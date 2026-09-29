import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clipboard } from "@capacitor/clipboard";
import { useNav } from "../nav";
import { diaLocal, fechaCorta, nombreMes } from "../lib/fecha";
import { leerConexion, leerUltimoEnvio, mandar, mesesAMandar, probarYGuardar, type Resultado } from "../lib/finanzas";
import { useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* «Mandar a Finanzas»: la tarjeta (arriba de Exportar a Excel), conectar la primera
   vez, y el resultado del envío (o "No encuentro a Finanzas"). */

const caja = (fondo: string, borde: string) => ({ background: `var(${fondo})`, border: `1px solid ${borde}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 12 });
const OK = caja("--ok-fondo", "rgba(93,211,158,.35)"), MAL = caja("--mal-fondo", "rgba(240,138,138,.35)"), AVISO = caja("--ambar-fondo", "rgba(245,192,99,.35)");

const mes = (p: string) => nombreMes(p, false);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const soloIp = (d: string) => d.replace(/:\d+$/, "");

/** La tarjeta, arriba de "Exportar a Excel". */
export function TarjetaMandar() {
  const nav = useNav();
  const conexion = useLiveQuery(leerConexion, []);
  const ultimo = useLiveQuery(leerUltimoEnvio, []);
  const [anterior, actual] = mesesAMandar();
  const mayus = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <div className="caja">
      <div style={{ fontSize: 17, fontWeight: 500 }}>Mandar a Finanzas</div>
      <div className="chico tenue">{mayus(mes(actual))} y {mes(anterior)}, lo que falta mandar.</div>
      <button className="btn" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        onClick={() => nav.abrir({ p: conexion ? "finanzas-mandar" : "finanzas-conectar" })}>
        <T.IconArrowRight size={18} /> Mandar
      </button>
      <div className="mini tenue" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{ultimo ? `última vez ${fechaCorta(diaLocal(ultimo.fecha))} a las ${hora(ultimo.fecha)} · ${soloIp(ultimo.direccion)}` : conexion ? `todavía no mandaste nada · ${soloIp(conexion.direccion)}` : "Primero hay que conectarla, una sola vez."}</span>
        {conexion && <button className="mini viol" onClick={() => nav.abrir({ p: "finanzas-conectar" })}>cambiar</button>}
      </div>
    </div>
  );
}

/** 1 · Conectar la primera vez (o cambiar la dirección o la clave). */
export function ConectarFinanzas() {
  const nav = useNav();
  const toast = useToast();
  const [direccion, setDireccion] = useState("");
  const [clave, setClave] = useState("");
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { leerConexion().then(c => { if (c) { setDireccion(c.direccion); setClave(c.clave); } }); }, []);

  async function pegar() {
    try { const { value } = await Clipboard.read(); if (value) setClave(value.trim()); }
    catch { setError("No pude leer el portapapeles: pegala a mano."); }
  }
  async function probar() {
    setProbando(true); setError(null);
    const r = await probarYGuardar(direccion, clave);
    setProbando(false);
    if (r.tipo === "revisado") { toast({ texto: "Conectado con Finanzas" }); nav.volver(); return; }
    setError(r.tipo === "clave" ? "La clave no es la de Finanzas. Copiala de nuevo desde la Mac."
      : r.tipo === "sin-respuesta" ? `${r.direccion} no contesta. ¿Estás en el Wi-Fi de casa y Finanzas está abierta?`
      : r.tipo === "rechazado" ? `Finanzas contestó, pero no aceptó el envío: ${r.mensaje}` : "No se pudo conectar.");
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Conectar con Finanzas</h1></div>
      <div className="chico tenue" style={{ marginBottom: 12 }}>Una sola vez. La dirección y la clave las ves en Finanzas, en la Mac.</div>
      <div className="campo"><label>Dirección de la Mac</label>
        <input inputMode="url" autoCapitalize="off" autoCorrect="off" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="192.168.1.17:3005" />
      </div>
      <div className="campo"><label>Clave</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="password" autoCapitalize="off" autoCorrect="off" value={clave} onChange={e => setClave(e.target.value)} placeholder="••••••••-••••-••••" style={{ flex: 1, minWidth: 0 }} />
          <button className="mini viol" onClick={pegar}>pegar</button>
        </div>
      </div>
      <button className="btn" disabled={probando || !direccion.trim() || !clave.trim()} onClick={probar}>{probando ? "Probando…" : "Probar y guardar"}</button>
      {error && <div style={{ ...MAL, marginTop: 12 }}><span className="chico">{error}</span></div>}
      <div className="mini tenue" style={{ marginTop: 10 }}>Tenés que estar en el Wi-Fi de casa y Finanzas abierta. Probar no cambia nada en Finanzas.</div>
    </div>
  );
}

/** 3 y 4 · Manda al abrir y muestra el resultado, o "No encuentro a Finanzas". */
export function MandarFinanzas() {
  const nav = useNav();
  const [res, setRes] = useState<Resultado | null>(null);
  const [intento, setIntento] = useState(0);
  const enCurso = useRef(false);

  useEffect(() => {
    if (enCurso.current) return;
    enCurso.current = true;
    setRes(null);
    (async () => {
      const c = await leerConexion();
      if (!c) { nav.volver(); return; }
      setRes(await mandar(c));
      enCurso.current = false;
    })();
  }, [intento]); // eslint-disable-line react-hooks/exhaustive-deps

  const excel = () => nav.volver(); // "Exportar a Excel" está en la pantalla de la que venís

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Mandar a Finanzas</h1></div>

      {!res && <div className="vacio">Mandando…</div>}

      {res?.tipo === "listo" && (
        <>
          <div style={OK}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Listo</span>
            <span className="num" style={{ fontSize: 30, fontWeight: 200 }}>{res.nuevos} {res.nuevos === 1 ? "nuevo" : "nuevos"}</span>
            <span className="chico tenue">{res.corregidos} {res.corregidos === 1 ? "corregido" : "corregidos"} · {res.iguales} ya estaban</span>
          </div>
          {res.porMes.length > 0 && (
            <div className="caja lista">
              {[...res.porMes].sort((a, b) => b.periodo.localeCompare(a.periodo)).map(p => (
                <div key={p.periodo} className="fila">
                  <span>{mes(p.periodo)}</span>
                  <b className="num" style={{ fontWeight: 500 }}>{[p.nuevos && `${p.nuevos} ${p.nuevos === 1 ? "nuevo" : "nuevos"}`, p.cambian && `${p.cambian} ${p.cambian === 1 ? "corregido" : "corregidos"}`].filter(Boolean).join(" · ") || "ya estaba todo"}</b>
                </div>
              ))}
            </div>
          )}
          {res.avisos.length > 0 && (
            <div style={AVISO}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Para mirar</span>
              {res.avisos.map((a, i) => <span key={i} className="chico tenue">{a.texto}</span>)}
            </div>
          )}
          <button className="btn2" style={{ width: "100%" }} onClick={nav.volver}>Listo</button>
        </>
      )}

      {res?.tipo === "sin-respuesta" && (
        <>
          <div style={MAL}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>No encuentro a Finanzas</span>
            <span className="chico tenue">{res.direccion} no contesta.</span>
          </div>
          <div className="caja chico tenue">Puede ser que la Mac esté apagada, que Finanzas no esté abierta, o que el celular esté en otra red.</div>
          <button className="btn" onClick={() => setIntento(i => i + 1)}>Probar de nuevo</button>
          <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={excel}>Exportar a Excel</button>
          <div className="mini tenue" style={{ marginTop: 10 }}>Nada se mandó. Los gastos siguen acá.</div>
        </>
      )}

      {(res?.tipo === "clave" || res?.tipo === "rechazado") && (
        <>
          <div style={MAL}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{res.tipo === "clave" ? "La clave no es la de Finanzas" : "Finanzas no aceptó el envío"}</span>
            <span className="chico tenue">{res.tipo === "clave" ? "Puede que la hayan cambiado en la Mac." : res.mensaje}</span>
          </div>
          {res.tipo === "clave"
            ? <button className="btn" onClick={() => nav.abrir({ p: "finanzas-conectar" })}>Cambiar la clave</button>
            : <button className="btn" onClick={() => setIntento(i => i + 1)}>Probar de nuevo</button>}
          <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={excel}>Exportar a Excel</button>
          <div className="mini tenue" style={{ marginTop: 10 }}>Nada se mandó. Los gastos siguen acá.</div>
        </>
      )}
    </div>
  );
}

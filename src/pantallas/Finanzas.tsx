import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clipboard } from "@capacitor/clipboard";
import { useNav } from "../nav";
import { diaLocal, fechaCorta, nombreMes } from "../lib/fecha";
import { leerEnvios, leerToken, mandar, marcarVisto, mesesAMandar, probarToken, REPO, type EnvioHecho, type Resultado, type Subida } from "../lib/finanzas";
import { useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* «Mandar a Finanzas» por el buzón: la tarjeta (arriba de Exportar a Excel), conectar
   la primera vez (el token de GitHub), dejar el envío en el buzón y la respuesta de
   Finanzas cuando llega. */

const caja = (fondo: string, borde: string) => ({ background: `var(${fondo})`, border: `1px solid ${borde}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 12 });
const OK = caja("--ok-fondo", "rgba(93,211,158,.35)"), MAL = caja("--mal-fondo", "rgba(240,138,138,.35)"), AVISO = caja("--ambar-fondo", "rgba(245,192,99,.35)");

const mes = (p: string) => nombreMes(p, false);
const cuando = (iso: string) => `${fechaCorta(diaLocal(iso))} a las ${new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
export const resumenDe = (r: Resultado) => r.tipo === "listo"
  ? `${plural(r.nuevos, "nuevo", "nuevos")} · ${plural(r.corregidos, "corregido", "corregidos")} · ${r.iguales} ya estaban`
  : "no aceptó el envío";

/** La tarjeta, arriba de "Exportar a Excel". */
export function TarjetaMandar() {
  const nav = useNav();
  const token = useLiveQuery(leerToken, []);
  const envios = useLiveQuery(leerEnvios, []);
  const ultimo = envios?.[envios.length - 1];
  const [anterior, actual] = mesesAMandar();
  return (
    <div className="caja">
      <div style={{ fontSize: 17, fontWeight: 500 }}>Mandar a Finanzas</div>
      <div className="chico tenue">{mes(actual)[0].toUpperCase() + mes(actual).slice(1)} y {mes(anterior)}, lo que falta mandar.</div>
      <button className="btn" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        onClick={() => nav.abrir({ p: token ? "finanzas-mandar" : "finanzas-conectar" })}>
        <T.IconArrowRight size={18} /> Mandar
      </button>
      <div className="mini tenue" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
        {!ultimo ? <span>{token ? "Todavía no mandaste nada." : "Primero hay que conectarla, una sola vez."}</span>
          : ultimo.resultado
            ? <button className="mini tenue" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "finanzas-respuesta", nombre: ultimo.nombre })}>última vez {cuando(ultimo.enviado)} · Finanzas: <span className={ultimo.resultado.tipo === "listo" ? "ok" : "mal"}>{resumenDe(ultimo.resultado)}</span></button>
            : <span>última vez {cuando(ultimo.enviado)} · esperando a Finanzas</span>}
        {token && <button className="mini viol" onClick={() => nav.abrir({ p: "finanzas-conectar" })}>cambiar</button>}
      </div>
    </div>
  );
}

/** 1 · Conectar la primera vez: el token de GitHub del buzón. */
export function ConectarFinanzas() {
  const nav = useNav();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { leerToken().then(t => { if (t) setToken(t); }); }, []);

  async function pegar() {
    try { const { value } = await Clipboard.read(); if (value) setToken(value.trim()); }
    catch { setError("No pude leer el portapapeles: pegalo a mano."); }
  }
  async function probar() {
    setProbando(true); setError(null);
    const r = await probarToken(token);
    setProbando(false);
    if (r === "ok") { toast({ texto: "Conectado con el buzón de Finanzas" }); nav.volver(); return; }
    setError(r === "token" ? "GitHub no reconoce ese token. Copialo de nuevo."
      : r === "sin-acceso" ? `El token no tiene permiso sobre ${REPO}.`
      : "GitHub no contesta. ¿Tenés conexión?");
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Conectar con Finanzas</h1></div>
      <div className="chico tenue" style={{ marginBottom: 12 }}>Una sola vez. Los gastos van a un buzón privado en GitHub y Finanzas los levanta desde ahí: anda desde cualquier lado, sin la Mac prendida.</div>
      <div className="campo"><label>Token de GitHub</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="password" autoCapitalize="off" autoCorrect="off" value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_…" style={{ flex: 1, minWidth: 0 }} />
          <button className="mini viol" onClick={pegar}>pegar</button>
        </div>
      </div>
      <button className="btn" disabled={probando || !token.trim()} onClick={probar}>{probando ? "Probando…" : "Probar y guardar"}</button>
      {error && <div style={{ ...MAL, marginTop: 12 }}><span className="chico">{error}</span></div>}
      <div className="mini tenue" style={{ marginTop: 10, lineHeight: 1.5 }}>
        Cómo sacarlo: GitHub → Settings → Developer settings → Fine-grained tokens → Generate. En «Repository access» elegí solo <b>gastos-buzon</b>, y en «Permissions → Contents», <b>Read and write</b>. Probar no manda nada.
      </div>
    </div>
  );
}

/** 2 y 4 · Deja el envío en el buzón al abrir, o "No pude dejarlo". */
export function MandarFinanzas() {
  const nav = useNav();
  const [res, setRes] = useState<Subida | null>(null);
  const [intento, setIntento] = useState(0);
  const enCurso = useRef(false);

  useEffect(() => {
    if (enCurso.current) return;
    enCurso.current = true;
    setRes(null);
    (async () => {
      const t = await leerToken();
      if (!t) { nav.volver(); return; }
      setRes(await mandar(t));
      enCurso.current = false;
    })();
  }, [intento]); // eslint-disable-line react-hooks/exhaustive-deps

  const excel = () => nav.volver(); // "Exportar a Excel" está en la pantalla de la que venís

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Mandar a Finanzas</h1></div>

      {!res && <div className="vacio">Mandando…</div>}

      {res?.tipo === "dejado" && (
        <>
          <div style={OK}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Quedó en el buzón</span>
            <span className="num" style={{ fontSize: 30, fontWeight: 200 }}>{plural(res.envio.cantidad, "movimiento", "movimientos")}</span>
            <span className="chico tenue">{res.envio.meses.map(mes).join(" y ")}, completos.</span>
          </div>
          <div className="caja chico tenue">Finanzas lo levanta a las 9:30 y a las 21:30, o cuando tocás «Traer lo del celular». Cuando conteste, te muestro qué entró la próxima vez que abras la app.</div>
          <button className="btn2" style={{ width: "100%" }} onClick={nav.volver}>Listo</button>
        </>
      )}

      {res && res.tipo !== "dejado" && (
        <>
          <div style={MAL}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{res.tipo === "token" ? "El token no sirve" : "No pude dejarlo en el buzón"}</span>
            <span className="chico tenue">{res.tipo === "token" ? `GitHub no lo acepta para ${REPO}: puede haber vencido.` : "GitHub no contesta."}</span>
          </div>
          {res.tipo === "sin-respuesta" && <div className="caja chico tenue">Puede ser que el celular esté sin conexión. El buzón no depende de la Mac: con internet alcanza.</div>}
          {res.tipo === "token"
            ? <button className="btn" onClick={() => nav.abrir({ p: "finanzas-conectar" })}>Cambiar el token</button>
            : <button className="btn" onClick={() => setIntento(i => i + 1)}>Probar de nuevo</button>}
          <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={excel}>Exportar a Excel</button>
          <div className="mini tenue" style={{ marginTop: 10 }}>Nada se mandó. Los gastos siguen acá.</div>
        </>
      )}
    </div>
  );
}

/** 3 · La respuesta de Finanzas a un envío. */
export function RespuestaFinanzas({ nombre }: { nombre: string }) {
  const nav = useNav();
  const envios = useLiveQuery(leerEnvios, []);
  const e: EnvioHecho | undefined = envios?.find(x => x.nombre === nombre);
  useEffect(() => { marcarVisto(nombre); }, [nombre]);
  const r = e?.resultado;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Mandar a Finanzas</h1></div>
      {e && <div className="mini tenue" style={{ marginBottom: 10 }}>Mandado {cuando(e.enviado)}{e.respondido ? ` · Finanzas lo aplicó ${cuando(e.respondido)}` : ""}</div>}
      {!r && <div className="vacio">Finanzas todavía no contestó.</div>}

      {r?.tipo === "listo" && (
        <>
          <div style={OK}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Listo</span>
            <span className="num" style={{ fontSize: 30, fontWeight: 200 }}>{plural(r.nuevos, "nuevo", "nuevos")}</span>
            <span className="chico tenue">{plural(r.corregidos, "corregido", "corregidos")} · {r.iguales} ya estaban</span>
          </div>
          {r.porMes.length > 0 && (
            <div className="caja lista">
              {[...r.porMes].sort((a, b) => b.periodo.localeCompare(a.periodo)).map(p => (
                <div key={p.periodo} className="fila">
                  <span>{mes(p.periodo)}</span>
                  <b className="num" style={{ fontWeight: 500 }}>{[p.nuevos && plural(p.nuevos, "nuevo", "nuevos"), p.cambian && plural(p.cambian, "corregido", "corregidos")].filter(Boolean).join(" · ") || "ya estaba todo"}</b>
                </div>
              ))}
            </div>
          )}
          {r.avisos.length > 0 && (
            <div style={AVISO}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Para mirar</span>
              {r.avisos.map((a, i) => <span key={i} className="chico tenue">{a.texto}</span>)}
            </div>
          )}
        </>
      )}

      {r?.tipo === "rechazado" && (
        <>
          <div style={MAL}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Finanzas no aceptó el envío</span>
            <span className="chico tenue">{r.mensaje}</span>
          </div>
          <div className="mini tenue" style={{ marginBottom: 10 }}>No se escribió nada en Finanzas. Los gastos siguen acá.</div>
          <button className="btn" onClick={() => nav.abrir({ p: "finanzas-mandar" })}>Mandar de nuevo</button>
        </>
      )}
      <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={nav.volver}>Listo</button>
    </div>
  );
}

/** Arriba de todo, al abrir la app, cuando llegó una respuesta que no viste. */
export function AvisoRespuesta({ envio, abrir, cerrar }: { envio: EnvioHecho; abrir: () => void; cerrar: () => void }) {
  const r = envio.resultado!;
  return (
    <div className="aviso-version" role="status">
      <button style={{ flex: 1, textAlign: "left" }} onClick={abrir}>
        <div>{r.tipo === "listo" ? "Finanzas recibió tus gastos" : "Finanzas no aceptó el envío"}</div>
        <div className="mini tenue">{r.tipo === "listo" ? resumenDe(r) : r.mensaje}</div>
      </button>
      <button className="tenue" aria-label="Cerrar" onClick={cerrar} style={{ padding: 6 }}>✕</button>
    </div>
  );
}

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, leerAjuste } from "../db";
import { useNav } from "../nav";
import { copiaDeSeguridad, editadosDespues, exportar, importarXlsx, mesesSinExportar, restaurar, sumarPaquete, type ResultadoImport } from "../lib/archivos";
import { diaLocal, fechaCorta, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { Hoja, Seg, useToast } from "../ui/piezas";
import { abrirArchivo, compartirArchivo, esApp, type Guardado } from "../lib/guardar";
import { TarjetaMandar } from "./Finanzas";
import { T } from "../ui/Icono";

export function Exportar() {
  const nav = useNav();
  const toast = useToast();
  const [modo, setModo] = useState<"nuevo" | "mes">("nuevo");
  const [mes, setMes] = useState(sumarMeses(periodoHoy(), -1));
  const sinExportar = useLiveQuery(() => db.movimientos.filter(m => !m.exportado).count(), []);
  const meses = useLiveQuery(mesesSinExportar, [sinExportar]);
  const editados = useLiveQuery(editadosDespues, [sinExportar]);
  const ultima = useLiveQuery(() => leerAjuste<string | null>("ultimaExportacion", null), [sinExportar]);
  const delMes = useLiveQuery(() => db.movimientos.where("fecha").startsWith(mes).count(), [mes]);
  const elegidos = modo === "nuevo" ? meses ?? [] : [mes];
  const cantidad = modo === "nuevo" ? sinExportar ?? 0 : delMes ?? 0;
  const [listo, setListo] = useState<{ g: Guardado; cantidad: number } | null>(null);

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Exportar a Finanzas</h1></div>
      <TarjetaMandar />
      <div className="titulo-sec"><span>Exportar a Excel</span></div>
      <div className="mini tenue" style={{ margin: "-4px 2px 8px" }}>El archivo de siempre, por si hace falta.</div>
      <div className="dos">
        <div className="caja"><div className="etq">Sin exportar</div><div className="mediano num">{sinExportar ?? "…"}</div></div>
        <div className="caja"><div className="etq">Última vez</div><div className="mediano">{ultima ? fechaCorta(diaLocal(ultima)) : "nunca"}</div></div>
      </div>
      <div className="pills" style={{ margin: "6px 0 10px" }}>
        <button className={`pill${modo === "nuevo" ? " on" : ""}`} onClick={() => setModo("nuevo")}>Lo nuevo</button>
        <button className={`pill${modo === "mes" ? " on" : ""}`} onClick={() => setModo("mes")}>Un mes</button>
      </div>
      {modo === "mes" && (
        <div className="pills scroll" style={{ marginBottom: 10 }}>
          {Array.from({ length: 12 }, (_, i) => sumarMeses(periodoHoy(), -i)).map(p => <button key={p} className={`pill${p === mes ? " on" : ""}`} onClick={() => setMes(p)}>{nombreMes(p)}</button>)}
        </div>
      )}
      <div className="caja chico">
        {modo === "nuevo"
          ? (elegidos.length ? <>Sale {elegidos.length === 1 ? "el mes" : "los meses"} de {elegidos.map(p => nombreMes(p, false)).join(", ")} completo{elegidos.length > 1 ? "s" : ""}. Lo que Finanzas ya tenía lo reconoce y no lo duplica.</> : "No hay nada nuevo para exportar.")
          : <>{delMes} movimientos de {nombreMes(mes)}.</>}
      </div>
      <div className="tenue chico" style={{ lineHeight: 1.5 }}>
        Un Excel con hojas Gastos e Ingresos: fecha, categoría, cuenta, monto en su moneda, etiquetas y comentario. El mismo formato que la app anterior: se importa en Finanzas igual que siempre. También se guarda una copia de seguridad de la app{esApp() ? " en Documentos/Gastos" : ""}: guardala en Drive.
      </div>
      {editados && editados.length > 0 && (
        <div className="caja aviso" style={{ marginTop: 10 }}>
          <div className="ambar chico">{editados.length === 1 ? "1 movimiento cambió" : `${editados.length} movimientos cambiaron`} después de exportarlo</div>
          <div className="mini tenue">Finanzas lo va a tomar como nuevo: borrá la versión vieja allá. {editados.slice(0, 3).map(m => `${fechaCorta(m.fecha, false)} ${m.monto} ${m.moneda}`).join(" · ")}</div>
        </div>
      )}
      <div className="pie-fijo">
        <button className="btn" disabled={!cantidad} onClick={async () => {
          const { cantidad: n, guardado } = await exportar(elegidos);
          // Una vez por mes se exporta: se aprovecha para guardar también la copia de seguridad.
          if (!guardado) await new Promise(r => setTimeout(r, 800));
          await copiaDeSeguridad();
          if (guardado) setListo({ g: guardado, cantidad: n });
          else toast({ texto: `Exportados ${n} movimientos · copia de seguridad descargada` });
        }}>
          Exportar a Excel {cantidad ? `(${cantidad} movimientos)` : ""}
        </button>
      </div>
      <HojaArchivo g={listo?.g ?? null} titulo="Excel listo" detalle={listo ? `${listo.cantidad} movimientos` : ""}
        nota="Quedó en Documentos/Gastos, junto con la copia de seguridad." conAbrir compartirComo="Gastos para Finanzas" cerrar={() => setListo(null)} />
    </div>
  );
}

export function Respaldo() {
  const nav = useNav();
  const toast = useToast();
  const ultimo = useLiveQuery(() => leerAjuste<string | null>("ultimoRespaldo", null), []);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [res, setRes] = useState<ResultadoImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCopia, setErrorCopia] = useState<string | null>(null);
  const [sumado, setSumado] = useState<Awaited<ReturnType<typeof sumarPaquete>> | null>(null);
  const [yaEnFinanzas, setYaEnFinanzas] = useState(true);
  const [copia, setCopia] = useState<Guardado | null>(null);

  async function importar(f: File | undefined) {
    if (!f) return;
    setError(null); setRes(null); setTrabajando("Leyendo el archivo…");
    try { setRes(await importarXlsx(f, setTrabajando, yaEnFinanzas)); }
    catch (e) { setError(`No pude leer el archivo: ${(e as Error).message}`); }
    setTrabajando(null);
  }
  async function restaurarDe(f: File | undefined) {
    if (!f) return;
    setErrorCopia(null); setSumado(null);
    try {
      // Un paquete suma sin borrar; una copia de seguridad reemplaza todo.
      const tipo = JSON.parse(await f.text()).app;
      if (tipo === "gastos-paquete") { setSumado(await sumarPaquete(f)); return; }
      if (!confirm("Esto reemplaza todo lo que hay en la app por lo del archivo. ¿Seguir?")) return;
      const n = await restaurar(f);
      toast({ texto: `Restaurados ${n} movimientos` });
    } catch (e) { setErrorCopia(e instanceof SyntaxError ? "Ese archivo no es un .json de la app." : (e as Error).message); }
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Copia e importación</h1></div>

      <div className="titulo-sec"><span>Copia de seguridad</span></div>
      <div className="caja">
        <div className="chico">Tus datos viven solo en este celular. La copia es un archivo: guardalo en Drive o mandátelo por mail.</div>
        <div className="mini tenue" style={{ marginTop: 4 }}>Última: {ultimo ? fechaCorta(diaLocal(ultimo)) : "nunca"} · se {esApp() ? "guarda en Documentos/Gastos" : "baja sola"} cada vez que exportás a Finanzas.</div>
        <div className="botones"><button className="btn1" onClick={async () => {
          const g = await copiaDeSeguridad();
          if (g) setCopia(g);
        }}>Hacer copia ahora</button></div>
        {/* Sin filtro de tipo: Android a veces no reconoce el .json que llega por
            WhatsApp o Drive y lo muestra deshabilitado. El contenido se valida al leerlo. */}
        <label className="btn1" style={{ display: "block", marginTop: 8 }}>
          Restaurar o sumar desde archivo (.json)
          <input type="file" hidden onChange={e => { restaurarDe(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {errorCopia && <div className="mal chico" style={{ marginTop: 8 }}>{errorCopia}</div>}
        {sumado && (
          <div className="chico" style={{ marginTop: 8 }}>
            <div className="ok">Sumado sin borrar nada: {[
              sumado.categorias && `${sumado.categorias} categorías`, sumado.movimientos && `${sumado.movimientos} movimientos`, sumado.recurrentes && `${sumado.recurrentes} recurrentes`,
              sumado.pagos && `${sumado.pagos} pagos vinculados`, sumado.corregidos && `${sumado.corregidos} corregidos`, sumado.cuentas && `${sumado.cuentas} cuentas actualizadas`, sumado.reglas && `${sumado.reglas} comercios`,
            ].filter(Boolean).join(", ") || "ya estaba todo"}.</div>
            {sumado.salteados.length > 0 && <div className="ambar">No encontré la categoría o cuenta de: {sumado.salteados.join(", ")}</div>}
          </div>
        )}
      </div>

      <div className="titulo-sec"><span>Traer lo de la app anterior</span></div>
      <div className="caja">
        <div className="chico">Exportá desde la app vieja a Excel (el mismo archivo que importás en Finanzas) y elegilo acá. Se crean las categorías y cuentas que falten.</div>
        <div className="etq" style={{ marginTop: 10 }}>¿Estos gastos ya están en Finanzas?</div>
        <Seg opciones={[["si", "Sí, ya están"], ["no", "No, son nuevos"]]} valor={yaEnFinanzas ? "si" : "no"} cambiar={v => setYaEnFinanzas(v === "si")} />
        <div className="mini tenue" style={{ marginTop: 4 }}>{yaEnFinanzas ? "No se vuelven a exportar." : "Salen en la próxima exportación a Finanzas."} Si importás el mismo archivo dos veces, no se duplica.</div>
        <label className="btn1" style={{ display: "block", marginTop: 10 }}>
          {trabajando ?? "Elegir archivo .xlsx"}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={!!trabajando} onChange={e => importar(e.target.files?.[0])} />
        </label>
        {res && (
          <div className="chico" style={{ marginTop: 10 }}>
            <div className="ok">{res.nuevos} movimientos nuevos{res.repetidos ? ` · ${res.repetidos} ya estaban` : ""}</div>
            {res.sinCotizar > 0 && <div className="ambar">{res.sinCotizar} sin cotización: se completan al tener conexión.</div>}
            {res.categoriasNuevas.length > 0 && <div className="tenue">Categorías nuevas: {res.categoriasNuevas.join(", ")}</div>}
            {res.cuentasNuevas.length > 0 && <div className="tenue">Cuentas nuevas: {res.cuentasNuevas.join(", ")} · revisá su moneda en Cuentas.</div>}
          </div>
        )}
        {error && <div className="mal chico" style={{ marginTop: 8 }}>{error}</div>}
      </div>
      <HojaArchivo g={copia} titulo="Copia lista" detalle="Copia de seguridad de Gastos"
        nota="Quedó en Documentos/Gastos. Guardala también fuera del celular: Drive o mail." compartirComo="Copia de seguridad de Gastos" cerrar={() => setCopia(null)} />
    </div>
  );
}

/** Después de guardar un archivo en la app: abrirlo o compartirlo. */
function HojaArchivo({ g, titulo, detalle, nota, conAbrir, compartirComo, cerrar }: { g: Guardado | null; titulo: string; detalle: string; nota: string; conAbrir?: boolean; compartirComo: string; cerrar: () => void }) {
  const toast = useToast();
  return (
    <Hoja abierta={!!g} cerrar={cerrar}>
      {g && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ok-fondo)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {conAbrir ? <T.IconFileSpreadsheet size={20} /> : <T.IconShieldCheck size={20} />}
            </span>
            <div><div style={{ fontSize: 16 }}>{titulo}</div><div className="mini tenue">{g.nombre} · {detalle}</div></div>
          </div>
          <div className="mini tenue" style={{ margin: "8px 0 14px" }}>{nota}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {conAbrir && <button className="btn2" style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}
              onClick={() => abrirArchivo(g).catch(() => toast({ texto: "No hay ninguna app para abrir planillas. Compartilo." }))}><T.IconExternalLink size={16} /> Abrir</button>}
            <button className="btn1" style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}
              onClick={() => compartirArchivo(g, compartirComo)}><T.IconShare size={16} /> Compartir</button>
          </div>
          <button className="tenue chico" style={{ width: "100%", marginTop: 14, padding: 6 }} onClick={cerrar}>Listo</button>
        </>
      )}
    </Hoja>
  );
}

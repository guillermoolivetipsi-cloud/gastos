import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, leerAjuste } from "../db";
import { useNav } from "../nav";
import { copiaDeSeguridad, editadosDespues, exportar, importarXlsx, mesesSinExportar, restaurar, sumarPaquete, type ResultadoImport } from "../lib/archivos";
import { fechaCorta, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { Seg, useToast } from "../ui/piezas";
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

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Exportar a Finanzas</h1></div>
      <div className="dos">
        <div className="caja"><div className="etq">Sin exportar</div><div className="mediano num">{sinExportar ?? "…"}</div></div>
        <div className="caja"><div className="etq">Última vez</div><div className="mediano">{ultima ? fechaCorta(ultima.slice(0, 10)) : "nunca"}</div></div>
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
        Un Excel con hojas Gastos e Ingresos: fecha, categoría, cuenta, monto en su moneda, etiquetas y comentario. El mismo formato que la app anterior: se importa en Finanzas igual que siempre. También se baja una copia de seguridad de la app: guardala en Drive.
      </div>
      {editados && editados.length > 0 && (
        <div className="caja aviso" style={{ marginTop: 10 }}>
          <div className="ambar chico">{editados.length === 1 ? "1 movimiento cambió" : `${editados.length} movimientos cambiaron`} después de exportarlo</div>
          <div className="mini tenue">Finanzas lo va a tomar como nuevo: borrá la versión vieja allá. {editados.slice(0, 3).map(m => `${fechaCorta(m.fecha, false)} ${m.monto} ${m.moneda}`).join(" · ")}</div>
        </div>
      )}
      <div className="pie-fijo">
        <button className="btn" disabled={!cantidad} onClick={async () => {
          const n = await exportar(elegidos);
          // Una vez por mes se exporta: se aprovecha para bajar también la copia de seguridad.
          await new Promise(r => setTimeout(r, 800));
          await copiaDeSeguridad();
          toast({ texto: `Exportados ${n} movimientos · copia de seguridad descargada` });
        }}>
          Exportar {cantidad ? `${cantidad} movimientos` : ""}
        </button>
      </div>
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
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [yaEnFinanzas, setYaEnFinanzas] = useState(true);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersistente); }, []);

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
        <div className="mini tenue" style={{ marginTop: 4 }}>Última: {ultimo ? fechaCorta(ultimo.slice(0, 10)) : "nunca"} · te aviso en "Para revisar" si pasa más de una semana.</div>
        {persistente === false && <div className="mini ambar" style={{ marginTop: 4 }}>Instalá la app en la pantalla de inicio para que Android no borre los datos si le falta espacio.</div>}
        <div className="botones"><button className="btn1" onClick={copiaDeSeguridad}>Hacer copia ahora</button></div>
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
    </div>
  );
}


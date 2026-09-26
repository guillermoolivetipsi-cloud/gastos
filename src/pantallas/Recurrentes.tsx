import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import { MONEDAS, type Clase, type Frecuencia, type Moneda, type Recurrente, type Tipo } from "../tipos";
import { eliminarRecurrente, type Alcance } from "../lib/acciones";
import { descartesSet, detectarRecurrentes } from "../lib/analisis";
import { DIAS_CORTOS, fechaCorta, fechaEnMes, hoy, nombreDia, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { estadoDe } from "../lib/recurrentes";
import { Barra, Hoja, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function cadaCuanto(r: Recurrente) {
  switch (r.frecuencia) {
    case "mensual": return `todos los meses, el ${r.dia}`;
    case "semanal": return `todos los ${nombreDia(r.dia)}`;
    case "anual": return `cada año, el ${r.dia} de ${MESES[(r.mes ?? 1) - 1]}`;
    case "una-vez": return `una vez, ${fechaCorta(r.inicio, false)}`;
  }
}

export function ListaRecurrentes() {
  const d = useDatos();
  const nav = useNav();
  const cat = new Map(d.categorias.map(c => [c.id, c]));
  const activos = d.recurrentes.filter(r => r.activo && r.frecuencia !== "una-vez" && (!r.fin || r.fin >= hoy()));
  const terminados = d.recurrentes.filter(r => !activos.includes(r) && r.frecuencia !== "una-vez");
  const fila = (r: Recurrente) => (
    <button key={r.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "recurrente", id: r.id })}>
      <span className="izq"><Punto cat={cat.get(r.categoriaId)} chico /><span>
        <div>{r.nombre}</div>
        <div className="mini tenue">{cadaCuanto(r)} · <span className={`etiq e-${r.clase}`}>{r.clase}</span></div>
      </span></span>
      <span className={`num ${r.tipo === "ingreso" ? "ok" : ""}`}>{r.clase === "variable" ? "~" : ""}{r.tipo === "ingreso" ? "+" : ""}{num(r.monto)} {r.moneda}</span>
    </button>
  );
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Recurrentes</h1><button className="accion" aria-label="Nuevo" onClick={() => nav.abrir({ p: "recurrente" })}><T.IconPlus size={22} /></button></div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Lo que se repite, gastos e ingresos juntos. Si el monto cambia cada mes (expensas, luz) te aviso con un estimado para que cargues el real.</div>
      {!activos.length && <div className="vacio">Todavía no hay recurrentes.</div>}
      {activos.length > 0 && <div className="caja lista">{activos.map(fila)}</div>}
      {terminados.length > 0 && <><div className="titulo-sec"><span>Terminados</span></div><div className="caja lista">{terminados.map(fila)}</div></>}
    </div>
  );
}

export function EditorRecurrente(props: Extract<Pantalla, { p: "recurrente" }>) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = props.id ? d.recurrentes.find(r => r.id === props.id) : undefined;
  const listo = useRef(false);
  const [f, setF] = useState<Omit<Recurrente, "id" | "monto"> & { montoTxt: string }>({
    nombre: "", tipo: props.tipo ?? "gasto", categoriaId: "", cuentaId: "", montoTxt: "", moneda: "EUR", clase: "fijo",
    frecuencia: "mensual", dia: Number(hoy().slice(8)), inicio: hoy(), modo: "avisar", activo: true,
  });
  const [borrar, setBorrar] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    if (listo.current || !d.listo) return;
    listo.current = true;
    if (existente) { setF({ ...existente, montoTxt: String(existente.monto).replace(".", ",") }); return; }
    if (props.desdeSugerencia) {
      const s = detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, descartesSet(d.descartes)).find(s => s.clave === props.desdeSugerencia);
      if (s) { setF(x => ({ ...x, nombre: s.nombre, tipo: s.tipo, categoriaId: s.categoriaId, cuentaId: s.cuentaId, montoTxt: String(s.monto).replace(".", ","), moneda: s.moneda, clase: s.clase, dia: s.dia, inicio: `${s.meses[0]}-01` })); return; }
    }
    const c = d.cuentas.find(c => !c.archivada);
    if (c) setF(x => ({ ...x, cuentaId: c.id, moneda: c.moneda }));
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(f.montoTxt);
  const valido = f.nombre.trim() && f.categoriaId && f.cuentaId && monto > 0;
  const cats = d.categorias.filter(c => c.tipo === f.tipo && (!c.archivada || c.id === f.categoriaId));

  async function guardar() {
    if (!valido) return;
    const { montoTxt: _, ...resto } = f;
    const r: Recurrente = { ...resto, nombre: f.nombre.trim(), monto, id: existente?.id ?? nuevoId() };
    await db.recurrentes.put(r);
    // Los movimientos que dieron origen a la sugerencia (y el de este mes, si ya
    // lo cargaste) quedan como pagos de este recurrente.
    if (props.desdeSugerencia && !existente) {
      const s = detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, descartesSet(d.descartes)).find(s => s.clave === props.desdeSugerencia);
      if (s) {
        const [, catId, texto] = s.clave.split("|");
        const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
        const pagos = d.movimientos.filter(m => !m.recurrenteId && m.categoriaId === catId && m.tipo === s.tipo && m.fecha.slice(0, 7) >= s.meses[0] && norm(m.comentario || m.etiquetas[0] || "") === texto);
        await db.movimientos.bulkUpdate(pagos.map(m => ({ key: m.id, changes: { recurrenteId: r.id, periodo: m.fecha.slice(0, 7) } })));
      }
    }
    toast({ texto: existente ? "Recurrente guardado" : "Recurrente creado" });
    nav.volver();
  }

  async function eliminar(a: Alcance) {
    if (!existente) return;
    // "Que no se repita más": lo de este mes queda, termina desde el próximo.
    const clave = a === "siguientes" ? sumarMeses(periodoHoy(), 1) : undefined;
    const deshacer = await eliminarRecurrente(existente, a, clave);
    setBorrar(false);
    toast({ texto: a === "todo" ? "Recurrente eliminado" : "No se repite más", deshacer });
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{existente ? "Editar recurrente" : "Nuevo recurrente"}</h1>
        {existente && <button className="accion peligro" aria-label="Eliminar" onClick={() => setBorrar(true)}><T.IconTrash size={21} /></button>}
      </div>
      <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={f.tipo} cambiar={(t: Tipo) => setF(x => ({ ...x, tipo: t, categoriaId: "" }))} />
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Expensas, alquiler, Netflix…" /></div>

      <div className="campo">
        <label>El monto</label>
        <Seg opciones={[["fijo", "Siempre igual"], ["variable", "Cambia cada mes"]] as [Clase, string][]} valor={f.clase} cambiar={v => set("clase", v)} />
      </div>
      <div className="campo">
        <label>{f.clase === "variable" ? "Monto estimado" : "Monto"}</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input inputMode="decimal" value={f.montoTxt} onChange={e => set("montoTxt", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" style={{ flex: 1 }} />
          <div style={{ width: 170 }}><Seg opciones={MONEDAS.map(m => [m, m] as [Moneda, string])} valor={f.moneda} cambiar={v => set("moneda", v)} /></div>
        </div>
        {f.clase === "variable" && <div className="mini tenue">Después se ajusta solo con el promedio de las últimas 3 veces.</div>}
      </div>

      <div className="campo">
        <label>Cada cuánto</label>
        <select value={f.frecuencia} onChange={e => set("frecuencia", e.target.value as Frecuencia)}>
          <option value="mensual">Todos los meses</option>
          <option value="semanal">Todas las semanas</option>
          <option value="anual">Una vez por año</option>
          {f.frecuencia === "una-vez" && <option value="una-vez">Una sola vez (en partes)</option>}
        </select>
      </div>
      {f.frecuencia === "semanal" ? (
        <div className="campo"><label>Día</label><div className="pills">{DIAS_CORTOS.map((n, i) => <button key={i} className={`pill${f.dia === i ? " on" : ""}`} onClick={() => set("dia", i)}>{n}</button>)}</div></div>
      ) : f.frecuencia !== "una-vez" && (
        <div className="dos">
          <div className="campo"><label>Día del mes</label><input inputMode="numeric" value={f.dia} onChange={e => set("dia", Math.min(31, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} /></div>
          {f.frecuencia === "anual" && <div className="campo"><label>Mes</label><select value={f.mes ?? 1} onChange={e => set("mes", Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>}
        </div>
      )}

      <div className="campo"><label>Categoría</label>
        <select value={f.categoriaId} onChange={e => set("categoriaId", e.target.value)}>
          <option value="">Elegir…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="campo"><label>Cuenta</label>
        <select value={f.cuentaId} onChange={e => { const c = d.cuentas.find(c => c.id === e.target.value); setF(x => ({ ...x, cuentaId: e.target.value, moneda: c?.moneda ?? x.moneda })); }}>
          <option value="">Elegir…</option>
          {d.cuentas.filter(c => !c.archivada || c.id === f.cuentaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      <div className="dos">
        <div className="campo"><label>Empieza</label><input type="date" value={f.inicio} onChange={e => e.target.value && set("inicio", e.target.value)} /></div>
        {f.frecuencia !== "una-vez" && <div className="campo"><label>Termina</label><input type="date" value={f.fin ?? ""} onChange={e => set("fin", e.target.value || undefined)} /><div className="mini tenue">{f.fin ? "" : "nunca"}</div></div>}
      </div>
      {f.frecuencia !== "una-vez" && (
        <div className="campo">
          <label>Cuando llega el día</label>
          <Seg opciones={[["avisar", "Avisarme"], ["auto", "Cargarlo solo"]] as ["avisar" | "auto", string][]} valor={f.modo} cambiar={v => set("modo", v)} />
          <div className="mini tenue" style={{ marginTop: 4 }}>{f.modo === "auto" ? "Se carga con este monto el día que toca." : "Aparece como \"por cargar\" y lo cargás vos con el monto real."}</div>
        </div>
      )}
      <div className="pie-fijo"><button className="btn" disabled={!valido} onClick={guardar}>Guardar</button></div>

      <Hoja abierta={borrar} cerrar={() => setBorrar(false)}>
        <h2>Eliminar {existente?.nombre}</h2>
        <div className="tenue chico">Lo que ya pagaste queda cargado.</div>
        <button className="opcion" onClick={() => eliminar("siguientes")}>Que no se repita más (este mes queda)</button>
        <button className="opcion mal" onClick={() => eliminar("todo")}>Eliminar el recurrente entero</button>
        <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setBorrar(false)}>Cancelar</button>
      </Hoja>
    </div>
  );
}

/** Una vez de un recurrente: cuánto era, cuánto pagaste y en qué pagos. */
export function Instancia({ id, clave }: { id: string; clave: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [borrar, setBorrar] = useState(false);
  const r = d.recurrentes.find(r => r.id === id);
  if (!r) return <div className="pantalla sin-tabs"><div className="vacio">Este recurrente ya no existe.</div></div>;
  const fecha = clave.length === 7 ? fechaEnMes(clave, r.dia) : clave;
  const e = estadoDe({ rec: r, clave, fecha: r.frecuencia === "una-vez" ? r.inicio : fecha }, d.movimientos, d.tasas.rec(r, d.cuentas));
  const cta = new Map(d.cuentas.map(c => [c.id, c.nombre]));
  const titulo = clave.length === 7 ? nombreMes(clave, false) : fechaCorta(clave, false);

  async function eliminar(a: Alcance) {
    const deshacer = await eliminarRecurrente(r!, a, clave);
    setBorrar(false);
    toast({ texto: a === "este" ? `Salteado ${titulo}` : a === "siguientes" ? "Terminado desde acá" : "Recurrente eliminado", deshacer });
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{r.nombre} · {titulo}</h1>
        <button className="accion peligro" aria-label="Eliminar" onClick={() => setBorrar(true)}><T.IconTrash size={21} /></button>
      </div>
      <div className="caja">
        <div className="etq">{e.estimado ? "Estimado del mes" : r.tipo === "gasto" ? "Total a pagar" : "Total a cobrar"}</div>
        <div className="mediano num">{e.estimado ? "~" : ""}{num(e.esperado)} {r.moneda}</div>
        <Barra valor={e.esperado ? e.pagado / e.esperado : 0} color="#60A5FA" />
        <div className="fila chico" style={{ padding: 0 }}>
          <span className="tenue">{r.tipo === "gasto" ? "pagado" : "cobrado"} {num(e.pagado)}</span>
          {e.falta > 0 && !e.estimado && <span className="ambar">faltan {num(e.falta)}</span>}
        </div>
      </div>
      <div className="titulo-sec"><span>Pagos</span></div>
      {!e.pagos.length && <div className="tenue chico" style={{ marginBottom: 8 }}>Todavía no hay pagos. {e.estimado ? "El monto es un estimado: cargá el real." : ""}</div>}
      {e.pagos.length > 0 && (
        <div className="caja lista">
          {e.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(p => (
            <button key={p.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: p.id })}>
              <span>{fechaCorta(p.fecha, false)} · {cta.get(p.cuentaId)}</span><span className="num">{num(p.monto)} {p.moneda}</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn1" style={{ width: "100%" }} onClick={() => nav.abrir({ p: "editor", recurrenteId: r.id, periodo: clave, monto: e.estimado ? undefined : e.falta || undefined, fecha: e.fecha <= hoy() ? hoy() : e.fecha })}>
        + {e.pagos.length ? "Agregar un pago" : e.estimado ? "Cargar el monto real" : "Cargar el pago"}
      </button>
      <div className="espacio" />
      <button className="btn2" style={{ width: "100%" }} onClick={() => nav.abrir({ p: "recurrente", id: r.id })}>Editar el recurrente</button>
      <div className="mini tenue centro" style={{ marginTop: 10 }}>{cadaCuanto(r)}</div>

      <Hoja abierta={borrar} cerrar={() => setBorrar(false)}>
        <h2>Eliminar {r.nombre}</h2>
        <div className="tenue chico">Es un recurrente. ¿Qué querés borrar?</div>
        <button className="opcion" onClick={() => eliminar("este")}>Solo el de {titulo}</button>
        {r.frecuencia !== "una-vez" && <button className="opcion" onClick={() => eliminar("siguientes")}>Este y los que siguen</button>}
        <button className="opcion mal" onClick={() => eliminar("todo")}>El recurrente entero</button>
        <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setBorrar(false)}>Cancelar</button>
      </Hoja>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import type { Clase, Frecuencia, Recurrente, Tipo } from "../tipos";
import { descartar, eliminarRecurrente, marcarEnCero, reactivarRecurrente, terminarRecurrente, vincular, vincularPagosDeSugerencia, type Alcance } from "../lib/acciones";
import { descartesSet, detectarRecurrentes } from "../lib/analisis";
import { DIAS_CORTOS, MESES, fechaCorta, fechaEnMes, hoy, mesCorto, nombreDia, nombreMes, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { candidatos, enUsdDe, estadoDe, fechaDePago, mensualEnUsd, montoHabitual } from "../lib/recurrentes";
import { Barra, Dia, Hoja, Montos, Puntito, Seg, textoOriginal, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";
import { cuentaDiaria } from "./Editor";
import { categoriasPorUso } from "./editorLogica";
import { FechaEnTitulo, GrillaCategorias, MontoConMoneda } from "../ui/formulario";


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
  // Reglas de Recurrentes: tres números arriba, solapas de gastos e ingresos, lo más caro
  // arriba, lo que debés en partes primero y los terminados plegados al final.
  const [pestana, setPestana] = useState<Tipo>("gasto");
  const [verTerminados, setVerTerminados] = useState(false);
  const activos = d.recurrentes.filter(r => r.activo && r.frecuencia !== "una-vez" && (!r.fin || r.fin >= hoy()));
  const terminados = d.recurrentes.filter(r => !activos.includes(r) && r.frecuencia !== "una-vez");
  // Los pagos en partes que todavía deben algo (se abren en su mes).
  const enPartes = d.recurrentes.filter(r => r.frecuencia === "una-vez" && r.activo)
    .map(r => estadoDe({ rec: r, clave: r.inicio.slice(0, 7), fecha: r.inicio }, d.movimientos, d.tasaRec(r)))
    .filter(e => e.estado !== "cargado");
  const usd = (r: Recurrente) => mensualEnUsd(r, d.movimientos, d.tasaRec(r));
  const total = (tipo: Recurrente["tipo"]) => activos.filter(r => r.tipo === tipo).reduce((s, r) => s + (usd(r) ?? 0), 0);
  const gastos = total("gasto"), ingresos = total("ingreso");
  const aTarjeta = activos.filter(r => r.tipo === "gasto" && d.cuentaPorId.get(r.cuentaId)?.esTarjeta).reduce((s, r) => s + (usd(r) ?? 0), 0);
  const lista = activos.filter(r => r.tipo === pestana).sort((a, b) => (usd(b) ?? 0) - (usd(a) ?? 0));
  const term = terminados.filter(r => r.tipo === pestana);
  const partes = enPartes.filter(e => e.rec.tipo === pestana);
  const partesUsd = partes.reduce((s, e) => s + (enUsdDe(e.rec, e.falta, d.tasaRec(e.rec)) ?? 0), 0);
  // Reglas de las listas: el día a la izquierda (cuándo toca), los dólares arriba y la
  // moneda original abajo. Lo semanal y lo anual se muestran por mes en dólares.
  const fila = (r: Recurrente) => {
    const habitual = montoHabitual(r, d.movimientos, d.tasaRec(r));
    const u = usd(r);
    const ing = r.tipo === "ingreso" ? "+" : "";
    const aprox = r.clase === "variable" ? "~" : "";
    const dia = r.frecuencia === "semanal" ? DIAS_CORTOS[r.dia] : r.frecuencia === "una-vez" ? Number(r.inicio.slice(8)) : r.dia;
    const abajo = r.frecuencia === "semanal" ? "c/sem" : r.frecuencia === "anual" ? MESES[(r.mes ?? 1) - 1].slice(0, 3) : r.frecuencia === "una-vez" ? mesCorto(r.inicio.slice(0, 7)) : "c/mes";
    return (
      <button key={r.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "recurrente", id: r.id })}>
        <span className="izq"><Dia dia={dia} abajo={abajo} /><Puntito cat={cat.get(r.categoriaId)} /><span style={{ minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
          <div className="mini tenue">{d.cuentaPorId.get(r.cuentaId)?.nombre}{r.moneda !== "USD" && u != null ? ` · ${aprox}${ing}${num(habitual)} ${r.moneda}` : ""}</div>
        </span></span>
        <span className="derecha">
          {r.moneda !== "USD" && u != null
            ? <div className={`num ${ing ? "ok" : ""}`}>{aprox}{ing}{num(u, 0)}{r.frecuencia !== "mensual" ? "/mes" : ""}</div>
            : <div className={`num ${ing ? "ok" : ""}`}>{aprox}{ing}{num(habitual)}{r.moneda !== "USD" ? ` ${r.moneda}` : ""}</div>}
        </span>
      </button>
    );
  };
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Recurrentes</h1><button className="accion" aria-label="Nuevo" onClick={() => nav.abrir({ p: "recurrente" })}><T.IconPlus size={22} /></button></div>
      {activos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <div className="caja" style={{ padding: "8px 10px" }}>
            <div className="mini tenue">Gastos/mes</div>
            <div className="num" style={{ fontSize: 20 }}>~{num(gastos, 0)}</div>
            <div className="mini tenue">USD</div>
          </div>
          <div className="caja" style={{ padding: "8px 10px" }}>
            <div className="mini tenue">Ingresos/mes</div>
            <div className="num ok" style={{ fontSize: 20 }}>{ingresos > 0 ? `+${num(ingresos, 0)}` : "0"}</div>
            <div className="mini tenue">USD</div>
          </div>
          <div className="caja" style={{ padding: "8px 10px" }}>
            <div className="mini tenue">A la tarjeta</div>
            <div className="num" style={{ fontSize: 20 }}>~{num(aTarjeta, 0)}</div>
            <div className="mini tenue">USD/mes</div>
          </div>
        </div>
      )}
      <div className="solapas" style={{ marginTop: 14 }}>
        <button className={pestana === "gasto" ? "on" : ""} onClick={() => setPestana("gasto")}>GASTOS</button>
        <button className={pestana === "ingreso" ? "on" : ""} onClick={() => setPestana("ingreso")}>INGRESOS</button>
      </div>
      {partes.length > 0 && <><div className="grupo-t"><span>Lo que debés en partes</span>{partesUsd > 0 && <span className="num">~{num(partesUsd, 0)}</span>}</div><div className="caja lista">{partes.map(e => (
        <button key={e.rec.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: e.rec.id, clave: e.clave })}>
          <span className="izq"><Dia dia={Number(e.rec.inicio.slice(8))} abajo={mesCorto(e.rec.inicio.slice(0, 7))} /><Puntito cat={cat.get(e.rec.categoriaId)} /><span style={{ minWidth: 0 }}><div>{e.rec.nombre}</div><div className="mini tenue">{d.cuentaPorId.get(e.rec.cuentaId)?.nombre}</div></span></span>
          <span className="derecha"><div className="num ambar">faltan {num(e.falta)} {e.rec.moneda}</div></span>
        </button>
      ))}</div></>}
      {!lista.length && <div className="vacio">{pestana === "gasto" ? "Todavía no hay gastos recurrentes." : "Todavía no hay ingresos recurrentes."}</div>}
      {lista.length > 0 && <div className="caja lista" style={{ marginTop: partes.length ? 0 : 4 }}>{lista.map(fila)}</div>}
      {term.length > 0 && <>
        <button className="grupo-t" style={{ width: "100%", color: "var(--tenue)", fontWeight: 400 }} onClick={() => setVerTerminados(!verTerminados)}>
          <span>Terminados ({term.length})</span>{verTerminados ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
        </button>
        {verTerminados && <div className="caja lista">{term.map(fila)}</div>}
      </>}
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
    const c = cuentaDiaria(d.cuentas);
    if (c) setF(x => ({ ...x, cuentaId: c.id, moneda: c.moneda }));
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(f.montoTxt);
  const valido = f.nombre.trim() && f.categoriaId && f.cuentaId && monto > 0;

  async function guardar() {
    if (!valido) return;
    const { montoTxt: _, ...resto } = f;
    const r: Recurrente = { ...resto, nombre: f.nombre.trim(), monto, id: existente?.id ?? nuevoId() };
    await db.recurrentes.put(r);
    // Los movimientos que dieron origen a la sugerencia (y el de este mes, si ya
    // lo cargaste) quedan como pagos de este recurrente.
    if (props.desdeSugerencia && !existente) {
      const s = detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, descartesSet(d.descartes)).find(s => s.clave === props.desdeSugerencia);
      if (s) await vincularPagosDeSugerencia(r.id, s, d.movimientos);
    }
    toast({ texto: existente ? "Recurrente guardado" : "Recurrente creado" });
    nav.volver();
  }

  async function terminar() {
    if (!existente) return;
    const deshacer = await terminarRecurrente(existente);
    setBorrar(false);
    toast({ texto: `${existente.nombre}: no se pide más`, deshacer });
    nav.volver();
  }
  async function eliminarDelTodo() {
    if (!existente) return;
    const deshacer = await eliminarRecurrente(existente, "todo");
    setBorrar(false);
    toast({ texto: "Recurrente eliminado", deshacer });
    nav.volver();
  }
  const terminado = !!existente?.fin && existente.fin < hoy();

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{existente ? "Editar recurrente" : "Nuevo recurrente"}
          <FechaEnTitulo titulo="¿Desde cuándo?" texto={`desde ${f.inicio === hoy() ? "hoy" : fechaCorta(f.inicio, false)}`}>
            {cerrar => {
              const p = hoy().slice(0, 7), opciones: [string, string][] = [[hoy(), "hoy"], [`${p}-01`, "el 1 de este mes"], [`${sumarMeses(p, 1)}-01`, "el 1 del que viene"]];
              return <>
                {opciones.map(([v, t]) => <button key={t} className={`pill${f.inicio === v ? " on" : ""}`} onClick={() => { set("inicio", v); cerrar(); }}>{t}</button>)}
                <label className={`pill${!opciones.some(([v]) => v === f.inicio) ? " on" : ""}`} style={{ position: "relative" }}>otro día
                  <input type="date" value={f.inicio} onChange={e => { if (e.target.value) { set("inicio", e.target.value); cerrar(); } }} style={{ position: "absolute", inset: 0, opacity: 0 }} aria-label="Elegir el día de inicio" />
                </label>
              </>;
            }}
          </FechaEnTitulo>
        </h1>
        {existente && <button className="accion peligro" aria-label="Eliminar" onClick={() => setBorrar(true)}><T.IconTrash size={21} /></button>}
      </div>
      <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={f.tipo} cambiar={(t: Tipo) => setF(x => ({ ...x, tipo: t, categoriaId: "" }))} />
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Expensas, alquiler, Netflix…" /></div>


      {/* Reglas de carga: el monto con la moneda al lado, la categoría justo después. */}
      <MontoConMoneda texto={f.montoTxt} cambiarTexto={t => set("montoTxt", t)} moneda={f.moneda} cambiarMoneda={m => set("moneda", m)} etiqueta={f.clase === "variable" ? "Monto estimado" : "Monto"} />
      {f.clase === "variable" && <div className="mini tenue centro" style={{ marginTop: -4 }}>Estimado: después se ajusta solo con el promedio de las últimas 3 veces.</div>}

      <div className="titulo-sec"><span>Categoría</span></div>
      <GrillaCategorias categorias={categoriasPorUso(d.movimientos, d.categorias, f.tipo, f.categoriaId)} valor={f.categoriaId} cambiar={id => set("categoriaId", id)} />
      <div className="campo"><label>{f.tipo === "gasto" ? "Se paga con" : "Entra en"}</label>
        <select value={f.cuentaId} onChange={e => { const c = d.cuentas.find(c => c.id === e.target.value); setF(x => ({ ...x, cuentaId: e.target.value, moneda: c?.moneda ?? x.moneda })); }}>
          <option value="">Elegir…</option>
          {d.cuentas.filter(c => (!c.archivada || c.id === f.cuentaId) && (f.tipo === "gasto" || !c.esTarjeta)).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="campo">
        <label>El monto</label>
        <Seg opciones={[["fijo", "Siempre igual"], ["variable", "Cambia cada mes"]] as [Clase, string][]} valor={f.clase} cambiar={v => set("clase", v)} />
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

      <div>
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
      {existente && (terminado
        ? <button className="btn2" style={{ width: "100%", marginTop: 12 }} onClick={async () => { await reactivarRecurrente(existente); toast({ texto: `${existente.nombre}: se vuelve a pedir` }); }}>Volver a pedirlo</button>
        : <button className="btn2" style={{ width: "100%", marginTop: 12 }} onClick={() => setBorrar(true)}>Ya no aplica: dejar de pedirlo</button>)}

      <Hoja abierta={borrar} cerrar={() => setBorrar(false)}>
        <h2>Dejar de pedir {existente?.nombre}</h2>
        <div className="tenue chico">Lo que ya {f.tipo === "ingreso" ? "cobraste" : "pagaste"} queda cargado y vinculado.</div>
        <button className="opcion" onClick={terminar}>
          <div>Dejar de pedirlo</div>
          <div className="mini tenue">Pasa a "Terminados". El historial queda igual y lo podés volver a activar.</div>
        </button>
        <button className="opcion mal" onClick={eliminarDelTodo}>
          <div>Eliminarlo del todo</div>
          <div className="mini tenue">{f.tipo === "ingreso" ? "Los cobros anteriores quedan como ingresos sueltos." : "Los pagos anteriores quedan como gastos sueltos."}</div>
        </button>
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
  const [elegir, setElegir] = useState(false);
  const r = d.recurrentes.find(r => r.id === id);
  // Si lo eliminaste desde "Editar el recurrente", esta pantalla ya no tiene sentido.
  useEffect(() => { if (d.listo && !r) nav.volver(); }, [d.listo, r]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <div className="pantalla sin-tabs"><div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button></div><div className="vacio">Este recurrente ya no existe.</div></div>;
  const fecha = clave.length === 7 ? fechaEnMes(clave, r.dia) : clave;
  const e = estadoDe({ rec: r, clave, fecha: r.frecuencia === "una-vez" ? r.inicio : fecha }, d.movimientos, d.tasaRec(r));
  const cta = new Map(d.cuentas.map(c => [c.id, c.nombre]));
  const titulo = clave.length === 7 ? nombreMes(clave, false) : fechaCorta(clave, false);
  const ing = r.tipo === "ingreso";
  const pagoTxt = ing ? "cobro" : "pago";
  const totalUsd = enUsdDe(r, e.esperado, d.tasaRec(r));

  async function eliminar(a: Alcance) {
    const deshacer = await eliminarRecurrente(r!, a, clave);
    setBorrar(false);
    toast({ texto: a === "este" ? `Salteado ${titulo}` : "Recurrente eliminado", deshacer });
    nav.volver();
  }

  // Reglas del recurrente del mes: el monto grande con una línea, lo parecido preguntado
  // arriba, una sola acción abajo y lo demás en «⋯».
  const tasaR = d.tasaRec(r);
  const descartados = descartesSet(d.descartes);
  const parecido = e.estado !== "cargado" ? candidatos(e, d.movimientos, tasaR).find(m => !descartados.has(`vinc|${m.id}|${r.id}`)) : undefined;
  const vence = fechaDePago(e);
  const estadoTxt = e.cero ? <span>en 0 este mes</span>
    : e.estado === "cargado" ? <span className="ok">{ing ? "cobrado" : "pagado"}</span>
    : e.pagado > 0 ? <span className="ambar">faltan {num(e.falta)} {r.moneda}</span>
    : e.estimado ? <span>estimado: cargá el real</span> : <span>falta todo</span>;
  // Los últimos 6 meses (solo lo mensual): lo que se pagó cada mes, en su moneda.
  const historia = r.frecuencia === "mensual" && clave.length === 7
    ? Array.from({ length: 6 }, (_, k) => sumarMeses(clave, k - 5)).filter(p => p >= r.inicio.slice(0, 7))
      .map(p => ({ p, v: p === clave ? (e.pagado || e.esperado) : estadoDe({ rec: r, clave: p, fecha: fechaEnMes(p, r.dia) }, d.movimientos, tasaR).pagado }))
    : [];
  const maxH = Math.max(1, ...historia.map(h => h.v));
  const textoCargar = e.estado === "cargado" ? `+ Agregar otro ${pagoTxt}` : e.pagado > 0 ? `Cargar lo que falta · ${num(e.falta)} ${r.moneda}` : e.estimado ? "Cargar el monto real" : `Cargar el ${pagoTxt}`;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{r.nombre} · {titulo}<span className="mini tenue" style={{ display: "block", fontWeight: 400, marginTop: 2 }}>{cadaCuanto(r)} · {cta.get(r.cuentaId)}</span></h1>
        <button className="accion" aria-label="Más opciones" onClick={() => setBorrar(true)}><T.IconDots size={22} /></button>
      </div>

      {parecido && (
        <div className="caja sug">
          <div>¿Es este el {pagoTxt}?</div>
          <div className="mini tenue">{fechaCorta(parecido.fecha, false)} · {d.categorias.find(c => c.id === parecido.categoriaId)?.nombre}{parecido.comentario ? ` · ${parecido.comentario}` : ""} · {cta.get(parecido.cuentaId)} · {num(parecido.monto)} {parecido.moneda}</div>
          <div className="botones">
            <button className="btn1" onClick={async () => { const deshacer = await vincular(parecido.id, r.id, clave); toast({ texto: `Vinculado como ${pagoTxt} de ${r.nombre}`, deshacer }); }}>Sí</button>
            <button className="btn2" onClick={() => descartar(`vinc|${parecido.id}|${r.id}`)}>No</button>
          </div>
        </div>
      )}

      <div style={{ margin: "4px 2px 10px" }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>
          {totalUsd != null ? <>{e.estimado ? "~" : ""}{num(totalUsd, 0)} <span className="chico tenue">USD</span></> : <>{e.estimado ? "~" : ""}{num(e.esperado)} <span className="chico tenue">{r.moneda}</span></>}
        </div>
        <div className="mini tenue" style={{ marginTop: 4 }}>
          {totalUsd != null && r.moneda !== "USD" ? `${e.estimado ? "~" : ""}${num(e.esperado)} ${r.moneda} · ` : ""}{ing ? "se cobra" : "vence"} el {fechaCorta(vence, false)} · {estadoTxt}
        </div>
        {e.pagado > 0 && e.falta > 0 && <Barra valor={e.pagado / e.esperado} color="#60A5FA" />}
      </div>

      {e.pagos.length > 0 && (
        <>
          <div className="grupo-t"><span>{ing ? "Cobros" : "Pagos"}</span></div>
          <div className="caja lista">
            {e.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(p => (
              <button key={p.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: p.id })}>
                <span className="izq"><Dia dia={Number(p.fecha.slice(8))} abajo={mesCorto(p.fecha.slice(0, 7))} /><span className="chico">{cta.get(p.cuentaId)}<span className="tenue">{textoOriginal({ usd: p.usd, monto: p.monto, moneda: p.moneda })}</span></span></span>
                <span className="derecha"><Montos usd={p.usd} monto={p.monto} moneda={p.moneda} /></span>
              </button>
            ))}
          </div>
        </>
      )}

      {historia.length > 1 && (
        <>
          <div className="grupo-t"><span>Los últimos {historia.length} meses</span><span className="tenue">{r.moneda}</span></div>
          <div className="caja">
            <div className="hist">
              {historia.map((h, k) => (
                <div key={h.p}>
                  <small className="num">{h.v > 0 && (k === 0 || Math.round(historia[k - 1].v) !== Math.round(h.v)) ? num(h.v, 0) : ""}</small>
                  <i className={h.p === clave ? "ahora" : ""} style={{ height: Math.max(2, Math.round(h.v / maxH * 44)) }} />
                  <small>{mesCorto(h.p)}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {e.cero && (
        <div className="caja" style={{ marginTop: 8 }}>
          <div className="fila" style={{ padding: 0 }}><span className="chico">Marcado en 0 este mes</span><button className="viol chico" onClick={() => marcarEnCero(r, clave, false)}>Deshacer</button></div>
        </div>
      )}

      <div className="espacio" />
      {e.estado !== "cargado" && <button className="viol chico" style={{ width: "100%", padding: "8px 0" }} onClick={() => setElegir(true)}>¿Ya lo cargaste? Elegilo</button>}
      {!e.cero && <div className="pie-fijo" style={{ marginTop: 8 }}><button className="btn" onClick={() => nav.abrir({ p: "editor", recurrenteId: r.id, periodo: clave, monto: e.estimado ? undefined : e.falta || undefined, fecha: fechaDePago(e) })}>{textoCargar}</button></div>}

      <Hoja abierta={elegir} cerrar={() => setElegir(false)}>
        <h2>¿Cuál es el {pagoTxt} de {r.nombre}?</h2>
        <div className="mini tenue" style={{ marginBottom: 6 }}>{ing ? "Ingresos" : "Gastos"} de {titulo} sin vincular, los más parecidos primero.</div>
        {(() => {
          const tasaR = d.tasaRec(r);
          const parecidos = candidatos(e, d.movimientos, tasaR);
          const resto = d.movimientos.filter(m => m.tipo === r.tipo && !m.recurrenteId && m.fecha.slice(0, 7) === e.fecha.slice(0, 7) && !parecidos.includes(m)).sort((a, b) => b.fecha.localeCompare(a.fecha));
          const lista = [...parecidos, ...resto].slice(0, 25);
          if (!lista.length) return <div className="tenue chico">No hay {ing ? "ingresos" : "gastos"} sin vincular ese mes.</div>;
          return lista.map(m => (
            <button key={m.id} className="opcion" onClick={async () => {
              const deshacer = await vincular(m.id, r.id, clave);
              setElegir(false); toast({ texto: `Vinculado como ${pagoTxt} de ${r.nombre}`, deshacer });
            }}>
              <div className="fila" style={{ padding: 0 }}>
                <span>{fechaCorta(m.fecha, false)} · {d.categorias.find(c => c.id === m.categoriaId)?.nombre}{m.comentario ? ` · ${m.comentario}` : ""}</span>
                <span className="num">{num(m.monto)} {m.moneda}</span>
              </div>
              {parecidos.includes(m) && <div className="mini viol">parecido</div>}
            </button>
          ));
        })()}
      </Hoja>

      <Hoja abierta={borrar} cerrar={() => setBorrar(false)}>
        <h2>{r.nombre} · {titulo}</h2>
        <button className="opcion" onClick={() => { setBorrar(false); nav.abrir({ p: "recurrente", id: r.id }); }}>
          <div>Editar el recurrente</div>
          <div className="mini tenue">Monto, día, cuenta y categoría.</div>
        </button>
        {e.estado !== "cargado" && (
          <button className="opcion" onClick={() => { setBorrar(false); marcarEnCero(r, clave, true); }}>
            <div>Fue 0 este mes</div>
            <div className="mini tenue">{titulo} queda resuelto sin {pagoTxt}.</div>
          </button>
        )}
        {r.frecuencia !== "una-vez" && (
          <button className="opcion" onClick={async () => { const deshacer = await terminarRecurrente(r); setBorrar(false); toast({ texto: `${r.nombre}: no se pide más`, deshacer }); nav.volver(); }}>
            <div>Dejar de pedirlo</div>
            <div className="mini tenue">Pasa a "Terminados" con su historial. Lo que ya {ing ? "cobraste" : "pagaste"} queda cargado.</div>
          </button>
        )}
        <button className="opcion" onClick={() => eliminar("este")}>
          <div>Saltear solo {titulo}</div>
          <div className="mini tenue">Este mes no se pide; los demás sí.</div>
        </button>
        <button className="opcion mal" onClick={() => eliminar("todo")}>
          <div>Eliminarlo del todo</div>
          <div className="mini tenue">Los {pagoTxt}s anteriores quedan como {ing ? "ingresos" : "gastos"} sueltos.</div>
        </button>
        <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setBorrar(false)}>Cancelar</button>
      </Hoja>
    </div>
  );
}

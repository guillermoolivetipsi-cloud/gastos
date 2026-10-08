import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import type { Clase, Frecuencia, Recurrente, Tipo } from "../tipos";
import { eliminarRecurrente, marcarEnCero, reactivarRecurrente, terminarRecurrente, vincular, vincularPagosDeSugerencia, type Alcance } from "../lib/acciones";
import { descartesSet, detectarRecurrentes } from "../lib/analisis";
import { DIAS_CORTOS, MESES, fechaCorta, fechaEnMes, hoy, mesCorto, nombreDia, nombreMes, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { candidatos, enUsdDe, estadoDe, fechaDePago, mensualEnUsd, montoHabitual } from "../lib/recurrentes";
import { Barra, Dia, Hoja, Montos, Punto, Seg, useToast } from "../ui/piezas";
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
  const activos = d.recurrentes.filter(r => r.activo && r.frecuencia !== "una-vez" && (!r.fin || r.fin >= hoy()));
  const terminados = d.recurrentes.filter(r => !activos.includes(r) && r.frecuencia !== "una-vez");
  // Los pagos en partes que todavía deben algo (se abren en su mes).
  const enPartes = d.recurrentes.filter(r => r.frecuencia === "una-vez" && r.activo)
    .map(r => estadoDe({ rec: r, clave: r.inicio.slice(0, 7), fecha: r.inicio }, d.movimientos, d.tasaRec(r)))
    .filter(e => e.estado !== "cargado");
  const usd = (r: Recurrente) => mensualEnUsd(r, d.movimientos, d.tasaRec(r));
  const total = (tipo: Recurrente["tipo"]) => activos.filter(r => r.tipo === tipo).reduce((s, r) => s + (usd(r) ?? 0), 0);
  const gastos = total("gasto"), ingresos = total("ingreso");
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
        <span className="izq"><Dia dia={dia} abajo={abajo} /><Punto cat={cat.get(r.categoriaId)} chico /><span style={{ minWidth: 0 }}>
          <div>{r.nombre}</div>
          <div className="mini tenue">{d.cuentaPorId.get(r.cuentaId)?.nombre} · <span className={`etiq e-${r.clase}`}>{r.clase}</span></div>
        </span></span>
        <span className="derecha">
          {r.moneda !== "USD" && u != null
            ? <><div className={`num chico ${ing ? "ok" : ""}`}>{aprox}{ing}{num(u, 0)} USD{r.frecuencia !== "mensual" ? "/mes" : ""}</div><div className="mini tenue num">{aprox}{ing}{num(habitual)} {r.moneda}</div></>
            : <div className={`num chico ${ing ? "ok" : ""}`}>{aprox}{ing}{num(habitual)} {r.moneda}</div>}
        </span>
      </button>
    );
  };
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Recurrentes</h1><button className="accion" aria-label="Nuevo" onClick={() => nav.abrir({ p: "recurrente" })}><T.IconPlus size={22} /></button></div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Lo que se repite, gastos e ingresos juntos. Si el monto cambia cada mes (expensas, luz) te aviso con un estimado para que cargues el real.</div>
      {activos.length > 0 && (
        <div className="caja">
          <div className="fila" style={{ padding: 0 }}><span className="tenue chico">Gastos recurrentes por mes</span><span className="mediano num">~{num(gastos, 0)} <span className="chico tenue">USD</span></span></div>
          {ingresos > 0 && <div className="fila" style={{ paddingBottom: 0 }}><span className="tenue chico">Ingresos recurrentes por mes</span><span className="num ok">+{num(ingresos, 0)} USD</span></div>}
          <div className="mini tenue" style={{ marginTop: 4 }}>En dólares con la cotización de hoy. Los variables, con su estimado.</div>
        </div>
      )}
      {!activos.length && <div className="vacio">Todavía no hay recurrentes.</div>}
      {activos.length > 0 && <div className="caja lista">{activos.map(fila)}</div>}
      {enPartes.length > 0 && <><div className="titulo-sec"><span>En partes, sin terminar</span></div><div className="caja lista">{enPartes.map(e => (
        <button key={e.rec.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: e.rec.id, clave: e.clave })}>
          <span className="izq"><Punto cat={cat.get(e.rec.categoriaId)} chico /><span><div>{e.rec.nombre}</div><div className="mini tenue">{cadaCuanto(e.rec)}</div></span></span>
          <span className="derecha"><div className="num ambar">faltan {num(e.falta)} {e.rec.moneda}</div></span>
        </button>
      ))}</div></>}
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

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{r.nombre} · {titulo}</h1>
        <button className="accion peligro" aria-label="Eliminar" onClick={() => setBorrar(true)}><T.IconTrash size={21} /></button>
      </div>
      <div className="caja">
        <div className="etq">{e.estimado ? "Estimado del mes" : r.tipo === "gasto" ? "Total a pagar" : "Total a cobrar"}</div>
        <div className="mediano num">{totalUsd != null ? `~${num(totalUsd, 0)} USD` : `${e.estimado ? "~" : ""}${num(e.esperado)} ${r.moneda}`}</div>
        {totalUsd != null && <div className="mini tenue num">{e.estimado ? "~" : ""}{num(e.esperado)} {r.moneda}</div>}
        <Barra valor={e.esperado ? e.pagado / e.esperado : 0} color="#60A5FA" />
        <div className="fila chico" style={{ padding: 0 }}>
          <span className="tenue">{ing ? "cobrado" : "pagado"} {num(e.pagado)}</span>
          {e.falta > 0 && !e.estimado && <span className="ambar">faltan {num(e.falta)}</span>}
        </div>
      </div>
      <div className="titulo-sec"><span>{ing ? "Cobros" : "Pagos"}</span></div>
      {!e.pagos.length && <div className="tenue chico" style={{ marginBottom: 8 }}>Todavía no hay {pagoTxt}s. {e.estimado ? "El monto es un estimado: cargá el real." : ""}</div>}
      {e.pagos.length > 0 && (
        <div className="caja lista">
          {e.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(p => (
            <button key={p.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: p.id })}>
              <span className="izq"><Dia dia={Number(p.fecha.slice(8))} abajo={mesCorto(p.fecha.slice(0, 7))} /><span className="chico">{cta.get(p.cuentaId)}</span></span>
              <span className="derecha"><Montos usd={p.usd} monto={p.monto} moneda={p.moneda} /></span>
            </button>
          ))}
        </div>
      )}
      <button className="btn1" style={{ width: "100%" }} onClick={() => nav.abrir({ p: "editor", recurrenteId: r.id, periodo: clave, monto: e.estimado ? undefined : e.falta || undefined, fecha: fechaDePago(e) })}>
        + {e.pagos.length ? `Agregar un ${pagoTxt}` : e.estimado ? "Cargar el monto real" : `Cargar el ${pagoTxt}`}
      </button>
      {e.estado !== "cargado" && (
        <>
          <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => setElegir(true)}>Ya lo cargué como {ing ? "ingreso" : "gasto"}: elegirlo</button>
          <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => marcarEnCero(r, clave, true)}>Este mes no se {ing ? "cobró" : "pagó"} (queda en 0)</button>
        </>
      )}
      {e.cero && (
        <div className="caja" style={{ marginTop: 8 }}>
          <div className="fila" style={{ padding: 0 }}><span className="chico">Marcado en 0 este mes</span><button className="viol chico" onClick={() => marcarEnCero(r, clave, false)}>Deshacer</button></div>
        </div>
      )}
      <div className="espacio" />
      <button className="btn2" style={{ width: "100%" }} onClick={() => nav.abrir({ p: "recurrente", id: r.id })}>Editar el recurrente</button>
      <button className="btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => setBorrar(true)}>Ya no aplica: dejar de pedirlo</button>

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
      <div className="mini tenue centro" style={{ marginTop: 10 }}>{cadaCuanto(r)}</div>

      <Hoja abierta={borrar} cerrar={() => setBorrar(false)}>
        <h2>Eliminar {r.nombre}</h2>
        <div className="tenue chico">Lo que ya {ing ? "cobraste" : "pagaste"} queda cargado.</div>
        {r.frecuencia !== "una-vez" && (
          <button className="opcion" onClick={async () => { const deshacer = await terminarRecurrente(r); setBorrar(false); toast({ texto: `${r.nombre}: no se pide más`, deshacer }); nav.volver(); }}>
            <div>Dejar de pedirlo desde ahora</div>
            <div className="mini tenue">Pasa a "Terminados" con su historial.</div>
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

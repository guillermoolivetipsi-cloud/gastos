import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos, type Datos } from "../datos";
import { leerEstimados, leerFuentesEstimados } from "../lib/finanzas";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import type { Moneda, Proyeccion, Tipo } from "../tipos";
import { fechaEnMes, hoy, mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { ingresosRecurrentesPorMes } from "../lib/recurrentes";
import { desgloseIngresos, mesesQueQuedan, serie, type PuntoMes, type TasaMoneda, type Vista } from "../lib/proyecciones";
import { Interruptor, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";
import { categoriasPorUso } from "./editorLogica";
import { FechaEnTitulo, GrillaCategorias, MontoConMoneda } from "../ui/formulario";

/* Resumen → Proyecciones: un gráfico de línea mes a mes (tu normal y con lo
   proyectado) y la lista de proyecciones, cada una con su interruptor. */

export const tasaDeProyecciones = (d: Datos): TasaMoneda => m => d.tasas.de(m);

const proximos = () => Array.from({ length: 6 }, (_, i) => sumarMeses(periodoHoy(), i));
const VISTAS: [Vista, string][] = [["gasto", "Gastos"], ["ingreso", "Ingresos"], ["queda", "Lo que queda"]];

export function Proyecciones() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>("gasto");
  const tasa = useMemo(() => tasaDeProyecciones(d), [d]);
  // La clínica, con la agenda que manda Finanzas (si la mandó).
  const estimados = useLiveQuery(leerEstimados, []) ?? {};
  const fuentes = useLiveQuery(leerFuentesEstimados, []) ?? {};
  // El resto de los ingresos, con tus recurrentes de ingreso (lo suelto no se repite).
  const recurrentesDelMes = useMemo(() => ingresosRecurrentesPorMes(proximos(), d.recurrentes, d.movimientos, r => d.tasas.de(r.moneda)), [d]);
  const deRecurrentes = useMemo(() => Object.fromEntries(Object.entries(recurrentesDelMes).map(([p, rs]) => [p, rs.reduce((s, r) => s + r.usd, 0)])), [recurrentesDelMes]);
  const puntos = useMemo(() => serie(vista, proximos(), d.movimientos, d.proyecciones, tasa, estimados, deRecurrentes), [vista, d.movimientos, d.proyecciones, tasa, estimados, deRecurrentes]);
  const lista = [...d.proyecciones].sort((a, b) => a.periodo.localeCompare(b.periodo) || a.creado.localeCompare(b.creado));

  // El mes que más se mueve por lo proyectado.
  const mayor = puntos.reduce<PuntoMes | null>((m, p) => (Math.abs(p.medio - p.normal) > (m ? Math.abs(m.medio - m.normal) : 0.5) ? p : m), null);
  const nombreVista = { gasto: "gasto", ingreso: "ingreso", queda: "lo que queda" }[vista];

  const noPaso = async (p: Proyeccion) => {
    await pasarAlMesQueSigue(p);
    toast({ texto: `${p.nombre} de ${nombreMes(p.periodo, false)}: no ${p.tipo === "ingreso" ? "entró" : "pasó"}`, deshacer: () => { db.proyecciones.put(p); } });
  };
  const paso = (p: Proyeccion) => nav.abrir({
    p: "editor", tipo: p.tipo, monto: p.montoMax ? undefined : p.monto, categoriaId: p.categoriaId, comentario: p.nombre, proyeccionId: p.id, moneda: p.moneda,
    fecha: p.periodo === periodoHoy() ? hoy() : fechaEnMes(p.periodo, 31),
  });

  return (
    <>
      <div className="caja">
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {VISTAS.map(([v, t]) => <button key={v} className={`pill${vista === v ? " on" : ""}`} style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setVista(v)}>{t}</button>)}
        </div>
        <div className="mini tenue" style={{ display: "flex", gap: 12 }}>
          <span><span style={{ color: "var(--tenue)" }}>━</span> normal</span>
          <span><span className="viol">┅</span> con proyecciones</span>
          {puntos.length > 1 && <span><span className="tenue">┈</span> promedio {num(puntos.slice(1).reduce((t, p) => t + p.medio, 0) / (puntos.length - 1), 0)}</span>}
        </div>
        <GraficoLinea puntos={puntos} />
        <div className="mini tenue" style={{ marginTop: 4 }}>
          {mayor
            ? <>El mes que más cambia: <span className="ambar">{nombreMes(mayor.periodo, false)}, {mayor.medio > mayor.normal ? "+" : "−"}{num(Math.abs(mayor.medio - mayor.normal), 0)} USD</span> de {nombreVista}.</>
            : "Sin proyecciones prendidas: ves solo tu normal."}
          {" "}{vista === "gasto" ? "El normal es tu promedio de los últimos 3 meses." : vista === "ingreso" ? "El normal es la clínica (la proyección de Finanzas) y tus recurrentes de ingreso; lo de una vez, cargalo como proyección." : "El normal: tus gastos de siempre contra la clínica y tus recurrentes de ingreso."}
        </div>
      </div>

      {vista === "ingreso" && (() => {
        // Mes a mes: de dónde sale lo que se espera que entre (regla de la proyección de ingresos).
        const meses = proximos(), filas = desgloseIngresos(meses, d.movimientos, d.proyecciones, tasa, estimados, deRecurrentes);
        return <>
          <div className="grupo-t"><span>Mes a mes</span><span className="num">se espera</span></div>
          <div className="caja lista">
            {filas.map(f => (
              <div key={f.periodo} className="fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{nombreMes(f.periodo, false)}{f.periodo === periodoHoy() && <span className="mini tenue"> · en curso</span>}</span>
                  <span className="num ok">~{num(f.total, 0)}</span>
                </div>
                <div className="mini tenue">
                  {[
                    f.fuenteClinica && `clínica ~${num(f.clinica, 0)}${f.fuenteClinica === "agenda" ? ` (${fuentes[f.periodo] ?? "agenda"})` : ""}`,
                    // Cada recurrente de ingreso por su nombre; si en el mes en curso ya entró más, lo que entró.
                    ...(f.otros > (deRecurrentes[f.periodo] ?? 0) + 0.5 ? [`otros ingresos ${num(f.otros, 0)} (ya entraron)`] : (recurrentesDelMes[f.periodo] ?? []).map(r => `${r.nombre} ~${num(r.usd, 0)}`)),
                    ...f.proyecciones.map(p => `${p.nombre} ~${p.sinTasa ?? num(p.usd, 0)}`),
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </>;
      })()}

      <div className="titulo-sec"><span>Tus proyecciones</span><span className="mini">prendé para sumar al gráfico</span></div>
      {!lista.length && <div className="mini tenue" style={{ margin: "0 2px 8px" }}>Algo que va a pasar (el service, un cobro) o que podría pasar (un viaje, unas zapatillas).</div>}
      {lista.length > 0 && (
        <div className="caja lista">
          {lista.map(p => {
            const cat = d.catPorId.get(p.categoriaId);
            // Los gustos de Finanzas se ven, no se editan acá ni se preguntan (se cambian allá).
            const deFinanzas = p.origen === "finanzas";
            const termino = p.periodo < periodoHoy() && !deFinanzas;
            const ing = p.tipo === "ingreso";
            return (
              <div key={p.id} className="fila" style={{ flexWrap: "wrap" }}>
                <button className="izq" style={{ textAlign: "left", flex: 1, minWidth: 0 }} onClick={() => deFinanzas ? toast({ texto: "Viene de Finanzas: se cambia allá" }) : nav.abrir({ p: "proyeccion", id: p.id })}>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                    <div className="mini tenue"><span className={`etiq ${p.clase === "seguro" ? "e-fijo" : "e-variable"}`}>{p.clase}</span> {deFinanzas ? "de Finanzas" : cat?.nombre} · {p.hasta && p.hasta > p.periodo ? `${mesCorto(p.periodo)} – ${mesCorto(p.hasta)} · ${mesesQueQuedan(p)} meses` : nombreMes(p.periodo, false)}</div>
                  </span>
                </button>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="derecha">{(() => {
                    // Dólares primero; la moneda original abajo.
                    const rango = (a: number, b?: number) => `${num(a, 0)}${b && b > a ? `–${num(b, 0)}` : ""}`;
                    const t = p.usd != null && p.moneda !== "USD" ? p.monto / p.usd : tasa(p.moneda), clase = `num chico${p.activa ? (ing ? " ok" : "") : " tenue"}`;
                    const porMes = p.hasta && p.hasta > p.periodo ? " /mes" : "";
                    const original = `${ing ? "+" : ""}${rango(p.monto, p.montoMax)} ${p.moneda}${porMes}`;
                    if (p.moneda === "USD" || !t) return <div className={clase}>{original}</div>;
                    return <><div className={clase}>~{ing ? "+" : ""}{rango(Math.round(p.monto / t), p.montoMax ? Math.round(p.montoMax / t) : undefined)} USD{porMes}</div><div className="mini tenue num">{original}</div></>;
                  })()}</span>
                  {!termino && p.periodo >= periodoHoy() && <Interruptor on={p.activa} cambiar={v => db.proyecciones.update(p.id, { activa: v })} />}
                </span>
                {termino && (
                  <div style={{ width: "100%", display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                    <span className="mini ambar" style={{ alignSelf: "center", marginRight: "auto" }}>{ing ? "¿Entró" : "¿Pasó"} {p.nombre} de {nombreMes(p.periodo, false)}?</span>
                    <button className="btn2" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => noPaso(p)}>No</button>
                    <button className="btn1" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => paso(p)}>Sí, cargarlo</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button className="btn1" style={{ width: "100%", marginTop: 4 }} onClick={() => nav.abrir({ p: "proyeccion" })}>+ Nueva proyección</button>
    </>
  );
}

/** Línea gris: el normal. Línea violeta punteada: con lo proyectado. Franja: del mínimo
 *  al máximo si hay rangos. El número de cada mes va arriba del punto, con un borde del
 *  color del fondo para que la línea no lo tape; sin escala a la izquierda (se pisaba) y
 *  con el promedio de los meses que vienen punteado; su número va en la leyenda (regla
 *  del gráfico de Proyecciones). */
function GraficoLinea({ puntos }: { puntos: PuntoMes[] }) {
  const W = 320, H = 170, izq = 20, der = 20, arriba = 26, abajo = 22;
  const valores = puntos.flatMap(p => [p.normal, p.min, p.max]);
  // No arranca en 0: las diferencias entre meses son lo que importa.
  const minV = Math.min(...valores), maxV = Math.max(...valores);
  const aire = Math.max((maxV - minV) * 0.25, Math.abs(maxV) * 0.1, 1);
  let lo = minV - aire, hi = maxV + aire * 0.6;
  if (minV >= 0) lo = Math.max(0, lo);
  const X = (i: number) => izq + (i * (W - izq - der)) / Math.max(1, puntos.length - 1);
  const Y = (v: number) => arriba + ((hi - v) * (H - arriba - abajo)) / (hi - lo || 1);
  const linea = (k: keyof PuntoMes) => puntos.map((p, i) => `${X(i)},${Y(p[k] as number)}`).join(" ");
  const siguientes = puntos.slice(1), prom = siguientes.length ? siguientes.reduce((t, p) => t + p.medio, 0) / siguientes.length : null;
  const hayRango = puntos.some(p => p.max - p.min > 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Gasto por mes, normal y con proyecciones">
      <line x1={6} x2={W - 6} y1={H - abajo + 4} y2={H - abajo + 4} stroke="var(--linea)" />
      {prom != null && <g>
        <line x1={6} x2={W - 6} y1={Y(prom)} y2={Y(prom)} stroke="var(--tenue)" strokeOpacity={0.6} strokeDasharray="3 4" />
      </g>}
      {hayRango && <polygon points={`${linea("max")} ${puntos.map((p, i) => `${X(i)},${Y(p.min)}`).reverse().join(" ")}`} fill="var(--viol)" fillOpacity={0.18} />}
      <polyline points={linea("normal")} fill="none" stroke="var(--tenue)" strokeWidth={2} />
      <polyline points={linea("medio")} fill="none" stroke="var(--viol)" strokeWidth={2} strokeDasharray="4 3" />
      {puntos.map((p, i) => {
        const cambia = Math.abs(p.medio - p.normal) > 0.5;
        return (
          <g key={p.periodo}>
            <circle cx={X(i)} cy={Y(p.medio)} r={3} fill={cambia ? "var(--viol)" : "var(--tenue)"} />
            <text x={X(i)} y={Y(Math.max(p.max, p.medio, p.normal)) - 10} textAnchor="middle" fill={cambia ? "var(--viol-claro)" : "var(--tenue)"} fontSize="11" stroke="var(--panel)" strokeWidth={3} paintOrder="stroke">{num(p.medio, 0)}</text>
            <text x={X(i)} y={H - 6} textAnchor="middle" fill="var(--tenue)" fontSize="10">{mesCorto(p.periodo)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function EditorProyeccion(props: Extract<Pantalla, { p: "proyeccion" }>) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = props.id ? d.proyecciones.find(p => p.id === props.id) : undefined;
  const listo = useRef(false);
  const [f, setF] = useState({ nombre: "", tipo: "gasto" as Tipo, clase: "seguro" as Proyeccion["clase"], montoTxt: "", maxTxt: "", moneda: "USD" as Moneda, periodo: props.periodo ?? periodoHoy(), hasta: "", categoriaId: "" });
  const [rango, setRango] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    if (listo.current || !d.listo || !existente) return;
    listo.current = true;
    const e = existente;
    setF({ nombre: e.nombre, tipo: e.tipo, clase: e.clase, montoTxt: String(e.monto).replace(".", ","), maxTxt: e.montoMax ? String(e.montoMax).replace(".", ",") : "", moneda: e.moneda, periodo: e.periodo, hasta: e.hasta ?? "", categoriaId: e.categoriaId });
    setRango(!!e.montoMax);
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(f.montoTxt), max = rango ? leerNumero(f.maxTxt) : 0;
  const valido = !!f.nombre.trim() && monto > 0 && !!f.categoriaId && (!rango || max > monto);
  const meses = proximos();

  async function guardar() {
    if (!valido) return;
    // Nueva: los seguros arrancan prendidos y los opcionales apagados. Si cambiás de
    // seguro a opcional (o al revés), también.
    const activa = existente && existente.clase === f.clase ? existente.activa : f.clase === "seguro";
    await db.proyecciones.put({
      id: existente?.id ?? nuevoId(), nombre: f.nombre.trim(), tipo: f.tipo, clase: f.clase, monto, montoMax: rango ? max : undefined, moneda: f.moneda,
      periodo: f.periodo, hasta: f.hasta && f.hasta > f.periodo ? f.hasta : undefined, categoriaId: f.categoriaId, activa, creado: existente?.creado ?? new Date().toISOString(),
    });
    toast({ texto: existente ? "Proyección guardada" : f.clase === "opcional" ? "Agregada (apagada: prendela para verla en el gráfico)" : "Proyección agregada" });
    nav.volver();
  }
  async function borrar() {
    if (!existente) return;
    await db.proyecciones.delete(existente.id);
    toast({ texto: "Proyección eliminada", deshacer: () => { db.proyecciones.put(existente); } });
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{existente ? "Editar proyección" : "Nueva proyección"}
          {/* El mes en el título, como la fecha al cargar un gasto. */}
          <FechaEnTitulo titulo="¿En qué mes?" texto={meses.includes(f.periodo) ? mesCorto(f.periodo) : nombreMes(f.periodo, false)}>
            {cerrar => <>
              {meses.map(p => <button key={p} className={`pill${f.periodo === p ? " on" : ""}`} onClick={() => { setF(x => ({ ...x, periodo: p, hasta: x.hasta && x.hasta > p ? x.hasta : "" })); cerrar(); }}>{nombreMes(p, false)}</button>)}
              <label className={`pill${!meses.includes(f.periodo) ? " on" : ""}`} style={{ position: "relative" }}>
                otro mes
                <input type="month" value={f.periodo} onChange={e => { if (e.target.value) { set("periodo", e.target.value); cerrar(); } }} style={{ position: "absolute", inset: 0, opacity: 0 }} aria-label="Elegir mes" />
              </label>
            </>}
          </FechaEnTitulo>
          {/* Hasta qué mes se repite (el alquiler de dic a mar): un solo mes si no se elige. */}
          <FechaEnTitulo titulo="¿Hasta qué mes?" separador="–" texto={f.hasta && f.hasta > f.periodo ? mesCorto(f.hasta) : "un mes"}>
            {cerrar => <>
              <button className={`pill${!f.hasta || f.hasta <= f.periodo ? " on" : ""}`} onClick={() => { set("hasta", ""); cerrar(); }}>solo {nombreMes(f.periodo, false)}</button>
              {Array.from({ length: 11 }, (_, k) => sumarMeses(f.periodo, k + 1)).map(p => <button key={p} className={`pill${f.hasta === p ? " on" : ""}`} onClick={() => { set("hasta", p); cerrar(); }}>hasta {nombreMes(p, false)}</button>)}
            </>}
          </FechaEnTitulo>
        </h1>
        {existente && <button className="accion peligro" aria-label="Eliminar" onClick={borrar}><T.IconTrash size={21} /></button>}
      </div>
      <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={f.tipo} cambiar={t => setF(x => ({ ...x, tipo: t, categoriaId: "" }))} />
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder={f.tipo === "gasto" ? "Service del auto, zapatillas…" : "Cobro de un proyecto…"} autoFocus={!existente} /></div>

      {/* Reglas de carga: el monto con la moneda al lado, la categoría justo después. */}
      <MontoConMoneda texto={f.montoTxt} cambiarTexto={t => set("montoTxt", t)} moneda={f.moneda} cambiarMoneda={m => set("moneda", m)} etiqueta={rango ? "Desde" : "Monto"} />
      {rango && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: -6 }}>
          <span className="tenue">hasta</span>
          <input inputMode="decimal" value={f.maxTxt} onChange={e => set("maxTxt", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" aria-label="Hasta"
            style={{ width: 110, fontSize: 22, textAlign: "center", borderBottom: "1px solid var(--linea-2)" }} />
          <span className="tenue">{f.moneda}</span>
        </div>
      )}
      <div className="centro"><button className="mini viol" onClick={() => setRango(!rango)}>{rango ? "− un solo monto" : "+ es un rango (entre … y …)"}</button></div>
      {rango && max > 0 && max <= monto && <div className="mini ambar centro">El "hasta" tiene que ser mayor.</div>}

      <div className="titulo-sec"><span>Categoría</span></div>
      <GrillaCategorias categorias={categoriasPorUso(d.movimientos, d.categorias, f.tipo, f.categoriaId)} valor={f.categoriaId} cambiar={id => set("categoriaId", id)} />

      <div className="campo">
        <Seg opciones={[["seguro", "Seguro"], ["opcional", "Opcional"]]} valor={f.clase} cambiar={v => set("clase", v)} />
        <div className="mini tenue" style={{ marginTop: 4 }}>{f.clase === "seguro" ? "Muy probable: arranca prendido en el gráfico." : "Puede no pasar: arranca apagado y lo prendés para ver cómo impactaría."}</div>
      </div>
      <div className="pie-fijo"><button className="btn" disabled={!valido} onClick={guardar}>Guardar</button></div>
    </div>
  );
}

/** Cuando pasa (o no pasa) el mes de una proyección: si se repite, sigue con el mes que
 *  viene; si era el último (o de un solo mes), se borra. */
export async function pasarAlMesQueSigue(p: Proyeccion) {
  if (p.hasta && p.hasta > p.periodo) await db.proyecciones.update(p.id, { periodo: sumarMeses(p.periodo, 1) });
  else await db.proyecciones.delete(p.id);
}

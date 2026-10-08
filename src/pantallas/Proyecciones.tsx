import { useEffect, useMemo, useRef, useState } from "react";
import { useDatos, type Datos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import { MONEDAS, type Moneda, type Proyeccion, type Tipo } from "../tipos";
import { fechaEnMes, hoy, mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { serie, type PuntoMes, type TasaMoneda, type Vista } from "../lib/proyecciones";
import { Interruptor, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

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
  const puntos = useMemo(() => serie(vista, proximos(), d.movimientos, d.proyecciones, tasa), [vista, d.movimientos, d.proyecciones, tasa]);
  const lista = [...d.proyecciones].sort((a, b) => a.periodo.localeCompare(b.periodo) || a.creado.localeCompare(b.creado));

  // El mes que más se mueve por lo proyectado.
  const mayor = puntos.reduce<PuntoMes | null>((m, p) => (Math.abs(p.medio - p.normal) > (m ? Math.abs(m.medio - m.normal) : 0.5) ? p : m), null);
  const nombreVista = { gasto: "gasto", ingreso: "ingreso", queda: "lo que queda" }[vista];

  const noPaso = async (p: Proyeccion) => {
    await db.proyecciones.delete(p.id);
    toast({ texto: `${p.nombre}: no pasó`, deshacer: () => { db.proyecciones.put(p); } });
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
        </div>
        <GraficoLinea puntos={puntos} />
        <div className="mini tenue" style={{ marginTop: 4 }}>
          {mayor
            ? <>El mes que más cambia: <span className="ambar">{nombreMes(mayor.periodo, false)}, {mayor.medio > mayor.normal ? "+" : "−"}{num(Math.abs(mayor.medio - mayor.normal), 0)} USD</span> de {nombreVista}.</>
            : "Sin proyecciones prendidas: ves solo tu normal."}
          {" "}El normal es tu promedio de los últimos 3 meses.
        </div>
      </div>

      <div className="titulo-sec"><span>Tus proyecciones</span><span className="mini">prendé para sumar al gráfico</span></div>
      {!lista.length && <div className="mini tenue" style={{ margin: "0 2px 8px" }}>Algo que va a pasar (el service, un cobro) o que podría pasar (un viaje, unas zapatillas).</div>}
      {lista.length > 0 && (
        <div className="caja lista">
          {lista.map(p => {
            const cat = d.catPorId.get(p.categoriaId);
            const termino = p.periodo < periodoHoy();
            const ing = p.tipo === "ingreso";
            return (
              <div key={p.id} className="fila" style={{ flexWrap: "wrap" }}>
                <button className="izq" style={{ textAlign: "left", flex: 1, minWidth: 0 }} onClick={() => nav.abrir({ p: "proyeccion", id: p.id })}>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                    <div className="mini tenue"><span className={`etiq ${p.clase === "seguro" ? "e-fijo" : "e-variable"}`}>{p.clase}</span> {cat?.nombre} · {nombreMes(p.periodo, false)}</div>
                  </span>
                </button>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="derecha">{(() => {
                    // Dólares primero; la moneda original abajo.
                    const rango = (a: number, b?: number) => `${num(a)}${b && b > a ? `–${num(b)}` : ""}`;
                    const t = tasa(p.moneda), clase = `num chico${p.activa ? (ing ? " ok" : "") : " tenue"}`;
                    const original = `${ing ? "+" : ""}${rango(p.monto, p.montoMax)} ${p.moneda}`;
                    if (p.moneda === "USD" || !t) return <div className={clase}>{original}</div>;
                    return <><div className={clase}>~{ing ? "+" : ""}{rango(Math.round(p.monto / t), p.montoMax ? Math.round(p.montoMax / t) : undefined)} USD</div><div className="mini tenue num">{original}</div></>;
                  })()}</span>
                  {!termino && <Interruptor on={p.activa} cambiar={v => db.proyecciones.update(p.id, { activa: v })} />}
                </span>
                {termino && (
                  <div style={{ width: "100%", display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                    <span className="mini ambar" style={{ alignSelf: "center", marginRight: "auto" }}>Terminó {nombreMes(p.periodo, false)}: ¿pasó?</span>
                    <button className="btn2" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => noPaso(p)}>No pasó</button>
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
 *  al máximo si hay rangos. El número de cada mes va arriba del punto. */
function GraficoLinea({ puntos }: { puntos: PuntoMes[] }) {
  const W = 320, H = 170, izq = 26, der = 12, arriba = 18, abajo = 22;
  const valores = puntos.flatMap(p => [p.normal, p.min, p.max]);
  // No arranca en 0: las diferencias entre meses son lo que importa.
  const minV = Math.min(...valores), maxV = Math.max(...valores);
  const aire = Math.max((maxV - minV) * 0.25, Math.abs(maxV) * 0.1, 1);
  let lo = minV - aire, hi = maxV + aire * 0.6;
  if (minV >= 0) lo = Math.max(0, lo);
  const X = (i: number) => izq + (i * (W - izq - der)) / Math.max(1, puntos.length - 1);
  const Y = (v: number) => arriba + ((hi - v) * (H - arriba - abajo)) / (hi - lo || 1);
  const linea = (k: keyof PuntoMes) => puntos.map((p, i) => `${X(i)},${Y(p[k] as number)}`).join(" ");
  // Unas 3 líneas guía en números redondos (100, 200, 500, 1000…).
  const crudo = (hi - lo) / 3, mag = Math.pow(10, Math.floor(Math.log10(crudo || 1)));
  const paso = ([1, 2, 5, 10].find(m => m * mag >= crudo) ?? 10) * mag;
  const guias: number[] = [];
  for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) guias.push(v);
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 1)}k` : num(v, 0));
  const hayRango = puntos.some(p => p.max - p.min > 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Gasto por mes, normal y con proyecciones">
      {guias.map(v => <g key={v}><line x1={izq - 4} x2={W - der} y1={Y(v)} y2={Y(v)} stroke="var(--linea)" /><text x={0} y={Y(v) + 3} fill="var(--tenue)" fontSize="9">{k(v)}</text></g>)}
      {hayRango && <polygon points={`${linea("max")} ${puntos.map((p, i) => `${X(i)},${Y(p.min)}`).reverse().join(" ")}`} fill="var(--viol)" fillOpacity={0.18} />}
      <polyline points={linea("normal")} fill="none" stroke="var(--tenue)" strokeWidth={2} />
      <polyline points={linea("medio")} fill="none" stroke="var(--viol)" strokeWidth={2} strokeDasharray="4 3" />
      {puntos.map((p, i) => {
        const cambia = Math.abs(p.medio - p.normal) > 0.5;
        return (
          <g key={p.periodo}>
            <circle cx={X(i)} cy={Y(p.medio)} r={3} fill={cambia ? "var(--viol)" : "var(--tenue)"} />
            <text x={X(i)} y={Y(Math.max(p.max, p.medio, p.normal)) - 7} textAnchor="middle" fill={cambia ? "var(--viol-claro)" : "var(--tenue)"} fontSize="10">{num(p.medio, 0)}</text>
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
  const [f, setF] = useState({ nombre: "", tipo: "gasto" as Tipo, clase: "seguro" as Proyeccion["clase"], montoTxt: "", maxTxt: "", moneda: "USD" as Moneda, periodo: props.periodo ?? periodoHoy(), categoriaId: "" });
  const [rango, setRango] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    if (listo.current || !d.listo || !existente) return;
    listo.current = true;
    const e = existente;
    setF({ nombre: e.nombre, tipo: e.tipo, clase: e.clase, montoTxt: String(e.monto).replace(".", ","), maxTxt: e.montoMax ? String(e.montoMax).replace(".", ",") : "", moneda: e.moneda, periodo: e.periodo, categoriaId: e.categoriaId });
    setRango(!!e.montoMax);
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(f.montoTxt), max = rango ? leerNumero(f.maxTxt) : 0;
  const valido = !!f.nombre.trim() && monto > 0 && !!f.categoriaId && (!rango || max > monto);
  const cats = d.categorias.filter(c => c.tipo === f.tipo && (!c.archivada || c.id === f.categoriaId));
  const meses = proximos();

  async function guardar() {
    if (!valido) return;
    // Nueva: los seguros arrancan prendidos y los opcionales apagados. Si cambiás de
    // seguro a opcional (o al revés), también.
    const activa = existente && existente.clase === f.clase ? existente.activa : f.clase === "seguro";
    await db.proyecciones.put({
      id: existente?.id ?? nuevoId(), nombre: f.nombre.trim(), tipo: f.tipo, clase: f.clase, monto, montoMax: rango ? max : undefined, moneda: f.moneda,
      periodo: f.periodo, categoriaId: f.categoriaId, activa, creado: existente?.creado ?? new Date().toISOString(),
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
        <h1>{existente ? "Editar proyección" : "Nueva proyección"}</h1>
        {existente && <button className="accion peligro" aria-label="Eliminar" onClick={borrar}><T.IconTrash size={21} /></button>}
      </div>
      <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={f.tipo} cambiar={t => setF(x => ({ ...x, tipo: t, categoriaId: "" }))} />
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder={f.tipo === "gasto" ? "Service del auto, zapatillas…" : "Cobro de un proyecto…"} autoFocus={!existente} /></div>
      <div className="campo">
        <Seg opciones={[["seguro", "Seguro"], ["opcional", "Opcional"]]} valor={f.clase} cambiar={v => set("clase", v)} />
        <div className="mini tenue" style={{ marginTop: 4 }}>{f.clase === "seguro" ? "Muy probable: arranca prendido en el gráfico." : "Puede no pasar: arranca apagado y lo prendés para ver cómo impactaría."}</div>
      </div>
      <div className="campo">
        <label>¿Cuánto?</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input inputMode="decimal" value={f.montoTxt} onChange={e => set("montoTxt", e.target.value.replace(/[^\d.,]/g, ""))} placeholder={rango ? "Desde" : "0"} style={{ flex: 1, minWidth: 0 }} />
          {rango && <><span className="tenue">a</span><input inputMode="decimal" value={f.maxTxt} onChange={e => set("maxTxt", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Hasta" style={{ flex: 1, minWidth: 0 }} /></>}
        </div>
        <div style={{ marginTop: 6 }}><Seg opciones={MONEDAS.map(m => [m, m] as [Moneda, string])} valor={f.moneda} cambiar={v => set("moneda", v)} /></div>
        <button className="mini viol" style={{ marginTop: 4 }} onClick={() => setRango(!rango)}>{rango ? "− un solo monto" : "+ es un rango (entre … y …)"}</button>
        {rango && max > 0 && max <= monto && <div className="mini ambar">El "hasta" tiene que ser mayor.</div>}
      </div>
      <div className="campo">
        <label>¿En qué mes?</label>
        <div className="pills">
          {meses.map(p => <button key={p} className={`pill${f.periodo === p ? " on" : ""}`} onClick={() => set("periodo", p)}>{mesCorto(p)}</button>)}
          <label className={`pill${!meses.includes(f.periodo) ? " on" : ""}`} style={{ position: "relative" }}>
            {!meses.includes(f.periodo) ? nombreMes(f.periodo, false) : "otro…"}
            <input type="month" value={f.periodo} onChange={e => e.target.value && set("periodo", e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0 }} aria-label="Elegir mes" />
          </label>
        </div>
      </div>
      <div className="campo"><label>Categoría</label>
        <select value={f.categoriaId} onChange={e => set("categoriaId", e.target.value)}>
          <option value="">Elegir…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="pie-fijo"><button className="btn" disabled={!valido} onClick={guardar}>Guardar</button></div>
    </div>
  );
}

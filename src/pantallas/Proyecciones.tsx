import { useEffect, useMemo, useRef, useState } from "react";
import { useDatos, type Datos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav, type Pantalla } from "../nav";
import { MONEDAS, type Moneda, type Proyeccion } from "../tipos";
import { fechaEnMes, hoy, mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { mesProyectado, promedioGasto, usdDeProyeccion, type TasaMoneda } from "../lib/proyecciones";
import { Interruptor, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Resumen → Proyecciones. Gastos que todavía no pasaron: "seguros" (siempre suman)
   y "caprichos" (se prenden para ver cómo impactarían). */

const AZUL = "#60A5FA", AMBAR = "#FBBF24";
const RAYADO = `repeating-linear-gradient(45deg, ${AMBAR} 0 3px, #6b5520 3px 6px)`;

export const tasaDeProyecciones = (d: Datos): TasaMoneda => m => d.tasas.de(m);

const proximos = () => Array.from({ length: 6 }, (_, i) => sumarMeses(periodoHoy(), i));

export function Proyecciones() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [periodo, setPeriodo] = useState(periodoHoy());
  const tasa = useMemo(() => tasaDeProyecciones(d), [d]);
  const meses = proximos();
  const porMes = useMemo(() => meses.map(p => mesProyectado(p, d.movimientos, d.recurrentes, d.proyecciones, d.tasaRec, tasa)), [d, tasa]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = porMes.find(x => x.periodo === periodo) ?? mesProyectado(periodo, d.movimientos, d.recurrentes, d.proyecciones, d.tasaRec, tasa);
  const promedio = useMemo(() => promedioGasto(d.movimientos), [d.movimientos]);
  const delMes = d.proyecciones.filter(p => p.periodo === periodo).sort((a, b) => a.creado.localeCompare(b.creado));
  const seguros = delMes.filter(p => p.clase === "seguro"), caprichos = delMes.filter(p => p.clase === "capricho");
  // Las de meses que ya pasaron: ¿pasó o no?
  const vencidas = d.proyecciones.filter(p => p.periodo < periodoHoy());

  const prender = (p: Proyeccion, on: boolean) => db.proyecciones.update(p.id, { activa: on });
  const noPaso = async (p: Proyeccion) => {
    await db.proyecciones.delete(p.id);
    toast({ texto: `${p.nombre}: no pasó`, deshacer: () => { db.proyecciones.put(p); } });
  };
  const paso = (p: Proyeccion) => nav.abrir({
    p: "editor", tipo: "gasto", monto: p.montoMax ? undefined : p.monto, categoriaId: p.categoriaId, comentario: p.nombre, proyeccionId: p.id, moneda: p.moneda,
    fecha: p.periodo === periodoHoy() ? hoy() : p.periodo < periodoHoy() ? fechaEnMes(p.periodo, 31) : `${p.periodo}-01`,
  });

  const monto = (p: Proyeccion) => `${num(p.monto)}${p.montoMax && p.montoMax > p.monto ? `–${num(p.montoMax)}` : ""} ${p.moneda}`;
  const fila = (p: Proyeccion, conSwitch: boolean, conPaso: boolean) => {
    const cat = d.catPorId.get(p.categoriaId);
    const u = usdDeProyeccion(p, tasa);
    return (
      <div key={p.id} className="fila" style={{ flexWrap: "wrap" }}>
        <button className="izq" style={{ textAlign: "left", flex: 1 }} onClick={() => nav.abrir({ p: "proyeccion", id: p.id })}>
          <Punto cat={cat} chico />
          <span><div>{p.nombre}</div><div className="mini tenue">{cat?.nombre} · {nombreMes(p.periodo, false)}</div></span>
        </button>
        <span className="derecha" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            <div className={`num chico${conSwitch && !p.activa ? " tenue" : ""}`}>{monto(p)}</div>
            {p.moneda !== "USD" && <div className="mini tenue num">≈ {num(u.medio, 0)} USD</div>}
          </span>
          {conSwitch && <Interruptor on={p.activa} cambiar={v => prender(p, v)} />}
        </span>
        {conPaso && (
          <div style={{ width: "100%", display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
            <span className="mini tenue" style={{ alignSelf: "center", marginRight: "auto" }}>¿Ya pasó?</span>
            <button className="btn2" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => noPaso(p)}>No pasó</button>
            <button className="btn1" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => paso(p)}>Cargarlo como gasto</button>
          </div>
        )}
      </div>
    );
  };

  const pct = (x: number) => `${m.total ? (x / m.total) * 100 : 0}%`;
  const hayRango = m.min !== m.max;
  const maxBarra = Math.max(1, ...porMes.map(x => x.total));

  return (
    <>
      {vencidas.length > 0 && (
        <>
          <div className="titulo-sec"><span>De meses que ya pasaron</span><span>{vencidas.length}</span></div>
          <div className="caja lista">{vencidas.map(p => fila(p, false, true))}</div>
        </>
      )}

      <div className="pills scroll" style={{ marginBottom: 10 }}>
        {meses.map(p => <button key={p} className={`pill${p === periodo ? " on" : ""}`} onClick={() => setPeriodo(p)}>{nombreMes(p, false)}</button>)}
      </div>

      <div className="caja">
        <div className="tenue chico">{nombreMes(periodo, false)[0].toUpperCase() + nombreMes(periodo, false).slice(1)}, cómo quedaría</div>
        <div className="mediano num">{hayRango ? "~" : ""}{num(m.total, 0)} <span className="chico tenue">USD</span></div>
        {hayRango && <div className="mini tenue">entre {num(m.min, 0)} y {num(m.max, 0)}</div>}
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", margin: "8px 0", background: "var(--linea)" }}>
          <div style={{ width: pct(m.base), background: AZUL }} />
          <div style={{ width: pct(m.seguros), background: AMBAR }} />
          <div style={{ width: pct(m.caprichos), background: RAYADO }} />
        </div>
        <div className="fila mini" style={{ padding: "2px 0" }}><span className="tenue"><span style={{ color: AZUL }}>■</span> gastado + recurrentes que faltan</span><span className="num">{num(m.base, 0)}</span></div>
        <div className="fila mini" style={{ padding: "2px 0" }}><span className="tenue"><span style={{ color: AMBAR }}>■</span> seguros</span><span className="num">{num(m.seguros, 0)}</span></div>
        <div className="fila mini" style={{ padding: "2px 0" }}><span className="tenue"><span style={{ color: AMBAR }}>▨</span> caprichos prendidos</span><span className="num">{num(m.caprichos, 0)}</span></div>
        {(m.caprichosTodos > m.caprichos || promedio != null) && (
          <div className="mini tenue sep" style={{ marginTop: 6, paddingTop: 6 }}>
            {m.caprichosTodos > m.caprichos && <>Con todos los caprichos: <span className="ambar">{num(m.total - m.caprichos + m.caprichosTodos, 0)} USD</span>. </>}
            {promedio != null && <>Tu promedio de gasto es {num(promedio, 0)} USD.</>}
          </div>
        )}
      </div>

      <div className="titulo-sec"><span>Seguros</span><span className="mini">siempre cuentan</span></div>
      {seguros.length ? <div className="caja lista">{seguros.map(p => fila(p, false, p.periodo === periodoHoy()))}</div>
        : <div className="mini tenue" style={{ margin: "0 2px 8px" }}>Lo que es muy probable que pase: el service, un regalo, un impuesto.</div>}

      <div className="titulo-sec"><span>Caprichos</span><span className="mini">prendé para ver el impacto</span></div>
      {caprichos.length ? <div className="caja lista">{caprichos.map(p => fila(p, true, p.periodo === periodoHoy()))}</div>
        : <div className="mini tenue" style={{ margin: "0 2px 8px" }}>Lo que te gustaría y podría no pasar. Puede tener un rango.</div>}

      <button className="btn1" style={{ width: "100%", marginTop: 4 }} onClick={() => nav.abrir({ p: "proyeccion", periodo })}>+ Nueva proyección</button>

      <div className="caja" style={{ marginTop: 12, padding: "10px 12px 6px" }}>
        <div className="mini tenue" style={{ marginBottom: 4 }}>Próximos 6 meses · USD</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, borderBottom: "1px solid var(--linea)" }}>
          {porMes.map(x => (
            <button key={x.periodo} onClick={() => setPeriodo(x.periodo)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch", minWidth: 0 }}>
              <span className="mini num" style={{ textAlign: "center", color: x.periodo === periodo ? "var(--tinta)" : "var(--tenue)", fontSize: 10 }}>{num(x.total, 0)}</span>
              <span style={{ height: `${(x.caprichos / maxBarra) * 78}%`, background: RAYADO, borderRadius: "3px 3px 0 0" }} />
              <span style={{ height: `${(x.seguros / maxBarra) * 78}%`, background: AMBAR }} />
              <span style={{ height: `${(x.base / maxBarra) * 78}%`, background: AZUL, opacity: x.periodo === periodo ? 1 : 0.7 }} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {porMes.map(x => <span key={x.periodo} className="mini tenue" style={{ flex: 1, textAlign: "center" }}>{mesCorto(x.periodo)}</span>)}
        </div>
        <div className="mini tenue" style={{ marginTop: 4 }}>Azul: lo gastado y los recurrentes. Amarillo: seguros. Rayado: caprichos prendidos.</div>
      </div>
    </>
  );
}

export function EditorProyeccion(props: Extract<Pantalla, { p: "proyeccion" }>) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = props.id ? d.proyecciones.find(p => p.id === props.id) : undefined;
  const listo = useRef(false);
  const [f, setF] = useState({ nombre: "", clase: "seguro" as Proyeccion["clase"], montoTxt: "", maxTxt: "", moneda: "USD" as Moneda, periodo: props.periodo ?? periodoHoy(), categoriaId: "" });
  const [rango, setRango] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    if (listo.current || !d.listo || !existente) return;
    listo.current = true;
    setF({ nombre: existente.nombre, clase: existente.clase, montoTxt: String(existente.monto).replace(".", ","), maxTxt: existente.montoMax ? String(existente.montoMax).replace(".", ",") : "", moneda: existente.moneda, periodo: existente.periodo, categoriaId: existente.categoriaId });
    setRango(!!existente.montoMax);
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(f.montoTxt), max = rango ? leerNumero(f.maxTxt) : 0;
  const valido = !!f.nombre.trim() && monto > 0 && !!f.categoriaId && (!rango || max > monto);
  const cats = d.categorias.filter(c => c.tipo === "gasto" && (!c.archivada || c.id === f.categoriaId));
  const meses = proximos();

  async function guardar() {
    if (!valido) return;
    await db.proyecciones.put({
      id: existente?.id ?? nuevoId(), nombre: f.nombre.trim(), clase: f.clase, monto, montoMax: rango ? max : undefined, moneda: f.moneda,
      periodo: f.periodo, categoriaId: f.categoriaId, activa: existente?.activa ?? false, creado: existente?.creado ?? new Date().toISOString(),
    });
    toast({ texto: existente ? "Proyección guardada" : f.clase === "capricho" ? "Capricho agregado (apagado)" : "Seguro agregado" });
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
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Service del auto, zapatillas…" autoFocus={!existente} /></div>
      <div className="campo">
        <Seg opciones={[["seguro", "Seguro"], ["capricho", "Capricho"]]} valor={f.clase} cambiar={v => set("clase", v)} />
        <div className="mini tenue" style={{ marginTop: 4 }}>{f.clase === "seguro" ? "Muy probable: siempre suma en la proyección." : "Opcional: arranca apagado y lo prendés para ver cómo impactaría."}</div>
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

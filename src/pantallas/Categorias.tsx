import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav } from "../nav";
import type { Categoria, Clase, Tipo } from "../tipos";
import { claseDe, sugerirClase, sugerirObjetivo } from "../lib/analisis";
import { leerNumero, num } from "../lib/formato";
import { ICONOS } from "../ui/Icono";
import { EtiquetaClase, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

const COLORES = ["#7C5CF0", "#5B21B6", "#6366F1", "#3B5BDB", "#3AA8E0", "#0E9594", "#22B8A5", "#2F9E6B", "#5E9E1C", "#C9A20A", "#E0A21B", "#E8701A", "#E5484D", "#B42318", "#D9559A", "#C2417A", "#9B7FD1", "#7E9C84", "#6B6880", "#8B6F4E"];

export function ListaCategorias() {
  const d = useDatos();
  const nav = useNav();
  const [tipo, setTipo] = useState<Tipo>("gasto");
  const cats = d.categorias.filter(c => c.tipo === tipo);
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Categorías</h1></div>
      <div className="solapas">
        <button className={tipo === "gasto" ? "on" : ""} onClick={() => setTipo("gasto")}>GASTOS</button>
        <button className={tipo === "ingreso" ? "on" : ""} onClick={() => setTipo("ingreso")}>INGRESOS</button>
      </div>
      <div className="cats">
        {cats.filter(c => !c.archivada).map(c => (
          <button key={c.id} className="cat" onClick={() => nav.abrir({ p: "categoria", id: c.id })}>
            <Punto cat={c} /><span>{c.nombre}</span>
            {tipo === "gasto" && <EtiquetaClase clase={claseDe(c)} sugerida={!c.claseConfirmada} />}
          </button>
        ))}
        <button className="cat" onClick={() => nav.abrir({ p: "categoria", tipo })}><Punto icono="question-mark" color="var(--viol)" /><span>Crear</span></button>
      </div>
      {cats.some(c => c.archivada) && (
        <>
          <div className="titulo-sec"><span>Archivadas</span></div>
          <div className="pills">{cats.filter(c => c.archivada).map(c => <button key={c.id} className="pill" onClick={() => nav.abrir({ p: "categoria", id: c.id })}>{c.nombre}</button>)}</div>
        </>
      )}
      {tipo === "gasto" && <div className="mini tenue" style={{ marginTop: 16 }}>Con "?" = fijo o variable según mi sugerencia; confirmalo o cambialo desde la categoría o en "Para revisar".</div>}
    </div>
  );
}

export function EditorCategoria({ id, tipo }: { id?: string; tipo?: Tipo }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = id ? d.categorias.find(c => c.id === id) : undefined;
  const listo = useRef(false);
  const [c, setC] = useState<Omit<Categoria, "id" | "orden">>({ nombre: "", tipo: tipo ?? "gasto", icono: "wallet", color: COLORES[0] });
  const [objTxt, setObjTxt] = useState("");
  const [todosIconos, setTodosIconos] = useState(false);
  useEffect(() => {
    if (listo.current || !d.listo) return;
    listo.current = true;
    if (existente) { setC(existente); setObjTxt(existente.objetivo != null ? String(existente.objetivo) : ""); }
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC(x => ({ ...x, [k]: v }));
  const sug = existente ? sugerirClase(existente, d.movimientos) : null;
  const sugObj = existente && c.tipo === "gasto" ? sugerirObjetivo(existente, d.movimientos) : null;
  const usada = existente && d.movimientos.some(m => m.categoriaId === existente.id);
  const iconos = Object.keys(ICONOS);

  async function guardar() {
    if (!c.nombre.trim()) return;
    const objetivo = objTxt.trim() ? leerNumero(objTxt) : undefined;
    await db.categorias.put({ ...c, nombre: c.nombre.trim(), objetivo, id: existente?.id ?? nuevoId(), orden: existente?.orden ?? d.categorias.length });
    toast({ texto: "Categoría guardada" });
    nav.volver();
  }
  async function eliminar() {
    if (!existente) return;
    if (usada) { await db.categorias.update(existente.id, { archivada: !existente.archivada }); toast({ texto: existente.archivada ? "Categoría reactivada" : "Categoría archivada" }); }
    else { await db.categorias.delete(existente.id); toast({ texto: "Categoría eliminada" }); }
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>{existente ? "Editar categoría" : "Nueva categoría"}</h1></div>
      <div className="fila">
        <Punto icono={c.icono} color={c.color} />
        <div className="campo" style={{ flex: 1 }}><input value={c.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre de la categoría" autoFocus={!existente} /></div>
      </div>
      {!existente && <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={c.tipo} cambiar={v => set("tipo", v)} />}

      {c.tipo === "gasto" && (
        <>
          <div className="campo">
            <label>¿El monto cambia de un mes a otro?</label>
            <Seg opciones={[["fijo", "Fijo"], ["variable", "Variable"]] as [Clase, string][]} valor={c.clase ?? sug?.clase ?? "variable"} cambiar={v => setC(x => ({ ...x, clase: v, claseConfirmada: true }))} />
            {sug && !c.claseConfirmada && <div className="mini viol" style={{ marginTop: 4 }}>Sugerencia: {sug.clase} · {sug.porque}</div>}
          </div>
          <div className="campo">
            <label>Objetivo mensual (USD)</label>
            <input inputMode="decimal" value={objTxt} onChange={e => setObjTxt(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Sin objetivo" />
            {sugObj && <button className="mini viol" onClick={() => setObjTxt(String(sugObj.objetivo))}>Sugerido: {num(sugObj.objetivo)} · tu promedio es {num(sugObj.promedio)}, 10% menos</button>}
            <div className="mini tenue">No te frena: solo marca en rojo si te pasás.</div>
          </div>
        </>
      )}

      <div className="titulo-sec"><span>Ícono</span></div>
      <div className="cats" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        {(todosIconos ? iconos : iconos.slice(0, 23)).map(n => (
          <button key={n} className={`cat${c.icono === n ? " on" : ""}`} onClick={() => set("icono", n)} aria-label={n}>
            <Punto icono={n} color={c.icono === n ? c.color : "#2A2A36"} chico />
          </button>
        ))}
        {!todosIconos && <button className="cat" onClick={() => setTodosIconos(true)} aria-label="Más íconos"><Punto icono="question-mark" color="var(--viol)" chico /></button>}
      </div>
      <div className="titulo-sec"><span>Color</span></div>
      <div className="pills">
        {COLORES.map(col => <button key={col} aria-label={col} onClick={() => set("color", col)} style={{ width: 30, height: 30, borderRadius: "50%", background: col, outline: c.color === col ? "2px solid var(--tinta)" : "none", outlineOffset: 2 }} />)}
      </div>
      <div className="pie-fijo"><button className="btn" disabled={!c.nombre.trim()} onClick={guardar}>Guardar</button></div>
      {existente && <button className="btn2" style={{ width: "100%", marginTop: 12 }} onClick={eliminar}>{usada ? (existente.archivada ? "Reactivar" : "Archivar (tiene movimientos)") : "Eliminar categoría"}</button>}
    </div>
  );
}

export function Objetivos() {
  const d = useDatos();
  const nav = useNav();
  const cats = d.categorias.filter(c => c.tipo === "gasto" && !c.archivada);
  const variables = cats.filter(c => claseDe(c) === "variable");
  const total = variables.reduce((s, c) => s + (c.objetivo ?? 0), 0);
  const guardar = (c: Categoria, txt: string) => db.categorias.update(c.id, { objetivo: txt.trim() ? leerNumero(txt) : undefined });
  const fila = (c: Categoria) => {
    const sug = c.objetivo == null ? sugerirObjetivo(c, d.movimientos) : null;
    return (
      <div key={c.id} className="fila">
        <span className="izq"><Punto cat={c} chico /><span>
          <div>{c.nombre}</div>
          {sug && <button className="mini viol" onClick={() => guardar(c, String(sug.objetivo))}>usar {num(sug.objetivo)} (promedio {num(sug.promedio)})</button>}
        </span></span>
        <input inputMode="decimal" className="num derecha" style={{ width: 90, borderBottom: "1px solid var(--linea-2)", padding: "4px 0" }}
          defaultValue={c.objetivo ?? ""} key={String(c.objetivo)} placeholder="—" onBlur={e => guardar(c, e.target.value)} aria-label={`Objetivo de ${c.nombre}`} />
      </div>
    );
  };
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Objetivos</h1></div>
      <div className="caja"><div className="fila" style={{ padding: 0 }}><span>Total variables</span><span className="mediano num">{num(total)} USD</span></div><div className="mini tenue">por mes · pasarte no bloquea nada: solo se marca en rojo</div></div>
      <div className="titulo-sec"><span>Variables</span><span>USD por mes</span></div>
      <div className="caja lista">{variables.map(fila)}</div>
      {cats.some(c => claseDe(c) === "fijo") && (
        <>
          <div className="titulo-sec"><span>Fijos</span></div>
          <div className="caja lista">{cats.filter(c => claseDe(c) === "fijo").map(fila)}</div>
        </>
      )}
    </div>
  );
}

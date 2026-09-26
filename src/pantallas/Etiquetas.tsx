import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { db, guardarAjuste, leerAjuste } from "../db";
import { useNav } from "../nav";
import { Hoja, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Las etiquetas salen de los gastos. "Dejar de sugerir" la saca de la carga sin
   tocar los gastos que ya la tienen; renombrar la cambia en todos. */
export function Etiquetas() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const ocultas = useLiveQuery(() => leerAjuste<string[]>("etiquetasOcultas", []), []) ?? [];
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");

  const uso = new Map<string, number>();
  for (const m of d.movimientos) for (const e of m.etiquetas) uso.set(e, (uso.get(e) ?? 0) + 1);
  const todas = [...uso.entries()].sort((a, b) => b[1] - a[1]);
  const activas = todas.filter(([e]) => !ocultas.includes(e));
  const escondidas = todas.filter(([e]) => ocultas.includes(e));

  const ocultar = (e: string, si: boolean) => guardarAjuste("etiquetasOcultas", si ? [...new Set([...ocultas, e])] : ocultas.filter(x => x !== e));

  async function renombrar() {
    const viejo = editando!, n = nuevo.trim();
    if (!n || n === viejo) { setEditando(null); return; }
    const afectados = d.movimientos.filter(m => m.etiquetas.includes(viejo));
    // No cambia `modificado`: las etiquetas no afectan lo que ya se exportó a Finanzas.
    await db.movimientos.bulkUpdate(afectados.map(m => ({ key: m.id, changes: { etiquetas: [...new Set(m.etiquetas.map(e => (e === viejo ? n : e)))] } })));
    if (ocultas.includes(viejo)) await ocultar(viejo, false);
    setEditando(null);
    toast({ texto: `"${viejo}" ahora es "${n}" en ${afectados.length} gastos` });
  }

  const fila = ([e, n]: [string, number], oculta: boolean) => (
    <div key={e} className="fila">
      <span>{e} <span className="tenue mini">· {n} {n === 1 ? "gasto" : "gastos"}</span></span>
      <span style={{ display: "flex", gap: 6 }}>
        <button className="btn2" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => { setEditando(e); setNuevo(e); }}>Renombrar</button>
        <button className="btn2" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => ocultar(e, !oculta)}>{oculta ? "Volver a sugerir" : "Dejar de sugerir"}</button>
      </span>
    </div>
  );

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Etiquetas</h1></div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Las creás al cargar un gasto. "Dejar de sugerir" la saca de la carga; los gastos que ya la tienen no cambian.</div>
      {!todas.length && <div className="vacio">Todavía no usaste etiquetas.</div>}
      {activas.length > 0 && <div className="caja lista">{activas.map(x => fila(x, false))}</div>}
      {escondidas.length > 0 && (
        <>
          <div className="titulo-sec"><span>Sin sugerir</span></div>
          <div className="caja lista">{escondidas.map(x => fila(x, true))}</div>
        </>
      )}
      <Hoja abierta={!!editando} cerrar={() => setEditando(null)}>
        <h2>Renombrar "{editando}"</h2>
        <div className="campo"><input autoFocus value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === "Enter" && renombrar()} /></div>
        <div className="espacio" />
        <button className="btn" onClick={renombrar}>Guardar</button>
      </Hoja>
    </div>
  );
}

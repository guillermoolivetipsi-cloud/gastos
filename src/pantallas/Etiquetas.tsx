import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { db, guardarAjuste, leerAjuste } from "../db";
import { useNav } from "../nav";
import { Hoja, Punto, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";
import { categoriasDeEtiquetas } from "./editorLogica";

/* Las etiquetas y sus categorías. Cada etiqueta aparece al cargar un gasto de su
   categoría. La categoría sale de dónde la usaste, o la elegís acá. "Dejar de
   sugerir" la saca de la carga sin tocar los gastos que ya la tienen. */

type Edicion = { modo: "nueva" | "categorias" | "renombrar"; etiqueta: string; nombre: string; cats: string[] };

export function Etiquetas() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const ocultas = useLiveQuery(() => leerAjuste<string[]>("etiquetasOcultas", []), []) ?? [];
  const asignadas = useLiveQuery(() => leerAjuste<Record<string, string[]>>("etiquetasCategorias", {}), []) ?? {};
  const mapa = useMemo(() => categoriasDeEtiquetas(d.movimientos, asignadas), [d.movimientos, asignadas]);
  const [ed, setEd] = useState<Edicion | null>(null);

  const todas = [...mapa.entries()].sort((a, b) => b[1].usos - a[1].usos || a[0].localeCompare(b[0]));
  const activas = todas.filter(([e]) => !ocultas.includes(e));
  const escondidas = todas.filter(([e]) => ocultas.includes(e));
  const catsActivas = d.categorias.filter(c => !c.archivada);

  const ocultar = (e: string, si: boolean) => guardarAjuste("etiquetasOcultas", si ? [...new Set([...ocultas, e])] : ocultas.filter(x => x !== e));
  const asignar = (cambios: (a: Record<string, string[]>) => void) => db.transaction("rw", db.ajustes, async () => {
    const actual = await leerAjuste<Record<string, string[]>>("etiquetasCategorias", {});
    cambios(actual);
    await guardarAjuste("etiquetasCategorias", actual);
  });

  async function guardar() {
    if (!ed) return;
    const nombre = ed.nombre.trim();
    if (ed.modo === "nueva") {
      if (!nombre || !ed.cats.length) return;
      await asignar(a => { a[nombre] = ed.cats; });
      toast({ texto: `Etiqueta "${nombre}" creada` });
    } else if (ed.modo === "categorias") {
      await asignar(a => { a[ed.etiqueta] = ed.cats; });
    } else if (nombre && nombre !== ed.etiqueta) {
      const afectados = d.movimientos.filter(m => m.etiquetas.includes(ed.etiqueta));
      // No cambia `modificado`: las etiquetas no afectan lo que ya se exportó a Finanzas.
      await db.movimientos.bulkUpdate(afectados.map(m => ({ key: m.id, changes: { etiquetas: [...new Set(m.etiquetas.map(e => (e === ed.etiqueta ? nombre : e)))] } })));
      await asignar(a => { if (a[ed.etiqueta]) { a[nombre] = a[ed.etiqueta]; delete a[ed.etiqueta]; } });
      if (ocultas.includes(ed.etiqueta)) await ocultar(ed.etiqueta, false);
      toast({ texto: `"${ed.etiqueta}" ahora es "${nombre}" en ${afectados.length} gastos` });
    }
    setEd(null);
  }

  const fila = ([e, v]: [string, { cats: string[]; usos: number }], oculta: boolean) => (
    <div key={e} className="fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div className="fila" style={{ padding: 0 }}>
        <span>{e} <span className="tenue mini">· {v.usos} {v.usos === 1 ? "gasto" : "gastos"}</span></span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="btn2" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setEd({ modo: "renombrar", etiqueta: e, nombre: e, cats: v.cats })}>Renombrar</button>
          <button className="btn2" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => ocultar(e, !oculta)}>{oculta ? "Volver a sugerir" : "Dejar de sugerir"}</button>
        </span>
      </div>
      <button className="pills" style={{ textAlign: "left" }} onClick={() => setEd({ modo: "categorias", etiqueta: e, nombre: e, cats: v.cats })} aria-label={`Categorías de ${e}`}>
        {v.cats.map(id => d.catPorId.get(id)).filter(Boolean).map(c => (
          <span key={c!.id} className="pill" style={{ padding: "3px 8px", fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c!.color, display: "inline-block" }} />{c!.nombre}</span>
        ))}
        <span className="pill viol" style={{ padding: "3px 8px", fontSize: 12 }}><T.IconPencil size={12} /> categoría</span>
      </button>
    </div>
  );

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>Etiquetas</h1>
        <button className="accion" aria-label="Nueva etiqueta" onClick={() => setEd({ modo: "nueva", etiqueta: "", nombre: "", cats: [] })}><T.IconPlus size={22} /></button>
      </div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Cada etiqueta aparece al cargar un gasto de su categoría. Tocá la categoría para cambiarla. "Dejar de sugerir" no cambia los gastos que ya la tienen.</div>
      {!todas.length && <div className="vacio">Todavía no tenés etiquetas.</div>}
      {activas.length > 0 && <div className="caja lista">{activas.map(x => fila(x, false))}</div>}
      {escondidas.length > 0 && (
        <>
          <div className="titulo-sec"><span>Sin sugerir</span></div>
          <div className="caja lista">{escondidas.map(x => fila(x, true))}</div>
        </>
      )}
      <button className="btn1" style={{ width: "100%", marginTop: 10 }} onClick={() => setEd({ modo: "nueva", etiqueta: "", nombre: "", cats: [] })}>+ Nueva etiqueta</button>

      <Hoja abierta={!!ed} cerrar={() => setEd(null)}>
        {ed && (
          <>
            <h2>{ed.modo === "nueva" ? "Nueva etiqueta" : ed.modo === "renombrar" ? `Renombrar "${ed.etiqueta}"` : `Categorías de "${ed.etiqueta}"`}</h2>
            {ed.modo !== "categorias" && (
              <div className="campo"><input autoFocus value={ed.nombre} placeholder="Nombre" onChange={e => setEd({ ...ed, nombre: e.target.value })} onKeyDown={e => e.key === "Enter" && guardar()} /></div>
            )}
            {ed.modo !== "renombrar" && (
              <>
                <div className="etq" style={{ marginTop: 10 }}>¿En qué categorías aparece?</div>
                <div className="pills">
                  {catsActivas.map(c => {
                    const on = ed.cats.includes(c.id);
                    return (
                      <button key={c.id} className={`pill${on ? " on" : ""}`} onClick={() => setEd({ ...ed, cats: on ? ed.cats.filter(x => x !== c.id) : [...ed.cats, c.id] })}>
                        <Punto cat={c} chico /> {c.nombre}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="espacio" />
            <button className="btn" disabled={ed.modo !== "renombrar" && !ed.cats.length || ed.modo !== "categorias" && !ed.nombre.trim()} onClick={guardar}>Guardar</button>
          </>
        )}
      </Hoja>
    </div>
  );
}

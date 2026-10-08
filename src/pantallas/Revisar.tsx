import { useState } from "react";
import { useDatos, usePendientes } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import type { Categoria, Clase } from "../tipos";
import { crearDesdeSugerencia, descartar, pausar, vincular } from "../lib/acciones";
import { claseDe, sugerirClase } from "../lib/analisis";
import { fechaCorta, nombreMes } from "../lib/fecha";
import { num } from "../lib/formato";
import { Hoja, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* "Para revisar": lo que la app te propone. Nada se aplica sin que lo confirmes.
   Reglas de las preguntas (CLAUDE.md): agrupadas por tipo, lo urgente primero (lo que
   tiene fecha), cada una con la pregunta corta y un dato, y solo "Sí", "No" y "⋯"
   (ahí van "Otra cosa…" y "Ahora no", que la esconde 30 días). */

interface Accion { texto: string; hacer: () => unknown }
interface Pregunta { id: string; titulo: string; dato: string; si: Accion; no?: Accion; mas: Accion[]; punto?: Categoria }
interface Grupo { id: string; titulo: string; urgente: boolean; preguntas: Pregunta[] }

export function Revisar() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const p = usePendientes();
  const [abiertos, setAbiertos] = useState<Set<string> | null>(null);
  const [opciones, setOpciones] = useState<Pregunta | null>(null);
  if (!d.listo || !p) return <div className="pantalla sin-tabs" />;
  const cat = new Map(d.categorias.map(c => [c.id, c]));
  const ahoraNo = (clave: string, dias = "30 días"): Accion => ({ texto: `Ahora no (${dias})`, hacer: () => pausar(clave) });
  const pct = (a: number, b: number) => Math.round(Math.abs(b - a) / a * 100);

  const grupos: Grupo[] = [
    { id: "tareas", titulo: "Para hacer este mes", urgente: true, preguntas: p.tareas.map(t => ({
      id: t.clave, titulo: t.titulo,
      dato: t.tipo === "resumen" ? `cerró en ${nombreMes(t.periodo, false)}` : t.tipo === "exportar" ? `quedan movimientos de ${nombreMes(t.periodo, false)}` : "todavía no anotaste nada hoy",
      si: t.tipo === "diario" ? { texto: "Cargar", hacer: () => nav.abrir({ p: "editor" }) } : t.tipo === "resumen" ? { texto: "Subir", hacer: () => nav.abrir({ p: "subir-resumen", cuentaId: t.cuenta.id }) } : { texto: "Mandar", hacer: () => nav.abrir({ p: "exportar" }) },
      no: { texto: t.tipo === "diario" ? "Hoy no gasté" : "Ya lo hice", hacer: () => descartar(t.clave) },
      mas: t.tipo === "diario" ? [] : [ahoraNo(t.clave, "3 días")],
    })) },
    { id: "vinculos", titulo: "¿Es el pago de un recurrente?", urgente: true, preguntas: p.vinculos.map(({ inst, mov }) => ({
      id: mov.id + inst.rec.id, punto: cat.get(mov.categoriaId),
      titulo: `¿Es el pago de ${inst.rec.nombre}?`,
      dato: `${fechaCorta(mov.fecha, false)} · ${num(mov.monto)} ${mov.moneda}${mov.comentario ? ` · ${mov.comentario}` : ""}`,
      si: { texto: "Sí", hacer: async () => { const deshacer = await vincular(mov.id, inst.rec.id, inst.clave); toast({ texto: `Vinculado como pago de ${inst.rec.nombre}`, deshacer }); } },
      no: { texto: "No", hacer: () => descartar(`vinc|${mov.id}|${inst.rec.id}`) },
      mas: [{ texto: "Otra cosa…", hacer: () => nav.abrir({ p: "instancia", id: inst.rec.id, clave: inst.clave }) }, ahoraNo(`vinc|${mov.id}|${inst.rec.id}`)],
    })) },
    { id: "cierres", titulo: "Cierres de tarjeta", urgente: true, preguntas: p.cierres.map(c => ({
      id: c.cuenta.id + c.periodo, titulo: `¿Qué día cerró la ${c.cuenta.nombre} en ${nombreMes(c.periodo, false)}?`,
      dato: c.compras === 1 ? "1 compra en esos días" : `${c.compras} compras en esos días`,
      si: { texto: "Elegir el día", hacer: () => nav.abrir({ p: "tarjeta", id: c.cuenta.id, periodo: c.periodo }) },
      mas: [ahoraNo(`cierre|${c.cuenta.id}|${c.periodo}`)],
    })) },
    { id: "precios", titulo: "Cambios de precio", urgente: false, preguntas: p.precios.map(x => ({
      id: x.clave, titulo: `${x.rec.nombre}: ${num(x.antes)} → ${num(x.ahora)} ${x.rec.moneda}`,
      dato: `${x.ahora > x.antes ? "subió" : "bajó"} un ${pct(x.antes, x.ahora)}%`,
      si: { texto: "Actualizar", hacer: async () => { const antes = x.rec.monto; await db.recurrentes.update(x.rec.id, { monto: x.ahora }); await descartar(x.clave); toast({ texto: `${x.rec.nombre}: ahora ${num(x.ahora)} ${x.rec.moneda}`, deshacer: () => { db.recurrentes.update(x.rec.id, { monto: antes }); } }); } },
      no: { texto: "Fue una vez", hacer: () => descartar(x.clave) },
      mas: [{ texto: "Otra cosa…", hacer: () => nav.abrir({ p: "recurrente", id: x.rec.id }) }, ahoraNo(x.clave)],
    })) },
    { id: "recurrentes", titulo: "Recurrentes que encontré", urgente: false, preguntas: p.recurrentes.map(x => ({
      id: x.clave, punto: cat.get(x.categoriaId), titulo: `¿${x.nombre} es recurrente?`,
      dato: `${x.meses.length} meses · ${x.clase === "variable" ? "~" : ""}${num(x.monto)} ${x.moneda} · el ${x.dia}`,
      si: { texto: "Es recurrente", hacer: async () => { const deshacer = await crearDesdeSugerencia(x, d.movimientos); toast({ texto: `${x.nombre}: agregado a recurrentes`, deshacer }); } },
      no: { texto: "No", hacer: () => descartar(`rec|${x.clave}`) },
      mas: [{ texto: "Otra cosa…", hacer: () => nav.abrir({ p: "recurrente", desdeSugerencia: x.clave }) }, ahoraNo(`rec|${x.clave}`)],
    })) },
    { id: "clases", titulo: "Fijas o variables", urgente: false, preguntas: p.clases.length ? [{
      id: "clases", titulo: "¿Qué categorías son fijas?", dato: `${p.clases.length} para revisar en una lista`,
      si: { texto: "Revisar", hacer: () => nav.abrir({ p: "clases" }) },
      mas: [ahoraNo("clases")],
    }] : [] },
  ].filter(g => g.preguntas.length);
  // Lo urgente primero (lo que tiene fecha); el resto, después.
  grupos.sort((a, b) => Number(b.urgente) - Number(a.urgente));
  const abiertosEf = abiertos ?? new Set(grupos.slice(0, 1).map(g => g.id));
  const alternar = (id: string) => { const n = new Set(abiertosEf); if (n.has(id)) n.delete(id); else n.add(id); setAbiertos(n); };

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Para revisar</h1></div>
      {p.total === 0 && <div className="vacio"><T.IconCheck size={32} /><div>Nada para revisar.</div></div>}

      {grupos.map(g => {
        const abierto = abiertosEf.has(g.id);
        return (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <button className="caja" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: abierto ? 8 : 0 }} onClick={() => alternar(g.id)} aria-expanded={abierto}>
              <span className={g.urgente ? "ambar" : ""}>{g.titulo}</span>
              <span className="tenue chico" style={{ display: "flex", alignItems: "center", gap: 4 }}>{g.preguntas.length}{abierto ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}</span>
            </button>
            {abierto && g.preguntas.map(q => (
              <div key={q.id} className="caja sug" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {q.punto && <Punto cat={q.punto} chico />}
                  <span style={{ minWidth: 0 }}><div>{q.titulo}</div><div className="mini tenue">{q.dato}</div></span>
                </div>
                <div className="botones" style={{ alignItems: "center" }}>
                  <button className="btn1" onClick={() => q.si.hacer()}>{q.si.texto}</button>
                  {q.no && <button className="btn2" onClick={() => q.no!.hacer()}>{q.no.texto}</button>}
                  {q.mas.length > 0 && <button className="btn2" aria-label="Más opciones" style={{ flex: "0 0 48px", padding: 0 }} onClick={() => setOpciones(q)}>⋯</button>}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <Hoja abierta={!!opciones} cerrar={() => setOpciones(null)}>
        {opciones && (
          <>
            <h2>{opciones.titulo}</h2>
            {opciones.mas.map(a => <button key={a.texto} className="opcion" onClick={() => { setOpciones(null); a.hacer(); }}>{a.texto}</button>)}
            <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setOpciones(null)}>Cancelar</button>
          </>
        )}
      </Hoja>
    </div>
  );
}

/** Todas las categorías de gastos en una lista: fijo o variable, con la propuesta marcada. */
export function Clases() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [elegido, setElegido] = useState<Record<string, Clase>>({});
  if (!d.listo) return <div className="pantalla sin-tabs" />;
  const cats = d.categorias.filter(c => c.tipo === "gasto" && !c.archivada);
  const propuesta = (id: string): Clase => {
    const c = cats.find(x => x.id === id)!;
    return c.claseConfirmada ? claseDe(c) : sugerirClase(c, d.movimientos)?.clase ?? claseDe(c);
  };
  const valor = (id: string) => elegido[id] ?? propuesta(id);
  const orden = [...cats].sort((a, b) => Number(!!a.claseConfirmada) - Number(!!b.claseConfirmada) || a.orden - b.orden);

  async function guardar() {
    await db.categorias.bulkUpdate(cats.map(c => ({ key: c.id, changes: { clase: valor(c.id), claseConfirmada: true } })));
    toast({ texto: "Categorías guardadas" });
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Tus categorías</h1></div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Fijo: el monto casi no cambia de un mes a otro. Variable: cambia, o hay meses sin nada. Lo que cargues como recurrente fijo (alquiler, gym) cuenta como fijo aunque su categoría sea variable.</div>
      <div className="caja lista">
        {orden.map(c => (
          <div key={c.id} className="fila">
            <span className="izq"><Punto cat={c} chico /><span>{c.nombre}{!c.claseConfirmada && <span className="mini viol"> · propuesta</span>}</span></span>
            <div style={{ width: 150 }}><Seg opciones={[["fijo", "Fijo"], ["variable", "Variable"]] as [Clase, string][]} valor={valor(c.id)} cambiar={v => setElegido(x => ({ ...x, [c.id]: v }))} /></div>
          </div>
        ))}
      </div>
      <div className="pie-fijo"><button className="btn" onClick={guardar}>Guardar todo</button></div>
    </div>
  );
}

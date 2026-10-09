import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav } from "../nav";
import type { Categoria, Clase, Movimiento, Tipo } from "../tipos";
import { claseDe, sugerirClase, sugerirObjetivo, usdDe } from "../lib/analisis";
import { periodoHoy } from "../lib/fecha";
import { leerNumero, num } from "../lib/formato";
import { ICONOS } from "../ui/Icono";
import { Barra, Hoja, Punto, Seg, useToast } from "../ui/piezas";

/** La marca de las barras con objetivo: el 80% (igual que en Resumen). */
const ALERTA = 0.8;
import { T } from "../ui/Icono";

const COLORES = ["#7C5CF0", "#5B21B6", "#6366F1", "#3B5BDB", "#3AA8E0", "#0E9594", "#22B8A5", "#2F9E6B", "#5E9E1C", "#C9A20A", "#E0A21B", "#E8701A", "#E5484D", "#B42318", "#D9559A", "#C2417A", "#9B7FD1", "#7E9C84", "#6B6880", "#8B6F4E"];

/** Lo gastado (o cobrado) en el mes en curso, en USD, por categoría. */
function delMes(movs: Movimiento[]) {
  const p = periodoHoy(), t = new Map<string, number>();
  for (const m of movs) if (m.fecha.slice(0, 7) === p) t.set(m.categoriaId, (t.get(m.categoriaId) ?? 0) + usdDe(m));
  return t;
}

/* Reglas de Categorías: una lista como el resto de la app, los objetivos acá mismo
   (Variables y Fijos con lo gastado contra el objetivo), y las archivadas plegadas. */
export function ListaCategorias() {
  const d = useDatos();
  const nav = useNav();
  const [tipo, setTipo] = useState<Tipo>("gasto");
  const [verArchivadas, setVerArchivadas] = useState(false);
  const cats = d.categorias.filter(c => c.tipo === tipo);
  const activas = cats.filter(c => !c.archivada), archivadas = cats.filter(c => c.archivada);
  const gastado = delMes(d.movimientos);
  const guardarObj = (c: Categoria, v: number) => db.categorias.update(c.id, { objetivo: v });

  const fila = (c: Categoria) => {
    const g = gastado.get(c.id) ?? 0;
    const obj = tipo === "gasto" ? c.objetivo ?? null : null;
    const sug = tipo === "gasto" && obj == null ? sugerirObjetivo(c, d.movimientos) : null;
    const pasado = obj != null && g > obj, cerca = obj != null && !pasado && g >= obj * ALERTA;
    return (
      <div key={c.id} className="fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="izq" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "categoria", id: c.id })}>
            <Punto cat={c} chico />
            <span style={{ minWidth: 0 }}>
              <div>{c.nombre}</div>
              {tipo === "gasto" && !c.claseConfirmada && <div className="mini tenue">{claseDe(c)} · sin confirmar</div>}
            </span>
          </button>
          <span className="num derecha">{num(g, 0)}{obj != null && <span className="tenue chico"> / {num(obj)}</span>}</span>
        </div>
        {sug && <button className="mini viol" style={{ textAlign: "left", paddingLeft: 38 }} onClick={() => guardarObj(c, sug.objetivo)}>usar {num(sug.objetivo)} de objetivo (promedio {num(sug.promedio)})</button>}
        {obj != null && <div style={{ paddingLeft: 38 }}><Barra valor={g / obj} color={pasado ? "var(--mal)" : cerca ? "var(--ambar)" : c.color} marca={ALERTA} /></div>}
      </div>
    );
  };
  const variables = activas.filter(c => claseDe(c) === "variable"), fijos = activas.filter(c => claseDe(c) === "fijo");
  const totalObj = variables.reduce((s, c) => s + (c.objetivo ?? 0), 0);

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>Categorías</h1>
        <button className="accion" aria-label="Nueva categoría" onClick={() => nav.abrir({ p: "categoria", tipo })}><T.IconPlus size={22} /></button>
      </div>
      <div className="solapas">
        <button className={tipo === "gasto" ? "on" : ""} onClick={() => setTipo("gasto")}>GASTOS</button>
        <button className={tipo === "ingreso" ? "on" : ""} onClick={() => setTipo("ingreso")}>INGRESOS</button>
      </div>
      {tipo === "gasto" ? (
        <>
          <div className="grupo-t" style={{ marginTop: 6 }}><span>Variables</span><span className="num">{totalObj > 0 ? `objetivo ${num(totalObj)} USD/mes` : "sin objetivos"}</span></div>
          <div className="mini tenue" style={{ margin: "-4px 2px 8px" }}>Lo gastado este mes contra tu objetivo. Pasarte no bloquea nada: solo se marca en rojo.</div>
          {variables.length > 0 && <div className="caja lista">{variables.map(fila)}</div>}
          {fijos.length > 0 && <>
            <div className="grupo-t"><span>Fijos</span><span className="num">{num(fijos.reduce((s, c) => s + (gastado.get(c.id) ?? 0), 0), 0)} este mes</span></div>
            <div className="caja lista">{fijos.map(fila)}</div>
          </>}
        </>
      ) : (
        <>
          <div className="grupo-t" style={{ marginTop: 6 }}><span>Ingresos</span><span className="num">{num(activas.reduce((s, c) => s + (gastado.get(c.id) ?? 0), 0), 0)} este mes</span></div>
          <div className="caja lista">{activas.map(fila)}</div>
        </>
      )}
      {archivadas.length > 0 && <>
        <button className="grupo-t" style={{ width: "100%", color: "var(--tenue)", fontWeight: 400 }} onClick={() => setVerArchivadas(!verArchivadas)}>
          <span>Archivadas ({archivadas.length})</span>{verArchivadas ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
        </button>
        {verArchivadas && <div className="caja lista">{archivadas.map(fila)}</div>}
      </>}
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
  const [menu, setMenu] = useState(false);
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

  const claseVal = c.clase ?? sug?.clase ?? "variable";
  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{existente ? "Editar categoría" : "Nueva categoría"}</h1>
        {existente && <button className="accion" aria-label="Más opciones" onClick={() => setMenu(true)}><T.IconDots size={22} /></button>}
      </div>

      {/* Arriba, la categoría y su objetivo grande (regla de Categorías); el ícono y el color al final. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, margin: "4px 0 8px" }}>
        <Punto icono={c.icono} color={c.color} grande />
        <input value={c.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre de la categoría" autoFocus={!existente}
          style={{ fontSize: 20, textAlign: "center", width: "100%", borderBottom: "1px solid var(--linea)", padding: "4px 0" }} />
        {c.tipo === "gasto" && <div className="mini tenue">gasto · {claseVal}</div>}
      </div>
      {/* Gasto o ingreso se puede cambiar mientras nada la use. */}
      {!usada && !d.recurrentes.some(r => r.categoriaId === existente?.id)
        ? <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={c.tipo} cambiar={v => set("tipo", v)} />
        : null}

      {c.tipo === "gasto" && (
        <>
          <div className="monto-grande" style={{ marginTop: 10 }}>
            <div className="mini tenue">Objetivo por mes</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6 }}>
              <input inputMode="decimal" value={objTxt} onChange={e => setObjTxt(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="—" aria-label="Objetivo por mes en USD" style={{ width: 160 }} />
              <span className="chico tenue">USD</span>
            </div>
          </div>
          <div className="centro">
            {sugObj && <button className="mini viol" onClick={() => setObjTxt(String(sugObj.objetivo))}>Sugerido: {num(sugObj.objetivo)} · tu promedio es {num(sugObj.promedio)}, 10% menos</button>}
            <div className="mini tenue">No te frena: solo marca en rojo si te pasás.</div>
          </div>
          <div className="grupo-t"><span>¿El monto cambia de un mes a otro?</span></div>
          <Seg opciones={[["fijo", "Fijo"], ["variable", "Variable"]] as [Clase, string][]} valor={claseVal} cambiar={v => setC(x => ({ ...x, clase: v, claseConfirmada: true }))} />
          {sug && !c.claseConfirmada && <div className="mini viol" style={{ marginTop: 4 }}>Sugerencia: {sug.clase} · {sug.porque}</div>}
        </>
      )}

      <div className="grupo-t"><span>Ícono</span></div>
      <div className="cats iconos" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        {(todosIconos ? iconos : iconos.slice(0, 23)).map(n => (
          <button key={n} className={`cat${c.icono === n ? " on" : ""}`} onClick={() => set("icono", n)} aria-label={n}>
            <Punto icono={n} color={c.icono === n ? c.color : "#2A2A36"} chico />
          </button>
        ))}
        {!todosIconos && <button className="cat" onClick={() => setTodosIconos(true)} aria-label="Más íconos"><Punto icono="question-mark" color="var(--viol)" chico /></button>}
      </div>
      <div className="grupo-t"><span>Color</span></div>
      <div className="pills">
        {COLORES.map(col => <button key={col} aria-label={col} onClick={() => set("color", col)} style={{ width: 30, height: 30, borderRadius: "50%", background: col, outline: c.color === col ? "2px solid var(--tinta)" : "none", outlineOffset: 2 }} />)}
      </div>
      <div className="pie-fijo"><button className="btn" disabled={!c.nombre.trim()} onClick={guardar}>Guardar</button></div>

      <Hoja abierta={menu} cerrar={() => setMenu(false)}>
        <h2>{existente?.nombre}</h2>
        {existente && (
          <button className={`opcion${usada ? "" : " mal"}`} onClick={() => { setMenu(false); eliminar(); }}>
            <div>{usada ? (existente.archivada ? "Reactivar" : "Archivar") : "Eliminar"}</div>
            <div className="mini tenue">{usada ? (existente.archivada ? "Vuelve a aparecer para elegir." : "Tiene movimientos: se guardan, pero no aparece para elegir.") : "No tiene movimientos: se borra."}</div>
          </button>
        )}
        <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setMenu(false)}>Cancelar</button>
      </Hoja>
    </div>
  );
}

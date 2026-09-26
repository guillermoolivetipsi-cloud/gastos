import { useState } from "react";
import { useDatos, usePendientes } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import type { Clase } from "../tipos";
import { crearDesdeSugerencia, descartar, pausar, vincular } from "../lib/acciones";
import { claseDe, sugerirClase } from "../lib/analisis";
import { fechaCorta, mesCorto, nombreMes } from "../lib/fecha";
import { num } from "../lib/formato";
import { Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* "Para revisar": lo que la app te propone. Nada se aplica sin que lo confirmes.
   Cada pregunta tiene su respuesta rápida, "Otra cosa…" (abre el formulario para
   contestar lo que quieras) y "Ahora no" (la esconde 30 días). */
export function Revisar() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const p = usePendientes();
  if (!d.listo || !p) return <div className="pantalla sin-tabs" />;
  const cat = new Map(d.categorias.map(c => [c.id, c]));
  const AhoraNo = ({ clave }: { clave: string }) => <button className="btn2" onClick={() => pausar(clave)}>Ahora no</button>;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Para revisar</h1></div>
      {p.total === 0 && <div className="vacio"><T.IconCheck size={32} /><div>Nada para revisar.</div></div>}

      {p.tareas.map(t => (
        <div key={t.clave} className="caja aviso">
          <div className="ambar">{t.titulo}</div>
          <div className="mini tenue">{t.detalle}</div>
          <div className="botones">
            {t.tipo === "diario" && <button className="btn1" onClick={() => nav.abrir({ p: "editor" })}>Cargar un gasto</button>}
            {t.tipo === "resumen" && <button className="btn1" onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: t.cuenta.id })}>Subir el resumen</button>}
            {t.tipo === "exportar" && <button className="btn1" onClick={() => nav.abrir({ p: "exportar" })}>Exportar</button>}
            <button className="btn2" onClick={() => descartar(t.clave)}>{t.tipo === "diario" ? "Hoy no gasté" : "Ya lo hice"}</button>
            {t.tipo !== "diario" && <button className="btn2" onClick={() => pausar(t.clave)}>Más tarde</button>}
          </div>
        </div>
      ))}

      {p.clases.length > 0 && (
        <div className="caja sug">
          <div className="fila" style={{ padding: 0 }}><span>¿Qué categorías son fijas?</span><span className="tenue">{p.clases.length}</span></div>
          <div className="mini tenue" style={{ margin: "3px 0 0" }}>Ya las propuse según tu historial. Revisalas en una sola lista.</div>
          <div className="botones">
            <button className="btn1" onClick={() => nav.abrir({ p: "clases" })}>Revisar la lista</button>
            <AhoraNo clave="clases" />
          </div>
        </div>
      )}

      {p.vinculos.map(({ inst, mov }) => (
        <div key={mov.id + inst.rec.id} className="caja sug">
          <div className="izq"><Punto cat={cat.get(mov.categoriaId)} chico /><span>
            <div>{cat.get(mov.categoriaId)?.nombre}{mov.comentario ? ` · ${mov.comentario}` : ""}</div>
            <div className="mini tenue">{fechaCorta(mov.fecha, false)} · {num(mov.monto)} {mov.moneda}</div>
          </span></div>
          <div className="mini tenue" style={{ margin: "4px 0 0 38px" }}>¿Es el pago de <span className="viol">{inst.rec.nombre}</span> de {inst.clave.length === 7 ? nombreMes(inst.clave, false) : fechaCorta(inst.fecha, false)}? (esperado ~{num(inst.esperado)} {inst.rec.moneda})</div>
          <div className="botones">
            <button className="btn1" onClick={async () => { const deshacer = await vincular(mov.id, inst.rec.id, inst.clave); toast({ texto: `Vinculado como pago de ${inst.rec.nombre}`, deshacer }); }}>Sí</button>
            <button className="btn2" onClick={() => descartar(`vinc|${mov.id}|${inst.rec.id}`)}>No</button>
            <button className="btn2" onClick={() => nav.abrir({ p: "instancia", id: inst.rec.id, clave: inst.clave })}>Otra cosa…</button>
            <AhoraNo clave={`vinc|${mov.id}|${inst.rec.id}`} />
          </div>
        </div>
      ))}

      {p.recurrentes.map(s => (
        <div key={s.clave} className="caja sug">
          <div className="vi chico">¿Esto se repite?</div>
          <div className="fila" style={{ paddingBottom: 0 }}>
            <span className="izq"><Punto cat={cat.get(s.categoriaId)} chico /><span>{s.nombre}</span></span>
            <span className="num">{s.clase === "variable" ? "~" : ""}{num(s.monto)} {s.moneda}</span>
          </div>
          <div className="mini tenue" style={{ margin: "2px 0 0 38px" }}>En {s.meses.map(mesCorto).join(", ")}{s.clase === "variable" ? ", con montos distintos" : ""} · alrededor del {s.dia}</div>
          <div className="botones">
            <button className="btn1" onClick={async () => { const deshacer = await crearDesdeSugerencia(s, d.movimientos); toast({ texto: `${s.nombre}: agregado a recurrentes`, deshacer }); }}>Es recurrente</button>
            <button className="btn2" onClick={() => descartar(`rec|${s.clave}`)}>No</button>
            <button className="btn2" onClick={() => nav.abrir({ p: "recurrente", desdeSugerencia: s.clave })}>Otra cosa…</button>
            <AhoraNo clave={`rec|${s.clave}`} />
          </div>
        </div>
      ))}

      {p.precios.map(s => (
        <div key={s.clave} className="caja aviso">
          <div className={s.ahora > s.antes ? "ambar" : "ok"}>{s.rec.nombre} {s.ahora > s.antes ? "subió" : "bajó"} de {num(s.antes)} a {num(s.ahora)} {s.rec.moneda}</div>
          <div className="botones">
            <button className="btn1" onClick={async () => { await db.recurrentes.update(s.rec.id, { monto: s.ahora }); await descartar(s.clave); }}>Actualizar el monto</button>
            <button className="btn2" onClick={() => descartar(s.clave)}>Fue una vez</button>
            <button className="btn2" onClick={() => nav.abrir({ p: "recurrente", id: s.rec.id })}>Otra cosa…</button>
          </div>
        </div>
      ))}

      {p.cierres.map(c => (
        <div key={c.cuenta.id + c.periodo} className="caja aviso">
          <div className="ambar chico">¿Qué día cerró la {c.cuenta.nombre} en {nombreMes(c.periodo, false)}?</div>
          <div className="mini tenue">{c.compras === 1 ? "Hay 1 compra" : `Hay ${c.compras} compras`} en esos días que pueden ir a uno u otro resumen.</div>
          <div className="botones">
            <button className="btn1" onClick={() => nav.abrir({ p: "tarjeta", id: c.cuenta.id, periodo: c.periodo })}>Elegir el día</button>
            <AhoraNo clave={`cierre|${c.cuenta.id}|${c.periodo}`} />
          </div>
        </div>
      ))}
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

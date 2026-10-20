import { useMemo, useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import type { Movimiento, Recurrente } from "../tipos";
import { bloques, descartesSet, detectarRecurrentes, recurrentesDelMes, usdDe } from "../lib/analisis";
import { fechaDePago, type EstadoInstancia } from "../lib/recurrentes";
import { claveDe, pareceRecurrente } from "../lib/cajas";
import { cambiarCategoria, crearDesdeMovimiento, desvincular, marcarEnCero, vincular } from "../lib/acciones";
import { DIAS_CORTOS, aFecha, fechaCorta, mesCorto, nombreMes } from "../lib/fecha";
import { num } from "../lib/formato";
import { Hoja, Puntito, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Lo que hay adentro de cada caja de Gastos (regla de las cajas): Recurrentes, cada
   recurrente con lo pagado o lo que falta; No recurrentes, primero lo que parece
   recurrente («¿Se repite?») y después por día. Tocar algo abre una hoja para moverlo. */

type Cual = "recurrentes" | "no-recurrentes";

export function Caja({ cual, periodo }: { cual: Cual; periodo: string }) {
  const nav = useNav();
  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{cual === "recurrentes" ? "Recurrentes" : "No recurrentes"}</h1>
        <span className="chico tenue">{nombreMes(periodo, false)}</span>
      </div>
      {cual === "recurrentes" ? <CajaRecurrentes periodo={periodo} /> : <CajaNoRecurrentes periodo={periodo} />}
    </div>
  );
}

function CajaRecurrentes({ periodo }: { periodo: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [elegida, setElegida] = useState<EstadoInstancia | null>(null);
  const [otro, setOtro] = useState(false);
  const insts = useMemo(() => recurrentesDelMes(d.recurrentes, d.movimientos, periodo, d.tasaRec).filter(i => i.rec.tipo === "gasto"), [d.recurrentes, d.movimientos, periodo, d.tasaRec]);
  const enUsd = (i: EstadoInstancia, x: number) => { const t = d.tasaRec(i.rec); return t ? x / t : 0; };
  const pagado = (i: EstadoInstancia) => i.pagos.reduce((s, m) => s + usdDe(m), 0);
  const falta = (i: EstadoInstancia) => (i.estado === "cargado" || i.cero ? 0 : enUsd(i, i.estado === "parcial" ? i.falta : i.esperado));
  // Lo más caro arriba (como en Recurrentes).
  const orden = [...insts].sort((a, b) => pagado(b) + falta(b) - (pagado(a) + falta(a)));
  const totPag = insts.reduce((s, i) => s + pagado(i), 0), totFalta = insts.reduce((s, i) => s + falta(i), 0);
  const cerrar = () => { setElegida(null); setOtro(false); };
  const hacer = async (texto: string, f: () => Promise<() => Promise<void>>) => { cerrar(); const deshacer = await f(); toast({ texto, deshacer }); };
  const otros = d.recurrentes.filter(r => r.activo && r.tipo === "gasto" && r.id !== elegida?.rec.id);

  return <>
    <div style={{ margin: "4px 2px 6px" }}>
      <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(totPag, 0)}{totFalta >= 1 && <span className="chico tenue"> / {num(totPag + totFalta, 0)}</span>}</div>
      <div className="mini tenue" style={{ marginTop: 2 }}>{insts.length} {insts.length === 1 ? "recurrente" : "recurrentes"} este mes{totFalta >= 1 ? ` · faltan ${num(totFalta, 0)}` : " · todo pagado"}</div>
    </div>
    {!insts.length && <div className="vacio">Sin recurrentes este mes.</div>}
    {insts.length > 0 && <div className="caja lista" style={{ marginTop: 10 }}>
      {orden.map(i => {
        const cat = d.catPorId.get(i.rec.categoriaId), f = falta(i), p = pagado(i);
        const estado = i.cero ? "fue 0" : i.estado === "cargado" ? "pagado" : i.estado === "parcial" ? <span className="ambar">parcial</span> : <span className="ambar">falta</span>;
        return (
          <div key={i.rec.id + i.clave} className="fila">
            <button className="izq" style={{ textAlign: "left" }} onClick={() => setElegida(i)}>
              <Puntito cat={cat} />
              <span style={{ minWidth: 0 }}><div>{i.rec.nombre}</div><div className="mini tenue">el {Number(i.fecha.slice(8))} · {estado}{i.pagos[0] ? ` · ${d.cuentaPorId.get(i.pagos[0].cuentaId)?.nombre ?? ""}` : ""}</div></span>
            </button>
            {f >= 1 && !i.pagos.length
              ? <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="num tenue">~{num(f, 0)}</span><button className="btn1" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => nav.abrir({ p: "editor", recurrenteId: i.rec.id, periodo: i.clave, monto: i.estimado ? undefined : i.falta || undefined, fecha: fechaDePago(i) })}>Cargar</button></span>
              : <button className="num" onClick={() => setElegida(i)}>{i.rec.clase === "variable" ? "~" : ""}{num(p, 0)}</button>}
          </div>
        );
      })}
    </div>}

    <Hoja abierta={!!elegida} cerrar={cerrar}>
      {elegida && <>
        <h2>{elegida.rec.nombre} · {mesCorto(periodo)}</h2>
        <div className="mini tenue" style={{ marginBottom: 6 }}>{elegida.pagos.length ? elegida.pagos.map(m => `${fechaCorta(m.fecha, false)} · ${num(m.monto)} ${m.moneda}`).join(" · ") : "todavía sin pago este mes"}</div>
        {elegida.pagos.length > 0 ? <>
          {/* Primero, el gasto mismo: se toca para abrirlo y ver qué es. */}
          {elegida.pagos.map(m => (
            <button key={m.id} className="opcion" onClick={() => { cerrar(); nav.abrir({ p: "editor", id: m.id }); }}>
              <div>Abrir el gasto{elegida.pagos.length > 1 ? ` del ${fechaCorta(m.fecha, false)}` : ""}</div>
              <div className="mini tenue">{[fechaCorta(m.fecha, false), m.comentario || m.etiquetas.join(", ") || d.catPorId.get(m.categoriaId)?.nombre, `${num(m.monto)} ${m.moneda}`, d.cuentaPorId.get(m.cuentaId)?.nombre].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
          <button className="opcion" onClick={() => hacer(`Ya no es de ${elegida.rec.nombre}`, () => desvincular(elegida.pagos.map(m => m.id)))}>
            <div>No es de {elegida.rec.nombre}</div><div className="mini tenue">pasa a no recurrentes</div>
          </button>
          <button className="opcion" onClick={() => setOtro(!otro)}><div>Es de otro recurrente ▾</div><div className="mini tenue">elegís cuál</div></button>
          {otro && <div className="pills" style={{ marginTop: 8 }}>
            {otros.map(r => <button key={r.id} className="pill" onClick={() => hacer(`Ahora es de ${r.nombre}`, async () => {
              const deshaceres = await Promise.all(elegida.pagos.map(m => vincular(m.id, r.id, claveDe(r, m.fecha))));
              return async () => { for (const x of deshaceres) await x(); };
            })}>{r.nombre}</button>)}
          </div>}
          <button className="opcion" onClick={() => { cerrar(); nav.abrir({ p: "instancia", id: elegida.rec.id, clave: elegida.clave }); }}><div>Ver el recurrente del mes</div></button>
        </> : <>
          <button className="opcion" onClick={() => { cerrar(); nav.abrir({ p: "editor", recurrenteId: elegida.rec.id, periodo: elegida.clave, monto: elegida.estimado ? undefined : elegida.falta || undefined, fecha: fechaDePago(elegida) }); }}><div>Cargar el pago</div></button>
          <button className="opcion" onClick={() => { cerrar(); nav.abrir({ p: "instancia", id: elegida.rec.id, clave: elegida.clave }); }}><div>¿Ya lo cargaste? Elegilo</div><div className="mini tenue">un gasto de los no recurrentes</div></button>
          {!elegida.cero && <button className="opcion" onClick={() => hacer(`${elegida.rec.nombre}: fue 0 este mes`, async () => { await marcarEnCero(elegida.rec, elegida.clave, true); return async () => { await marcarEnCero(elegida.rec, elegida.clave, false); }; })}><div>Fue 0 este mes</div></button>}
        </>}
      </>}
    </Hoja>
  </>;
}

function CajaNoRecurrentes({ periodo }: { periodo: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [elegido, setElegido] = useState<Movimiento | null>(null);
  const [abierto, setAbierto] = useState<"rec" | "cat" | null>(null);
  const recPorId = useMemo(() => new Map(d.recurrentes.map(r => [r.id, r])), [d.recurrentes]);
  const delMes = useMemo(() => d.movimientos.filter(m => m.tipo === "gasto" && m.fecha.slice(0, 7) === periodo), [d.movimientos, periodo]);
  const sueltos = delMes.filter(m => !recPorId.has(m.recurrenteId ?? ""));
  const pendientes = useMemo(() => recurrentesDelMes(d.recurrentes, d.movimientos, periodo, d.tasaRec).filter(i => i.estado !== "cargado"), [d.recurrentes, d.movimientos, periodo, d.tasaRec]);
  const b = bloques(periodo, delMes, d.categorias, d.recurrentes, pendientes, d.tasaRec).noRecurrentes;
  const sugerencias = useMemo(() => detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, descartesSet(d.descartes)), [d.movimientos, d.categorias, d.recurrentes, d.descartes]);
  const parece = useMemo(() => pareceRecurrente(sueltos, sugerencias, d.recurrentes), [sueltos, sugerencias, d.recurrentes]);
  const seRepite = sueltos.filter(m => parece.has(m.id));
  const resto = sueltos.filter(m => !parece.has(m.id)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  const porDia = [...new Set(resto.map(m => m.fecha))].map(f => ({ f, ms: resto.filter(m => m.fecha === f) }));

  const cerrar = () => { setElegido(null); setAbierto(null); };
  const hacer = async (texto: string, f: () => Promise<() => Promise<void>>) => { cerrar(); const deshacer = await f(); toast({ texto, deshacer }); };
  const queFue = (m: Movimiento) => m.comentario || m.etiquetas.join(", ") || d.catPorId.get(m.categoriaId)?.nombre || "Gasto";
  const activos = d.recurrentes.filter(r => r.activo && r.tipo === "gasto");
  // Arriba, el recurrente al que se parece.
  const sugerido = elegido ? parece.get(elegido.id) ?? null : null;
  const recsOrden: Recurrente[] = sugerido ? [sugerido, ...activos.filter(r => r.id !== sugerido.id)] : activos;

  const fila = (m: Movimiento) => {
    const cat = d.catPorId.get(m.categoriaId), cuenta = d.cuentaPorId.get(m.cuentaId), q = queFue(m);
    const p = parece.get(m.id);
    return (
      <button key={m.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => setElegido(m)}>
        <span className="izq">
          <Puntito cat={cat} />
          <span style={{ minWidth: 0 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q}</div>
            <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {q !== cat?.nombre ? `${cat?.nombre ?? "Sin categoría"} · ` : ""}{cuenta?.nombre}{m.moneda !== "USD" ? ` · ${num(m.monto)} ${m.moneda}` : ""}
              {parece.has(m.id) && <span className="viol"> · {p ? `¿es ${p.nombre}?` : "¿se repite?"}</span>}
            </div>
          </span>
        </span>
        <span className="derecha num" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {m.cuotas && m.cuotas > 1 ? <span className="mini" style={{ color: "var(--azul)" }}>{m.cuotas}×</span> : null}
          −{m.usd != null ? num(m.usd) : "…"}
        </span>
      </button>
    );
  };

  return <>
    <div style={{ margin: "4px 2px 6px" }}>
      <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(b.todo, 0)}</div>
      <div className="mini tenue" style={{ marginTop: 2 }}>{sueltos.length} {sueltos.length === 1 ? "gasto" : "gastos"}{b.objetivo > 0 ? ` · llevás ${num(b.gastado, 0)} de ${num(b.objetivo, 0)} en objetivos` : ""}</div>
    </div>
    {/* De dónde sale el objetivo: cada categoría con lo que queda después de sus recurrentes. */}
    {b.porCategoria.length > 0 && <>
      <div className="grupo-t"><span>Objetivos</span><span className="num">{num(b.gastado, 0)} / {num(b.objetivo, 0)}</span></div>
      <div className="caja lista">
        {b.porCategoria.map(x => (
          <div key={x.cat.id} className="fila">
            <span className="izq"><Puntito cat={x.cat} /><span><div>{x.cat.nombre}</div>{x.objetivo < (x.cat.objetivo ?? 0) - 0.5 && <div className="mini tenue">de {num(x.cat.objetivo!, 0)}, sin lo recurrente</div>}</span></span>
            <span className={`num${x.gastado > x.objetivo ? " mal" : ""}`}>{num(x.gastado, 0)} <span className="tenue chico">/ {num(x.objetivo, 0)}</span></span>
          </div>
        ))}
      </div>
    </>}
    {!sueltos.length && <div className="vacio">Sin gastos no recurrentes este mes.</div>}

    {seRepite.length > 0 && <>
      <div className="grupo-t"><span className="viol">¿Se repite?</span><span className="num">{seRepite.length}</span></div>
      <div className="caja lista sug">{seRepite.map(fila)}</div>
      <div className="mini tenue" style={{ margin: "-4px 2px 0" }}>Se parecen a un recurrente o aparecen todos los meses: tocalos para pasarlos a recurrentes.</div>
    </>}
    {porDia.map(({ f, ms }) => (
      <div key={f}>
        <div className="grupo-t"><span>{Number(f.slice(8))} {mesCorto(f.slice(0, 7))} · {DIAS_CORTOS[aFecha(f).getDay()]}</span><span className="num">−{num(ms.reduce((s, m) => s + usdDe(m), 0), 2)}</span></div>
        <div className="caja lista">{ms.map(fila)}</div>
      </div>
    ))}

    <Hoja abierta={!!elegido} cerrar={cerrar}>
      {elegido && <>
        <h2>{queFue(elegido)} · {fechaCorta(elegido.fecha, false)}</h2>
        <div className="mini tenue" style={{ marginBottom: 6 }}>no recurrente · {num(elegido.monto)} {elegido.moneda} · {d.cuentaPorId.get(elegido.cuentaId)?.nombre}</div>
        <button className="opcion" onClick={() => setAbierto(abierto === "rec" ? null : "rec")}>
          <div>Es el pago de… ▾</div><div className="mini tenue">{sugerido ? `¿${sugerido.nombre}?` : "elegís el recurrente"}</div>
        </button>
        {abierto === "rec" && <div className="pills" style={{ marginTop: 8 }}>
          {recsOrden.map(r => <button key={r.id} className={`pill${r.id === sugerido?.id ? " on" : ""}`} onClick={() => hacer(`Ahora es el pago de ${r.nombre}`, () => vincular(elegido.id, r.id, claveDe(r, elegido.fecha)))}>{r.nombre}</button>)}
          {!recsOrden.length && <span className="mini tenue">Todavía no tenés recurrentes de gasto.</span>}
        </div>}
        <button className="opcion" onClick={() => hacer(`${queFue(elegido)}: agregado a recurrentes`, () => crearDesdeMovimiento(elegido, queFue(elegido)))}>
          <div>Crear un recurrente con este gasto</div><div className="mini tenue">todos los meses, el {Number(elegido.fecha.slice(8))} · {d.cuentaPorId.get(elegido.cuentaId)?.nombre}</div>
        </button>
        <button className="opcion" onClick={() => setAbierto(abierto === "cat" ? null : "cat")}>
          <div>Cambiar la categoría ▾</div><div className="mini tenue">{d.catPorId.get(elegido.categoriaId)?.nombre ?? "Sin categoría"}</div>
        </button>
        {abierto === "cat" && <div className="pills" style={{ marginTop: 8 }}>
          {d.categorias.filter(c => c.tipo === "gasto" && !c.archivada).map(c => <button key={c.id} className={`pill${c.id === elegido.categoriaId ? " on" : ""}`} onClick={() => hacer(`Ahora es ${c.nombre}`, () => cambiarCategoria(elegido, c.id))}><Puntito cat={c} /> {c.nombre}</button>)}
        </div>}
        <button className="opcion" onClick={() => { cerrar(); nav.abrir({ p: "editor", id: elegido.id }); }}><div>Abrir el gasto</div></button>
      </>}
    </Hoja>
  </>;
}

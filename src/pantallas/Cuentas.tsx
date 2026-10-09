import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav } from "../nav";
import { MONEDAS, type Cuenta, type Dolar } from "../tipos";
import { fechaCorta, hoy, mesCorto, nombreMes, periodoDe, periodoHoy, sumarMeses, ultimoDia } from "../lib/fecha";
import { num, redondear } from "../lib/formato";
import { aPagarTarjeta, usdDe } from "../lib/analisis";
import { cuotasFuturas, esDudosa, resumen } from "../lib/tarjeta";
import { Dia, GrupoT, Hoja, Montos, Seg, textoOriginal, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Reglas de Cuentas: cada cuenta con su moneda y lo que salió este mes, cada tarjeta
   con su próximo resumen, y las archivadas plegadas al final. */
export function ListaCuentas() {
  const d = useDatos();
  const nav = useNav();
  const [verArchivadas, setVerArchivadas] = useState(false);
  const p = periodoHoy();
  const delMes = d.movimientos.filter(m => m.fecha.slice(0, 7) === p);
  const salio = (c: Cuenta) => delMes.filter(m => m.cuentaId === c.id && m.tipo === "gasto").reduce((s, m) => s + usdDe(m), 0);
  const cuantos = (c: Cuenta) => delMes.filter(m => m.cuentaId === c.id).length;
  // El resumen que se está juntando: el que cierra este mes, o el del mes que viene si ya cerró.
  const proximo = (c: Cuenta) => {
    let periodo = p, r = resumen(c, d.movimientos, periodo);
    if (r.cierre < hoy()) { periodo = sumarMeses(p, 1); r = resumen(c, d.movimientos, periodo); }
    const ap = aPagarTarjeta(c, d.movimientos, d.recurrentes, periodoDe(r.vence), d.tasaRec, d.resumenesCargados);
    const real = ap.resumen.periodo === periodo && ap.real;
    const previsto = ap.resumen.periodo === periodo && !real ? ap.previsto : 0;
    return { periodo, r, real, total: redondear(r.total + previsto) };
  };
  const filaCuenta = (c: Cuenta) => {
    const s = salio(c), n = cuantos(c);
    return (
      <button key={c.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "cuenta", id: c.id })}>
        <span className="izq"><T.IconBuildingBank size={18} className="tenue" /><span><div>{c.nombre}</div><div className="mini tenue">{c.moneda}{c.moneda === "ARS" ? ` · dólar ${c.dolar}` : ""}{n ? ` · ${n} este mes` : ""}</div></span></span>
        <span className={`num derecha${s ? "" : " tenue"}`}>{s ? num(s, 0) : "—"}</span>
      </button>
    );
  };
  const filaTarjeta = (c: Cuenta) => {
    const x = proximo(c);
    return (
      <button key={c.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "tarjeta", id: c.id, periodo: x.periodo })}>
        <span className="izq"><T.IconCreditCard size={18} /><span><div>{c.nombre}</div><div className="mini tenue">cierra {x.r.confirmado ? "" : "~"}{fechaCorta(x.r.cierre, false)} · vence ~{fechaCorta(x.r.vence, false)}</div></span></span>
        <span className="num derecha">{x.real ? "" : "~"}{num(x.total, 0)}</span>
      </button>
    );
  };
  const activas = d.cuentas.filter(c => !c.archivada), archivadas = d.cuentas.filter(c => c.archivada);
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Cuentas</h1><button className="accion" aria-label="Nueva" onClick={() => nav.abrir({ p: "cuenta" })}><T.IconPlus size={22} /></button></div>
      <GrupoT titulo="Cuentas" derecha="salió este mes" ayuda="Cada cuenta tiene su moneda: al elegirla, el gasto arranca en esa moneda. Los pesos se pasan a USD con el dólar que indiques." />
      <div className="caja lista">{activas.filter(c => !c.esTarjeta).map(filaCuenta)}</div>
      <GrupoT titulo="Tarjetas de crédito" derecha="próximo resumen" />
      <div className="caja lista">{activas.filter(c => c.esTarjeta).map(filaTarjeta)}</div>
      {archivadas.length > 0 && <>
        <button className="grupo-t" style={{ width: "100%", color: "var(--tenue)", fontWeight: 400 }} onClick={() => setVerArchivadas(!verArchivadas)}>
          <span>Archivadas ({archivadas.length})</span>{verArchivadas ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
        </button>
        {verArchivadas && <div className="caja lista">{archivadas.map(filaCuenta)}</div>}
      </>}
    </div>
  );
}

/** Un número de día que se toca para cambiar (regla de los formularios: el valor en violeta, con ▾). */
function ElegirNumero({ valor, desde, hasta, cambiar, etiqueta, sufijo = "" }: { valor: number; desde: number; hasta: number; cambiar: (n: number) => void; etiqueta: string; sufijo?: string }) {
  return (
    <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>
      {valor}{sufijo} ▾
      <select value={valor} aria-label={etiqueta} onChange={e => cambiar(Number(e.target.value))} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }}>
        {Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export function EditorCuenta({ id }: { id?: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = id ? d.cuentas.find(c => c.id === id) : undefined;
  const listo = useRef(false);
  const [menu, setMenu] = useState(false);
  const [c, setC] = useState<Omit<Cuenta, "id" | "orden">>({ nombre: "", moneda: "EUR", dolar: "blue", esTarjeta: false });
  useEffect(() => { if (!listo.current && d.listo) { listo.current = true; if (existente) setC(existente); } }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC(x => ({ ...x, [k]: v }));
  const usada = existente && d.movimientos.some(m => m.cuentaId === existente.id);

  async function guardar() {
    if (!c.nombre.trim()) return;
    const tarjeta = c.esTarjeta ? { cierreDesde: c.cierreDesde ?? 5, cierreHasta: c.cierreHasta ?? 10, venceDias: c.venceDias ?? 10, cierres: c.cierres ?? {} } : {};
    await db.cuentas.put({ ...c, ...tarjeta, nombre: c.nombre.trim(), id: existente?.id ?? nuevoId(), orden: existente?.orden ?? d.cuentas.length });
    toast({ texto: "Cuenta guardada" });
    nav.volver();
  }
  async function eliminar() {
    if (!existente) return;
    if (usada) { await db.cuentas.update(existente.id, { archivada: !existente.archivada }); toast({ texto: existente.archivada ? "Cuenta reactivada" : "Cuenta archivada" }); }
    else {
      const antes = existente;
      await db.cuentas.delete(antes.id);
      toast({ texto: "Cuenta eliminada", deshacer: () => { db.cuentas.put(antes); } });
    }
    nav.volver();
  }
  // La moneda al lado del nombre: un toque pasa a la siguiente (regla de los formularios).
  const sigMoneda = () => set("moneda", MONEDAS[(MONEDAS.indexOf(c.moneda) + 1) % MONEDAS.length]);

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{existente ? "Editar cuenta" : "Nueva cuenta"}</h1>
        {existente && <button className="accion" aria-label="Más opciones" onClick={() => setMenu(true)}><T.IconDots size={22} /></button>}
      </div>
      <Seg opciones={[["cuenta", "Cuenta"], ["tarjeta", "Tarjeta de crédito"]] as ["cuenta" | "tarjeta", string][]} valor={c.esTarjeta ? "tarjeta" : "cuenta"}
        cambiar={v => setC(x => ({ ...x, esTarjeta: v === "tarjeta", dolar: v === "tarjeta" ? "oficial" : x.dolar }))} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--linea)", marginTop: 6 }}>
        <input value={c.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Revolut, Mercado Pago…" aria-label="Nombre" style={{ fontSize: 22, flex: 1, minWidth: 0, textAlign: "center" }} />
        <button className="chip-moneda" onClick={sigMoneda} aria-label="Moneda">{c.moneda} ▾</button>
      </div>
      {c.moneda === "ARS" && (
        <>
          <GrupoT titulo="Pesos a USD con el dólar" ayuda={c.esTarjeta ? "La tarjeta se paga en dólares desde la cuenta: el banco usa el oficial." : "El que usás cuando cambiás plata."} />
          <Seg opciones={[["blue", "Blue"], ["oficial", "Oficial"]] as [Dolar, string][]} valor={c.dolar} cambiar={v => set("dolar", v)} />
        </>
      )}
      {c.esTarjeta && (
        <>
          <GrupoT titulo="Cierre y vencimiento" ayuda="Mientras no subas el resumen de un mes (o elijas el día en la tarjeta), se toma el último día del rango." />
          <div className="caja">
            <div>cierra entre el <ElegirNumero valor={c.cierreDesde ?? 5} desde={1} hasta={31} etiqueta="Cierra desde el día" cambiar={n => set("cierreDesde", n)} /> y el <ElegirNumero valor={c.cierreHasta ?? 10} desde={1} hasta={31} etiqueta="Cierra hasta el día" cambiar={n => set("cierreHasta", n)} /></div>
            <div className="mini tenue" style={{ marginTop: 4 }}>vence <ElegirNumero valor={c.venceDias ?? 10} desde={0} hasta={30} etiqueta="Días hasta el vencimiento" sufijo=" días" cambiar={n => set("venceDias", n)} /> después del cierre</div>
          </div>
        </>
      )}
      <div className="pie-fijo"><button className="btn" disabled={!c.nombre.trim()} onClick={guardar}>Guardar</button></div>

      <Hoja abierta={menu} cerrar={() => setMenu(false)}>
        <h2>{existente?.nombre}</h2>
        {existente && (
          <button className={`opcion${usada ? "" : " mal"}`} onClick={() => { setMenu(false); eliminar(); }}>
            <div>{usada ? (existente.archivada ? "Reactivar" : "Archivar") : "Eliminar"}</div>
            <div className="mini tenue">{usada ? (existente.archivada ? "Vuelve a aparecer para elegir." : "Tiene movimientos: se guardan, pero no aparece para elegir.") : "No tiene movimientos: se borra (con Deshacer)."}</div>
          </button>
        )}
        <button className="opcion tenue" style={{ textAlign: "center" }} onClick={() => setMenu(false)}>Cancelar</button>
      </Hoja>
    </div>
  );
}

/** Una tarjeta: el resumen de un mes, su cierre y lo comprometido en cuotas. */
export function Tarjeta({ id, periodo: inicial }: { id: string; periodo?: string }) {
  const d = useDatos();
  const nav = useNav();
  const [periodo, setPeriodo] = useState(inicial ?? periodoHoy());
  const c = d.cuentas.find(c => c.id === id);
  // Si la eliminaste desde el engranaje, esta pantalla ya no tiene sentido.
  useEffect(() => { if (d.listo && !c) nav.volver(); }, [d.listo, c]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return <div className="pantalla sin-tabs"><div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button></div></div>;
  const r = resumen(c, d.movimientos, periodo);
  const futuras = cuotasFuturas(c, d.movimientos, periodo);
  const cat = new Map(d.categorias.map(c => [c.id, c.nombre]));
  const porCompra = new Map<string, typeof futuras>();
  for (const q of futuras) porCompra.set(q.mov.id, [...(porCompra.get(q.mov.id) ?? []), q]);

  const borrarCierre = () => db.cuentas.where("id").equals(c!.id).modify(x => { const { [periodo]: _, ...resto } = x.cierres ?? {}; x.cierres = resto; });
  const confirmarCierre = (dia: number) => db.cuentas.where("id").equals(c!.id).modify(x => { x.cierres = { ...(x.cierres ?? {}), [periodo]: dia }; });

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{c.nombre}</h1>
        <button className="accion" aria-label="Configurar" onClick={() => nav.abrir({ p: "cuenta", id: c.id })}><T.IconSettings size={21} /></button>
      </div>
      <div className="navega">
        <button aria-label="Anterior" onClick={() => setPeriodo(sumarMeses(periodo, -1))}><T.IconChevronLeft size={20} /></button>
        <span>Cierra en {nombreMes(periodo, false)}</span>
        <button aria-label="Siguiente" onClick={() => setPeriodo(sumarMeses(periodo, 1))}><T.IconChevronRight size={20} /></button>
      </div>
      {/* Un número y una línea (regla de Tarjetas). Mientras no está confirmado, suma los
          recurrentes que todavía no se cobraron (igual que "Lo que viene"). El cierre real
          sale del resumen al subirlo; acá se puede corregir tocando la fecha o volver al estimado. */}
      {(() => {
        const ap = aPagarTarjeta(c, d.movimientos, d.recurrentes, periodoDe(r.vence), d.tasaRec, d.resumenesCargados);
        const real = ap.resumen.periodo === periodo && ap.real;
        const previsto = ap.resumen.periodo === periodo && !real ? ap.previsto : 0;
        return (
          <div style={{ margin: "4px 2px 6px" }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{real ? "" : "~"}{num(redondear(r.total + previsto), 0)} <span className="chico tenue">USD</span></div>
            <div className="mini tenue" style={{ marginTop: 4 }}>
              cierra{" "}
              <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>
                {fechaCorta(r.cierre, false)} ▾
                <input type="date" value={r.cierre} min={`${periodo}-01`} max={ultimoDia(periodo)} aria-label="Día de cierre"
                  onChange={e => e.target.value && confirmarCierre(Number(e.target.value.slice(8)))} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }} />
              </label>
              {r.confirmado ? <> (confirmado · <button className="viol mini" onClick={borrarCierre}>volver al estimado</button>)</> : " (estimado)"} · vence ~{fechaCorta(r.vence, false)}
            </div>
            {(previsto > 0 || r.enCuotas > 0) && (
              <div className="mini tenue">{num(r.total, 0)} de consumos{previsto > 0 && <span className="ambar"> · +{num(previsto, 0)} de recurrentes que faltan</span>}{r.enCuotas > 0 ? ` · ${num(r.enCuotas, 0)} en cuotas` : ""}</div>
            )}
          </div>
        );
      })()}

      <GrupoT titulo={`Qué entra en este resumen · ${r.items.length}`} derecha={num(r.total, 0)} ayuda="Pagar la tarjeta no es un gasto nuevo: ya lo contaste el día de la compra." />
      {!r.items.length && <div className="tenue chico">Nada todavía.</div>}
      {r.items.length > 0 && (
        <div className="caja lista">
          {/* Como Movimientos: arriba lo que fue, abajo la categoría; "3×" para las cuotas y ↻ para un recurrente. */}
          {r.items.map(q => {
            const queFue = q.mov.comentario || q.mov.etiquetas.join(", ");
            const nombreCat = cat.get(q.mov.categoriaId) ?? "Sin categoría";
            const abajo = [queFue ? nombreCat : "", q.de > 1 ? `cuota ${q.numero} de ${q.de}` : textoOriginal({ usd: q.mov.usd, monto: q.mov.monto, moneda: q.mov.moneda }).replace(/^ · /, "")].filter(Boolean).join(" · ");
            return (
              <button key={q.mov.id + q.numero} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: q.mov.id })}>
                <span className="izq"><Dia dia={Number(q.mov.fecha.slice(8))} abajo={mesCorto(q.mov.fecha.slice(0, 7))} /><span style={{ minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{queFue || nombreCat}</div>
                  <div className="mini tenue">{abajo}{q.numero === 1 && esDudosa(c, q.mov.fecha) ? <span className="ambar">{abajo ? " · " : ""}puede ir al próximo</span> : ""}</div>
                </span></span>
                <span className="derecha">
                  <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                    {q.mov.recurrenteId && <T.IconRepeat size={13} className="viol" aria-label="Pago de un recurrente" />}
                    {q.de > 1 && <span className="mini" style={{ color: "var(--azul)" }}>{q.de}×</span>}
                    {q.de > 1 ? <span className="num">{num(q.usd)}</span> : <Montos usd={q.mov.usd} monto={q.mov.monto} moneda={q.mov.moneda} />}
                  </div>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {porCompra.size > 0 && (
        <>
          <div className="grupo-t"><span>Cuotas que siguen</span><span className="num">{num(futuras.reduce((s, q) => s + q.usd, 0))} USD</span></div>
          <div className="caja lista">
            {[...porCompra.values()].map(qs => (
              <div key={qs[0].mov.id} className="fila">
                <span>{cat.get(qs[0].mov.categoriaId)}{qs[0].mov.comentario ? ` · ${qs[0].mov.comentario}` : ""} <span className="tenue mini">· faltan {qs.length} de {qs[0].de}</span></span>
                <span className="num">{num(qs[0].usd)}/mes</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="espacio" />
      <div className="pie-fijo"><button className="btn" onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: c.id })}><T.IconFileImport size={17} style={{ verticalAlign: -3 }} /> Subir el resumen</button></div>
    </div>
  );
}

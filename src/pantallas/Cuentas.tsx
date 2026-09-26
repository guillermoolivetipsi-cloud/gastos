import { useEffect, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, nuevoId } from "../db";
import { useNav } from "../nav";
import { MONEDAS, type Cuenta, type Dolar, type Moneda } from "../tipos";
import { fechaCorta, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num } from "../lib/formato";
import { cuotasFuturas, esDudosa, resumen } from "../lib/tarjeta";
import { Interruptor, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

export function ListaCuentas() {
  const d = useDatos();
  const nav = useNav();
  const fila = (c: Cuenta) => (
    <button key={c.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir(c.esTarjeta ? { p: "tarjeta", id: c.id } : { p: "cuenta", id: c.id })}>
      <span className="izq">{c.esTarjeta ? <T.IconCreditCard size={18} /> : <T.IconBuildingBank size={18} className="tenue" />}<span>{c.nombre}{c.archivada && <span className="tenue"> · archivada</span>}</span></span>
      <span className="viol chico">{c.moneda}{c.moneda === "ARS" ? ` · ${c.dolar}` : ""}</span>
    </button>
  );
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Cuentas</h1><button className="accion" aria-label="Nueva" onClick={() => nav.abrir({ p: "cuenta" })}><T.IconPlus size={22} /></button></div>
      <div className="chico tenue" style={{ marginBottom: 10 }}>Cada cuenta tiene su moneda: al elegirla, el gasto arranca en esa moneda. Los pesos se pasan a USD con el dólar que indiques.</div>
      <div className="caja lista">{d.cuentas.filter(c => !c.esTarjeta).map(fila)}</div>
      <div className="titulo-sec"><span>Tarjetas de crédito</span></div>
      <div className="caja lista">{d.cuentas.filter(c => c.esTarjeta).map(fila)}</div>
    </div>
  );
}

export function EditorCuenta({ id }: { id?: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = id ? d.cuentas.find(c => c.id === id) : undefined;
  const listo = useRef(false);
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
    else { await db.cuentas.delete(existente.id); toast({ texto: "Cuenta eliminada" }); }
    nav.volver();
  }

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>{existente ? "Editar cuenta" : "Nueva cuenta"}</h1></div>
      <div className="campo"><label>Nombre</label><input value={c.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Revolut, Mercado Pago…" /></div>
      <div className="campo"><label>Moneda</label><Seg opciones={MONEDAS.map(m => [m, m] as [Moneda, string])} valor={c.moneda} cambiar={v => set("moneda", v)} /></div>
      <div className="fila campo"><span>Es tarjeta de crédito</span><Interruptor on={c.esTarjeta} cambiar={v => setC(x => ({ ...x, esTarjeta: v, dolar: v ? "oficial" : x.dolar }))} /></div>
      {c.moneda === "ARS" && (
        <div className="campo">
          <label>Pesos a USD con el dólar</label>
          <Seg opciones={[["blue", "Blue"], ["oficial", "Oficial"]] as [Dolar, string][]} valor={c.dolar} cambiar={v => set("dolar", v)} />
          <div className="mini tenue" style={{ marginTop: 4 }}>{c.esTarjeta ? "La tarjeta se paga en dólares desde la cuenta: el banco usa el oficial." : "El que usás cuando cambiás plata."}</div>
        </div>
      )}
      {c.esTarjeta && (
        <>
          <div className="dos">
            <div className="campo"><label>Cierra desde el día</label><input inputMode="numeric" value={c.cierreDesde ?? 5} onChange={e => set("cierreDesde", Number(e.target.value.replace(/\D/g, "")) || 1)} /></div>
            <div className="campo"><label>hasta el día</label><input inputMode="numeric" value={c.cierreHasta ?? 10} onChange={e => set("cierreHasta", Number(e.target.value.replace(/\D/g, "")) || 1)} /></div>
          </div>
          <div className="campo"><label>Vence, días después del cierre</label><input inputMode="numeric" value={c.venceDias ?? 10} onChange={e => set("venceDias", Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>
        </>
      )}
      <div className="pie-fijo"><button className="btn" disabled={!c.nombre.trim()} onClick={guardar}>Guardar</button></div>
      {existente && <button className="btn2" style={{ width: "100%", marginTop: 12 }} onClick={eliminar}>{usada ? (existente.archivada ? "Reactivar" : "Archivar (tiene movimientos)") : "Eliminar cuenta"}</button>}
    </div>
  );
}

/** Una tarjeta: el resumen de un mes, su cierre y lo comprometido en cuotas. */
export function Tarjeta({ id, periodo: inicial }: { id: string; periodo?: string }) {
  const d = useDatos();
  const nav = useNav();
  const [periodo, setPeriodo] = useState(inicial ?? periodoHoy());
  const c = d.cuentas.find(c => c.id === id);
  if (!c) return <div className="pantalla sin-tabs" />;
  const r = resumen(c, d.movimientos, periodo);
  const futuras = cuotasFuturas(c, d.movimientos, periodo);
  const cat = new Map(d.categorias.map(c => [c.id, c.nombre]));
  const porCompra = new Map<string, typeof futuras>();
  for (const q of futuras) porCompra.set(q.mov.id, [...(porCompra.get(q.mov.id) ?? []), q]);
  const dias = Array.from({ length: (c.cierreHasta ?? 10) - (c.cierreDesde ?? 5) + 1 }, (_, i) => (c.cierreDesde ?? 5) + i);

  async function confirmarCierre(dia: number) {
    await db.cuentas.update(c!.id, { cierres: { ...(c!.cierres ?? {}), [periodo]: dia } });
  }

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
      <div className="caja">
        <div className="mediano num">{num(r.total)} USD</div>
        <div className="mini tenue">cierra {fechaCorta(r.cierre, false)}{r.confirmado ? "" : " (estimado)"} · vence ~{fechaCorta(r.vence, false)}</div>
        {r.enCuotas > 0 && <div className="fila chico" style={{ paddingBottom: 0 }}><span className="tenue">en cuotas {num(r.enCuotas)}</span><span className="tenue">en un pago {num(r.enUnPago)}</span></div>}
      </div>

      <div className={`caja${r.confirmado ? "" : " aviso"}`}>
        <div className={r.confirmado ? "chico" : "ambar chico"} style={{ marginBottom: 6 }}>
          <T.IconCalendarQuestion size={15} style={{ verticalAlign: -2 }} /> {r.confirmado ? `Cerró el ${c.cierres![periodo]} de ${nombreMes(periodo, false)}` : `¿Qué día cerró en ${nombreMes(periodo, false)}?`}
        </div>
        <div className="pills">{dias.map(n => <button key={n} className={`pill${c.cierres?.[periodo] === n ? " on" : ""}`} onClick={() => confirmarCierre(n)}>{n}</button>)}</div>
        {!r.confirmado && <div className="mini tenue">Lo sacás del resumen. Hasta que lo confirmes, uso el {c.cierreHasta}.</div>}
      </div>

      <button className="btn1" style={{ width: "100%", marginBottom: 10 }} onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: c.id })}>
        <T.IconFileImport size={16} style={{ verticalAlign: -3 }} /> Subir el PDF del resumen
      </button>

      <div className="titulo-sec"><span>Qué entra en este resumen</span><span>{r.items.length}</span></div>
      {!r.items.length && <div className="tenue chico">Nada todavía.</div>}
      {r.items.length > 0 && (
        <div className="caja lista">
          {r.items.map(q => (
            <button key={q.mov.id + q.numero} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: q.mov.id })}>
              <span className="izq"><span>
                <div>{cat.get(q.mov.categoriaId)}{q.mov.comentario ? <span className="tenue"> · {q.mov.comentario}</span> : ""}</div>
                <div className="mini tenue">{fechaCorta(q.mov.fecha, false)}{q.de > 1 ? ` · cuota ${q.numero} de ${q.de}` : ""}{q.numero === 1 && esDudosa(c, q.mov.fecha) ? <span className="ambar"> · puede ir al próximo</span> : ""}</div>
              </span></span>
              <span className="num">{num(q.usd)}</span>
            </button>
          ))}
        </div>
      )}

      {porCompra.size > 0 && (
        <>
          <div className="titulo-sec"><span>Cuotas que siguen</span><span className="num">{num(futuras.reduce((s, q) => s + q.usd, 0))} USD</span></div>
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
      <div className="mini tenue centro" style={{ marginTop: 12 }}>Pagar la tarjeta no es un gasto nuevo: ya lo contaste el día de la compra.</div>
    </div>
  );
}

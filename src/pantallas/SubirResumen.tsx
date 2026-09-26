import { useState } from "react";
import { useDatos } from "../datos";
import { db, guardarAjuste, leerAjuste, nuevoId } from "../db";
import { useNav } from "../nav";
import type { Cuenta, Movimiento } from "../tipos";
import { aprender, conciliar, type Conciliacion, type Fila } from "../lib/conciliar";
import { aUsd, cotizar } from "../lib/cotizaciones";
import { recurrenteDe } from "../lib/recurrentes";
import { fechaCorta, nombreMes, periodoDe, sumarDias } from "../lib/fecha";
import { num, redondear } from "../lib/formato";
import { textoDePdf } from "../lib/pdf";
import { leerResumen, type Resumen } from "../lib/resumen-tarjeta";
import { Punto, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Subir el PDF del resumen: se lee, se compara con lo cargado y se proponen los
   cambios. Nada se guarda hasta tocar "Guardar". Lo que no sabe categorizar, lo pregunta. */

export function SubirResumen({ cuentaId }: { cuentaId?: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resumen | null>(null);
  const [tarjetaId, setTarjetaId] = useState(cuentaId ?? "");
  const [cierre, setCierre] = useState("");
  const [vence, setVence] = useState("");
  const [conc, setConc] = useState<Conciliacion | null>(null);
  const [cats, setCats] = useState<Record<number, string>>({});
  const [aplicar, setAplicar] = useState<Record<number, boolean>>({});
  const tarjetas = d.cuentas.filter(c => c.esTarjeta && !c.archivada);
  const tarjeta = d.cuentas.find(c => c.id === tarjetaId);
  const catsGasto = d.categorias.filter(c => c.tipo === "gasto" && !c.archivada);

  async function leer(f: File | undefined) {
    if (!f) return;
    setError(null); setLeyendo(true); setConc(null);
    try {
      const r = leerResumen(await textoDePdf(new Uint8Array(await f.arrayBuffer())));
      if (!r.consumos.length) throw new Error("No encontré consumos en ese PDF. ¿Es el resumen de la tarjeta?");
      setRes(r);
      const t = tarjetas.find(c => c.nombre.toLowerCase().includes(r.tarjeta.startsWith("Master") ? "master" : "visa")) ?? tarjetas.find(c => c.id === tarjetaId);
      if (t) setTarjetaId(t.id);
      setCierre(r.cierre ?? "");
      setVence(r.vencimiento ?? "");
      if (t) await cruzar(r, t, r.cierre);
    } catch (e) { setError((e as Error).message); }
    setLeyendo(false);
  }

  async function cruzar(r: Resumen, t: Cuenta, fechaCierre: string | null) {
    const reglas = await leerAjuste<Record<string, string>>("reglasComercio", {});
    const fechas = r.consumos.map(c => c.fecha).sort();
    const desde = sumarDias(fechas[0], -3), hasta = sumarDias(fechaCierre ?? fechas[fechas.length - 1], 3);
    const c = conciliar(r.consumos, t, d.movimientos, reglas, desde, hasta);
    setConc(c);
    setCats(Object.fromEntries(c.filas.map((f, i) => [i, f.categoriaId ?? ""])));
    setAplicar(Object.fromEntries(c.filas.map((f, i) => [i, f.tipo !== "coincide"])));
  }

  const filas = conc?.filas ?? [];
  const faltan = filas.map((f, i) => [f, i] as [Fila, number]).filter(([f]) => f.tipo === "falta");
  const sinCategoria = faltan.filter(([, i]) => aplicar[i] && !cats[i]).length;

  async function guardar() {
    if (!conc || !tarjeta || !res) return;
    const ahora = new Date().toISOString();
    // Lo anterior al primer movimiento de la app ya lo tiene Finanzas (venía de la
    // app anterior): se agrega marcado como exportado para no duplicarlo allá.
    const primera = d.movimientos.map(m => m.fecha).sort()[0] ?? "9999";
    let nuevos = 0, cambiados = 0;
    const agregados: Movimiento[] = [];
    const tasaRec = (r: Parameters<typeof d.tasas.rec>[0]) => d.tasas.rec(r, d.cuentas);
    for (const [i, f] of filas.entries()) {
      // Un cobro que ya estaba en esta tarjeta y coincide con un recurrente (Claude, Gym…) queda como su pago.
      if (f.tipo === "coincide" && f.mov && !f.mov.recurrenteId) {
        const v = recurrenteDe(f.mov, d.recurrentes, [...d.movimientos, ...agregados], tasaRec);
        if (v) { await db.movimientos.update(f.mov.id, v); Object.assign(f.mov, v); }
      }
      if (!aplicar[i]) continue;
      if (f.tipo === "falta") {
        const c = f.consumo;
        const esArs = c.columna === "ARS";
        const cot = esArs ? await cotizar("ARS", c.fecha, tarjeta.dolar) : null;
        const mov: Movimiento = {
          id: nuevoId(), tipo: "gasto", fecha: c.fecha, monto: c.importe, moneda: esArs ? "ARS" : (c.moneda as Movimiento["moneda"]),
          usd: esArs ? (cot ? aUsd(c.importe, cot.tasa) : null) : c.usd,
          cotizacion: esArs ? cot ?? undefined : { tasa: c.usd ? redondear(c.importe / c.usd, 6) : 1, fuente: "resumen", fecha: c.fecha },
          cuentaId: tarjeta.id, categoriaId: cats[i], etiquetas: [], comentario: c.comercio, creado: ahora, modificado: ahora,
          exportado: c.fecha < primera ? ahora : undefined,
        };
        if (!["USD", "EUR", "ARS"].includes(mov.moneda)) { mov.moneda = "USD"; mov.monto = c.usd ?? c.importe; }
        Object.assign(mov, recurrenteDe(mov, d.recurrentes, [...d.movimientos, ...agregados], tasaRec) ?? {});
        agregados.push(mov);
        await db.movimientos.add(mov); nuevos++;
      } else if (f.mov && (f.tipo === "otra-cuenta" || f.tipo === "moneda")) {
        const cambios: Partial<Movimiento> = { cuentaId: tarjeta.id, modificado: ahora };
        if (f.tipo === "moneda") Object.assign(cambios, { moneda: f.consumo.moneda, usd: f.consumo.usd, cotizacion: { tasa: redondear(f.consumo.importe / (f.consumo.usd ?? f.consumo.importe), 6), fuente: "resumen", fecha: f.consumo.fecha } });
        await db.movimientos.update(f.mov.id, cambios); cambiados++;
      }
      if (f.mov && !f.mov.recurrenteId && (f.tipo === "otra-cuenta" || f.tipo === "moneda")) {
        const v = recurrenteDe({ ...f.mov, cuentaId: tarjeta.id }, d.recurrentes, [...d.movimientos, ...agregados], tasaRec);
        if (v) await db.movimientos.update(f.mov.id, v);
      }
    }
    // Aprende los comercios: los que coincidieron y los que categorizaste.
    const reglas = await leerAjuste<Record<string, string>>("reglasComercio", {});
    await guardarAjuste("reglasComercio", aprender(reglas, filas.map((f, i) => ({ consumo: f.consumo, categoriaId: f.mov?.categoriaId ?? cats[i] })), d.categorias));
    // El cierre real ordena en qué resumen cae cada compra, y el vencimiento, cuándo se paga.
    if (cierre) {
      const p = periodoDe(cierre);
      const venceDias = vence ? Math.max(1, Math.round((new Date(vence).getTime() - new Date(cierre).getTime()) / 864e5)) : tarjeta.venceDias;
      await db.cuentas.update(tarjeta.id, { cierres: { ...(tarjeta.cierres ?? {}), [p]: Number(cierre.slice(8)) }, venceDias });
      const hechos = await leerAjuste<Record<string, string>>("resumenesCargados", {});
      await guardarAjuste("resumenesCargados", { ...hechos, [`${tarjeta.id}|${p}`]: ahora });
    }
    toast({ texto: `Resumen guardado: ${nuevos} nuevos, ${cambiados} corregidos` });
    nav.volver();
  }

  const etiqueta: Record<Fila["tipo"], string> = { coincide: "Ya cargados", "otra-cuenta": "Cargados en otra cuenta", moneda: "Cargados con la moneda equivocada", falta: "No están en la app" };

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Subir resumen</h1></div>

      {!res && (
        <div className="caja">
          <div className="chico">Bajá el PDF del resumen desde el home banking y elegilo acá. Lo comparo con lo que cargaste y te muestro qué falta y qué corregir. No se guarda nada hasta que confirmes.</div>
          <label className="btn1" style={{ display: "block", marginTop: 10 }}>
            {leyendo ? "Leyendo el resumen…" : "Elegir el PDF del resumen"}
            <input type="file" hidden disabled={leyendo} onChange={e => { leer(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {error && <div className="mal chico" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {res && (
        <>
          <div className="caja">
            <div className="pills">
              {tarjetas.map(t => <button key={t.id} className={`pill${t.id === tarjetaId ? " on" : ""}`} onClick={() => { setTarjetaId(t.id); cruzar(res, t, cierre || null); }}><T.IconCreditCard size={14} />{t.nombre}</button>)}
            </div>
            <div className="dos" style={{ marginTop: 6 }}>
              <div className="campo"><label>Cierre</label><input type="date" value={cierre} onChange={e => setCierre(e.target.value)} /></div>
              <div className="campo"><label>Vencimiento</label><input type="date" value={vence} onChange={e => setVence(e.target.value)} /></div>
            </div>
            {!res.cierre && <div className="mini ambar">No encontré las fechas en el PDF: completalas, así ubico bien cada compra.</div>}
            <div className="fila chico" style={{ paddingBottom: 0 }}>
              <span className="tenue">{res.consumos.length} consumos · {num(res.sumaUsd)} USD + $ {num(res.sumaArs)}</span>
              {res.cuadra === true && <span className="ok">cuadra con el banco</span>}
              {res.cuadra === false && <span className="mal">no cuadra con el total</span>}
            </div>
          </div>

          {(["falta", "moneda", "otra-cuenta", "coincide"] as const).map(tipo => {
            const grupo = filas.map((f, i) => [f, i] as [Fila, number]).filter(([f]) => f.tipo === tipo);
            if (!grupo.length) return null;
            return (
              <div key={tipo}>
                <div className="titulo-sec"><span>{etiqueta[tipo]}</span><span>{grupo.length}</span></div>
                <div className="caja lista">
                  {grupo.map(([f, i]) => {
                    const c = f.consumo;
                    const cat = d.categorias.find(x => x.id === (f.mov?.categoriaId ?? cats[i]));
                    return (
                      <div key={i} className="fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          {tipo !== "coincide" && <input type="checkbox" checked={!!aplicar[i]} onChange={e => setAplicar(a => ({ ...a, [i]: e.target.checked }))} aria-label="Aplicar" />}
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.comercio}</div>
                            <div className="mini tenue">{fechaCorta(c.fecha, false)} · {c.columna === "ARS" ? `$ ${num(c.importe)}` : `${num(c.importe)} ${c.moneda}${c.usd ? ` = ${num(c.usd)} USD` : ""}`}</div>
                          </span>
                          {cat && tipo !== "falta" && <Punto cat={cat} chico />}
                        </div>
                        {tipo === "moneda" && f.mov && <div className="mini ambar">En la app: {num(f.mov.monto)} {f.mov.moneda} → pasa a {num(c.importe)} {c.moneda}</div>}
                        {tipo === "otra-cuenta" && f.mov && <div className="mini ambar">En la app está en {d.cuentas.find(x => x.id === f.mov!.cuentaId)?.nombre} → pasa a {tarjeta?.nombre}</div>}
                        {tipo === "falta" && aplicar[i] && (
                          <select value={cats[i] ?? ""} onChange={e => setCats(x => ({ ...x, [i]: e.target.value }))}
                            style={{ background: "var(--panel-2)", borderRadius: 8, padding: "6px 8px", color: cats[i] ? "var(--tinta)" : "var(--ambar)" }}
                            aria-label={`Categoría de ${c.comercio}`}>
                            <option value="">¿Qué categoría es?</option>
                            {catsGasto.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {conc && conc.sobrantes.length > 0 && (
            <>
              <div className="titulo-sec"><span>Cargados con {tarjeta?.nombre} que el resumen no trae</span><span>{conc.sobrantes.length}</span></div>
              <div className="caja lista">
                {conc.sobrantes.map(m => (
                  <div key={m.id} className="fila chico"><span>{fechaCorta(m.fecha, false)} · {d.categorias.find(c => c.id === m.categoriaId)?.nombre}{m.comentario ? ` · ${m.comentario}` : ""}</span><span className="num">{num(m.monto)} {m.moneda}</span></div>
                ))}
              </div>
              <div className="mini tenue">Pueden caer en el próximo resumen, o haberse pagado con otra cuenta. Revisalos.</div>
            </>
          )}

          {cierre && <div className="mini tenue" style={{ marginTop: 10 }}>Queda registrado el cierre del {fechaCorta(cierre, false)} (resumen de {nombreMes(periodoDe(cierre), false)}).</div>}
          <div className="pie-fijo">
            <button className="btn" disabled={!tarjeta || sinCategoria > 0} onClick={guardar}>
              {sinCategoria > 0 ? `Falta la categoría de ${sinCategoria}` : "Guardar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

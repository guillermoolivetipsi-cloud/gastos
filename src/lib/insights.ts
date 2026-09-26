import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";
import { recurrentesDelMes } from "./analisis";
import { periodoDe, sumarMeses } from "./fecha";
import { redondear } from "./formato";
import { cuotasFuturas, fechaCierre, resumenQueVence } from "./tarjeta";
import type { EstadoInstancia } from "./recurrentes";

/* "Cómo venís": datos del mes para decidir algo, sin juicios. Todo en USD. */

type Tasa = (r: Recurrente) => number | null;
const gastosDe = (movs: Movimiento[], p: string) => movs.filter(m => m.tipo === "gasto" && periodoDe(m.fecha) === p);
const suma = (ms: Movimiento[]) => redondear(ms.reduce((s, m) => s + (m.usd ?? 0), 0));

/** Un mes tiene la tarjeta completa si hay cobros de tarjeta desde los primeros días
 *  (antes de septiembre la app anterior no los registraba bien). */
function tarjetaCompleta(movs: Movimiento[], tarjetas: Set<string>, p: string) {
  const primeros = movs.filter(m => tarjetas.has(m.cuentaId) && periodoDe(m.fecha) === p).map(m => Number(m.fecha.slice(8)));
  return primeros.length >= 5 && Math.min(...primeros) <= 5;
}

export interface Insights {
  tarjeta: {
    total: number; pct: number;
    anterior: number | null; // null si el mes anterior no tiene la tarjeta completa
    categorias: { cat: Categoria; total: number }[];
    cuotas: number;
    /** Lo que cobró de más el banco al pasar euros a dólares; null si todavía no hay resúmenes subidos. */
    costoCambio: { usd: number; pct: number } | null;
  };
  comprometido: { periodo: string; tarjetas: number; recurrentes: number; entra: number; total: number };
  suscripciones: { total: number; promedio: number | null; anual: number; items: { nombre: string; usd: number; nueva: boolean }[] };
  cambios: { cat: Categoria; ahora: number; promedio: number; dif: number }[];
}

export function calcularInsights(p: string, movs: Movimiento[], cats: Categoria[], cuentas: Cuenta[], recs: Recurrente[], tasa: Tasa, bce: (fecha: string) => number | null): Insights {
  const catPorId = new Map(cats.map(c => [c.id, c]));
  const tarjetas = cuentas.filter(c => c.esTarjeta);
  const idsTarjeta = new Set(tarjetas.map(c => c.id));
  const gastos = gastosDe(movs, p);
  const total = suma(gastos);

  // 1 · Tarjeta
  const conTarjeta = gastos.filter(m => idsTarjeta.has(m.cuentaId));
  const totalTarjeta = suma(conTarjeta);
  const anteriorP = sumarMeses(p, -1);
  const porCat = new Map<string, number>();
  for (const m of conTarjeta) porCat.set(m.categoriaId, (porCat.get(m.categoriaId) ?? 0) + (m.usd ?? 0));
  const cuotas = redondear(tarjetas.flatMap(c => cuotasFuturas(c, movs, p)).reduce((s, q) => s + q.usd, 0));
  // Costo del cambio: solo con los cobros en euros que ya vienen del resumen (tasa del banco).
  const delBanco = conTarjeta.filter(m => m.moneda === "EUR" && m.cotizacion?.fuente === "resumen" && m.usd);
  let costoCambio: Insights["tarjeta"]["costoCambio"] = null;
  if (delBanco.length) {
    let banco = 0, oficial = 0;
    for (const m of delBanco) { const t = bce(m.fecha); if (t) { banco += m.usd!; oficial += m.monto / t; } }
    if (oficial > 0) costoCambio = { usd: redondear(banco - oficial), pct: redondear(((banco - oficial) / oficial) * 100, 1) };
  }

  // 2 · El mes siguiente, ya comprometido
  const sig = sumarMeses(p, 1);
  const desde = (c: Cuenta, q: string) => fechaCierre(c, sumarMeses(q, -1));
  let tarjetasSig = 0;
  for (const c of tarjetas) {
    const r = resumenQueVence(c, movs, sig);
    // Recurrentes de la tarjeta que todavía no se cobraron pero caen en ese resumen.
    const previstos = [r.periodo, sumarMeses(r.periodo, -1)]
      .flatMap(q => recurrentesDelMes(recs.filter(x => x.cuentaId === c.id && x.tipo === "gasto"), movs, q, tasa))
      .filter(i => i.fecha > desde(c, r.periodo) && i.fecha <= r.cierre && i.estado !== "cargado");
    tarjetasSig += r.total + (r.confirmado ? 0 : previstos.reduce((s, i) => { const t = tasa(i.rec); return s + (t ? i.esperado / t : 0); }, 0));
  }
  const instSig = recurrentesDelMes(recs, movs, sig, tasa);
  const enUsd = (i: EstadoInstancia) => { const t = tasa(i.rec); return t ? (i.estado === "cargado" ? i.pagado : i.esperado) / t : 0; };
  const deCuenta = instSig.filter(i => i.rec.tipo === "gasto" && !idsTarjeta.has(i.rec.cuentaId)).reduce((s, i) => s + enUsd(i), 0);
  const entra = instSig.filter(i => i.rec.tipo === "ingreso").reduce((s, i) => s + enUsd(i), 0);

  // 3 · Suscripciones
  const esSus = (m: Movimiento) => catPorId.get(m.categoriaId)?.nombre === "Suscripciones";
  const nombre = (m: Movimiento) => (m.recurrenteId && recs.find(r => r.id === m.recurrenteId)?.nombre) || m.comentario || "Sin nombre";
  const susAhora = gastos.filter(esSus);
  // "Nueva" solo contra meses con recurrentes cargados en esta app: en la anterior los
  // nombres eran a mano ("Antriphic") y todo parecería nuevo.
  const antes = [1, 2].flatMap(k => gastosDe(movs, sumarMeses(p, -k)).filter(m => esSus(m) && m.recurrenteId)).map(nombre).map(n => n.toLowerCase());
  const agrup = new Map<string, number>();
  for (const m of susAhora) agrup.set(nombre(m), (agrup.get(nombre(m)) ?? 0) + (m.usd ?? 0));
  const mesesPrev = [1, 2, 3].map(k => suma(gastosDe(movs, sumarMeses(p, -k)).filter(esSus))).filter(x => x > 0);
  const totalSus = suma(susAhora);

  // 4 · Qué cambió contra el promedio de los 3 meses anteriores (con datos)
  const cambios: Insights["cambios"] = [];
  for (const c of cats.filter(c => c.tipo === "gasto")) {
    const ahora = suma(gastos.filter(m => m.categoriaId === c.id));
    const prev = [1, 2, 3].map(k => suma(gastosDe(movs, sumarMeses(p, -k)).filter(m => m.categoriaId === c.id)));
    if (!prev.some(x => x > 0) && !ahora) continue;
    const promedio = redondear(prev.reduce((a, b) => a + b, 0) / 3);
    const dif = redondear(ahora - promedio);
    if (Math.abs(dif) >= 50 && Math.abs(dif) >= promedio * 0.3) cambios.push({ cat: c, ahora, promedio, dif });
  }
  cambios.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));

  return {
    tarjeta: {
      total: totalTarjeta, pct: total ? Math.round((totalTarjeta / total) * 100) : 0,
      anterior: tarjetaCompleta(movs, idsTarjeta, anteriorP) ? suma(gastosDe(movs, anteriorP).filter(m => idsTarjeta.has(m.cuentaId))) : null,
      categorias: [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, t]) => ({ cat: catPorId.get(id)!, total: redondear(t) })).filter(x => x.cat),
      cuotas, costoCambio,
    },
    comprometido: { periodo: sig, tarjetas: redondear(tarjetasSig), recurrentes: redondear(deCuenta), entra: redondear(entra), total: redondear(tarjetasSig + deCuenta) },
    suscripciones: {
      total: totalSus, anual: redondear(totalSus * 12),
      promedio: mesesPrev.length ? redondear(mesesPrev.reduce((a, b) => a + b, 0) / mesesPrev.length) : null,
      items: [...agrup.entries()].sort((a, b) => b[1] - a[1]).map(([n, usd]) => ({ nombre: n, usd: redondear(usd), nueva: !antes.includes(n.toLowerCase()) && antes.length > 0 })),
    },
    cambios: cambios.slice(0, 6),
  };
}

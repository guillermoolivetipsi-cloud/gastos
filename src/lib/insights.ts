import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";
import { aPagarTarjeta, recurrentesDelMes, suma } from "./analisis";
import { hoy, periodoDe, periodoHoy, sumarMeses } from "./fecha";
import { agrupar, redondear } from "./formato";
import { cuotasFuturas } from "./tarjeta";
import { mensualEnUsd, type EstadoInstancia } from "./recurrentes";

/* "Cómo venís": datos del mes para decidir algo, sin juicios. Todo en USD. */

type Tasa = (r: Recurrente) => number | null;
/** Los gastos agrupados por mes, una vez por versión de los datos. */
const porMes = new WeakMap<Movimiento[], Map<string, Movimiento[]>>();
function gastosDe(movs: Movimiento[], p: string) {
  let m = porMes.get(movs);
  if (!m) { m = agrupar(movs.filter(x => x.tipo === "gasto"), x => periodoDe(x.fecha)); porMes.set(movs, m); }
  return m.get(p) ?? [];
}

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
  suscripciones: { total: number; promedio: number | null; anual: number; items: { nombre: string; usd: number; nueva: boolean; previsto: boolean }[] };
  cambios: { cat: Categoria; ahora: number; promedio: number; dif: number }[];
}

export function calcularInsights(p: string, movs: Movimiento[], cats: Categoria[], cuentas: Cuenta[], recs: Recurrente[], tasa: Tasa, bce: (fecha: string) => number | null, subidos: Record<string, string> = {}): Insights {
  const catPorId = new Map(cats.map(c => [c.id, c]));
  const tarjetas = cuentas.filter(c => c.esTarjeta);
  // El mes en curso va por la mitad: se compara con los meses anteriores hasta el
  // mismo día, no con meses enteros (si no, el día 8 todo parece haber bajado).
  const corte = p === periodoHoy() ? Number(hoy().slice(8)) : 31;
  const hastaCorte = (ms: Movimiento[]) => ms.filter(m => Number(m.fecha.slice(8)) <= corte);
  const idsTarjeta = new Set(tarjetas.map(c => c.id));
  const gastos = gastosDe(movs, p);
  const total = suma(gastos);

  // 1 · Tarjeta
  const conTarjeta = gastos.filter(m => idsTarjeta.has(m.cuentaId));
  const totalTarjeta = suma(conTarjeta);
  const anteriorP = sumarMeses(p, -1);
  const porCat = new Map<string, number>();
  for (const m of conTarjeta) porCat.set(m.categoriaId, (porCat.get(m.categoriaId) ?? 0) + (m.usd ?? 0));
  // Las mismas que "Cuotas comprometidas a futuro" de Lo que viene: después del resumen de este mes.
  const cuotas = redondear(tarjetas.filter(c => !c.archivada).flatMap(c => cuotasFuturas(c, movs, p)).reduce((s, q) => s + q.usd, 0));
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
  const tarjetasSig = tarjetas.reduce((s, c) => s + aPagarTarjeta(c, movs, recs, sig, tasa, subidos).total, 0);
  const instSig = recurrentesDelMes(recs, movs, sig, tasa);
  // Lo cobrado si ya está; si no, lo que falta (un pago en partes ya tiene una parte paga).
  const enUsd = (i: EstadoInstancia) => { const t = tasa(i.rec); return t ? (i.estado === "cargado" ? i.pagado : i.falta) / t : 0; };
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
  // Las que vienen este mes y todavía no se cobraron (casi todas van a la tarjeta y
  // se cargan con el resumen): cuentan con su monto estimado, marcadas "previsto".
  const previstas = recurrentesDelMes(recs, movs, p, tasa)
    .filter(i => i.rec.tipo === "gasto" && catPorId.get(i.rec.categoriaId)?.nombre === "Suscripciones" && i.estado !== "cargado")
    .map(i => { const t = tasa(i.rec); return { nombre: i.rec.nombre, usd: t ? (i.esperado - i.pagado) / t : 0 }; })
    .filter(x => x.usd > 0);
  const totalSus = redondear(suma(susAhora) + previstas.reduce((s, x) => s + x.usd, 0));
  // Por año: cada recurrente según su frecuencia (una anual cuenta una vez, no × 12),
  // más lo cobrado este mes que no es de ningún recurrente, como si fuera mensual.
  const recsSus = recs.filter(r => r.tipo === "gasto" && r.activo && (!r.fin || r.fin >= hoy()) && catPorId.get(r.categoriaId)?.nombre === "Suscripciones");
  const sueltas = suma(susAhora.filter(m => !recsSus.some(r => r.id === m.recurrenteId)));
  const anualSus = redondear(12 * (recsSus.reduce((s, r) => s + (mensualEnUsd(r, movs, tasa(r)) ?? 0), 0) + sueltas));

  // 4 · Qué cambió contra el promedio de los 3 meses anteriores: solo los meses con
  // datos, y en el mes en curso, hasta el mismo día.
  const cambios: Insights["cambios"] = [];
  const ahoraPorCat = agrupar(gastos, m => m.categoriaId);
  const mesesConDatos = [1, 2, 3].map(k => gastosDe(movs, sumarMeses(p, -k))).filter(g => g.length > 0);
  const previosPorCat = mesesConDatos.map(g => agrupar(hastaCorte(g), m => m.categoriaId));
  for (const c of cats.filter(c => c.tipo === "gasto")) {
    const ahora = suma(ahoraPorCat.get(c.id) ?? []);
    const prev = previosPorCat.map(g => suma(g.get(c.id) ?? []));
    if (!prev.some(x => x > 0) && !ahora) continue;
    if (!prev.length) continue;
    const promedio = redondear(prev.reduce((a, b) => a + b, 0) / prev.length);
    const dif = redondear(ahora - promedio);
    if (Math.abs(dif) >= 50 && Math.abs(dif) >= promedio * 0.3) cambios.push({ cat: c, ahora, promedio, dif });
  }
  cambios.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));

  return {
    tarjeta: {
      total: totalTarjeta, pct: total ? Math.round((totalTarjeta / total) * 100) : 0,
      // El mes anterior hasta el mismo día, para comparar parejo.
      anterior: tarjetaCompleta(movs, idsTarjeta, anteriorP) ? suma(hastaCorte(gastosDe(movs, anteriorP)).filter(m => idsTarjeta.has(m.cuentaId))) : null,
      categorias: [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, t]) => ({ cat: catPorId.get(id)!, total: redondear(t) })).filter(x => x.cat),
      cuotas, costoCambio,
    },
    comprometido: { periodo: sig, tarjetas: redondear(tarjetasSig), recurrentes: redondear(deCuenta), entra: redondear(entra), total: redondear(tarjetasSig + deCuenta) },
    suscripciones: {
      total: totalSus, anual: anualSus,
      promedio: mesesPrev.length ? redondear(mesesPrev.reduce((a, b) => a + b, 0) / mesesPrev.length) : null,
      items: [
        ...[...agrup.entries()].map(([n, usd]) => ({ nombre: n, usd: redondear(usd), nueva: !antes.includes(n.toLowerCase()) && antes.length > 0, previsto: false })),
        ...previstas.map(x => ({ nombre: x.nombre, usd: redondear(x.usd), nueva: false, previsto: true })),
      ].sort((a, b) => b.usd - a.usd),
    },
    cambios: cambios.slice(0, 6),
  };
}

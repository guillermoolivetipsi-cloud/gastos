import type { Cuenta, Movimiento } from "../tipos";
import { diasDelMes, fechaEnMes, periodoDe, sumarDias, sumarMeses } from "./fecha";
import { redondear } from "./formato";

/* Un gasto con tarjeta vive en dos lugares:
   - como gasto, el día de la compra (así lo cuenta también Finanzas);
   - como pago pendiente, en el resumen donde cae cada cuota.
   El resumen se nombra por el mes en que cierra. */

export const cierreDe = (c: Cuenta, periodo: string) =>
  Math.min(c.cierres?.[periodo] ?? c.cierreHasta ?? 10, diasDelMes(periodo));

export const cierreConfirmado = (c: Cuenta, periodo: string) => c.cierres?.[periodo] != null;

/** En qué resumen cae una compra (el período del mes en que cierra). */
export function resumenDe(c: Cuenta, fecha: string) {
  const p = periodoDe(fecha);
  return Number(fecha.slice(8, 10)) <= cierreDe(c, p) ? p : sumarMeses(p, 1);
}

/** Compra hecha entre el primer y el último día posible de cierre, con el
 *  cierre de ese mes sin confirmar: puede caer en este resumen o en el próximo. */
export function esDudosa(c: Cuenta, fecha: string) {
  const p = periodoDe(fecha);
  const dia = Number(fecha.slice(8, 10));
  return !cierreConfirmado(c, p) && dia > (c.cierreDesde ?? 5) && dia <= (c.cierreHasta ?? 10);
}

export const fechaCierre = (c: Cuenta, periodo: string) => fechaEnMes(periodo, cierreDe(c, periodo));
export const vencimiento = (c: Cuenta, periodo: string) => sumarDias(fechaCierre(c, periodo), c.venceDias ?? 10);

export interface Cuota {
  mov: Movimiento;
  numero: number; // 1..n
  de: number;
  usd: number;
  monto: number;
  periodo: string; // resumen donde cae
}

export function cuotasDe(c: Cuenta, m: Movimiento): Cuota[] {
  const n = Math.max(1, m.cuotas ?? 1);
  const primero = resumenDe(c, m.fecha);
  const signo = m.tipo === "ingreso" ? -1 : 1; // una devolución resta del resumen
  return Array.from({ length: n }, (_, i) => ({
    mov: m,
    numero: i + 1,
    de: n,
    usd: signo * redondear((m.usd ?? 0) / n),
    monto: signo * redondear(m.monto / n),
    periodo: sumarMeses(primero, i),
  }));
}

export interface Resumen {
  cuenta: Cuenta;
  periodo: string;
  cierre: string;
  vence: string;
  confirmado: boolean;
  total: number; // USD
  enCuotas: number;
  enUnPago: number;
  items: Cuota[];
  dudosas: number;
}

export function resumen(c: Cuenta, movs: Movimiento[], periodo: string): Resumen {
  const items = movs
    .filter(m => m.cuentaId === c.id)
    .flatMap(m => cuotasDe(c, m))
    .filter(q => q.periodo === periodo)
    .sort((a, b) => b.mov.fecha.localeCompare(a.mov.fecha));
  const enCuotas = redondear(items.filter(q => q.de > 1).reduce((s, q) => s + q.usd, 0));
  const total = redondear(items.reduce((s, q) => s + q.usd, 0));
  return {
    cuenta: c, periodo, items, total, enCuotas,
    enUnPago: redondear(total - enCuotas),
    cierre: fechaCierre(c, periodo),
    vence: vencimiento(c, periodo),
    confirmado: cierreConfirmado(c, periodo),
    dudosas: items.filter(q => q.numero === 1 && esDudosa(c, q.mov.fecha)).length,
  };
}

/** Cuotas que caen después de `periodo`: lo comprometido a futuro. */
export function cuotasFuturas(c: Cuenta, movs: Movimiento[], periodo: string) {
  return movs
    .filter(m => m.cuentaId === c.id && (m.cuotas ?? 1) > 1)
    .flatMap(m => cuotasDe(c, m))
    .filter(q => q.periodo > periodo);
}

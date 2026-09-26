import type { Moneda } from "../tipos";

const SIMBOLO: Record<Moneda, string> = { USD: "USD", EUR: "€", ARS: "$" };

/** 1.234,56 — con decimales solo si hacen falta. */
export function num(n: number, decimales?: number) {
  const d = decimales ?? (Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2);
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const usd = (n: number, decimales?: number) => `${num(n, decimales)} USD`;

export function monto(n: number, moneda: Moneda) {
  return moneda === "USD" ? `${num(n)} USD` : moneda === "EUR" ? `${num(n)} €` : `$ ${num(n)}`;
}
export const simbolo = (m: Moneda) => SIMBOLO[m];

/** Lee lo que tipeaste: "1.234,5" o "1234.5". */
export function leerNumero(s: string): number {
  const limpio = s.trim().replace(/\s/g, "");
  if (!limpio) return 0;
  const normal = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

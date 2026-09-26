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

/** Lee lo que tipeaste. La coma es decimal ("2,40"); el punto es de miles si hay
 *  varios o si le siguen exactamente tres cifras ("18.500", "1.234.567"), y decimal
 *  si no ("12.5"). */
export function leerNumero(s: string): number {
  const limpio = s.trim().replace(/\s/g, "");
  if (!limpio) return 0;
  let normal: string;
  if (limpio.includes(",")) normal = limpio.replace(/\./g, "").replace(",", ".");
  else if ((limpio.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(limpio)) normal = limpio.replace(/\./g, "");
  else normal = limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

/** "Categoría" y "categoria" son lo mismo al comparar. */
export const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Agrupa en un Map sin copiar arreglos en cada paso (lineal, no cuadrático). */
export function agrupar<T, K>(xs: Iterable<T>, clave: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) { const k = clave(x); const g = m.get(k); if (g) g.push(x); else m.set(k, [x]); }
  return m;
}

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

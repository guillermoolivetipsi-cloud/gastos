import type { Categoria, Cuenta, Movimiento } from "../tipos";
import type { Consumo } from "./resumen-tarjeta";
import { diasEntre } from "./fecha";

/* Compara un resumen de tarjeta con lo que cargaste en la app. Es el mismo cruce que
   se hizo a mano con septiembre: por fecha (±3 días) y monto.
   - En dólares, el banco convierte del euro con su propia cotización: se compara el
     USD del resumen con el de la app (±6%), o el monto original con el de la app.
   - Si en la app está en USD pero el número es el de los euros, es un error de carga
     (pasó siete veces en septiembre): se propone corregir la moneda. */

/** "credito": una devolución o bonificación (monto negativo en el resumen); se suma
 *  como ingreso de la tarjeta, salvo que ya esté cargada. */
export type Tipo = "coincide" | "otra-cuenta" | "moneda" | "falta" | "credito";

export interface Fila {
  consumo: Consumo;
  tipo: Tipo;
  mov?: Movimiento;
  /** Categoría sugerida por lo aprendido de ese comercio; si no hay, se pregunta. */
  categoriaId?: string;
}

export interface Conciliacion {
  filas: Fila[];
  /** Cargados con esta tarjeta en el período del resumen que el banco no trae. */
  sobrantes: Movimiento[];
}

const PALABRAS_VACIAS = new Set(["LA", "EL", "LOS", "LAS", "THE", "DE", "DEL", "WWW", "COM", "SL", "SA", "ESP", "S", "L"]);

/** "SQ *PANADERIA LUNA S.L." → "PANADERIA LUNA" · "DLOCAL*MUSICA P" → "MUSICA" */
export function claveComercio(comercio: string) {
  const sinPrefijo = comercio.toUpperCase().replace(/^.*\*+/, "");
  const palabras = sinPrefijo.replace(/[^A-ZÑ ]/g, " ").split(/\s+/).filter(p => p.length > 1 && !PALABRAS_VACIAS.has(p));
  return palabras.slice(0, 2).join(" ");
}

function error(consumo: Consumo, m: Movimiento): { err: number; moneda: boolean } | null {
  if (consumo.columna === "ARS") return m.moneda === "ARS" ? { err: Math.abs(m.monto - consumo.importe) / consumo.importe, moneda: false } : null;
  if (m.moneda === consumo.moneda) return { err: Math.abs(m.monto - consumo.importe) / consumo.importe, moneda: false };
  if (m.moneda === "USD") {
    const contraUsd = consumo.usd ? Math.abs(m.monto - consumo.usd) / consumo.usd : 1;
    const contraOriginal = Math.abs(m.monto - consumo.importe) / consumo.importe;
    // El número exacto del monto original, cargado como USD: moneda equivocada.
    // Solo con monedas que la app maneja (una compra en libras se deja como está).
    if ((consumo.moneda === "EUR" || consumo.moneda === "ARS") && contraOriginal <= 0.01 && contraOriginal < contraUsd) return { err: contraOriginal, moneda: true };
    return { err: contraUsd, moneda: false };
  }
  if (m.usd != null && consumo.usd) return { err: Math.abs(m.usd - consumo.usd) / consumo.usd, moneda: false };
  return null;
}

export function conciliar(consumos: Consumo[], tarjeta: Cuenta, gastosEIngresos: Movimiento[], reglas: Record<string, string>, desde: string, hasta: string): Conciliacion {
  const gastos = gastosEIngresos;
  const candidatos = gastos.filter(m => m.tipo === "gasto" && m.fecha >= desde && m.fecha <= hasta);
  const pares: { i: number; m: Movimiento; score: number; moneda: boolean }[] = [];
  consumos.forEach((c, i) => {
    if (c.importe <= 0) return;
    for (const m of candidatos) {
      const d = Math.abs(diasEntre(m.fecha, c.fecha));
      if (d > 3) continue;
      const e = error(c, m);
      if (!e || e.err > 0.06) continue;
      // Preferir lo que ya está en esta tarjeta.
      pares.push({ i, m, moneda: e.moneda, score: e.err * 10 + d + (m.cuentaId === tarjeta.id ? 0 : 0.5) });
    }
  });
  pares.sort((a, b) => a.score - b.score);
  const usados = new Set<string>(), asignado = new Map<number, (typeof pares)[number]>();
  for (const p of pares) {
    if (asignado.has(p.i) || usados.has(p.m.id)) continue;
    asignado.set(p.i, p); usados.add(p.m.id);
  }
  // Devoluciones: ¿ya hay un ingreso de esta tarjeta por ese monto, cerca de esa fecha?
  const ingresos = gastosEIngresos.filter(m => m.tipo === "ingreso" && m.cuentaId === tarjeta.id && m.fecha >= desde && m.fecha <= hasta);
  const filas: Fila[] = consumos.filter(c => c.importe !== 0).map(c => {
    const i = consumos.indexOf(c);
    if (c.importe < 0) {
      const ya = ingresos.find(m => !usados.has(m.id) && Math.abs(diasEntre(m.fecha, c.fecha)) <= 3
        && (c.columna === "ARS" ? m.moneda === "ARS" && Math.abs(m.monto + c.importe) <= Math.abs(c.importe) * 0.01
          : m.usd != null && c.usd != null && Math.abs(m.usd + c.usd) <= Math.abs(c.usd) * 0.06));
      if (ya) { usados.add(ya.id); return { consumo: c, mov: ya, tipo: "coincide" }; }
      return { consumo: c, tipo: "credito" };
    }
    const p = asignado.get(i);
    if (!p) return { consumo: c, tipo: "falta", categoriaId: reglas[claveComercio(c.comercio)] };
    return { consumo: c, mov: p.m, tipo: p.moneda ? "moneda" : p.m.cuentaId === tarjeta.id ? "coincide" : "otra-cuenta" };
  });
  const sobrantes = candidatos.filter(m => m.cuentaId === tarjeta.id && !usados.has(m.id));
  return { filas, sobrantes };
}

/** Aprende de lo que ya coincidió: "este comercio es Super". */
export function aprender(reglas: Record<string, string>, filas: { consumo: Consumo; categoriaId?: string }[], cats: Categoria[]) {
  const validas = new Set(cats.map(c => c.id));
  const nuevas = { ...reglas };
  for (const f of filas) {
    const k = claveComercio(f.consumo.comercio);
    // Solo de los consumos: una devolución no enseña la categoría de un comercio.
    if (k && f.consumo.importe > 0 && f.categoriaId && validas.has(f.categoriaId)) nuevas[k] = f.categoriaId;
  }
  return nuevas;
}

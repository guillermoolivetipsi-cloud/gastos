import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import { ultimaTasa } from "./lib/cotizaciones";
import type { Cuenta, Dolar, Moneda, Movimiento, Recurrente } from "./tipos";

/** Todo lo que las pantallas necesitan, vivo: si cambia la base, se redibuja. */
export function useDatos() {
  const cuentas = useLiveQuery(() => db.cuentas.orderBy("orden").toArray(), []);
  const categorias = useLiveQuery(() => db.categorias.orderBy("orden").toArray(), []);
  const movimientos = useLiveQuery(() => db.movimientos.toArray(), []);
  const recurrentes = useLiveQuery(() => db.recurrentes.toArray(), []);
  const descartes = useLiveQuery(() => db.descartes.toArray(), []);
  const tasas = useTasas(movimientos);
  const listo = !!(cuentas && categorias && movimientos && recurrentes && descartes);
  return { listo, cuentas: cuentas ?? [], categorias: categorias ?? [], movimientos: movimientos ?? [], recurrentes: recurrentes ?? [], descartes: descartes ?? [], tasas };
}

export type Tasas = ReturnType<typeof useTasas>;

/** Cotizaciones de hoy (las últimas conocidas), para estimar en USD lo que todavía no pasó. */
export function useTasas(movs?: Movimiento[]) {
  const [t, setT] = useState<Record<string, number | null>>({});
  const version = useLiveQuery(() => db.ajustes.where("clave").startsWith("ultima|").toArray(), []);
  useEffect(() => {
    (async () => {
      setT({
        EUR: await ultimaTasa("EUR", "blue"),
        "ARS|blue": await ultimaTasa("ARS", "blue"),
        "ARS|oficial": await ultimaTasa("ARS", "oficial"),
      });
    })();
  }, [version]);
  // Si todavía no hay cotización de hoy, la última que quedó guardada en un movimiento.
  const ultimas = useMemo(() => {
    const m = new Map<string, { fecha: string; tasa: number }>();
    for (const x of movs ?? []) {
      if (!x.cotizacion) continue;
      const k = `${x.moneda}|${x.cotizacion.fuente}`;
      if (!m.has(k) || x.fecha > m.get(k)!.fecha) m.set(k, { fecha: x.fecha, tasa: x.cotizacion.tasa });
    }
    return m;
  }, [movs]);
  const ultimaDeMovs = (moneda: Moneda, dolar: Dolar) => ultimas.get(`${moneda}|${moneda === "EUR" ? "BCE" : dolar}`)?.tasa ?? null;
  const de = (moneda: Moneda, dolar: Dolar = "blue") =>
    moneda === "USD" ? 1 : moneda === "EUR" ? t.EUR ?? ultimaDeMovs("EUR", dolar) : t[`ARS|${dolar}`] ?? ultimaDeMovs("ARS", dolar) ?? t["ARS|blue"] ?? ultimaDeMovs("ARS", "blue");
  return {
    de,
    /** Tasa para un recurrente: usa el dólar de su cuenta. */
    rec: (r: Recurrente, cuentas: Cuenta[]) => de(r.moneda, cuentas.find(c => c.id === r.cuentaId)?.dolar),
  };
}

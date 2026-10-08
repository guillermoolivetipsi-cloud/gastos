import { useLiveQuery } from "dexie-react-hooks";
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db, leerAjuste } from "./db";
import { ultimaTasa } from "./lib/cotizaciones";
import { pendientes, useExtras, type Pendientes } from "./lib/revisar";
import type { Categoria, Cuenta, Descarte, Dolar, Moneda, Movimiento, Proyeccion, Recurrente } from "./tipos";

/* Los datos de la app, leídos UNA vez y compartidos por todas las pantallas.
   Antes cada pantalla abierta leía la base entera por su cuenta (con miles de
   movimientos, y la solapa de abajo queda montada mientras hay otra encima). */

export interface Datos {
  listo: boolean;
  cuentas: Cuenta[];
  categorias: Categoria[];
  movimientos: Movimiento[];
  recurrentes: Recurrente[];
  descartes: Descarte[];
  proyecciones: Proyeccion[];
  /** Los resúmenes de tarjeta ya subidos ("tarjetaId|AAAA-MM"): ahí el total es el real. */
  resumenesCargados: Record<string, string>;
  tasas: Tasas;
  /** Cotización para un recurrente, con el dólar de su cuenta. */
  tasaRec: (r: Recurrente) => number | null;
  catPorId: Map<string, Categoria>;
  cuentaPorId: Map<string, Cuenta>;
}

const Ctx = createContext<Datos | null>(null);
const CtxRevisar = createContext<Pendientes | null>(null);

export function ProveedorDatos({ children }: { children: ReactNode }) {
  const cuentas = useLiveQuery(() => db.cuentas.orderBy("orden").toArray(), []);
  const categorias = useLiveQuery(() => db.categorias.orderBy("orden").toArray(), []);
  const movimientos = useLiveQuery(() => db.movimientos.toArray(), []);
  const recurrentes = useLiveQuery(() => db.recurrentes.toArray(), []);
  const descartes = useLiveQuery(() => db.descartes.toArray(), []);
  const proyecciones = useLiveQuery(() => db.proyecciones.toArray(), []);
  const resumenesCargados = useLiveQuery(() => leerAjuste<Record<string, string>>("resumenesCargados", {}), []);
  const tasas = useTasas(movimientos);
  const datos = useMemo<Datos>(() => {
    const cs = cuentas ?? [];
    return {
      listo: !!(cuentas && categorias && movimientos && recurrentes && descartes),
      cuentas: cs, categorias: categorias ?? [], movimientos: movimientos ?? [], recurrentes: recurrentes ?? [], descartes: descartes ?? [], proyecciones: proyecciones ?? [], resumenesCargados: resumenesCargados ?? {},
      tasas,
      tasaRec: r => tasas.rec(r, cs),
      catPorId: new Map((categorias ?? []).map(c => [c.id, c])),
      cuentaPorId: new Map(cs.map(c => [c.id, c])),
    };
  }, [cuentas, categorias, movimientos, recurrentes, descartes, proyecciones, resumenesCargados, tasas]);
  // "Para revisar" se calcula una vez por cambio en los datos, no en cada pantalla.
  const extras = useExtras();
  const revisar = useMemo(() => (datos.listo && extras ? pendientes(datos, extras) : null), [datos, extras]);
  return createElement(Ctx.Provider, { value: datos }, createElement(CtxRevisar.Provider, { value: revisar }, children));
}

export function useDatos(): Datos {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDatos fuera de ProveedorDatos");
  return d;
}

/** Lo pendiente de "Para revisar" (null mientras carga). */
export const usePendientes = () => useContext(CtxRevisar);

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
  // Estable mientras no cambien las cotizaciones: así los cálculos memorizados valen.
  return useMemo(() => {
    const ultimaDeMovs = (moneda: Moneda, dolar: Dolar) => ultimas.get(`${moneda}|${moneda === "EUR" ? "BCE" : dolar}`)?.tasa ?? null;
    const de = (moneda: Moneda, dolar: Dolar = "blue") =>
      moneda === "USD" ? 1 : moneda === "EUR" ? t.EUR ?? ultimaDeMovs("EUR", dolar) : t[`ARS|${dolar}`] ?? ultimaDeMovs("ARS", dolar) ?? t["ARS|blue"] ?? ultimaDeMovs("ARS", "blue");
    return {
      de,
      /** Tasa para un recurrente: usa el dólar de su cuenta. */
      rec: (r: Recurrente, cuentas: Cuenta[]) => de(r.moneda, cuentas.find(c => c.id === r.cuentaId)?.dolar),
    };
  }, [t, ultimas]);
}

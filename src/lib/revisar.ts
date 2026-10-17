import { useLiveQuery } from "dexie-react-hooks";
import type { Datos } from "../datos";
import { leerAjuste } from "../db";
import { RECORDATORIOS, tareas, type Recordatorios, type Tarea } from "./recordatorios";
import { cambiosDePrecio, cierresDudosos, descartesSet, detectarRecurrentes, type CambioPrecio, type CierreDudoso, type SugerenciaRecurrente } from "./analisis";
import { diaLocal, diasEntre, hoy, periodoHoy, sumarMeses } from "./fecha";
import { recurrentesDelMes } from "./analisis";
import { sugerirVinculos, type EstadoInstancia } from "./recurrentes";
import type { Categoria, Movimiento } from "../tipos";
import { sinAcentos } from "./formato";

/* La bandeja "Para revisar": todo lo que la app te propone, en un solo lugar.
   Nada de esto se aplica solo; vos confirmás o cambiás. */

export interface Pendientes {
  recurrentes: SugerenciaRecurrente[];
  precios: CambioPrecio[];
  cierres: CierreDudoso[];
  tareas: Tarea[];
  /** Gastos cargados sueltos que parecen el pago de un recurrente pendiente. */
  vinculos: { inst: EstadoInstancia; mov: Movimiento }[];
  /** Cobros de Psicología cargados en la app en un mes en que Finanzas ya trajo la clínica. */
  traidos: { mov: Movimiento; total: Movimiento }[];
  total: number;
}

export interface Extras {
  ultimoRespaldo: string | null;
  recordatorios: Recordatorios;
  resumenesCargados: Record<string, string>;
  ultimaExportacion: string | null;
}

/** Los ajustes que necesita la bandeja. undefined mientras cargan. */
export function useExtras(): Extras | undefined {
  return useLiveQuery(async () => ({
    ultimoRespaldo: await leerAjuste<string | null>("ultimoRespaldo", null),
    recordatorios: await leerAjuste<Recordatorios>("recordatorios", RECORDATORIOS),
    resumenesCargados: await leerAjuste<Record<string, string>>("resumenesCargados", {}),
    ultimaExportacion: await leerAjuste<string | null>("ultimaExportacion", null),
  }), []);
}

export function pendientes(d: Datos, x: Extras): Pendientes {
  const ds = descartesSet(d.descartes);
  // "Ahora no" esconde algo por 30 días (una tarea, por 3).
  const pausas = new Map(d.descartes.filter(z => z.clave.startsWith("pausa|")).map(z => [z.clave.slice(6), diaLocal(z.fecha)]));
  const pausado = (k: string, dias = 30) => { const f = pausas.get(k); return !!f && diasEntre(f, hoy()) < dias; };

  const recurrentes = detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, ds).filter(s => !pausado(`rec|${s.clave}`));
  const precios = cambiosDePrecio(d.recurrentes, d.movimientos, ds).filter(s => !pausado(s.clave));
  const cierres = cierresDudosos(d.cuentas, d.movimientos).filter(c => !pausado(`cierre|${c.cuenta.id}|${c.periodo}`));
  const ts = tareas(x.recordatorios, d.cuentas, d.movimientos, x.resumenesCargados, x.ultimaExportacion, ds).filter(t => !pausado(t.clave, 3));
  const tasa = (r: EstadoInstancia["rec"]) => d.tasas.rec(r, d.cuentas);
  const insts = [sumarMeses(periodoHoy(), -1), periodoHoy()].flatMap(p => recurrentesDelMes(d.recurrentes, d.movimientos, p, tasa));
  const sug = sugerirVinculos(insts, d.movimientos, tasa, (m, r) => ds.has(`vinc|${m}|${r}`) || pausado(`vinc|${m}|${r}`));
  const vinculos: Pendientes["vinculos"] = insts.filter(i => sug.has(i.rec.id + i.clave)).map(inst => ({ inst, mov: sug.get(inst.rec.id + inst.clave)! }));
  const traidos = yaTraidos(d.movimientos, d.categorias).filter(x => !ds.has(`traido|${x.mov.id}`) && !pausado(`traido|${x.mov.id}`));
  return {
    recurrentes, precios, cierres, tareas: ts, vinculos, traidos,
    total: ts.length + vinculos.length + traidos.length + recurrentes.length + precios.length + cierres.length,
  };
}

/** Los cobros de Psicología cargados en la app (no llegados de Finanzas) en un mes y una
 *  moneda en que Finanzas ya trajo el total de la clínica: la app pregunta si ya está ahí
 *  (regla de los repetidos). Cada uno, con el total de Finanzas de ese mes y esa moneda. */
export function yaTraidos(movs: Movimiento[], cats: Categoria[]) {
  const psico = new Set(cats.filter(c => c.tipo === "ingreso" && sinAcentos(c.nombre).trim().toLowerCase() === "psicologia").map(c => c.id));
  const totales = new Map(movs.filter(m => m.origen === "finanzas").map(m => [`${m.fecha.slice(0, 7)}|${m.moneda}`, m]));
  return movs
    .filter(m => m.tipo === "ingreso" && m.origen !== "finanzas" && psico.has(m.categoriaId))
    .flatMap(m => { const total = totales.get(`${m.fecha.slice(0, 7)}|${m.moneda}`); return total ? [{ mov: m, total }] : []; });
}

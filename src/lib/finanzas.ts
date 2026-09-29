import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { db, guardarAjuste, leerAjuste } from "../db";
import type { Categoria, Cuenta, Movimiento } from "../tipos";
import { periodoDe, periodoHoy, sumarMeses } from "./fecha";

/* «Mandar a Finanzas»: el celular le manda sus movimientos a Finanzas por el Wi-Fi.
   El contrato está en ~/Desktop/Aplicaciones/Finanzas/CONTRATO-GASTOS.md. Lo que no se
   negocia: los importes van en su moneda (nunca en dólares), el id es el de la base de
   la app y no cambia, y los meses van completos.

   Por ahora: el mes en curso y el anterior. Sin borrados, sin recurrentes, sin traer
   nada de vuelta. */

export const CONTRATO = "1.0";
export const PUERTO = 3005;

export interface Conexion { direccion: string; clave: string }
export interface UltimoEnvio { fecha: string; direccion: string }

export interface MovimientoEnviado {
  id: string; tipo: "gasto" | "ingreso"; fecha: string; monto: number; moneda: string;
  cuenta?: string; categoria?: string; etiquetas: string[]; comentario?: string; cuotas?: number;
}
export interface Envio {
  app: "gastos"; contrato: string; generado: string; desde: string; hasta: string;
  modo?: "revisar"; movimientos: MovimientoEnviado[];
}

export interface Aviso { nivel: "error" | "atencion" | "info"; texto: string }
export interface Vista {
  ok: boolean; avisos: Aviso[]; desde: string; hasta: string; leidos: number;
  nuevos: number; cambian: number; iguales: number; sinCuenta: string[];
  porMes: { periodo: string; nuevos: number; cambian: number; iguales: number }[];
}

export type Resultado =
  | { tipo: "listo"; nuevos: number; corregidos: number; iguales: number; porMes: Vista["porMes"]; avisos: Aviso[] }
  | { tipo: "revisado"; vista: Vista }
  | { tipo: "rechazado"; mensaje: string }
  | { tipo: "clave" }
  | { tipo: "sin-respuesta"; direccion: string };

/** Los dos meses que se mandan: el anterior y el que corre. */
export const mesesAMandar = (hoy = periodoHoy()) => [sumarMeses(hoy, -1), hoy];

/** "http://192.168.1.17:3005/" o "192.168.1.17" → "192.168.1.17:3005". */
export function normalizarDireccion(d: string) {
  const sin = d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return !sin ? "" : /:\d+$/.test(sin) ? sin : `${sin}:${PUERTO}`;
}

/** Lo que no viaja (contrato §7, "una fuente por hecho"): los cobros de pacientes
 *  entran a Finanzas por PsicoTracker. */
export function seManda(m: Movimiento, cat: Categoria | undefined) {
  return !(m.tipo === "ingreso" && cat?.nombre === "Psicología");
}

/** El envío: todos los movimientos de esos meses, completos, en su moneda. */
export function armarEnvio(meses: string[], movs: Movimiento[], cats: Categoria[], cuentas: Cuenta[], ahora = new Date()): Envio {
  const cat = new Map(cats.map(c => [c.id, c]));
  const cta = new Map(cuentas.map(c => [c.id, c]));
  const movimientos = movs
    .filter(m => meses.includes(periodoDe(m.fecha)) && seManda(m, cat.get(m.categoriaId)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado))
    .map((m): MovimientoEnviado => {
      const cuenta = cta.get(m.cuentaId);
      return {
        id: m.id, tipo: m.tipo, fecha: m.fecha, monto: m.monto, moneda: m.moneda,
        cuenta: cuenta?.nombre, categoria: cat.get(m.categoriaId)?.nombre,
        etiquetas: m.etiquetas, comentario: m.comentario || undefined,
        cuotas: cuenta?.esTarjeta ? m.cuotas ?? 1 : undefined,
      };
    });
  const orden = [...meses].sort();
  return { app: "gastos", contrato: CONTRATO, generado: ahora.toISOString(), desde: orden[0], hasta: orden[orden.length - 1], movimientos };
}

/** POST a Finanzas. En la app va por el HTTP nativo: la página de la app es https y
 *  Finanzas contesta en http dentro de tu red. */
async function post(direccion: string, clave: string, cuerpo: Envio): Promise<{ status: number; data: unknown } | null> {
  const url = `http://${direccion}/api/gastos/sincronizar`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${clave}` };
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.post({ url, headers, data: cuerpo, connectTimeout: 6000, readTimeout: 30000 });
      return { status: r.status, data: typeof r.data === "string" ? JSON.parse(r.data || "null") : r.data };
    }
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), 30000);
    try {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(cuerpo), signal: corte.signal });
      return { status: r.status, data: await r.json().catch(() => null) };
    } finally { clearTimeout(t); }
  } catch {
    return null; // no contestó: Mac apagada, Finanzas cerrada u otra red
  }
}

/** Lee lo que contestó Finanzas. */
export function interpretar(r: { status: number; data: unknown } | null, direccion: string, revisar: boolean): Resultado {
  if (!r) return { tipo: "sin-respuesta", direccion };
  if (r.status === 401) return { tipo: "clave" };
  const d = (r.data ?? {}) as { ok?: boolean; mensaje?: string; vista?: Vista; nuevos?: number; corregidos?: number; iguales?: number };
  const errorDe = (v?: Vista) => v?.avisos?.find(a => a.nivel === "error")?.texto;
  if (!d.ok || errorDe(d.vista)) return { tipo: "rechazado", mensaje: errorDe(d.vista) ?? d.mensaje ?? `Finanzas contestó ${r.status}` };
  if (revisar) return { tipo: "revisado", vista: d.vista! };
  return {
    tipo: "listo", nuevos: d.nuevos ?? 0, corregidos: d.corregidos ?? 0, iguales: d.iguales ?? 0,
    porMes: d.vista?.porMes ?? [], avisos: (d.vista?.avisos ?? []).filter(a => a.nivel !== "info"),
  };
}

export const leerConexion = () => leerAjuste<Conexion | null>("finanzas", null);
export const leerUltimoEnvio = () => leerAjuste<UltimoEnvio | null>("finanzasUltimo", null);

async function envioDeAhora(modo?: "revisar") {
  const [movs, cats, cuentas] = await Promise.all([db.movimientos.toArray(), db.categorias.toArray(), db.cuentas.toArray()]);
  const e = armarEnvio(mesesAMandar(), movs, cats, cuentas);
  return modo ? { ...e, modo } : e;
}

/** "Probar y guardar": manda en modo revisar (Finanzas no escribe nada) y, si
 *  contesta bien, guarda la dirección y la clave. */
export async function probarYGuardar(direccion: string, clave: string): Promise<Resultado> {
  const dir = normalizarDireccion(direccion);
  const res = interpretar(await post(dir, clave.trim(), await envioDeAhora("revisar")), dir, true);
  if (res.tipo === "revisado") await guardarAjuste("finanzas", { direccion: dir, clave: clave.trim() } satisfies Conexion);
  return res;
}

/** Manda de verdad. Si sale bien, esos meses quedan como exportados (así el
 *  recordatorio de exportar se va y el Excel no los vuelve a mandar). */
export async function mandar(c: Conexion): Promise<Resultado> {
  const envio = await envioDeAhora();
  const res = interpretar(await post(c.direccion, c.clave, envio), c.direccion, false);
  if (res.tipo === "listo") {
    const ahora = new Date().toISOString();
    // Todos los de esos meses, también los que no viajan (§7): no hace falta mandarlos.
    const meses = mesesAMandar();
    const delPeriodo = await db.movimientos.filter(m => meses.includes(periodoDe(m.fecha))).primaryKeys();
    await db.movimientos.bulkUpdate(delPeriodo.map(id => ({ key: id, changes: { exportado: ahora } })));
    await guardarAjuste("ultimaExportacion", ahora);
    await guardarAjuste("finanzasUltimo", { fecha: ahora, direccion: c.direccion } satisfies UltimoEnvio);
  }
  return res;
}

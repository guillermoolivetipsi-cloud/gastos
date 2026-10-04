import { db, guardarAjuste, leerAjuste } from "../db";
import type { Categoria, Cuenta, Movimiento } from "../tipos";
import { periodoDe, periodoHoy, sumarMeses } from "./fecha";

/* «Mandar a Finanzas» por el buzón: el celular deja el envío en un repo privado de
   GitHub y Finanzas lo levanta (9:30 y 21:30, o con «Traer lo del celular»). Por cada
   envío, Finanzas deja una respuesta con el mismo nombre; la app la lee al abrirse.
   El contrato está en ~/Desktop/Aplicaciones/Finanzas/CONTRATO-GASTOS.md. Lo que no se
   negocia: los importes van en su moneda (nunca en dólares), el id es el de la base de
   la app y no cambia, y los meses van completos.

   Cada envío: los últimos 6 meses, completos. `cuenta` va siempre que el movimiento
   tenga cuenta: es el medio de pago, y las tarjetas se llaman "Visa" y "Mastercard"
   (Finanzas las reconoce por el nombre). Sin borrados, sin recurrentes. */

export const CONTRATO = "1.0";
export const REPO = "guillermoolivetipsi-cloud/gastos-buzon";
const API = `https://api.github.com/repos/${REPO}`;

export interface MovimientoEnviado {
  id: string; tipo: "gasto" | "ingreso"; fecha: string; monto: number; moneda: string;
  cuenta?: string; categoria?: string; etiquetas: string[]; comentario?: string; cuotas?: number;
}
export interface Envio {
  app: "gastos"; contrato: string; generado: string; desde: string; hasta: string;
  movimientos: MovimientoEnviado[];
}

export interface Aviso { nivel: "error" | "atencion" | "info"; texto: string }
export type PorMes = { periodo: string; nuevos: number; cambian: number; iguales: number }[];

/** Lo que dice Finanzas de un envío (el archivo de respuestas/). */
export type Resultado =
  | { tipo: "listo"; nuevos: number; corregidos: number; iguales: number; porMes: PorMes; avisos: Aviso[] }
  | { tipo: "rechazado"; mensaje: string };

/** Un envío que la app dejó en el buzón, y su respuesta cuando llega. */
export interface EnvioHecho {
  nombre: string;       // "2026-09-29T12-40-05Z.json"
  enviado: string;      // ISO
  meses: string[];
  cantidad: number;
  resultado?: Resultado;
  respondido?: string;  // ISO, cuándo lo aplicó Finanzas
  visto?: boolean;      // ya se mostró la respuesta
}

/** Cómo salió dejarlo en el buzón. */
export type Subida = { tipo: "dejado"; envio: EnvioHecho } | { tipo: "token" } | { tipo: "sin-respuesta" };

/** Los meses que se mandan, completos: los últimos 6, el que corre incluido. Así cada
 *  envío también corrige lo de meses anteriores (por el id: no duplica). */
export const MESES = 6;
export const mesesAMandar = (hoy = periodoHoy()) => Array.from({ length: MESES }, (_, i) => sumarMeses(hoy, i - MESES + 1));

/** "2026-09-29T12:40:05.123Z" → "2026-09-29T12-40-05Z.json" */
export const nombreDeEnvio = (d: Date) => `${d.toISOString().slice(0, 19).replace(/:/g, "-")}Z.json`;

/** Lo que no viaja (contrato §5, "una fuente por hecho"): los cobros de pacientes
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

/** Lee el archivo de respuesta de Finanzas. `ok: false` = no se escribió nada. */
export function interpretar(r: unknown): Resultado {
  const d = (r ?? {}) as { ok?: boolean; mensaje?: string; nuevos?: number; corregidos?: number; iguales?: number; avisos?: Aviso[]; porMes?: PorMes };
  const error = d.avisos?.find(a => a.nivel === "error")?.texto;
  if (!d.ok) return { tipo: "rechazado", mensaje: error ?? d.mensaje ?? "Finanzas no aceptó el envío" };
  return {
    tipo: "listo", nuevos: d.nuevos ?? 0, corregidos: d.corregidos ?? 0, iguales: d.iguales ?? 0,
    porMes: d.porMes ?? [], avisos: (d.avisos ?? []).filter(a => a.nivel !== "info"),
  };
}

/* ── GitHub ── */

const cabeceras = (token: string, crudo = false) => ({
  Authorization: `Bearer ${token}`,
  Accept: crudo ? "application/vnd.github.raw+json" : "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

function aBase64(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const leerToken = () => leerAjuste<string | null>("buzonToken", null);
export const leerEnvios = () => leerAjuste<EnvioHecho[]>("buzonEnvios", []);
const guardarEnvios = (es: EnvioHecho[]) => guardarAjuste("buzonEnvios", es.slice(-20));

/** "Probar y guardar": el token tiene que poder ver el repo del buzón. */
export async function probarToken(token: string): Promise<"ok" | "token" | "sin-acceso" | "sin-respuesta"> {
  const t = token.trim();
  try {
    const r = await fetch(API, { headers: cabeceras(t) });
    if (r.status === 401) return "token";
    if (!r.ok) return "sin-acceso"; // 403/404: el token no tiene permiso sobre ese repo
    await guardarAjuste("buzonToken", t);
    return "ok";
  } catch {
    return "sin-respuesta";
  }
}

/** Deja el envío en envios/<fecha>.json. */
export async function mandar(token: string): Promise<Subida> {
  const [movs, cats, cuentas] = await Promise.all([db.movimientos.toArray(), db.categorias.toArray(), db.cuentas.toArray()]);
  const ahora = new Date();
  const meses = mesesAMandar();
  const envio = armarEnvio(meses, movs, cats, cuentas, ahora);
  const nombre = nombreDeEnvio(ahora);
  try {
    const r = await fetch(`${API}/contents/envios/${nombre}`, {
      method: "PUT", headers: { ...cabeceras(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Envío del celular: ${envio.movimientos.length} movimientos (${meses[0]} a ${meses[meses.length - 1]})`, content: aBase64(JSON.stringify(envio, null, 1)) }),
    });
    if (r.status === 401 || r.status === 403 || r.status === 404) return { tipo: "token" };
    if (!r.ok) return { tipo: "sin-respuesta" };
  } catch {
    return { tipo: "sin-respuesta" };
  }
  const hecho: EnvioHecho = { nombre, enviado: ahora.toISOString(), meses, cantidad: envio.movimientos.length };
  await guardarEnvios([...(await leerEnvios()), hecho]);
  return { tipo: "dejado", envio: hecho };
}

/** Al abrir la app: busca las respuestas de los envíos que todavía no tienen. Si
 *  Finanzas los aplicó, esos meses quedan como exportados (así se va el recordatorio
 *  de exportar y el Excel no los repite). Devuelve los que llegaron ahora. */
export async function buscarRespuestas(): Promise<EnvioHecho[]> {
  const token = await leerToken();
  const envios = await leerEnvios();
  const esperando = envios.filter(e => !e.resultado);
  if (!token || !esperando.length) return [];
  const llegaron: EnvioHecho[] = [];
  for (const e of esperando) {
    try {
      const r = await fetch(`${API}/contents/respuestas/${e.nombre}`, { headers: cabeceras(token, true), cache: "no-store" });
      if (!r.ok) continue; // 404: Finanzas todavía no lo levantó
      const datos = await r.json() as { respondido?: string };
      Object.assign(e, { resultado: interpretar(datos), respondido: datos.respondido ?? new Date().toISOString(), visto: false });
      llegaron.push(e);
    } catch { /* sin conexión: la próxima vez */ }
  }
  if (!llegaron.length) return [];
  await guardarEnvios(envios);
  for (const e of llegaron) if (e.resultado?.tipo === "listo") {
    // Todos los de esos meses, también los que no viajan (§5). Con la hora del envío:
    // lo que cambiaste después sigue saliendo como "cambió después de exportarlo".
    const ids = await db.movimientos.filter(m => e.meses.includes(periodoDe(m.fecha)) && !(m.exportado && m.exportado >= e.enviado)).primaryKeys();
    await db.movimientos.bulkUpdate(ids.map(id => ({ key: id, changes: { exportado: e.enviado } })));
    const ultima = await leerAjuste<string | null>("ultimaExportacion", null);
    if (!ultima || ultima < e.enviado) await guardarAjuste("ultimaExportacion", e.enviado);
  }
  return llegaron;
}

export async function marcarVisto(nombre: string) {
  const es = await leerEnvios();
  const e = es.find(x => x.nombre === nombre);
  if (e && !e.visto) { e.visto = true; await guardarEnvios(es); }
}

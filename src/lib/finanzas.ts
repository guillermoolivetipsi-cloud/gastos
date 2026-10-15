import { db, guardarAjuste, leerAjuste, nuevoId } from "../db";
import type { Categoria, Cuenta, Moneda, Movimiento } from "../tipos";
import type { Destinos } from "./plan";
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
export function seManda(m: Movimiento, cat: Categoria | undefined, cuenta?: Cuenta) {
  // Lo que llegó de Finanzas no vuelve.
  if (m.origen === "finanzas") return false;
  // Lo de la cuenta «App anterior» (lo que se trajo del Excel de la app vieja) ya está en Finanzas.
  if (cuenta?.nombre.trim().toLowerCase() === "app anterior") return false;
  return !(m.tipo === "ingreso" && cat?.nombre === "Psicología");
}

/** El envío: todos los movimientos de esos meses, completos, en su moneda. */
export function armarEnvio(meses: string[], movs: Movimiento[], cats: Categoria[], cuentas: Cuenta[], ahora = new Date()): Envio {
  const cat = new Map(cats.map(c => [c.id, c]));
  const cta = new Map(cuentas.map(c => [c.id, c]));
  const movimientos = movs
    .filter(m => meses.includes(periodoDe(m.fecha)) && seManda(m, cat.get(m.categoriaId), cta.get(m.cuentaId)))
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

/* ── La vuelta: lo que manda Finanzas (CONTRATO-FINANZAS-A-GASTOS.md) ─────────────
   Finanzas deja hacia-gastos/<fecha>.json con los cobros de Psicología y, por mes, lo
   que fue a liquidez, inversión y deuda (USD). La app aplica el más nuevo (los meses
   vienen completos: el último manda) y borra los que leyó. */

export interface IngresoDeFinanzas { id: string; fecha: string; monto: number; moneda: Moneda; usd: number; categoria: string; cuenta?: string; comentario?: string }
export interface Etapa { nombre: string; texto: string; meses?: number; objetivo?: number }
export interface Estimado { periodo: string; usd: number; texto?: string }
export interface DesdeFinanzas {
  app: "finanzas"; contrato: string; generado: string; meses: string[];
  ingresos: IngresoDeFinanzas[]; destinos: (Destinos & { periodo: string })[];
  /** La etapa de la cascada de Finanzas hoy. */
  etapa?: Etapa;
  /** La proyección de la clínica para el mes en curso. */
  estimados?: Estimado[];
}

const esMes = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x);
const esNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);

/** Lo que llegó, si cumple el contrato; si no, null (y no se aplica nada). */
export function validarDesdeFinanzas(x: unknown): DesdeFinanzas | null {
  const d = x as DesdeFinanzas;
  if (!d || d.app !== "finanzas" || d.contrato !== "1.0" || !Array.isArray(d.meses) || !d.meses.every(esMes)) return null;
  if (!Array.isArray(d.ingresos) || !Array.isArray(d.destinos)) return null;
  const okIngreso = (i: IngresoDeFinanzas) => typeof i?.id === "string" && !!i.id && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha ?? "")
    && esNum(i.monto) && i.monto > 0 && ["ARS", "USD", "EUR"].includes(i.moneda) && esNum(i.usd) && typeof i.categoria === "string" && d.meses.includes(i.fecha.slice(0, 7));
  const okDestino = (x: Destinos & { periodo: string }) => esMes(x?.periodo) && (x.liquidez == null || esNum(x.liquidez)) && esNum(x.inversion) && esNum(x.deuda);
  if (!d.ingresos.every(okIngreso) || !d.destinos.every(okDestino)) return null;
  if (d.etapa != null && (typeof d.etapa.nombre !== "string" || typeof d.etapa.texto !== "string")) return null;
  if (d.estimados != null && (!Array.isArray(d.estimados) || !d.estimados.every(e => esMes(e?.periodo) && esNum(e.usd)))) return null;
  if (new Set(d.ingresos.map(i => i.id)).size !== d.ingresos.length) return null;
  return d;
}

/** Arma lo que hay que guardar: los ingresos como movimientos de la app (con id
 *  `finanzas:<id>`), las categorías o cuentas que falten, y los destinos por mes. */
export function armarDesdeFinanzas(d: DesdeFinanzas, cats: Categoria[], cuentas: Cuenta[]) {
  const catsNuevas: Categoria[] = [], cuentasNuevas: Cuenta[] = [];
  const categoria = (nombre: string) => {
    const n = nombre.trim().toLowerCase();
    let c = [...cats, ...catsNuevas].find(x => x.tipo === "ingreso" && x.nombre.trim().toLowerCase() === n);
    if (!c) { c = { id: nuevoId(), nombre: nombre.trim(), tipo: "ingreso", icono: "question-mark", color: "#3AA8E0", orden: cats.length + catsNuevas.length }; catsNuevas.push(c); }
    return c;
  };
  const cuenta = (nombre: string | undefined, moneda: Moneda) => {
    const n = (nombre || "Finanzas").trim();
    let c = [...cuentas, ...cuentasNuevas].find(x => x.nombre.trim().toLowerCase() === n.toLowerCase());
    if (!c) { c = { id: nuevoId(), nombre: n, moneda, dolar: "oficial", esTarjeta: false, orden: cuentas.length + cuentasNuevas.length }; cuentasNuevas.push(c); }
    return c;
  };
  const movs: Movimiento[] = d.ingresos.map(i => ({
    id: `finanzas:${i.id}`, tipo: "ingreso", fecha: i.fecha, monto: i.monto, moneda: i.moneda, usd: i.usd,
    cuentaId: cuenta(i.cuenta, i.moneda).id, categoriaId: categoria(i.categoria).id, etiquetas: [],
    comentario: i.comentario || undefined, origen: "finanzas",
    // Ya está en Finanzas: no queda como «sin exportar».
    exportado: d.generado, creado: d.generado, modificado: d.generado,
  }));
  const destinos: Record<string, Destinos> = {};
  for (const x of d.destinos) destinos[x.periodo] = { ...(x.liquidez != null ? { liquidez: x.liquidez } : {}), inversion: x.inversion, deuda: x.deuda };
  return { movs, catsNuevas, cuentasNuevas, destinos };
}

/** Guarda lo que llegó: reemplaza lo de Finanzas de esos meses. */
export async function aplicarDesdeFinanzas(d: DesdeFinanzas) {
  const [cats, cuentas] = await Promise.all([db.categorias.toArray(), db.cuentas.toArray()]);
  const { movs, catsNuevas, cuentasNuevas, destinos } = armarDesdeFinanzas(d, cats, cuentas);
  await db.transaction("rw", [db.movimientos, db.categorias, db.cuentas, db.ajustes], async () => {
    if (catsNuevas.length) await db.categorias.bulkAdd(catsNuevas);
    if (cuentasNuevas.length) await db.cuentas.bulkAdd(cuentasNuevas);
    const viejos = await db.movimientos.filter(m => m.origen === "finanzas" && d.meses.includes(m.fecha.slice(0, 7))).primaryKeys();
    await db.movimientos.bulkDelete(viejos);
    await db.movimientos.bulkPut(movs);
    const antes = await leerAjuste<Record<string, Destinos>>("destinosFinanzas", {});
    for (const p of d.meses) delete antes[p];
    await guardarAjuste("destinosFinanzas", { ...antes, ...destinos });
    await guardarAjuste("ultimoDeFinanzas", { generado: d.generado, ingresos: movs.length, meses: d.meses });
    await guardarAjuste("etapaFinanzas", d.etapa ?? null);
    await guardarAjuste("estimadosFinanzas", d.estimados ?? []);
  });
  return movs.length;
}

export const leerDestinos = () => leerAjuste<Record<string, Destinos>>("destinosFinanzas", {});
/** La agenda de la clínica que manda Finanzas: USD esperados por mes (el actual y los que vienen). */
/** De dónde sale la proyección de la clínica de cada mes, según el texto de Finanzas:
 *  «agenda» si es la agenda de PsicoTracker; «proyección» si es un cálculo (más allá de la agenda). */
export const leerFuentesEstimados = async () => Object.fromEntries((await leerAjuste<Estimado[]>("estimadosFinanzas", [])).map(e => [e.periodo, /agenda/i.test(e.texto ?? "") ? "agenda" : "proyección"])) as Record<string, "agenda" | "proyección">;
export const leerEstimados = async () => Object.fromEntries((await leerAjuste<Estimado[]>("estimadosFinanzas", [])).map(e => [e.periodo, e.usd])) as Record<string, number>;

/** Al abrir la app: busca lo que dejó Finanzas en hacia-gastos/, aplica el más nuevo y
 *  borra lo leído. Devuelve cuántos ingresos llegaron, o null si no había nada. */
export async function recibirDeFinanzas(): Promise<number | null> {
  const token = await leerToken();
  if (!token) return null;
  try {
    const r = await fetch(`${API}/contents/hacia-gastos`, { headers: cabeceras(token), cache: "no-store" });
    if (!r.ok) return null; // 404: todavía no hay nada
    const archivos = (await r.json() as { name: string; sha: string }[]).filter(a => a.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name));
    if (!archivos.length) return null;
    const ultimo = archivos[archivos.length - 1];
    const crudo = await fetch(`${API}/contents/hacia-gastos/${ultimo.name}`, { headers: cabeceras(token, true), cache: "no-store" });
    if (!crudo.ok) return null;
    const d = validarDesdeFinanzas(await crudo.json());
    if (!d) return null; // no cumple el contrato: no se aplica ni se borra
    const cantidad = await aplicarDesdeFinanzas(d);
    for (const a of archivos) {
      await fetch(`${API}/contents/hacia-gastos/${a.name}`, {
        method: "DELETE", headers: { ...cabeceras(token), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Leído por el celular: ${a.name}`, sha: a.sha }),
      }).catch(() => undefined);
    }
    return cantidad;
  } catch {
    return null; // sin conexión: la próxima vez
  }
}

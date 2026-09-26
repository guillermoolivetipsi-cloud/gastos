type XLSXMod = typeof import("xlsx");
// La librería de Excel pesa: se carga solo al exportar o importar.
const xlsx = () => import("xlsx");
import { db, guardarAjuste, nuevoId, sembrar } from "../db";
import type { Categoria, Cuenta, Moneda, Movimiento, Recurrente, Tipo } from "../tipos";
import { aTexto, periodoDe } from "./fecha";
import { aUsd, precargarHistoria, cotizar } from "./cotizaciones";

/* ── Exportar a Finanzas ──────────────────────────────────────────────────
   Mismo formato que la app anterior, que es el que lee `lib/importar.ts` de
   Finanzas: hojas "Gastos" e "Ingresos", datos desde la fila 3, columnas
   fecha · categoría · cuenta · importe · moneda · importe tx · moneda tx ·
   etiquetas · comentario.

   Finanzas reconoce los duplicados por fecha, categoría, importe, moneda y
   comentario, numerando los iguales en el orden del archivo. Por eso se exportan
   siempre meses enteros y en el mismo orden: si mandara solo lo nuevo, un segundo
   café idéntico en el mismo día quedaría numerado 1 y Finanzas lo descartaría. */

export const ordenExport = (a: Movimiento, b: Movimiento) =>
  a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado);

export async function mesesSinExportar() {
  const sin = await db.movimientos.filter(m => !m.exportado).toArray();
  return [...new Set(sin.map(m => periodoDe(m.fecha)))].sort();
}

/** Movimientos que cambiaste después de exportarlos: Finanzas los va a ver como nuevos. */
export async function editadosDespues() {
  return db.movimientos.filter(m => !!m.exportado && m.modificado > m.exportado).toArray();
}

export async function exportar(meses: string[]) {
  const [movs, cats, cuentas] = await Promise.all([
    db.movimientos.filter(m => meses.includes(periodoDe(m.fecha))).toArray(),
    db.categorias.toArray(),
    db.cuentas.toArray(),
  ]);
  const cat = new Map(cats.map(c => [c.id, c.nombre]));
  const cta = new Map(cuentas.map(c => [c.id, c.nombre]));
  const titulo = ["Fecha", "Categoría", "Cuenta", "Importe en moneda de la cuenta", "Moneda de la cuenta", "Importe en moneda de la transacción", "Moneda de la transacción", "Etiquetas", "Comentario", "ID"];
  const XLSX = await xlsx();
  const wb = XLSX.utils.book_new();
  for (const [hoja, tipo] of [["Gastos", "gasto"], ["Ingresos", "ingreso"]] as const) {
    const filas = movs.filter(m => m.tipo === tipo).sort(ordenExport).map(m => [
      m.fecha, cat.get(m.categoriaId) ?? "Otros", cta.get(m.cuentaId) ?? "",
      m.monto, m.moneda, m.monto, m.moneda, m.etiquetas.join(", "), m.comentario ?? "", m.id,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[`${hoja} · ${meses.join(", ")}`], titulo, ...filas]);
    XLSX.utils.book_append_sheet(wb, ws, hoja);
  }
  const nombre = `gastos-${meses[0]}${meses.length > 1 ? `-a-${meses[meses.length - 1]}` : ""}.xlsx`;
  descargar(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombre);
  const ahora = new Date().toISOString();
  await db.movimientos.bulkUpdate(movs.map(m => ({ key: m.id, changes: { exportado: ahora } })));
  await guardarAjuste("ultimaExportacion", ahora);
  return movs.length;
}

/* ── Importar desde la app anterior ─────────────────────────────────────── */

const MONEDAS = new Set(["USD", "EUR", "ARS"]);

function fechaDe(XLSX: XLSXMod, v: unknown): string | null {
  if (v instanceof Date) return aTexto(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  return null;
}

export interface ResultadoImport { nuevos: number; repetidos: number; sinCotizar: number; categoriasNuevas: string[]; cuentasNuevas: string[] }

/** `yaEnFinanzas`: lo que viene de la app anterior ya se importó en Finanzas y no
 *  se vuelve a exportar. Lo nuevo (por ejemplo, cobros de tarjeta que faltaban) sí. */
export async function importarXlsx(archivo: File, avance?: (t: string) => void, yaEnFinanzas = true): Promise<ResultadoImport> {
  const XLSX = await xlsx();
  const wb = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
  const cats = await db.categorias.toArray();
  const cuentas = await db.cuentas.toArray();
  const existentes = new Set((await db.movimientos.toArray()).map(m => `${m.tipo}|${m.fecha}|${m.monto}|${m.moneda}|${m.comentario ?? ""}|${m.categoriaId}`));
  const res: ResultadoImport = { nuevos: 0, repetidos: 0, sinCotizar: 0, categoriasNuevas: [], cuentasNuevas: [] };
  const nuevos: Movimiento[] = [];

  const categoria = (nombre: string, tipo: Tipo): Categoria => {
    let c = cats.find(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.tipo === tipo);
    if (!c) {
      c = { id: nuevoId(), nombre, tipo, icono: "question-mark", color: "#6B6880", orden: cats.length };
      cats.push(c); res.categoriasNuevas.push(nombre);
      db.categorias.add(c);
    }
    return c;
  };
  const cuenta = (nombre: string, moneda: Moneda): Cuenta => {
    let c = cuentas.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (!c) {
      c = { id: nuevoId(), nombre, moneda, dolar: "blue", esTarjeta: false, orden: cuentas.length };
      cuentas.push(c); res.cuentasNuevas.push(nombre);
      db.cuentas.add(c);
    }
    return c;
  };

  for (const [hoja, tipo] of [["Gastos", "gasto"], ["Ingresos", "ingreso"]] as const) {
    const ws = wb.Sheets[hoja];
    if (!ws) continue;
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }).slice(2);
    for (const f of filas) {
      const fecha = fechaDe(XLSX, f[0]);
      if (!fecha) continue;
      const monedaCta = MONEDAS.has(String(f[4])) ? (f[4] as Moneda) : "USD";
      const monedaTx = MONEDAS.has(String(f[6])) ? (f[6] as Moneda) : null;
      const monto = Math.abs(Number(monedaTx && f[5] ? f[5] : f[3]) || 0);
      const moneda = monedaTx && f[5] ? monedaTx : monedaCta;
      if (!monto) continue;
      const cat = categoria(String(f[1] ?? "Otros").trim() || "Otros", tipo);
      const cta = cuenta(String(f[2] ?? "Principal").trim() || "Principal", monedaCta);
      const comentario = f[8] ? String(f[8]).trim() : undefined;
      const clave = `${tipo}|${fecha}|${monto}|${moneda}|${comentario ?? ""}|${cat.id}`;
      if (existentes.has(clave)) { res.repetidos++; continue; }
      existentes.add(clave);
      const ahora = new Date().toISOString();
      nuevos.push({
        id: nuevoId(), tipo, fecha, monto, moneda, usd: moneda === "USD" ? monto : null,
        cuentaId: cta.id, categoriaId: cat.id,
        etiquetas: f[7] ? String(f[7]).split(",").map(s => s.trim()).filter(Boolean) : [],
        comentario, creado: ahora, modificado: ahora,
        exportado: yaEnFinanzas ? ahora : undefined,
      });
    }
  }

  avance?.("Buscando cotizaciones…");
  await precargarHistoria(nuevos.map(m => m.fecha));
  let i = 0;
  for (const m of nuevos) {
    if (m.usd == null) {
      const cot = await cotizar(m.moneda, m.fecha, cuentas.find(c => c.id === m.cuentaId)?.dolar ?? "blue");
      if (cot) { m.usd = aUsd(m.monto, cot.tasa); m.cotizacion = cot; } else res.sinCotizar++;
    }
    if (++i % 200 === 0) avance?.(`Convirtiendo ${i} de ${nuevos.length}…`);
  }
  await db.movimientos.bulkAdd(nuevos);
  res.nuevos = nuevos.length;
  return res;
}

/* ── Copia de seguridad ─────────────────────────────────────────────────── */

export async function copiaDeSeguridad() {
  const datos = {
    app: "gastos", version: 1, fecha: new Date().toISOString(),
    cuentas: await db.cuentas.toArray(),
    categorias: await db.categorias.toArray(),
    movimientos: await db.movimientos.toArray(),
    recurrentes: await db.recurrentes.toArray(),
    descartes: await db.descartes.toArray(),
    ajustes: (await db.ajustes.toArray()).filter(a => a.clave !== "cotizaciones"),
  };
  descargar(new Blob([JSON.stringify(datos)], { type: "application/json" }), `gastos-respaldo-${aTexto(new Date())}.json`);
  await guardarAjuste("ultimoRespaldo", datos.fecha);
}

export async function restaurar(archivo: File) {
  const d = JSON.parse(await archivo.text());
  if (d.app !== "gastos") throw new Error("Este archivo no es una copia de seguridad de Gastos.");
  // Que la carga inicial de cuentas y categorías termine antes: si no, podría
  // escribirse encima de lo restaurado y duplicar las cuentas.
  await sembrar();
  await db.transaction("rw", [db.cuentas, db.categorias, db.movimientos, db.recurrentes, db.descartes, db.ajustes], async () => {
    for (const t of [db.cuentas, db.categorias, db.movimientos, db.recurrentes, db.descartes]) await t.clear();
    await db.cuentas.bulkAdd(d.cuentas);
    await db.categorias.bulkAdd(d.categorias);
    await db.movimientos.bulkAdd(d.movimientos);
    await db.recurrentes.bulkAdd(d.recurrentes);
    await db.descartes.bulkAdd(d.descartes ?? []);
    for (const a of d.ajustes ?? []) await db.ajustes.put(a);
  });
  return d.movimientos.length as number;
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ── Sumar desde archivo ───────────────────────────────────────────────────
   Un "paquete" agrega cosas sin tocar lo que ya hay: recurrentes nuevos (con los
   pagos ya cargados que les corresponden), cambios de configuración de cuentas y
   comercios aprendidos. Es idempotente: sumarlo dos veces no duplica nada. */

export interface Paquete {
  app: "gastos-paquete";
  recurrentes?: (Omit<Recurrente, "categoriaId" | "cuentaId"> & { categoria: string; cuenta: string; pagos?: string[] })[];
  cuentas?: { nombre: string; cambios: Partial<Cuenta> }[];
  reglasComercio?: Record<string, string>; // comercio → nombre de categoría
}

export async function sumarPaquete(archivo: File) {
  const p = JSON.parse(await archivo.text()) as Paquete;
  if (p.app !== "gastos-paquete") throw new Error("Este archivo no es un paquete para sumar.");
  const cats = await db.categorias.toArray(), cuentas = await db.cuentas.toArray();
  const cat = (n: string) => cats.find(c => c.nombre.toLowerCase() === n.toLowerCase());
  const cta = (n: string) => cuentas.find(c => c.nombre.toLowerCase() === n.toLowerCase());
  const res = { recurrentes: 0, pagos: 0, cuentas: 0, reglas: 0, salteados: [] as string[] };
  await db.transaction("rw", [db.recurrentes, db.movimientos, db.cuentas, db.ajustes], async () => {
    for (const r of p.recurrentes ?? []) {
      const c = cat(r.categoria), k = cta(r.cuenta);
      if (!c || !k) { res.salteados.push(r.nombre); continue; }
      if (await db.recurrentes.get(r.id)) continue;
      const { categoria: _c, cuenta: _k, pagos, ...resto } = r;
      await db.recurrentes.add({ ...resto, categoriaId: c.id, cuentaId: k.id });
      res.recurrentes++;
      for (const id of pagos ?? []) {
        const m = await db.movimientos.get(id);
        if (m && !m.recurrenteId) { await db.movimientos.update(id, { recurrenteId: r.id, periodo: m.fecha.slice(0, 7) }); res.pagos++; }
      }
    }
    for (const { nombre, cambios } of p.cuentas ?? []) {
      const k = cta(nombre);
      if (k) { await db.cuentas.update(k.id, cambios); res.cuentas++; }
    }
    if (p.reglasComercio) {
      const actuales = ((await db.ajustes.get("reglasComercio"))?.valor ?? {}) as Record<string, string>;
      const nuevas = { ...actuales };
      for (const [comercio, nombreCat] of Object.entries(p.reglasComercio)) {
        const c = cat(nombreCat);
        if (c && !nuevas[comercio]) { nuevas[comercio] = c.id; res.reglas++; }
      }
      await db.ajustes.put({ clave: "reglasComercio", valor: nuevas });
    }
  });
  return res;
}

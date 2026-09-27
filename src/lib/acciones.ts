import { db, nuevoId } from "../db";
import type { Cuenta, Movimiento, Recurrente } from "../tipos";
import type { SugerenciaRecurrente } from "./analisis";
import { aUsd, cotizar } from "./cotizaciones";
import { periodoHoy, sumarDias, ultimoDia } from "./fecha";
import { sinAcentos } from "./formato";

export type Borrador = Omit<Movimiento, "id" | "usd" | "cotizacion" | "creado" | "modificado" | "exportado"> & { id?: string };

/** Guarda un movimiento con la cotización de su fecha. Sin conexión, queda sin USD
 *  y se completa sola cuando vuelve. */
export async function guardarMovimiento(b: Borrador, cuenta: Cuenta | undefined) {
  const previo = b.id ? await db.movimientos.get(b.id) : undefined;
  const mismaCot = previo && previo.fecha === b.fecha && previo.moneda === b.moneda && previo.cotizacion && previo.cuentaId === b.cuentaId;
  const cot = mismaCot ? previo!.cotizacion! : await cotizar(b.moneda, b.fecha, cuenta?.dolar ?? "blue");
  const ahora = new Date().toISOString();
  const mov: Movimiento = {
    ...previo,
    ...b,
    id: b.id ?? nuevoId(),
    usd: cot ? aUsd(b.monto, cot.tasa) : null,
    cotizacion: cot ?? undefined,
    creado: previo?.creado ?? ahora,
    modificado: ahora,
  };
  await db.movimientos.put(mov);
  return mov;
}

/** Borra y devuelve una función para deshacerlo. */
export async function eliminarMovimiento(id: string) {
  const m = await db.movimientos.get(id);
  await db.movimientos.delete(id);
  // Un pago de un recurrente automático volvería a cargarse solo: ese mes se saltea.
  const r = m?.recurrenteId ? await db.recurrentes.get(m.recurrenteId) : undefined;
  const salteo = r?.modo === "auto" && m?.periodo ? m.periodo : null;
  if (salteo) await db.recurrentes.where("id").equals(r!.id).modify(x => { x.saltear = [...new Set([...(x.saltear ?? []), salteo])]; });
  return async () => {
    if (m) await db.movimientos.put(m);
    if (salteo) await db.recurrentes.where("id").equals(r!.id).modify(x => { x.saltear = (x.saltear ?? []).filter(k => k !== salteo); });
  };
}

export type Alcance = "este" | "todo";

/** Borrar un recurrente: solo esta vez, de acá en adelante, o entero (con sus pagos). */
export async function eliminarRecurrente(r: Recurrente, alcance: Alcance, clave?: string) {
  const antes = await db.recurrentes.get(r.id);
  const pagos = await db.movimientos.where("recurrenteId").equals(r.id).toArray();
  if (alcance === "este" && clave) {
    // Lo ya pagado de esa vez queda cargado, como gasto suelto.
    const deEste = pagos.filter(p => p.periodo === clave);
    await db.transaction("rw", db.recurrentes, db.movimientos, async () => {
      await db.recurrentes.where("id").equals(r.id).modify(x => { x.saltear = [...new Set([...(x.saltear ?? []), clave])]; });
      await db.movimientos.bulkUpdate(deEste.map(p => ({ key: p.id, changes: { recurrenteId: undefined, periodo: undefined } })));
    });
    return async () => { await db.recurrentes.put(antes!); await db.movimientos.bulkPut(deEste); };
  }
  // Entero: se borra el recurrente; los pagos ya hechos quedan como gastos sueltos.
  await db.recurrentes.delete(r.id);
  await db.movimientos.bulkUpdate(pagos.map(p => ({ key: p.id, changes: { recurrenteId: undefined, periodo: undefined } })));
  return async () => { await db.recurrentes.put(antes!); await db.movimientos.bulkPut(pagos); };
}

/** Dejar de pedir un recurrente: termina y queda en "Terminados" con todos sus
 *  pagos vinculados (el historial no se toca). Si este mes ya está pagado, termina
 *  a fin de mes; si no, termina el mes pasado y este mes ya no se pide. */
export async function terminarRecurrente(r: Recurrente) {
  const antes = await db.recurrentes.get(r.id);
  const p = periodoHoy();
  const pagadoEsteMes = (await db.movimientos.where("recurrenteId").equals(r.id).toArray()).some(m => m.periodo?.startsWith(p));
  const fin = pagadoEsteMes ? ultimoDia(p) : sumarDias(`${p}-01`, -1);
  await db.recurrentes.update(r.id, { fin });
  return async () => { if (antes) await db.recurrentes.put(antes); };
}

/** Volver a pedirlo: le saca la fecha de fin. */
export const reactivarRecurrente = (r: Recurrente) => db.recurrentes.update(r.id, { fin: undefined });

/** "Este mes fue 0": la instancia queda resuelta sin pago. Se puede deshacer. */
export async function marcarEnCero(r: Recurrente, clave: string, enCero: boolean) {
  await db.recurrentes.where("id").equals(r.id).modify(x => {
    const actual = new Set(x.enCero ?? []);
    if (enCero) actual.add(clave); else actual.delete(clave);
    x.enCero = [...actual];
  });
}

/** Los gastos que originaron una sugerencia (y el de este mes, si ya está) pasan a
 *  ser pagos del recurrente. */
export async function vincularPagosDeSugerencia(recId: string, s: SugerenciaRecurrente, movs: Movimiento[]) {
  const [, catId, texto] = s.clave.split("|");
  const pagos = movs.filter(m => !m.recurrenteId && m.categoriaId === catId && m.tipo === s.tipo && m.fecha.slice(0, 7) >= s.meses[0] && sinAcentos(m.comentario || m.etiquetas[0] || "") === texto);
  await db.movimientos.bulkUpdate(pagos.map(m => ({ key: m.id, changes: { recurrenteId: recId, periodo: m.fecha.slice(0, 7) } })));
}

/** "Es recurrente" con un toque: se crea con lo sugerido (mensual, avisar). */
export async function crearDesdeSugerencia(s: SugerenciaRecurrente, movs: Movimiento[]) {
  const id = nuevoId();
  await db.recurrentes.add({
    id, nombre: s.nombre, tipo: s.tipo, categoriaId: s.categoriaId, cuentaId: s.cuentaId, monto: s.monto, moneda: s.moneda,
    clase: s.clase, frecuencia: "mensual", dia: s.dia, inicio: `${s.meses[0]}-01`, modo: "avisar", activo: true,
  });
  await vincularPagosDeSugerencia(id, s, movs);
  return async () => {
    await db.movimientos.where("recurrenteId").equals(id).modify({ recurrenteId: undefined, periodo: undefined });
    await db.recurrentes.delete(id);
  };
}

/** Este gasto es el pago de esa vez del recurrente. Devuelve cómo deshacerlo. */
export async function vincular(movId: string, recurrenteId: string, periodo: string) {
  const antes = await db.movimientos.get(movId);
  await db.movimientos.update(movId, { recurrenteId, periodo, modificado: new Date().toISOString() });
  return async () => { if (antes) await db.movimientos.update(movId, { recurrenteId: antes.recurrenteId, periodo: antes.periodo }); };
}

/** "Ahora no": la sugerencia se esconde por 30 días. */
export const pausar = (clave: string) => descartar(`pausa|${clave}`);

export async function descartar(clave: string) {
  await db.descartes.put({ clave, fecha: new Date().toISOString() });
}

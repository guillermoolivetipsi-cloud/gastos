import { db, nuevoId } from "../db";
import type { Cuenta, Movimiento, Recurrente } from "../tipos";
import { aUsd, cotizar } from "./cotizaciones";
import { sumarDias } from "./fecha";

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
  return async () => { if (m) await db.movimientos.put(m); };
}

export type Alcance = "este" | "siguientes" | "todo";

/** Borrar un recurrente: solo esta vez, de acá en adelante, o entero (con sus pagos). */
export async function eliminarRecurrente(r: Recurrente, alcance: Alcance, clave?: string) {
  const antes = await db.recurrentes.get(r.id);
  const pagos = await db.movimientos.where("recurrenteId").equals(r.id).toArray();
  if (alcance === "este" && clave) {
    await db.recurrentes.update(r.id, { saltear: [...(r.saltear ?? []), clave] });
    const deEste = pagos.filter(p => p.periodo === clave);
    await db.movimientos.bulkDelete(deEste.map(p => p.id));
    return async () => { await db.recurrentes.put(antes!); await db.movimientos.bulkPut(deEste); };
  }
  if (alcance === "siguientes" && clave) {
    // Termina el día anterior a esta instancia; lo ya pagado queda.
    const inicio = clave.length === 7 ? `${clave}-01` : clave;
    await db.recurrentes.update(r.id, { fin: sumarDias(inicio, -1) });
    const futuros = pagos.filter(p => p.periodo! >= clave);
    await db.movimientos.bulkDelete(futuros.map(p => p.id));
    return async () => { await db.recurrentes.put(antes!); await db.movimientos.bulkPut(futuros); };
  }
  // Entero: se borra el recurrente; los pagos ya hechos quedan como gastos sueltos.
  await db.recurrentes.delete(r.id);
  await db.movimientos.bulkUpdate(pagos.map(p => ({ key: p.id, changes: { recurrenteId: undefined, periodo: undefined } })));
  return async () => { await db.recurrentes.put(antes!); await db.movimientos.bulkPut(pagos); };
}

/** "Este mes fue 0": la instancia queda resuelta sin pago. Se puede deshacer. */
export async function marcarEnCero(r: Recurrente, clave: string, enCero: boolean) {
  const actual = new Set(r.enCero ?? []);
  if (enCero) actual.add(clave); else actual.delete(clave);
  await db.recurrentes.update(r.id, { enCero: [...actual] });
}

export async function descartar(clave: string) {
  await db.descartes.put({ clave, fecha: new Date().toISOString() });
}

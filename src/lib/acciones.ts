import { db, nuevoId } from "../db";
import type { Cuenta, Movimiento, Recurrente } from "../tipos";
import type { SugerenciaRecurrente } from "./analisis";
import { aUsd, cotizar } from "./cotizaciones";
import { diasDelMes, periodoHoy, sumarDias } from "./fecha";

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

/** Dejar de pedir un recurrente: termina y queda en "Terminados" con todos sus
 *  pagos vinculados (el historial no se toca). Si este mes ya está pagado, termina
 *  a fin de mes; si no, termina el mes pasado y este mes ya no se pide. */
export async function terminarRecurrente(r: Recurrente) {
  const antes = await db.recurrentes.get(r.id);
  const p = periodoHoy();
  const pagadoEsteMes = (await db.movimientos.where("recurrenteId").equals(r.id).toArray()).some(m => m.periodo?.startsWith(p));
  const fin = pagadoEsteMes ? `${p}-${String(diasDelMes(p)).padStart(2, "0")}` : sumarDias(`${p}-01`, -1);
  await db.recurrentes.update(r.id, { fin });
  return async () => { if (antes) await db.recurrentes.put(antes); };
}

/** Volver a pedirlo: le saca la fecha de fin. */
export const reactivarRecurrente = (r: Recurrente) => db.recurrentes.update(r.id, { fin: undefined });

/** "Este mes fue 0": la instancia queda resuelta sin pago. Se puede deshacer. */
export async function marcarEnCero(r: Recurrente, clave: string, enCero: boolean) {
  const actual = new Set(r.enCero ?? []);
  if (enCero) actual.add(clave); else actual.delete(clave);
  await db.recurrentes.update(r.id, { enCero: [...actual] });
}

/** Los gastos que originaron una sugerencia (y el de este mes, si ya está) pasan a
 *  ser pagos del recurrente. */
export async function vincularPagosDeSugerencia(recId: string, s: SugerenciaRecurrente, movs: Movimiento[]) {
  const [, catId, texto] = s.clave.split("|");
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const pagos = movs.filter(m => !m.recurrenteId && m.categoriaId === catId && m.tipo === s.tipo && m.fecha.slice(0, 7) >= s.meses[0] && norm(m.comentario || m.etiquetas[0] || "") === texto);
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

/** "Ahora no": la sugerencia se esconde por 30 días. */
export const pausar = (clave: string) => descartar(`pausa|${clave}`);

export async function descartar(clave: string) {
  await db.descartes.put({ clave, fecha: new Date().toISOString() });
}

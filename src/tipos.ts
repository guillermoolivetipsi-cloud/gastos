export type Moneda = "USD" | "EUR" | "ARS";
export const MONEDAS: Moneda[] = ["EUR", "ARS", "USD"];

export type Tipo = "gasto" | "ingreso";

/** Qué dólar se usa para pasar pesos a USD. La tarjeta se paga en dólares
 *  desde la cuenta, así que toma el oficial; lo demás, el blue. */
export type Dolar = "blue" | "oficial";

/** fijo: el monto no cambia de un mes a otro. variable: sí cambia.
 *  Es independiente de si se repite (eso es un recurrente). */
export type Clase = "fijo" | "variable";

export interface Cuenta {
  id: string;
  nombre: string;
  moneda: Moneda;
  dolar: Dolar;
  esTarjeta: boolean;
  /** Tarjeta: cierra entre estos dos días. Mientras no se confirme el día real
   *  de un mes, se toma `cierreHasta`. */
  cierreDesde?: number;
  cierreHasta?: number;
  /** Días entre el cierre y el vencimiento. */
  venceDias?: number;
  /** Cierres confirmados: "2026-10" → 8 */
  cierres?: Record<string, number>;
  orden: number;
  archivada?: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  tipo: Tipo;
  icono: string;
  color: string;
  /** Objetivo mensual en USD. No frena nada: solo marca. */
  objetivo?: number;
  clase?: Clase;
  /** true cuando lo confirmaste vos; si no, `clase` es una sugerencia. */
  claseConfirmada?: boolean;
  orden: number;
  archivada?: boolean;
}

export interface Cotizacion {
  /** Cuántas unidades de la moneda hacen 1 USD. */
  tasa: number;
  fuente: string;
  fecha: string;
}

export interface Movimiento {
  id: string;
  tipo: Tipo;
  fecha: string; // YYYY-MM-DD, el día que pasó (con tarjeta: el día de la compra)
  monto: number;
  moneda: Moneda;
  /** Monto en USD con la cotización de ese día. null mientras no hay conexión. */
  usd: number | null;
  cotizacion?: Cotizacion;
  cuentaId: string;
  categoriaId: string;
  etiquetas: string[];
  comentario?: string;
  /** Tarjeta: en cuántas cuotas. */
  cuotas?: number;
  /** Si es un pago de un recurrente (o de un gasto en partes), a cuál y de qué período. */
  recurrenteId?: string;
  periodo?: string;
  exportado?: string;
  creado: string;
  modificado: string;
}

export type Frecuencia = "mensual" | "semanal" | "anual" | "una-vez";

export interface Recurrente {
  id: string;
  nombre: string;
  tipo: Tipo;
  categoriaId: string;
  cuentaId: string;
  monto: number;
  moneda: Moneda;
  clase: Clase;
  frecuencia: Frecuencia;
  /** mensual/anual: día del mes · semanal: 0=domingo…6 */
  dia: number;
  /** anual: mes 1-12 */
  mes?: number;
  inicio: string;
  fin?: string;
  /** auto: se carga solo el día que toca. avisar: aparece como "por cargar". */
  modo: "auto" | "avisar";
  activo: boolean;
  /** Períodos que ya no corresponden ("borrar solo el de octubre"). */
  saltear?: string[];
  /** Períodos que ese mes fueron 0: quedan resueltos sin un pago. */
  enCero?: string[];
}

/** Sugerencias que descartaste, para no volver a mostrarlas. */
export interface Descarte {
  clave: string;
  fecha: string;
}

export interface Ajuste {
  clave: string;
  valor: unknown;
}

import Dexie, { type EntityTable } from "dexie";
import type { Ajuste, Categoria, Cuenta, Descarte, Movimiento, Recurrente } from "./tipos";

/* Todo vive en el celular (IndexedDB). No hay servidor: por eso funciona sin
   conexión, y por eso importa la copia de seguridad. */
export const db = new Dexie("gastos") as Dexie & {
  cuentas: EntityTable<Cuenta, "id">;
  categorias: EntityTable<Categoria, "id">;
  movimientos: EntityTable<Movimiento, "id">;
  recurrentes: EntityTable<Recurrente, "id">;
  descartes: EntityTable<Descarte, "clave">;
  ajustes: EntityTable<Ajuste, "clave">;
};

db.version(1).stores({
  cuentas: "id, orden",
  categorias: "id, tipo, orden",
  movimientos: "id, fecha, tipo, cuentaId, categoriaId, recurrenteId, [recurrenteId+periodo], exportado",
  recurrentes: "id, activo",
  descartes: "clave",
  ajustes: "clave",
});

export const nuevoId = () => crypto.randomUUID();

export async function leerAjuste<T>(clave: string, porDefecto: T): Promise<T> {
  const a = await db.ajustes.get(clave);
  return (a?.valor as T) ?? porDefecto;
}
export const guardarAjuste = (clave: string, valor: unknown) => db.ajustes.put({ clave, valor });

/* Las categorías y cuentas iniciales son las de tu app actual, con los mismos
   nombres: así las reglas de Finanzas las siguen reconociendo al importar. */
const CATEGORIAS_GASTO: [string, string, string][] = [
  ["Casa", "home", "#7C5CF0"],
  ["Super", "shopping-cart", "#E0A21B"],
  ["Ocio", "wallet", "#22B8A5"],
  ["Café", "coffee", "#0E9594"],
  ["Alimentación", "basket", "#3AA8E0"],
  ["Transporte", "bus", "#3B5BDB"],
  ["Salud", "heartbeat", "#E5484D"],
  ["Deporte", "barbell", "#5E9E1C"],
  ["Ropa", "shirt", "#E8701A"],
  ["Trip", "plane", "#6366F1"],
  ["Suscripciones", "receipt", "#D9559A"],
  ["Sin culpa", "star", "#C9A20A"],
  ["Regalos", "gift", "#7E9C84"],
  ["Educación", "school", "#C2417A"],
  ["Peluqueria", "scissors", "#9B7FD1"],
  ["neopsy", "world", "#5B21B6"],
  ["Deuda", "cash", "#B42318"],
  ["Otros", "question-mark", "#6B6880"],
];
const CATEGORIAS_INGRESO: [string, string, string][] = [
  ["Trabajo", "briefcase", "#2F9E6B"],
  ["Alquiler", "home-dollar", "#1F8A70"],
  ["Intereses", "trending-up", "#3AA8E0"],
  ["Otros ingresos", "coin", "#6B6880"],
];

let sembrando: Promise<void> | null = null;
export const sembrar = () => (sembrando ??= sembrarUnaVez());

async function sembrarUnaVez() {
  if ((await db.categorias.count()) > 0) return;
  await db.transaction("rw", db.categorias, db.cuentas, async () => {
    let orden = 0;
    for (const [nombre, icono, color] of CATEGORIAS_GASTO)
      await db.categorias.add({ id: nuevoId(), nombre, icono, color, tipo: "gasto", orden: orden++ });
    for (const [nombre, icono, color] of CATEGORIAS_INGRESO)
      await db.categorias.add({ id: nuevoId(), nombre, icono, color, tipo: "ingreso", orden: orden++ });
    const cuentas: Omit<Cuenta, "id" | "orden">[] = [
      { nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false },
      { nombre: "Wise", moneda: "EUR", dolar: "blue", esTarjeta: false },
      { nombre: "Payoneer", moneda: "USD", dolar: "blue", esTarjeta: false },
      { nombre: "Mercado Pago", moneda: "ARS", dolar: "blue", esTarjeta: false },
      { nombre: "Banco Galicia", moneda: "ARS", dolar: "blue", esTarjeta: false },
      { nombre: "Efectivo", moneda: "EUR", dolar: "blue", esTarjeta: false },
      { nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 5, cierreHasta: 10, venceDias: 10, cierres: {} },
      { nombre: "Mastercard", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 5, cierreHasta: 10, venceDias: 10, cierres: {} },
    ];
    cuentas.forEach((c, i) => db.cuentas.add({ ...c, id: nuevoId(), orden: i }));
  });
}

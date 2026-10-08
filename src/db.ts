import Dexie, { type EntityTable } from "dexie";
import type { Ajuste, Categoria, Cuenta, Descarte, Movimiento, Proyeccion, Recurrente } from "./tipos";

/* Todo vive en el celular (IndexedDB). No hay servidor: por eso funciona sin
   conexión, y por eso importa la copia de seguridad. */
export const db = new Dexie("gastos") as Dexie & {
  cuentas: EntityTable<Cuenta, "id">;
  categorias: EntityTable<Categoria, "id">;
  movimientos: EntityTable<Movimiento, "id">;
  recurrentes: EntityTable<Recurrente, "id">;
  descartes: EntityTable<Descarte, "clave">;
  ajustes: EntityTable<Ajuste, "clave">;
  proyecciones: EntityTable<Proyeccion, "id">;
};

db.version(1).stores({
  cuentas: "id, orden",
  categorias: "id, tipo, orden",
  movimientos: "id, fecha, tipo, cuentaId, categoriaId, recurrenteId, [recurrenteId+periodo], exportado",
  recurrentes: "id, activo",
  descartes: "clave",
  ajustes: "clave",
});
// v2: proyecciones (tabla nueva; lo demás queda igual).
db.version(2).stores({ proyecciones: "id, periodo" });
// v3: "capricho" pasa a llamarse "opcional", hay proyecciones de ingresos y los
// seguros también se prenden y apagan (arrancan prendidos).
db.version(3).stores({}).upgrade(tx => tx.table("proyecciones").toCollection().modify((p: Record<string, unknown>) => {
  if (p.clase === "capricho") p.clase = "opcional";
  if (p.clase === "seguro") p.activa = true;
  p.tipo ??= "gasto";
}));

// v4: las cuentas que tenés en Finanzas y faltaban (para "Entró en" de los ingresos) y
// las categorías de ingreso Ventas, Licencias y Alquiler. Se buscan por nombre: si ya
// estaban no se tocan, y si estaban archivadas vuelven.
export const CUENTAS_DE_FINANZAS: Omit<Cuenta, "id" | "orden">[] = [
  { nombre: "Nexo", moneda: "USD", dolar: "blue", esTarjeta: false },
  { nombre: "Invertir Online", moneda: "ARS", dolar: "blue", esTarjeta: false },
  { nombre: "Cocos", moneda: "ARS", dolar: "blue", esTarjeta: false },
  { nombre: "ARQ", moneda: "USD", dolar: "blue", esTarjeta: false },
];
export const INGRESOS_NUEVOS: [string[], string, string, string][] = [
  [["Ventas", "Venta"], "Ventas", "store", "#2F9E6B"],
  [["Licencias", "Licencia"], "Licencias", "certificate", "#3AA8E0"],
  [["Alquiler"], "Alquiler", "home-dollar", "#1F8A70"],
];
db.version(4).stores({}).upgrade(async tx => {
  const cuentas = tx.table<Cuenta, string>("cuentas"), categorias = tx.table<Categoria, string>("categorias");
  const cs = await cuentas.toArray();
  let orden = Math.max(-1, ...cs.map(c => c.orden)) + 1;
  for (const c of CUENTAS_DE_FINANZAS) {
    const ya = cs.find(x => x.nombre.toLowerCase() === c.nombre.toLowerCase());
    if (!ya) await cuentas.add({ ...c, id: crypto.randomUUID(), orden: orden++ });
    else if (ya.archivada) await cuentas.update(ya.id, { archivada: false });
  }
  const cats = await categorias.toArray();
  let ordenCat = Math.max(-1, ...cats.map(c => c.orden)) + 1;
  for (const [nombres, nombre, icono, color] of INGRESOS_NUEVOS) {
    const ya = cats.find(c => c.tipo === "ingreso" && nombres.some(n => n.toLowerCase() === c.nombre.toLowerCase()));
    if (!ya) await categorias.add({ id: crypto.randomUUID(), nombre, tipo: "ingreso", icono, color, orden: ordenCat++ });
    else if (ya.archivada) await categorias.update(ya.id, { archivada: false });
  }
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
  ["Ventas", "store", "#2F9E6B"],
  ["Licencias", "certificate", "#3AA8E0"],
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
      ...CUENTAS_DE_FINANZAS,
      { nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 5, cierreHasta: 10, venceDias: 10, cierres: {} },
      { nombre: "Mastercard", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 5, cierreHasta: 10, venceDias: 10, cierres: {} },
    ];
    cuentas.forEach((c, i) => db.cuentas.add({ ...c, id: nuevoId(), orden: i }));
  });
}

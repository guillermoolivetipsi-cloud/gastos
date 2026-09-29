/* Copiado de Finanzas (lib/resumen-tarjeta.ts), más las fechas de cierre y vencimiento.

   El resumen de la tarjeta, leído desde el texto de su PDF.
 *
 * Es el mismo criterio que scripts/leer-resumenes-tarjeta.py, que hasta sep-2026 era la
 * única forma de cargarlo: había que bajar los PDF y correr el script. Tres formatos de
 * renglón —exterior de Mastercard, exterior de Visa y en pesos de las dos— y el control
 * que importa: lo leído tiene que sumar lo mismo que el total que declara el banco.
 *
 * Pura, sin base ni PDF: recibe texto, así se prueba con renglones escritos a mano. */

export type Consumo = {
  fecha: string; comercio: string; moneda: string; importe: number;
  /** En los consumos del exterior, lo que el resumen dice en dólares. */
  usd: number | null;
  /** En qué columna del resumen suma: pesos o dólares. */
  columna: "ARS" | "USD";
};

export type Resumen = {
  numero: string | null;
  /** Como está guardada en la tabla de control. */
  tarjeta: string;
  consumos: Consumo[];
  sumaArs: number; sumaUsd: number;
  declaradoArs: number | null; declaradoUsd: number | null;
  /** Si lo leído suma lo mismo que el total del banco. Null si el resumen no lo trae. */
  cuadra: boolean | null;
  /** "2026-09-25". Null si el PDF no las trae con un formato conocido: se preguntan. */
  cierre: string | null;
  vencimiento: string | null;
};

/** "25-Sep-26", "25/09/26", "25 Sep 2026" → "2026-09-25" */
function fechaSuelta(dd: string, mm: string, aa: string) {
  const mes = /^\d+$/.test(mm) ? Number(mm) : MES[mm.slice(0, 3).toLowerCase()];
  if (!mes) return null;
  const anio = aa.length === 2 ? `20${aa}` : aa;
  return `${anio}-${dos(mes)}-${dos(Number(dd))}`;
}
const FECHA = String.raw`(\d{1,2})[-/ .]+([A-Za-z]{3,}|\d{1,2})[-/ .]+(\d{2,4})`;
function fechaDe(texto: string, rotulo: string) {
  const m = texto.match(new RegExp(`${rotulo}[^\\d\\n]{0,25}${FECHA}`, "i"));
  return m ? fechaSuelta(m[1], m[2], m[3]) : null;
}

const MES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const dos = (n: number) => String(n).padStart(2, "0");
const limpio = (s: string) => s.replace(/\s+/g, " ").trim();
// Los renglones en pesos que no son consumos: pagos, devoluciones, impuestos, totales.
const NO_ES_CONSUMO = /SU PAGO|DEV[. ]|DB\.|IIBB|I\.?V\.?A|PERCEP|GASTOS DE SERVICIO|TOTAL|SUBTOTAL/i;

export function leerResumen(texto: string): Resumen {
  const numero = texto.match(/Resumen N[°º]\s*(\S+)/)?.[1] ?? null;
  /* Los nombres son los que ya tiene la tabla: el script guardaba «Visa Galicia» y
     «Mastercard», y un nombre distinto partiría la misma tarjeta en dos. */
  const tarjeta = /MASTERCARD/i.test(texto.slice(0, 600)) ? "Mastercard" : "Visa Galicia";

  const consumos: Consumo[] = [];
  for (const ln of texto.split("\n")) {
    // exterior, Mastercard:  01-Ago-26 COMERCIO(PAIS,MON,  16,99) 00988  19,63
    let m = ln.match(/^\s*(\d{2})-([A-Za-z]{3})-(\d{2})\s+(.+?)\s*\(\s*([A-Z]{3})\s*,\s*([A-Z]{3})\s*,\s*(-?[\d.,]+)\s*\)\s+(\d+)\s+(-?[\d.,]+)\s*$/);
    if (m && MES[m[2].toLowerCase()]) {
      const [, dd, mm, aa, com, , mon, imp, , usd] = m;
      consumos.push({ fecha: `20${aa}-${dos(MES[mm.toLowerCase()])}-${dd}`, comercio: limpio(com), moneda: mon, importe: num(imp), usd: num(usd), columna: "USD" });
      continue;
    }
    // exterior, Visa:  02-08-26 F SUPER BCN    EUR   54,46 341111 63,52
    m = ln.match(/^\s*(\d{2})-(\d{2})-(\d{2})\s+(?:\S\s+)?(.+?)\s*(USD|EUR|ARS|BRL|GBP|CHF)\s+(-?[\d.,]+)\s+(\d+)\s+(-?[\d.,]+)\s*$/);
    if (m) {
      const [, dd, mm, aa, com, mon, imp, , usd] = m;
      consumos.push({ fecha: `20${aa}-${mm}-${dd}`, comercio: limpio(com), moneda: mon, importe: num(imp), usd: num(usd), columna: "USD" });
      continue;
    }
    // en pesos, cualquiera de los dos formatos:  25-08-26 COMERCIO 123456 68.000,00
    /* La marca de cuotas es una letra suelta ANTES de un espacio. El script la escribía
       como «una letra opcional» a secas, y sin marca se comía la primera letra del
       comercio: guardó «ERPAGO*…» por «MERPAGO*…». */
    m = ln.match(/^\s*(\d{2})-(?:([A-Za-z]{3})|(\d{2}))-(\d{2})\s+(?:\S\s+)?(.+?)\s+(\d{4,})\s+(-?[\d.,]+)\s*$/);
    if (m && !NO_ES_CONSUMO.test(ln)) {
      const [, dd, mtxt, mnum, aa, com, , imp] = m;
      const mes = mtxt ? MES[mtxt.toLowerCase()] : Number(mnum);
      if (!mes) continue;
      consumos.push({ fecha: `20${aa}-${dos(mes)}-${dd}`, comercio: limpio(com), moneda: "ARS", importe: num(imp), usd: null, columna: "ARS" });
    }
  }

  const sub = texto.match(/TOTAL CONSUMOS DEL MES\s+([\d.,]+)\s+([\d.,]+)/)
    ?? texto.match(/Total Consumos[^\d]*([\d.,]+)\s+([\d.,]+)/)
    ?? texto.match(/SUBTOTAL\s+([\d.,]+)\s+([\d.,]+)\s*$/m);
  const redondo = (n: number) => Math.round(n * 100) / 100;
  const sumaArs = redondo(consumos.filter(c => c.columna === "ARS").reduce((t, c) => t + c.importe, 0));
  const sumaUsd = redondo(consumos.filter(c => c.columna === "USD").reduce((t, c) => t + (c.usd ?? 0), 0));
  const declaradoArs = sub ? num(sub[1]) : null;
  const declaradoUsd = sub ? num(sub[2]) : null;

  return {
    numero, tarjeta, consumos, sumaArs, sumaUsd, declaradoArs, declaradoUsd,
    cierre: fechaDe(texto, "CIERRE\\s+ACTUAL") ?? fechaDe(texto, "CIERRE"),
    vencimiento: fechaDe(texto, "VENCIMIENTO\\s+ACTUAL") ?? fechaDe(texto, "VENCIMIENTO"),
    cuadra: sub ? Math.abs(sumaArs - declaradoArs!) < 1 && Math.abs(sumaUsd - declaradoUsd!) < 0.05 : null,
  };
}

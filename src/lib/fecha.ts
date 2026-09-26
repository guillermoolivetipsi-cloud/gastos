/* Fechas como texto "YYYY-MM-DD" en hora local. Nunca toISOString(): en la
   Argentina, después de las 21 ya daría el día siguiente. */

const pad = (n: number) => String(n).padStart(2, "0");

export const aTexto = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoy = () => aTexto(new Date());
export const aFecha = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d || 1);
};

/** "2026-09" */
export const periodoDe = (fecha: string) => fecha.slice(0, 7);
export const periodoHoy = () => periodoDe(hoy());

export function sumarMeses(periodo: string, n: number) {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function sumarDias(fecha: string, n: number) {
  const d = aFecha(fecha);
  d.setDate(d.getDate() + n);
  return aTexto(d);
}
export const diasDelMes = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(a, m, 0).getDate();
};
/** El día `dia` de ese mes, recortado si el mes es más corto (31 → 30 de sep). */
export const fechaEnMes = (periodo: string, dia: number) =>
  `${periodo}-${pad(Math.min(dia, diasDelMes(periodo)))}`;

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86400000);

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export const nombreMes = (periodo: string, conAnio = true) => {
  const [a, m] = periodo.split("-").map(Number);
  const n = MESES[m - 1];
  return conAnio ? `${n[0].toUpperCase()}${n.slice(1)} ${a}` : n;
};
export const mesCorto = (periodo: string) => MESES_CORTOS[Number(periodo.slice(5, 7)) - 1];
export const nombreDia = (n: number) => DIAS[n];

/** "26 sep" · "ayer" · "hoy" */
export function fechaCorta(fecha: string, relativa = true) {
  if (relativa) {
    const d = diasEntre(fecha, hoy());
    if (d === 0) return "hoy";
    if (d === 1) return "ayer";
    if (d === -1) return "mañana";
  }
  const f = aFecha(fecha);
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
}
export function fechaLarga(fecha: string) {
  const f = aFecha(fecha);
  return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

export type Vista = "dia" | "semana" | "mes" | "anio" | "periodo";

/** Rango [desde, hasta] (inclusive) que contiene a `ancla` para esa vista. */
export function rango(vista: Vista, ancla: string, hasta?: string): [string, string] {
  const d = aFecha(ancla);
  switch (vista) {
    case "dia":
      return [ancla, ancla];
    case "semana": {
      const lunes = sumarDias(ancla, -((d.getDay() + 6) % 7));
      return [lunes, sumarDias(lunes, 6)];
    }
    case "mes": {
      const p = periodoDe(ancla);
      return [`${p}-01`, `${p}-${pad(diasDelMes(p))}`];
    }
    case "anio":
      return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
    case "periodo":
      return [ancla, hasta ?? ancla];
  }
}

export function moverAncla(vista: Vista, ancla: string, n: number) {
  switch (vista) {
    case "dia": return sumarDias(ancla, n);
    case "semana": return sumarDias(ancla, 7 * n);
    case "mes": return `${sumarMeses(periodoDe(ancla), n)}-01`;
    case "anio": return `${aFecha(ancla).getFullYear() + n}-01-01`;
    default: return ancla;
  }
}

export function tituloRango(vista: Vista, desde: string, hasta: string) {
  switch (vista) {
    case "dia": {
      const d = diasEntre(desde, hoy());
      const base = fechaLarga(desde);
      return d === 0 ? `Hoy, ${base}` : d === 1 ? `Ayer, ${base}` : base[0].toUpperCase() + base.slice(1);
    }
    case "semana": return `${fechaCorta(desde, false)} – ${fechaCorta(hasta, false)}`;
    case "mes": return nombreMes(periodoDe(desde));
    case "anio": return desde.slice(0, 4);
    case "periodo": return `${fechaCorta(desde, false)} – ${fechaCorta(hasta, false)}`;
  }
}

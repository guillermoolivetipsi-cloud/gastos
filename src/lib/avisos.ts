import { db, leerAjuste } from "../db";
import { descartesSet } from "./analisis";
import { RECORDATORIOS, tareas, type Recordatorios } from "./recordatorios";

/* ── En la app de Android ──────────────────────────────────────────────────
   No hay nada que despierte la app en segundo plano: al abrirla (y cada vez que
   cambian los datos) se programan de antemano los avisos de los próximos días.
   El diario sale a su hora si ese día todavía no cargaste nada; el del resumen y
   el de exportar salen a las 10, el día que empiezan y después cada 3 días,
   siempre los mismos días aunque se reprogramen. */

export interface Aviso {
  id: number;
  titulo: string;
  cuerpo: string;
  cuando: Date;
  /** Qué abrir al tocarlo. */
  accion: "gasto" | "resumen" | "exportar";
  cuentaId?: string;
}

const numeroDeDia = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);

export function planificar(r: Recordatorios, cuentas: Parameters<typeof tareas>[1], movs: Parameters<typeof tareas>[2], cargados: Record<string, string>, ultimaExportacion: string | null, hechas: Set<string>, ahora = new Date(), dias = 14): Aviso[] {
  const out: Aviso[] = [];
  const [hh, mm] = r.diario.hora.split(":").map(Number);
  for (let i = 0; i < dias; i++) {
    const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i);
    const aLas = (h: number, m: number) => new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m);
    const diario = aLas(hh, mm);
    if (diario > ahora) for (const t of tareas(r, cuentas, movs, cargados, ultimaExportacion, hechas, diario))
      if (t.tipo === "diario") out.push({ id: out.length + 1, titulo: t.titulo, cuerpo: t.detalle, cuando: diario, accion: "gasto" });
    const diez = aLas(10, 0);
    if (diez <= ahora) continue;
    for (const t of tareas(r, cuentas, movs, cargados, ultimaExportacion, hechas, diez)) {
      if (t.tipo === "diario") continue;
      const primerDia = dia.getDate() === (t.tipo === "resumen" ? r.resumen.dia : r.exportar.dia);
      if (!primerDia && numeroDeDia(dia) % 3 !== 0) continue;
      out.push({ id: out.length + 1, titulo: t.titulo, cuerpo: t.detalle, cuando: diez, accion: t.tipo, cuentaId: t.tipo === "resumen" ? t.cuenta.id : undefined });
    }
  }
  return out;
}

/** Lo que hay que programar ahora, leído de la base. */
export async function avisosAProgramar(): Promise<Aviso[]> {
  if (!(await leerAjuste<boolean>("notificaciones", false))) return [];
  const [cuentas, movimientos, descartes] = await Promise.all([db.cuentas.toArray(), db.movimientos.toArray(), db.descartes.toArray()]);
  return planificar(
    await leerAjuste<Recordatorios>("recordatorios", RECORDATORIOS),
    cuentas, movimientos,
    await leerAjuste<Record<string, string>>("resumenesCargados", {}),
    await leerAjuste<string | null>("ultimaExportacion", null),
    descartesSet(descartes),
  );
}

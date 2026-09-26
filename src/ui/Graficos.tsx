import type { Movimiento } from "../tipos";
import { DIAS_CORTOS, aFecha, diasEntre, fechaCorta, hoy, mesCorto, sumarDias } from "../lib/fecha";
import { num } from "../lib/formato";

/** Barras por día (semana, mes, período corto) o por mes (año, período largo),
 *  con una línea punteada en el promedio. */
export function PorTiempo({ movs, desde, hasta }: { movs: Movimiento[]; desde: string; hasta: string }) {
  const dias = diasEntre(desde, hasta) + 1;
  const porMes = dias > 62;
  const tramos: { clave: string; etiqueta: string; total: number; futuro: boolean }[] = [];
  if (porMes) {
    for (let f = desde; f <= hasta; ) {
      const p = f.slice(0, 7);
      tramos.push({ clave: p, etiqueta: mesCorto(p)[0].toUpperCase(), total: 0, futuro: `${p}-01` > hoy() });
      const d = aFecha(f); d.setMonth(d.getMonth() + 1, 1);
      f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
  } else {
    for (let i = 0; i < dias; i++) {
      const f = sumarDias(desde, i);
      const dia = aFecha(f);
      tramos.push({ clave: f, etiqueta: dias <= 7 ? DIAS_CORTOS[dia.getDay()][0].toUpperCase() : String(dia.getDate()), total: 0, futuro: f > hoy() });
    }
  }
  const idx = new Map(tramos.map((t, i) => [t.clave, i]));
  for (const m of movs) {
    const i = idx.get(porMes ? m.fecha.slice(0, 7) : m.fecha);
    if (i != null) tramos[i].total += m.usd ?? 0;
  }
  const max = Math.max(1, ...tramos.map(t => t.total));
  const pasados = tramos.filter(t => !t.futuro);
  const promedio = pasados.length ? pasados.reduce((s, t) => s + t.total, 0) / pasados.length : 0;
  const pocos = tramos.length <= 12;
  const maxTramo = tramos.reduce<(typeof tramos)[number] | null>((a, t) => (t.total > (a?.total ?? 0) ? t : a), null);
  return (
    <div className="caja" style={{ padding: "10px 12px 6px" }}>
      <div className="fila mini tenue" style={{ padding: "0 0 6px" }}>
        <span>{porMes ? "Por mes" : "Por día"} · promedio {num(promedio, 0)} USD</span>
        {maxTramo && <span>máx. {num(maxTramo.total, 0)} · {porMes ? mesCorto(maxTramo.clave) : fechaCorta(maxTramo.clave)}</span>}
      </div>
      {/* Compacto: 64 px de alto. Las barras y la línea del promedio usan la misma escala. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: pocos ? 6 : 2, height: 64, position: "relative", borderBottom: "1px solid var(--linea)" }}>
        {promedio > 0 && <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(promedio / max) * 100}%`, borderTop: "1px dashed var(--tenue)" }} />}
        {tramos.map(t => (
          <div key={t.clave} style={{
            flex: 1, height: `${Math.max(t.total ? 3 : 0, (t.total / max) * 100)}%`,
            background: t.clave === hoy() ? "var(--viol-claro)" : "var(--viol)", borderRadius: "2px 2px 0 0", opacity: t.futuro ? 0.3 : 1,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: pocos ? 6 : 2 }} className="mini tenue">
        {tramos.map((t, i) => <span key={t.clave} style={{ flex: 1, textAlign: "center", fontSize: 10, visibility: pocos || i % 5 === 0 ? "visible" : "hidden" }}>{t.etiqueta}</span>)}
      </div>
    </div>
  );
}

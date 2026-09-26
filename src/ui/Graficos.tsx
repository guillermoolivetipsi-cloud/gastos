import type { Movimiento } from "../tipos";
import type { PorCategoria } from "../lib/analisis";
import { DIAS_CORTOS, aFecha, diasEntre, hoy, mesCorto, sumarDias } from "../lib/fecha";
import { num } from "../lib/formato";

export type TipoGrafico = "dia" | "barras" | "rectangulos" | "torta";

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
  return (
    <div className="caja" style={{ padding: "12px 12px 8px" }}>
      <div className="fila mini tenue" style={{ padding: "0 0 8px" }}>
        <span>{porMes ? "Por mes" : "Por día"}</span>
        <span>promedio {num(promedio, 0)} USD {porMes ? "por mes" : "por día"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: pocos ? 8 : 2, height: 120, position: "relative", borderBottom: "1px solid var(--linea)" }}>
        {promedio > 0 && <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(promedio / max) * 100}%`, borderTop: "1px dashed var(--tenue)" }} />}
        {tramos.map(t => (
          <div key={t.clave} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
            {pocos && t.total > 0 && <span className="mini tenue num" style={{ fontSize: 10, marginBottom: 2 }}>{num(t.total, 0)}</span>}
            <div style={{ width: "100%", height: `${Math.max(t.total ? 2 : 0, (t.total / max) * (pocos ? 82 : 100))}%`, background: t.clave === hoy() ? "var(--viol-claro)" : "var(--viol)", borderRadius: "3px 3px 0 0", opacity: t.futuro ? 0.3 : 1 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: pocos ? 8 : 2 }} className="mini tenue">
        {tramos.map((t, i) => <span key={t.clave} style={{ flex: 1, textAlign: "center", fontSize: 10, visibility: pocos || i % 5 === 0 ? "visible" : "hidden" }}>{t.etiqueta}</span>)}
      </div>
    </div>
  );
}

/** Mapa de rectángulos: cada categoría ocupa un área proporcional a lo gastado.
 *  Se parte en filas (algoritmo "squarified" simplificado) para que queden casi cuadrados. */
export function Rectangulos({ cats, tocar }: { cats: PorCategoria[]; tocar: (c: PorCategoria) => void }) {
  const W = 100, H = 70;
  const total = cats.reduce((s, c) => s + c.total, 0);
  if (!total) return null;
  const items = cats.filter(c => c.total > 0).map(c => ({ c, area: (c.total / total) * W * H }));
  const rects: { c: PorCategoria; x: number; y: number; w: number; h: number }[] = [];
  let x = 0, y = 0, w = W, h = H;
  const peor = (fila: typeof items, lado: number) => {
    const s = fila.reduce((a, b) => a + b.area, 0);
    return Math.max(...fila.map(r => Math.max((lado * lado * r.area) / (s * s), (s * s) / (lado * lado * r.area))));
  };
  let resto = [...items];
  while (resto.length) {
    const lado = Math.min(w, h);
    let fila = [resto[0]];
    let i = 1;
    while (i < resto.length && peor([...fila, resto[i]], lado) <= peor(fila, lado)) { fila.push(resto[i]); i++; }
    resto = resto.slice(i);
    const s = fila.reduce((a, b) => a + b.area, 0);
    if (w >= h) { // columna a la izquierda
      const cw = s / h; let yy = y;
      for (const r of fila) { const rh = r.area / cw; rects.push({ c: r.c, x, y: yy, w: cw, h: rh }); yy += rh; }
      x += cw; w -= cw;
    } else { // fila arriba
      const rh = s / w; let xx = x;
      for (const r of fila) { const rw = r.area / rh; rects.push({ c: r.c, x: xx, y, w: rw, h: rh }); xx += rw; }
      y += rh; h -= rh;
    }
  }
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}`, margin: "6px 0 10px" }}>
      {rects.map(r => (
        <button key={r.c.cat.id} onClick={() => tocar(r.c)} style={{
          position: "absolute", left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
          padding: 2, boxSizing: "border-box",
        }}>
          <div style={{ width: "100%", height: "100%", background: r.c.cat.color, borderRadius: 8, padding: "6px 8px", textAlign: "left", overflow: "hidden", color: "#fff" }}>
            {r.w * r.h > 180 && <><div className="chico" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.c.cat.nombre}</div><div className="mini num" style={{ opacity: .85 }}>{num(r.c.total, 0)}</div></>}
          </div>
        </button>
      ))}
    </div>
  );
}

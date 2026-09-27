import { useDeferredValue, useMemo, useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { eliminarMovimiento } from "../lib/acciones";
import { usdDe } from "../lib/analisis";
import { fechaCorta, fechaLarga } from "../lib/fecha";
import { num, sinAcentos } from "../lib/formato";
import { BotonAgregar, Deslizable, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";


export function Movimientos() {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"todos" | "gasto" | "ingreso">("todos");
  // Filtros: por medio de pago ("sin" = sin tarjeta) y por categoría.
  const [medio, setMedio] = useState<string>("todos");
  const [catFiltro, setCatFiltro] = useState("");
  const [cuantos, setCuantos] = useState(150);

  const cat = useMemo(() => new Map(d.categorias.map(c => [c.id, c])), [d.categorias]);
  const cta = useMemo(() => new Map(d.cuentas.map(c => [c.id, c])), [d.cuentas]);
  const rec = useMemo(() => new Map(d.recurrentes.map(r => [r.id, r])), [d.recurrentes]);

  // El texto de búsqueda de cada movimiento se arma una vez, no en cada tecla.
  const textos = useMemo(() => new Map(d.movimientos.map(m => [m.id, sinAcentos([cat.get(m.categoriaId)?.nombre, cta.get(m.cuentaId)?.nombre, m.comentario, ...m.etiquetas, String(m.monto)].join(" "))])), [d.movimientos, cat, cta]);
  const qDiferida = useDeferredValue(q);
  const lista = useMemo(() => {
    const t = sinAcentos(qDiferida);
    return d.movimientos
      .filter(m => tipo === "todos" || m.tipo === tipo)
      .filter(m => medio === "todos" || (medio === "sin" ? !cta.get(m.cuentaId)?.esTarjeta : m.cuentaId === medio))
      .filter(m => !catFiltro || m.categoriaId === catFiltro)
      .filter(m => !t || textos.get(m.id)!.includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  }, [d.movimientos, qDiferida, textos, tipo, cta, medio, catFiltro]);
  const filtrando = medio !== "todos" || !!catFiltro || !!q.trim();
  const totalFiltrado = lista.reduce((s, m) => s + (m.tipo === "gasto" ? 1 : -1) * usdDe(m), 0);

  // El total de cada día sale de la lista entera: no cambia al tocar "Ver más".
  const totalDia = useMemo(() => {
    const t = new Map<string, number>();
    for (const m of lista) t.set(m.fecha, (t.get(m.fecha) ?? 0) + (m.tipo === "gasto" ? -1 : 1) * usdDe(m));
    return t;
  }, [lista]);
  const porDia: [string, typeof lista][] = [];
  for (const m of lista.slice(0, cuantos)) {
    const ult = porDia[porDia.length - 1];
    if (ult && ult[0] === m.fecha) ult[1].push(m); else porDia.push([m.fecha, [m]]);
  }
  const sinCotizar = d.movimientos.filter(m => m.usd == null).length;

  return (
    <div className="pantalla">
      <div className="enc"><h1>Movimientos</h1></div>
      <div className="buscar"><T.IconSearch size={18} className="tenue" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por categoría, cuenta, comentario…" />{q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda"><T.IconX size={16} /></button>}</div>
      <Seg opciones={[["todos", "Todos"], ["gasto", "Gastos"], ["ingreso", "Ingresos"]]} valor={tipo} cambiar={t => {
        setTipo(t);
        // Una categoría de gastos no tiene sentido mirando ingresos (y al revés).
        if (t !== "todos" && catFiltro && cat.get(catFiltro)?.tipo !== t) setCatFiltro("");
      }} />
      <div className="pills scroll" style={{ marginTop: 10 }}>
        {[["todos", "Todas"], ["sin", "Sin tarjeta"], ...d.cuentas.filter(c => c.esTarjeta && !c.archivada).map(c => [c.id, c.nombre])].map(([v, t]) => (
          <button key={v} className={`pill${medio === v ? " on" : ""}`} onClick={() => setMedio(v)}>{t}</button>
        ))}
        <select className={`pill${catFiltro ? " on" : ""}`} value={catFiltro} onChange={e => setCatFiltro(e.target.value)} aria-label="Categoría" style={{ appearance: "none" }}>
          <option value="">Categoría ▾</option>
          {d.categorias.filter(c => !c.archivada && (tipo === "todos" || c.tipo === tipo)).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      {filtrando && lista.length > 0 && <div className="mini tenue" style={{ marginTop: 8 }}>{lista.length} movimientos · {num(Math.abs(totalFiltrado))} USD</div>}
      {sinCotizar > 0 && <div className="mini ambar" style={{ marginTop: 10 }}><T.IconCloudOff size={13} /> {sinCotizar} sin convertir a USD: se completan al tener conexión.</div>}

      {!lista.length && <div className="vacio">{q ? "Nada coincide con la búsqueda." : filtrando || tipo !== "todos" ? "Nada con estos filtros." : "Todavía no cargaste nada. Tocá + para empezar."}</div>}

      {porDia.map(([fecha, ms]) => {
        const total = totalDia.get(fecha) ?? 0;
        return (
          <div key={fecha}>
            <div className="dia-titulo"><span>{fechaCorta(fecha) === "hoy" || fechaCorta(fecha) === "ayer" ? `${fechaCorta(fecha)} · ` : ""}{fechaLarga(fecha)}</span><span className="num">{num(total)}</span></div>
            {ms.map(m => {
              const c = cat.get(m.categoriaId);
              const cuenta = cta.get(m.cuentaId);
              const r = m.recurrenteId ? rec.get(m.recurrenteId) : undefined;
              const detalle = [m.comentario, m.etiquetas.join(", ")].filter(Boolean).join(" · ");
              return (
                <Deslizable key={m.id} tocar={() => nav.abrir({ p: "editor", id: m.id })} borrar={async () => {
                  const deshacer = await eliminarMovimiento(m.id);
                  toast({ texto: m.tipo === "gasto" ? "Gasto eliminado" : "Ingreso eliminado", deshacer });
                }}>
                  <div className="fila">
                    <span className="izq">
                      <Punto cat={c} chico />
                      <span style={{ minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.nombre ?? "Sin categoría"}{detalle && <span className="tenue"> · {detalle}</span>}</div>
                        <div className="mini tenue">
                          {cuenta?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {cuenta?.nombre}
                          {m.cuotas && m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ""}{r ? ` · ${r.nombre}` : ""}
                        </div>
                      </span>
                    </span>
                    <span className="derecha num">
                      <div className={m.tipo === "ingreso" ? "ok" : ""}>{m.tipo === "ingreso" ? "+" : ""}{m.usd != null ? num(m.usd) : "…"} USD</div>
                      {m.moneda !== "USD" && <div className="mini tenue">{num(m.monto)} {m.moneda}</div>}
                    </span>
                  </div>
                </Deslizable>
              );
            })}
          </div>
        );
      })}
      {lista.length > cuantos && <button className="btn2" style={{ width: "100%", marginTop: 12 }} onClick={() => setCuantos(c => c + 300)}>Ver más</button>}
      {lista.length > 0 && <div className="mini tenue centro" style={{ marginTop: 14 }}>Deslizá un movimiento a la izquierda para eliminarlo</div>}
      <BotonAgregar tipo={tipo === "ingreso" || cat.get(catFiltro)?.tipo === "ingreso" ? "ingreso" : "gasto"}
        abrir={t => nav.abrir({ p: "editor", tipo: t, cuentaId: cta.get(medio)?.esTarjeta ? medio : undefined, categoriaId: catFiltro || undefined })} />
    </div>
  );
}

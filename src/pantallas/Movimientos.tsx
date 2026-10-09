import { useDeferredValue, useMemo, useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { eliminarMovimiento } from "../lib/acciones";
import { usdDe } from "../lib/analisis";
import { DIAS_CORTOS, aFecha, mesCorto, nombreMes, periodoHoy } from "../lib/fecha";
import { num, sinAcentos } from "../lib/formato";
import { BotonAgregar, Deslizable, Punto, useToast } from "../ui/piezas";
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
  // La búsqueda se abre con la lupa de arriba (regla de orden: una sola fila de controles).
  const [buscando, setBuscando] = useState(false);

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
      <div className="enc"><h1>Movimientos</h1>
        <button className="accion" aria-label="Buscar" onClick={() => { if (buscando) setQ(""); setBuscando(!buscando); }}>{buscando ? <T.IconX size={22} /> : <T.IconSearch size={22} />}</button>
      </div>
      {buscando && <div className="buscar"><T.IconSearch size={18} className="tenue" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por categoría, cuenta, comentario…" />{q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda"><T.IconX size={16} /></button>}</div>}
      {/* Los filtros, en una sola fila de desplegables. */}
      <div className="pills scroll">
        <select className={`pill${tipo !== "todos" ? " on" : ""}`} value={tipo} aria-label="Tipo" onChange={e => {
          const t = e.target.value as typeof tipo;
          setTipo(t);
          // Una categoría de gastos no tiene sentido mirando ingresos (y al revés).
          if (t !== "todos" && catFiltro && cat.get(catFiltro)?.tipo !== t) setCatFiltro("");
        }}>
          <option value="todos">Gastos e ingresos ▾</option><option value="gasto">Gastos ▾</option><option value="ingreso">Ingresos ▾</option>
        </select>
        <select className={`pill${medio !== "todos" ? " on" : ""}`} value={medio} aria-label="Cuenta" onChange={e => setMedio(e.target.value)}>
          <option value="todos">Todas las cuentas ▾</option><option value="sin">Sin tarjeta ▾</option>
          {d.cuentas.filter(c => c.esTarjeta && !c.archivada).map(c => <option key={c.id} value={c.id}>{c.nombre} ▾</option>)}
        </select>
        <select className={`pill${catFiltro ? " on" : ""}`} value={catFiltro} onChange={e => setCatFiltro(e.target.value)} aria-label="Categoría">
          <option value="">Categoría ▾</option>
          {d.categorias.filter(c => !c.archivada && (tipo === "todos" || c.tipo === tipo)).map(c => <option key={c.id} value={c.id}>{c.nombre} ▾</option>)}
        </select>
      </div>
      {/* Siempre una línea de totales: con filtros, lo filtrado; sin filtros, el mes en curso. */}
      {(() => {
        const delMes = !filtrando && tipo === "todos";
        const base = delMes ? d.movimientos.filter(m => m.fecha.slice(0, 7) === periodoHoy()) : lista;
        const g = base.reduce((s, m) => s + (m.tipo === "gasto" ? usdDe(m) : 0), 0), i = base.reduce((s, m) => s + (m.tipo === "ingreso" ? usdDe(m) : 0), 0);
        if (!base.length) return null;
        return (
          <div className="mini tenue" style={{ marginTop: 10 }}>
            {delMes ? `${nombreMes(periodoHoy(), false)[0].toUpperCase()}${nombreMes(periodoHoy(), false).slice(1)}:` : `${lista.length} movimientos:`}
            {g > 0 && <> <span style={{ color: "var(--tinta)" }}>−{num(g, 0)} gastos</span></>}{g > 0 && i > 0 && " ·"}{i > 0 && <> <span className="ok">+{num(i, 0)} ingresos</span></>} USD
          </div>
        );
      })()}
      {sinCotizar > 0 && <div className="mini ambar" style={{ marginTop: 10 }}><T.IconCloudOff size={13} /> {sinCotizar} sin convertir a USD: se completan al tener conexión.</div>}

      {!lista.length && <div className="vacio">{q ? "Nada coincide con la búsqueda." : filtrando || tipo !== "todos" ? "Nada con estos filtros." : "Todavía no cargaste nada. Tocá + para empezar."}</div>}

      {porDia.map(([fecha, ms]) => {
        const total = totalDia.get(fecha) ?? 0;
        return (
          <div key={fecha}>
            {/* Cada día es un grupo: su título con el total y su caja (reglas de Movimientos y de orden). */}
            <div className="grupo-t"><span>{Number(fecha.slice(8))} {mesCorto(fecha.slice(0, 7))} · {DIAS_CORTOS[aFecha(fecha).getDay()]}</span><span className="num">{total > 0 ? "+" : ""}{num(total)}</span></div>
            <div className="caja lista">
            {ms.map(m => {
              const c = cat.get(m.categoriaId);
              const cuenta = cta.get(m.cuentaId);
              const r = m.recurrenteId ? rec.get(m.recurrenteId) : undefined;
              // Arriba, lo que fue (el comentario o las etiquetas); si no hay, la categoría.
              const nombreCat = c?.nombre ?? "Sin categoría";
              const queFue = m.comentario || m.etiquetas.join(", ");
              return (
                <Deslizable key={m.id} tocar={() => nav.abrir({ p: "editor", id: m.id })} borrar={async () => {
                  const deshacer = await eliminarMovimiento(m.id);
                  toast({ texto: m.tipo === "gasto" ? "Gasto eliminado" : "Ingreso eliminado", deshacer });
                }}>
                  <div className="fila">
                    <span className="izq">
                      <Punto cat={c} chico />
                      <span style={{ minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{queFue || nombreCat}</div>
                        <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {queFue ? `${nombreCat} · ` : ""}{cuenta?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {cuenta?.nombre}{m.moneda !== "USD" ? ` · ${num(m.monto)} ${m.moneda}` : ""}
                        </div>
                      </span>
                    </span>
                    <span className="derecha num">
                      {/* Cuotas y recurrentes, con íconos chicos junto al monto. */}
                      <div className={m.tipo === "ingreso" ? "ok" : ""} style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                        {r && <T.IconRepeat size={13} className="viol" aria-label={`Pago de ${r.nombre}`} />}
                        {m.cuotas && m.cuotas > 1 ? <span className="mini" style={{ color: "var(--azul)" }} aria-label={`${m.cuotas} cuotas`}>{m.cuotas}×</span> : null}
                        <span>{m.tipo === "ingreso" ? "+" : ""}{m.usd != null ? num(m.usd) : "…"}</span>
                      </div>
                    </span>
                  </div>
                </Deslizable>
              );
            })}
            </div>
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

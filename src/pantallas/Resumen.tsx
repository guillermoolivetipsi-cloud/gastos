import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos, usePendientes } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import type { Categoria, Movimiento, Tipo } from "../tipos";
import { avanceDelMes, bloques, claseProvisoria, porCategoria, recurrentesDelMes, suma, usdDe } from "../lib/analisis";
import { fechaCorta, hoy, moverAncla, nombreMes, periodoDe, periodoHoy, rango, tituloRango, type Vista } from "../lib/fecha";
import { num, usd } from "../lib/formato";
import { Barra, Dona, Hoja, Punto } from "../ui/piezas";
import { PorTiempo } from "../ui/Graficos";
import { useInsights } from "./ComoVenis";
import { T } from "../ui/Icono";

const VISTAS: [Vista, string][] = [["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"], ["periodo", "Período"]];

export function Resumen() {
  const d = useDatos();
  const nav = useNav();
  const [tipo, setTipo] = useState<Tipo>("gasto");
  // Abre siempre en la semana: es lo que se mira todos los días.
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [elegirPeriodo, setElegirPeriodo] = useState(false);
  const [detalle, setDetalle] = useState<Categoria | null>(null);
  // El mes se ve en torta; la semana, el año y un período, en barras por día (o por mes).
  const grafico: "torta" | "dia" = vista === "mes" || vista === "dia" ? "torta" : "dia";

  const [desde, fin] = rango(vista, ancla, hasta);
  const movs = useMemo(() => d.movimientos.filter(m => m.tipo === tipo && m.fecha >= desde && m.fecha <= fin), [d.movimientos, tipo, desde, fin]);
  const cats = porCategoria(movs, d.categorias);
  const total = suma(movs);
  const esMes = vista === "mes";
  const periodo = periodoDe(desde);
  const avance = esMes ? avanceDelMes(periodo) : undefined;

  const tasa = (r: Parameters<typeof d.tasas.rec>[0]) => d.tasas.rec(r, d.cuentas);
  const instancias = esMes ? recurrentesDelMes(d.recurrentes, d.movimientos, periodo, tasa) : [];
  // Lo que va con tarjeta llega con el resumen: no se pide cargar a mano.
  const conTarjeta = new Set(d.cuentas.filter(c => c.esTarjeta).map(c => c.id));
  const porCargar = instancias.filter(i => !conTarjeta.has(i.rec.cuentaId) && (i.estado === "por-cargar" || (i.estado === "parcial" && i.fecha <= hoy())));
  const clase = useMemo(() => claseProvisoria(d.categorias, d.movimientos), [d.categorias, d.movimientos]);
  const b = esMes && tipo === "gasto" ? bloques(periodo, movs, d.categorias, d.recurrentes, instancias.filter(i => i.estado !== "cargado"), tasa, clase) : null;
  const revisar = usePendientes()?.total ?? 0;

  const vacio = tipo === "gasto" ? "Sin gastos" : "Sin ingresos";
  const enEsto = { dia: "este día", semana: "esta semana", mes: "este mes", anio: "este año", periodo: "este período" }[vista];

  return (
    <div className="pantalla">
      <div className="enc">
        <h1>Resumen</h1>
        <button className="accion" aria-label="Para revisar" onClick={() => nav.abrir({ p: "revisar" })} style={{ position: "relative" }}>
          <T.IconInbox size={22} />
          {revisar > 0 && <span className="badge" style={{ position: "absolute", top: -2, right: -6 }}>{revisar}</span>}
        </button>
      </div>

      <div className="solapas">
        <button className={tipo === "gasto" ? "on" : ""} onClick={() => setTipo("gasto")}>GASTOS</button>
        <button className={tipo === "ingreso" ? "on" : ""} onClick={() => setTipo("ingreso")}>INGRESOS</button>
      </div>

      <div className="vistas">
        {VISTAS.map(([v, t]) => (
          <button key={v} className={vista === v ? "on" : ""} onClick={() => {
            setVista(v);
            if (v === "periodo") { setAncla(`${periodoHoy()}-01`); setHasta(hoy()); setElegirPeriodo(true); }
            else setAncla(hoy());
          }}>{t}</button>
        ))}
      </div>
      <div className="navega">
        <button aria-label="Anterior" disabled={vista === "periodo"} onClick={() => setAncla(moverAncla(vista, ancla, -1))} style={{ opacity: vista === "periodo" ? 0 : 1 }}><T.IconChevronLeft size={20} /></button>
        <button onClick={() => vista === "periodo" ? setElegirPeriodo(true) : setAncla(hoy())}><span style={{ color: "var(--tinta)" }}>{tituloRango(vista, desde, fin)}</span></button>
        <button aria-label="Siguiente" disabled={vista === "periodo"} onClick={() => setAncla(moverAncla(vista, ancla, 1))} style={{ opacity: vista === "periodo" ? 0 : 1 }}><T.IconChevronRight size={20} /></button>
      </div>

      {porCargar.length > 0 && (
        <button className="caja aviso" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.irA("viene")}>
          <div className="ambar" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <T.IconBell size={16} /> {porCargar.length === 1 ? "1 recurrente sin cargar" : `${porCargar.length} recurrentes sin cargar`}
          </div>
          {porCargar.slice(0, 3).map(i => (
            <div className="fila chico" key={i.rec.id + i.clave} style={{ padding: "3px 0" }}>
              <span>{i.rec.nombre} · {fechaCorta(i.fecha)}</span>
              <span className="tenue">{i.estado === "parcial" ? `faltan ${num(i.falta)}` : `~${num(i.esperado)}`} {i.rec.moneda}</span>
            </div>
          ))}
        </button>
      )}

      {b && (
        <div className="dos">
          <div className="caja">
            <span className="etiq e-fijo">Fijos</span>
            <div className="mediano num" style={{ marginTop: 6 }}>{num(b.fijos.total)}</div>
            <Barra valor={b.fijos.total ? b.fijos.pagado / b.fijos.total : 0} color="#60A5FA" />
            <div className="mini tenue">{b.fijos.falta > 0 ? `faltan ${num(b.fijos.falta)}` : "todo pagado"}</div>
          </div>
          <div className="caja">
            <span className="etiq e-variable">Variables</span>
            <div className="mediano num" style={{ marginTop: 6 }}>{num(b.variables.gastado)}{b.variables.objetivo > 0 && <span className="tenue chico"> / {num(b.variables.objetivo)}</span>}</div>
            {b.variables.objetivo > 0 && <Barra valor={b.variables.gastado / b.variables.objetivo} color={b.variables.queda < 0 ? "var(--mal)" : "var(--ambar)"} marca={avance} />}
            <div className="mini tenue">
              {b.variables.porDia != null ? <><span className="viol">{num(b.variables.porDia)} USD</span> por día</> : b.variables.objetivo > 0 ? (b.variables.queda >= 0 ? `sobraron ${num(b.variables.queda)}` : `te pasaste ${num(-b.variables.queda)}`) : "sin objetivos"}
            </div>
          </div>
        </div>
      )}
      {b && b.variables.porDia != null && (
        <div className="mini tenue" style={{ margin: "-4px 2px 6px" }}>
          {b.variables.queda >= 0 ? `Te quedan ${num(b.variables.queda)} USD para ${b.variables.dias} ${b.variables.dias === 1 ? "día" : "días"}` : `Te pasaste ${num(-b.variables.queda)} USD de tus objetivos`}
        </div>
      )}

      {grafico === "torta" ? (
        <Dona partes={cats.map(c => ({ valor: c.total, color: c.cat.color }))} centro={total ? `${num(total)} USD` : vacio} sub={total ? undefined : enEsto} />
      ) : (
        <div className="fila" style={{ padding: "4px 2px 10px" }}>
          <span className="tenue chico">{total ? `Total ${enEsto}` : `${vacio} ${enEsto}`}</span>
          {total > 0 && <span className="mediano num">{num(total)} <span className="chico tenue">USD</span></span>}
        </div>
      )}
      {grafico === "dia" && vista !== "dia" && total > 0 && <PorTiempo movs={movs} desde={desde} hasta={fin} />}

      {cats.length > 0 && (
        <div className="caja lista">
          {cats.map(c => {
            const obj = esMes && c.cat.objetivo ? c.cat.objetivo : null;
            const pasado = obj != null && c.total > obj;
            const ritmo = obj != null && avance != null && c.total > obj * avance * 1.05 && !pasado;
            const ranking = obj == null && grafico === "dia";
            return (
              <button key={c.cat.id} className="fila" style={{ width: "100%", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 0 }} onClick={() => setDetalle(c.cat)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Punto cat={c.cat} chico />
                  <span style={{ flex: 1 }}>{c.cat.nombre}</span>
                  <span className="tenue chico">{Math.round(c.pct * 100)}%</span>
                  <span className="num derecha" style={{ minWidth: 82 }}>
                    <span className={pasado ? "mal" : ritmo ? "ambar" : ""}>{num(c.total)}</span>
                    {obj != null && <span className="tenue chico"> / {num(obj)}</span>}
                  </span>
                </div>
                {obj != null && <div style={{ paddingLeft: 38 }}><Barra valor={c.total / obj} color={pasado ? "var(--mal)" : ritmo ? "var(--ambar)" : c.cat.color} marca={avance} /></div>}
                {ranking && <div style={{ paddingLeft: 38 }}><Barra valor={c.total / cats[0].total} color={c.cat.color} /></div>}
              </button>
            );
          })}
        </div>
      )}
      {esMes && avance != null && avance < 1 && cats.some(c => c.cat.objetivo) && (
        <div className="mini tenue centro">La marca blanca es donde deberías ir hoy</div>
      )}

      {esMes && tipo === "gasto" && <TarjetaComoVenis periodo={periodo} />}

      <Hoja abierta={elegirPeriodo} cerrar={() => setElegirPeriodo(false)}>
        <h2>Elegir período</h2>
        <div className="campo"><label>Desde</label><input type="date" value={ancla} max={hasta} onChange={e => e.target.value && setAncla(e.target.value)} /></div>
        <div className="campo"><label>Hasta</label><input type="date" value={hasta} min={ancla} onChange={e => e.target.value && setHasta(e.target.value)} /></div>
        <div className="espacio" />
        <button className="btn" onClick={() => setElegirPeriodo(false)}>Listo</button>
      </Hoja>

      <DetalleCategoria cat={detalle} movs={movs} cerrar={() => setDetalle(null)} />
    </div>
  );
}

function DetalleCategoria({ cat, movs, cerrar }: { cat: Categoria | null; movs: Movimiento[]; cerrar: () => void }) {
  const nav = useNav();
  const cuentas = useLiveQuery(() => db.cuentas.toArray(), []);
  if (!cat) return null;
  const lista = movs.filter(m => m.categoriaId === cat.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const nombreCta = (id: string) => cuentas?.find(c => c.id === id)?.nombre ?? "";
  return (
    <Hoja abierta cerrar={cerrar}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Punto cat={cat} chico /><h2 style={{ margin: 0, flex: 1 }}>{cat.nombre}</h2>
        <span className="num">{usd(suma(lista))}</span>
      </div>
      {lista.map(m => (
        <button key={m.id} className="fila" style={{ width: "100%", textAlign: "left", borderTop: "1px solid var(--linea)" }} onClick={() => { cerrar(); nav.abrir({ p: "editor", id: m.id }); }}>
          <span className="izq"><span className="tenue chico" style={{ minWidth: 46 }}>{fechaCorta(m.fecha)}</span><span>{m.comentario || m.etiquetas.join(", ") || nombreCta(m.cuentaId)}</span></span>
          <span className="num derecha">{num(usdDe(m))}<div className="mini tenue">{m.moneda !== "USD" ? `${num(m.monto)} ${m.moneda}` : ""}</div></span>
        </button>
      ))}
    </Hoja>
  );
}

/** La tarjeta "Cómo venís" al pie del mes: tres datos y se abre al tocarla. No avisa nada. */
function TarjetaComoVenis({ periodo }: { periodo: string }) {
  const nav = useNav();
  const x = useInsights(periodo);
  if (!x) return null;
  const partes = [
    x.tarjeta.total > 0 && `Tarjeta ${x.tarjeta.pct}% del mes`,
    x.comprometido.total > 0 && `${nombreMes(x.comprometido.periodo, false)} ya comprometido ~${num(x.comprometido.total, 0)} USD`,
    x.suscripciones.total > 0 && `Suscripciones ${num(x.suscripciones.total, 0)} USD`,
  ].filter(Boolean);
  if (!partes.length) return null;
  return (
    <button className="caja" style={{ width: "100%", textAlign: "left", borderColor: "#3A2F5C", marginTop: 10 }} onClick={() => nav.abrir({ p: "como-venis", periodo })}>
      <div className="fila" style={{ padding: 0 }}><span className="viol">✦ Cómo venís en {nombreMes(periodo, false)}</span><T.IconChevronRight size={16} className="tenue" /></div>
      <div className="mini tenue" style={{ marginTop: 4, lineHeight: 1.5 }}>{partes.join(" · ")}</div>
    </button>
  );
}

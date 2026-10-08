import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos, usePendientes } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import type { Categoria, Movimiento, Tipo } from "../tipos";
import { bloques, claseProvisoria, porCargarDelMes, porCategoria, recurrentesDelMes, suma, usdDe } from "../lib/analisis";
import { enUsdDe } from "../lib/recurrentes";
import { proyectadoPorCategoria } from "../lib/proyecciones";
import { Proyecciones, tasaDeProyecciones } from "./Proyecciones";
import { BotonMandar } from "./Finanzas";
import { fechaCorta, hoy, moverAncla, nombreMes, periodoDe, periodoHoy, rango, tituloRango, type Vista } from "../lib/fecha";
import { num, usd } from "../lib/formato";
import { Barra, BotonAgregar, Dona, Hoja, Punto } from "../ui/piezas";
import { PorTiempo } from "../ui/Graficos";
import { useInsights } from "./ComoVenis";
import { T } from "../ui/Icono";

/** La marca de las barras con objetivo: avisa que ya vas por el 80%. */
const ALERTA = 0.8;
const VISTAS: [Vista, string][] = [["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"], ["periodo", "Período"]];

export function Resumen() {
  const d = useDatos();
  const nav = useNav();
  const [solapa, setSolapa] = useState<Tipo | "proy">("gasto");
  const tipo: Tipo = solapa === "proy" ? "gasto" : solapa;
  // En el mes: sumar lo proyectado que esté prendido (seguro en claro, opcional rayado).
  const [conProy, setConProy] = useState(false);
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

  const tasa = d.tasaRec;
  const instancias = esMes ? recurrentesDelMes(d.recurrentes, d.movimientos, periodo, tasa) : [];
  // Lo que va con tarjeta llega con el resumen: no se pide cargar a mano. Se avisa
  // solo si algo ya venció; el número es el mismo que en "Lo que viene".
  const { todos: porCargar, vencidos } = porCargarDelMes(instancias, d.cuentas);
  const clase = useMemo(() => claseProvisoria(d.categorias, d.movimientos), [d.categorias, d.movimientos]);
  const b = esMes && tipo === "gasto" ? bloques(periodo, movs, d.categorias, d.recurrentes, instancias.filter(i => i.estado !== "cargado"), tasa, clase) : null;
  const revisar = usePendientes()?.total ?? 0;

  const tasaProy = useMemo(() => tasaDeProyecciones(d), [d]);
  const proyPorCat = useMemo(() => (esMes ? proyectadoPorCategoria(periodo, tipo, d.proyecciones, tasaProy) : new Map<string, { seguro: number; opcional: number }>()), [esMes, tipo, periodo, d.proyecciones, tasaProy]);
  const hayProy = proyPorCat.size > 0;
  const verProy = conProy && hayProy;
  const proyTotal = verProy ? [...proyPorCat.values()].reduce((a, b) => a + b.seguro + b.opcional, 0) : 0;
  // Previsto: lo que falta de los recurrentes de gasto de este mes que todavía no se
  // cargaron (casi siempre los que van a la tarjeta y llegan con el resumen).
  const previstoPorCat = useMemo(() => {
    const out = new Map<string, number>();
    if (!esMes || tipo !== "gasto" || periodo < periodoHoy()) return out;
    for (const i of instancias) {
      if (i.rec.tipo !== "gasto" || i.estado === "cargado") continue;
      const t = tasa(i.rec);
      if (t && i.falta > 0) out.set(i.rec.categoriaId, (out.get(i.rec.categoriaId) ?? 0) + i.falta / t);
    }
    return out;
  }, [esMes, tipo, periodo, instancias, tasa]);
  const previstoTotal = [...previstoPorCat.values()].reduce((a, b) => a + b, 0);
  // Las categorías que solo tienen algo proyectado o previsto también aparecen.
  const extra = new Set([...(verProy ? proyPorCat.keys() : []), ...previstoPorCat.keys()]);
  const catsVer = [...cats, ...[...extra].filter(id => !cats.some(c => c.cat.id === id)).map(id => d.catPorId.get(id)).filter(Boolean).map(cat => ({ cat: cat!, total: 0, pct: 0, n: 0 }))];
  // Los que todavía no tienen cotización cuentan como 0 hasta que haya conexión.
  const sinCotizar = movs.filter(m => m.usd == null).length;

  const vacio = tipo === "gasto" ? "Sin gastos" : "Sin ingresos";
  const enEsto = { dia: "este día", semana: "esta semana", mes: "este mes", anio: "este año", periodo: "este período" }[vista];

  return (
    <div className="pantalla">
      <div className="enc">
        <h1>Resumen</h1>
        <span style={{ marginLeft: "auto" }}><BotonMandar /></span>
        <button className="accion" aria-label="Para revisar" onClick={() => nav.abrir({ p: "revisar" })} style={{ position: "relative" }}>
          <T.IconInbox size={22} />
          {revisar > 0 && <span className="badge" style={{ position: "absolute", top: -2, right: -6 }}>{revisar}</span>}
        </button>
      </div>

      <div className="solapas">
        <button className={solapa === "gasto" ? "on" : ""} onClick={() => setSolapa("gasto")}>GASTOS</button>
        <button className={solapa === "ingreso" ? "on" : ""} onClick={() => setSolapa("ingreso")}>INGRESOS</button>
        <button className={solapa === "proy" ? "on" : ""} onClick={() => setSolapa("proy")}>PROYECCIONES</button>
      </div>
      {solapa === "proy" ? <Proyecciones /> : <>

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

      {vencidos.length > 0 && (
        <button className="caja aviso" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.irA("viene", periodo)}>
          <div className="ambar" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <T.IconBell size={16} /> {porCargar.length} por cargar{vencidos.length < porCargar.length ? ` (${vencidos.length} ${vencidos.length === 1 ? "vencido" : "vencidos"})` : ""}
          </div>
          {vencidos.slice(0, 3).map(i => (
            <div className="fila chico" key={i.rec.id + i.clave} style={{ padding: "3px 0" }}>
              <span>{i.rec.nombre} · {fechaCorta(i.fecha)}</span>
              <span className="tenue">{(() => {
                // Dólares primero; la moneda original después.
                const x = i.estado === "parcial" ? i.falta : i.esperado, u = enUsdDe(i.rec, x, tasa(i.rec));
                const pre = i.estado === "parcial" ? "faltan " : "~";
                return u != null ? `${pre}${num(u, 0)} USD · ${num(x)} ${i.rec.moneda}` : `${pre}${num(x)} ${i.rec.moneda}`;
              })()}</span>
            </div>
          ))}
        </button>
      )}

      {/* "Cómo venís" arriba de todo en el mes, antes de los números. */}
      {esMes && tipo === "gasto" && <TarjetaComoVenis periodo={periodo} />}

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
            {b.variables.objetivo > 0 && <Barra valor={b.variables.gastado / b.variables.objetivo} color={b.variables.queda < 0 ? "var(--mal)" : b.variables.gastado >= b.variables.objetivo * ALERTA ? "var(--ambar)" : "var(--viol)"} marca={ALERTA} />}
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

      {hayProy && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className={`pill${verProy ? " on" : ""}`} style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setConProy(!conProy)}>Con proyecciones{verProy ? " ✓" : ""}</button>
        </div>
      )}
      {grafico === "torta" ? (
        // La torta chica y el total grande al lado (regla de Resumen): entra más sin bajar.
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, margin: "4px 0 6px" }}>
          <Dona tam={120} centro=""
            partes={catsVer.flatMap(c => {
              const p = verProy ? proyPorCat.get(c.cat.id) : undefined;
              return [{ valor: c.total, color: c.cat.color }, { valor: p?.seguro ?? 0, color: c.cat.color, tenue: true }, { valor: p?.opcional ?? 0, color: c.cat.color, rayado: true }];
            })} />
          <div style={{ minWidth: 0 }}>
            {total + proyTotal
              ? <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(total + proyTotal, 0)} <span className="chico tenue">USD</span></div>
              : <div className="chico tenue">{vacio}</div>}
            <div className="mini tenue">{enEsto}</div>
            {verProy && <div className="mini tenue">{num(proyTotal, 0)} proyectado: <span className="ambar">claro</span> seguro · <span className="viol" style={{ textDecoration: "underline dotted" }}>rayado</span> opcional</div>}
            {previstoTotal >= 1 && <div className="mini tenue">+ ~{num(previstoTotal, 0)} previsto</div>}
          </div>
        </div>
      ) : (
        <div className="fila" style={{ padding: "4px 2px 10px" }}>
          <span className="tenue chico">{total ? `Total ${enEsto}` : `${vacio} ${enEsto}`}</span>
          {total > 0 && <span className="mediano num">{num(total)} <span className="chico tenue">USD</span></span>}
        </div>
      )}
      {sinCotizar > 0 && <div className="mini ambar centro" style={{ marginBottom: 6 }}>{sinCotizar} sin cotizar: se suman al tener conexión</div>}
      {grafico === "dia" && vista !== "dia" && total > 0 && <PorTiempo movs={movs} desde={desde} hasta={fin} />}

      {catsVer.length > 0 && (
        <div className="caja lista">
          {catsVer.map(c => {
            const proy = verProy ? proyPorCat.get(c.cat.id) : undefined;
            const obj = esMes && c.cat.objetivo ? c.cat.objetivo : null;
            const prev = previstoPorCat.get(c.cat.id) ?? 0;
            // Con lo previsto: si lo que viene te pasa del objetivo, ya se ve ahora.
            const pasado = obj != null && c.total + prev > obj;
            // Cerca del objetivo: pasó la marca del 80%.
            const ritmo = obj != null && c.total + prev >= obj * ALERTA && !pasado;
            const ranking = obj == null && grafico === "dia";
            return (
              <button key={c.cat.id} className="fila" style={{ width: "100%", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 0 }} onClick={() => setDetalle(c.cat)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Punto cat={c.cat} chico />
                  <span style={{ flex: 1 }}>{c.cat.nombre}</span>
                  <span className="tenue chico">{c.total > 0 ? `${Math.round(c.pct * 100)}%` : ""}</span>
                  <span className="num derecha" style={{ minWidth: 82 }}>
                    <span className={pasado ? "mal" : ritmo ? "ambar" : ""}>{num(c.total)}</span>
                    {proy != null && proy.seguro > 0 && <span className="ambar chico"> +{num(proy.seguro, 0)}</span>}
                    {proy != null && proy.opcional > 0 && <span className="viol chico" style={{ textDecoration: "underline dotted" }}> +{num(proy.opcional, 0)}</span>}
                    {prev >= 1 && <span className="tenue chico" style={{ textDecoration: "underline dotted" }}> +{num(prev, 0)} previsto</span>}
                    {obj != null && <span className="tenue chico"> / {num(obj)}</span>}
                  </span>
                </div>
                {obj != null && <div style={{ paddingLeft: 38 }}><Barra valor={c.total / obj} previsto={prev / obj} color={pasado ? "var(--mal)" : ritmo ? "var(--ambar)" : c.cat.color} colorPrevisto={c.cat.color} marca={ALERTA} /></div>}
                {ranking && <div style={{ paddingLeft: 38 }}><Barra valor={c.total / cats[0].total} color={c.cat.color} /></div>}
              </button>
            );
          })}
        </div>
      )}
      {esMes && cats.some(c => c.cat.objetivo) && (
        <div className="mini tenue centro">La marca es el 80% del objetivo</div>
      )}


      </>}

      {solapa !== "proy" && <BotonAgregar tipo={tipo} abrir={t => nav.abrir({ p: "editor", tipo: t, fecha: fechaParaCargar(desde, fin) })} />}

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
    x.tarjeta.total > 0 && `tarjeta ${x.tarjeta.pct}%`,
    x.comprometido.total > 0 && `${nombreMes(x.comprometido.periodo, false)} ~${num(x.comprometido.total, 0)}`,
    x.suscripciones.total > 0 && `suscripciones ${num(x.suscripciones.total, 0)}`,
  ].filter(Boolean);
  if (!partes.length) return null;
  return (
    // Una sola línea arriba (regla de Resumen); se toca para ver el detalle.
    <button style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "4px 2px" }} onClick={() => nav.abrir({ p: "como-venis", periodo })}>
      <span className="viol chico" style={{ flex: "none" }}>✦ Cómo venís:</span>
      <span className="mini tenue" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partes.join(" · ")}</span>
      <T.IconChevronRight size={16} className="tenue" style={{ flex: "none" }} />
    </button>
  );
}

/** Al cargar mirando otro día, semana o mes, el gasto va ahí: hoy si cae adentro,
 *  si no el último día (pasado) o el primero (futuro). */
export function fechaParaCargar(desde: string, fin: string) {
  const h = hoy();
  return h < desde ? desde : h > fin ? fin : h;
}

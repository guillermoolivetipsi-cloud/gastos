import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos, usePendientes } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import type { Categoria, Movimiento, Tipo } from "../tipos";
import { bloques, claseProvisoria, porCargarDelMes, porCategoria, recurrentesDelMes, suma, usdDe } from "../lib/analisis";
import { enUsdDe, fechaDePago } from "../lib/recurrentes";
import { proyectadoPorCategoria } from "../lib/proyecciones";
import { Proyecciones, tasaDeProyecciones } from "./Proyecciones";
import { BotonMandar } from "./Finanzas";
import { fechaCorta, hoy, mesCorto, moverAncla, nombreMes, periodoDe, periodoHoy, rango, sumarMeses, tituloRango, type Vista } from "../lib/fecha";
import { num, usd } from "../lib/formato";
import { Barra, BotonAgregar, Dia, Dona, Hoja, Puntito, Punto } from "../ui/piezas";
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
  // Ingresos del mes (reglas de Ingresos): lo que falta cobrar de los recurrentes, lo
  // esperado por categoría, los últimos 6 meses y la comparación con el mes anterior.
  const esIng = esMes && tipo === "ingreso";
  const instIng = esIng ? instancias.filter(i => i.rec.tipo === "ingreso" && !i.cero) : [];
  const enUsdI = (i: (typeof instancias)[number], x: number) => { const t = tasa(i.rec); return t ? x / t : 0; };
  const faltaCobrar = instIng.filter(i => i.estado !== "cargado");
  const faltaUsd = faltaCobrar.reduce((s, i) => s + enUsdI(i, i.esperado - i.pagado), 0);
  const esperadoPorCat = new Map<string, number>();
  for (const i of instIng) esperadoPorCat.set(i.rec.categoriaId, (esperadoPorCat.get(i.rec.categoriaId) ?? 0) + enUsdI(i, Math.max(i.esperado, i.pagado)));
  const ingresoDe = (p: string, hastaDia?: string) => d.movimientos.filter(m => m.tipo === "ingreso" && m.fecha.slice(0, 7) === p && (!hastaDia || m.fecha.slice(8) <= hastaDia)).reduce((s, m) => s + usdDe(m), 0);
  const seisMeses = esIng ? Array.from({ length: 6 }, (_, k) => sumarMeses(periodo, k - 5)).map(p => ({ p, v: p === periodo ? total : ingresoDe(p) })) : [];
  const previos = esIng ? [1, 2, 3].map(k => ingresoDe(sumarMeses(periodo, -k))).filter(x => x > 0) : [];
  const promedio = previos.length ? previos.reduce((a, b) => a + b, 0) / previos.length : null;
  const mesEnCurso = periodo === periodoHoy();
  const anterior = sumarMeses(periodo, -1);
  const antVal = esIng ? ingresoDe(anterior, mesEnCurso ? hoy().slice(8) : undefined) : 0;
  const extra = new Set([...(verProy ? proyPorCat.keys() : []), ...previstoPorCat.keys(), ...esperadoPorCat.keys()]);
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

      {/* La vista y el período en una sola fila (regla de orden). */}
      <div className="navega">
        <select className="pill" value={vista} aria-label="Vista" onChange={e => {
          const v = e.target.value as Vista;
          setVista(v);
          if (v === "periodo") { setAncla(`${periodoHoy()}-01`); setHasta(hoy()); setElegirPeriodo(true); }
          else setAncla(hoy());
        }}>
          {VISTAS.map(([v, t]) => <option key={v} value={v}>{t} ▾</option>)}
        </select>
        <span className="flechas">
          <button aria-label="Anterior" disabled={vista === "periodo"} onClick={() => setAncla(moverAncla(vista, ancla, -1))} style={{ opacity: vista === "periodo" ? 0 : 1 }}><T.IconChevronLeft size={20} /></button>
          <button onClick={() => vista === "periodo" ? setElegirPeriodo(true) : setAncla(hoy())}><span style={{ color: "var(--tinta)" }}>{tituloRango(vista, desde, fin)}</span></button>
          <button aria-label="Siguiente" disabled={vista === "periodo"} onClick={() => setAncla(moverAncla(vista, ancla, 1))} style={{ opacity: vista === "periodo" ? 0 : 1 }}><T.IconChevronRight size={20} /></button>
        </span>
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
      {esIng && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
          <div className="caja" style={{ padding: "8px 10px", margin: 0 }}><div className="mini tenue">Entró</div><div className="num ok" style={{ fontSize: 20 }}>+{num(total, 0)}</div><div className="mini tenue">USD</div></div>
          <div className="caja" style={{ padding: "8px 10px", margin: 0 }}><div className="mini tenue">Falta cobrar</div><div className="num" style={{ fontSize: 20 }}>{faltaUsd >= 1 ? `~${num(faltaUsd, 0)}` : "0"}</div><div className="mini tenue">{faltaCobrar.length ? `${faltaCobrar.length} · ` : ""}USD</div></div>
          <div className="caja" style={{ padding: "8px 10px", margin: 0 }}><div className="mini tenue">Tu promedio</div><div className="num" style={{ fontSize: 20 }}>{promedio != null ? num(promedio, 0) : "—"}</div><div className="mini tenue">USD/mes</div></div>
        </div>
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

      {esIng ? (
        // Barras de los últimos 6 meses, con lo que falta cobrar rayado y tu promedio punteado.
        (() => {
          const max = Math.max(1, ...seisMeses.map(x => x.v + (x.p === periodo ? faltaUsd : 0)), promedio ?? 0);
          const H = 80;
          return (
            <>
              <div className="grupo-t"><span>Los últimos 6 meses</span>{promedio != null && <span className="num">promedio {num(promedio, 0)}</span>}</div>
              <div className="caja">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                  {seisMeses.map(({ p, v }) => {
                    const ahora = p === periodo;
                    return (
                      <div key={p} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <small className="num mini tenue" style={{ fontSize: 12 }}>{v > 0 ? num(v, 0) : ""}</small>
                        <div style={{ position: "relative", height: H, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                          {promedio != null && <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.round(promedio / max * H), borderTop: "1px dashed #8E8BA3", zIndex: 1 }} />}
                          {ahora && faltaUsd >= 1 && <i style={{ width: "62%", height: Math.round(faltaUsd / max * H), background: "repeating-linear-gradient(-45deg, var(--ok) 0 3px, transparent 3px 6px)", borderRadius: "4px 4px 0 0", display: "block", opacity: .7 }} />}
                          <i style={{ width: "62%", height: Math.max(v > 0 ? 2 : 0, Math.round(v / max * H)), background: ahora ? "var(--ok)" : "#1E5A48", borderRadius: ahora && faltaUsd >= 1 ? 0 : "4px 4px 0 0", display: "block", position: "relative" }} />
                        </div>
                        <small className="mini tenue" style={{ fontSize: 12 }}>{mesCorto(p)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
              {antVal > 0 && (
                <div className="mini tenue" style={{ margin: "-4px 2px 4px" }}>
                  {mesEnCurso ? `a esta altura de ${nombreMes(anterior, false)}` : `en ${nombreMes(anterior, false)}`}: {num(antVal, 0)} · <span className={total >= antVal ? "ok" : "ambar"}>{total >= antVal ? "+" : "−"}{num(Math.abs(total - antVal), 0)}</span>
                </div>
              )}
              {faltaCobrar.length > 0 && <>
                <div className="grupo-t"><span>Falta cobrar · {faltaCobrar.length}</span><span className="num">~{num(faltaUsd, 0)}</span></div>
                <div className="caja lista">
                  {faltaCobrar.map(i => (
                    <div key={i.rec.id + i.clave} className="fila">
                      <button className="izq" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                        <Dia dia={Number(i.fecha.slice(8))} abajo={mesCorto(i.fecha.slice(0, 7))} />
                        <Puntito cat={d.catPorId.get(i.rec.categoriaId)} />
                        <span style={{ minWidth: 0 }}><div>{i.rec.nombre}</div><div className="mini tenue">{d.cuentaPorId.get(i.rec.cuentaId)?.nombre}</div></span>
                      </button>
                      <span className="derecha">
                        <div className="num tenue">~{num(enUsdI(i, i.esperado - i.pagado), 0)}</div>
                        <button className="btn1" style={{ padding: "3px 10px", fontSize: 13, marginTop: 3 }} onClick={() => nav.abrir({ p: "editor", recurrenteId: i.rec.id, periodo: i.clave, monto: i.estimado ? undefined : i.falta || undefined, fecha: fechaDePago(i) })}>Cobrar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </>}
            </>
          );
        })()
      ) : grafico === "torta" ? (
        // La torta chica con el total pegado a la izquierda, y "Con proyecciones" debajo (reglas de Resumen y de orden).
        <div className="torta-fila" style={{ display: "flex", alignItems: "center", gap: 20, margin: "16px 0 4px" }}>
          <Dona tam={120} centro=""
            partes={catsVer.flatMap(c => {
              const p = verProy ? proyPorCat.get(c.cat.id) : undefined;
              return [{ valor: c.total, color: c.cat.color }, { valor: p?.seguro ?? 0, color: c.cat.color, tenue: true }, { valor: p?.opcional ?? 0, color: c.cat.color, rayado: true }];
            })} />
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {total + proyTotal
              ? <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(total + proyTotal, 0)} <span className="chico tenue">USD</span></div>
              : <div className="chico tenue">{vacio}</div>}
            <div className="mini tenue">{enEsto}{previstoTotal >= 1 ? ` · + ~${num(previstoTotal, 0)} previsto` : ""}</div>
            {verProy && <div className="mini tenue">{num(proyTotal, 0)} proyectado: <span className="ambar">claro</span> seguro · <span className="viol" style={{ textDecoration: "underline dotted" }}>rayado</span> opcional</div>}
            {hayProy && <button className={`pill${verProy ? " on" : ""}`} style={{ marginTop: 8, width: "fit-content" }} onClick={() => setConProy(!conProy)}>Con proyecciones{verProy ? " ✓" : ""}</button>}
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

      {catsVer.length > 0 && <div className="grupo-t"><span>Por categoría</span>{total > 0 && <span className="num">{num(total, 0)}</span>}</div>}
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
            const hayDebajo = prev >= 1 || (proy != null && proy.seguro + proy.opcional > 0);
            // Ingresos con un recurrente: lo que entró contra lo esperado (regla de Ingresos).
            const esp = esIng ? esperadoPorCat.get(c.cat.id) : undefined;
            // Columnas alineadas: el % debajo del nombre; el monto con su objetivo arriba y lo previsto debajo.
            return (
              <button key={c.cat.id} className="fila" style={{ width: "100%", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 0 }} onClick={() => setDetalle(c.cat)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Punto cat={c.cat} chico />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div>{c.cat.nombre}</div>
                    {c.total > 0 && <div className="mini tenue">{Math.round(c.pct * 100)}% {enEsto === "este mes" ? "del mes" : ""}</div>}
                  </span>
                  <span className="num derecha">
                    <div><span className={pasado ? "mal" : ritmo ? "ambar" : ""}>{num(c.total)}</span>{obj != null && <span className="tenue chico"> / {num(obj)}</span>}{esp != null && <span className="tenue chico"> / {num(esp, 0)}</span>}</div>
                    {esp != null && (esp - c.total >= 1 ? <div className="mini tenue">~{num(esp - c.total, 0)} falta</div> : <div className="mini ok">cobrado</div>)}
                    {hayDebajo && <div className="mini tenue">
                      {prev >= 1 && <span>~+{num(prev, 0)} previsto</span>}
                      {proy != null && proy.seguro > 0 && <span className="ambar"> +{num(proy.seguro, 0)}</span>}
                      {proy != null && proy.opcional > 0 && <span className="viol" style={{ textDecoration: "underline dotted" }}> +{num(proy.opcional, 0)}</span>}
                    </div>}
                  </span>
                </div>
                {esp != null && <div style={{ paddingLeft: 38 }}><Barra valor={Math.min(1, c.total / esp)} previsto={Math.max(0, (esp - c.total) / esp)} color={c.cat.color} colorPrevisto={c.cat.color} /></div>}
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

import { useMemo, useState } from "react";
import { useDatos, usePendientes } from "../datos";
import { useNav } from "../nav";
import type { Movimiento, Tipo } from "../tipos";
import { aPagarTarjeta, bloques, claseProvisoria, porCargarDelMes, porCategoria, recurrentesDelMes, suma, usdDe } from "../lib/analisis";
import { enUsdDe, fechaDePago } from "../lib/recurrentes";
import { proyectadoPorCategoria } from "../lib/proyecciones";
import { Proyecciones, tasaDeProyecciones } from "./Proyecciones";
import { BotonMandar } from "./Finanzas";
import { DIAS_CORTOS, aFecha, fechaCorta, hoy, mesCorto, moverAncla, nombreMes, periodoDe, periodoHoy, rango, sumarMeses, tituloRango, type Vista } from "../lib/fecha";
import { num } from "../lib/formato";
import { Barra, BotonAgregar, Dia, Dona, Hoja, Puntito, Punto } from "../ui/piezas";
import { PorTiempo } from "../ui/Graficos";
import { useInsights } from "./ComoVenis";
import { T } from "../ui/Icono";

/** La marca de las barras con objetivo: avisa que ya vas por el 80%. */
const ALERTA = 0.8;
const VISTAS: [Vista, string][] = [["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"], ["periodo", "Período"]];

/** La pestaña Gastos o la pestaña Ingresos (regla de las pestañas). */
export function Resumen({ tipo }: { tipo: Tipo }) {
  const d = useDatos();
  const nav = useNav();
  // En el mes: sumar lo proyectado que esté prendido (seguro en claro, opcional rayado).
  const [conProy, setConProy] = useState(false);
  // Abre en el mes (regla de las vistas de Resumen).
  const [vista, setVista] = useState<Vista>("mes");
  const [ancla, setAncla] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [elegirPeriodo, setElegirPeriodo] = useState(false);
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
  const gastosMes = esIng ? d.movimientos.filter(m => m.tipo === "gasto" && m.fecha.slice(0, 7) === periodo).reduce((s, m) => s + usdDe(m), 0) : 0;
  const previstoGastos = esIng && periodo >= periodoHoy() ? instancias.filter(i => i.rec.tipo === "gasto" && i.estado !== "cargado" && !i.cero).reduce((s, i) => s + enUsdI(i, i.falta), 0) : 0;
  const antVal = esIng ? ingresoDe(anterior, mesEnCurso ? hoy().slice(8) : undefined) : 0;
  const extra = new Set([...(verProy ? proyPorCat.keys() : []), ...previstoPorCat.keys(), ...esperadoPorCat.keys()]);
  const catsVer = [...cats, ...[...extra].filter(id => !cats.some(c => c.cat.id === id)).map(id => d.catPorId.get(id)).filter(Boolean).map(cat => ({ cat: cat!, total: 0, pct: 0, n: 0 }))];
  // Los que todavía no tienen cotización cuentan como 0 hasta que haya conexión.
  const sinCotizar = movs.filter(m => m.usd == null).length;

  // Para la vista Año: cuántos meses van y en cuántos te pasaste del objetivo de la categoría.
  const mesesDelAnio = (a: string) => a < periodoHoy().slice(0, 4) ? 12 : a > periodoHoy().slice(0, 4) ? 1 : Number(periodoHoy().slice(5));
  const delAnio = (catId: string) => {
    const a = desde.slice(0, 4), meses = mesesDelAnio(a), cat = d.catPorId.get(catId);
    let pasados = 0;
    if (cat?.objetivo) for (let k = 1; k <= meses; k++) {
      const p = `${a}-${String(k).padStart(2, "0")}`;
      if (d.movimientos.filter(m => m.categoriaId === catId && m.fecha.slice(0, 7) === p).reduce((x, m) => x + usdDe(m), 0) > cat.objetivo) pasados++;
    }
    return { meses, pasados };
  };
  const vacio = tipo === "gasto" ? "Sin gastos" : "Sin ingresos";
  const enEsto = { dia: "este día", semana: "esta semana", mes: "este mes", anio: "este año", periodo: "este período" }[vista];

  return (
    <div className="pantalla">
      <div className="enc">
        <h1>{tipo === "gasto" ? "Gastos" : "Ingresos"}</h1>
        <button className="accion" aria-label="Buscar" style={{ marginLeft: "auto", color: "var(--tenue-2)" }} onClick={() => nav.abrir({ p: "movimientos", tipo, buscar: true })}><T.IconSearch size={22} /></button>
        <span><BotonMandar /></span>
        <button className="accion" aria-label="Para revisar" onClick={() => nav.abrir({ p: "revisar" })} style={{ position: "relative" }}>
          <T.IconInbox size={22} />
          {revisar > 0 && <span className="badge" style={{ position: "absolute", top: -2, right: -6 }}>{revisar}</span>}
        </button>
      </div>


      {/* Las vistas a la vista, en su fila, y el período debajo (regla de las vistas de Resumen). */}
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
        <button className="caja aviso" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "viene", periodo })}>
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
      {tipo === "gasto" && <LineaLoQueViene />}
      {esIng && (
        // Entró y Gastaste, y debajo cuánto te quedó (regla de Ingresos).
        <>
          <div className="dos" style={{ marginTop: 6 }}>
            <div className="caja" style={{ padding: "8px 10px", margin: 0 }}><div className="mini tenue">Entró</div><div className="num ok" style={{ fontSize: 20 }}>+{num(total, 0)}</div><div className="mini tenue">{faltaUsd >= 1 ? `~${num(faltaUsd, 0)} falta cobrar` : "USD"}</div></div>
            <div className="caja" style={{ padding: "8px 10px", margin: 0 }}><div className="mini tenue">Gastaste</div><div className="num" style={{ fontSize: 20 }}>{num(gastosMes, 0)}</div><div className="mini tenue">{previstoGastos >= 1 ? `+ ~${num(previstoGastos, 0)} previsto` : "USD"}</div></div>
          </div>
          <div className="caja" style={{ marginTop: 8 }}>
            <div className="fila" style={{ padding: 0 }}><span>Te quedó</span><span className={`num ${total - gastosMes >= 0 ? "ok" : "mal"}`} style={{ fontSize: 20 }}>{total - gastosMes >= 0 ? "+" : "−"}{num(Math.abs(total - gastosMes), 0)}</span></div>
            <div className="mini tenue">lo que entró menos lo que gastaste{promedio != null ? ` · tu promedio de ingresos: ${num(promedio, 0)}` : ""}</div>
          </div>
        </>
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
      ) : vista === "anio" ? (
        <Anio tipo={tipo} anio={desde.slice(0, 4)} total={total} abrirMes={p => { setVista("mes"); setAncla(`${p}-01`); }} />
      ) : (
        <div className="fila" style={{ padding: "4px 2px 10px" }}>
          <span className="tenue chico">{total ? `Total ${enEsto}` : `${vacio} ${enEsto}`}</span>
          {total > 0 && <span className="mediano num">{num(total)} <span className="chico tenue">USD</span></span>}
        </div>
      )}
      {sinCotizar > 0 && <div className="mini ambar centro" style={{ marginBottom: 6 }}>{sinCotizar} sin cotizar: se suman al tener conexión</div>}
      {grafico === "dia" && vista !== "dia" && vista !== "anio" && total > 0 && <PorTiempo movs={movs} desde={desde} hasta={fin} />}

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
            const ranking = obj == null && grafico === "dia" && vista !== "anio";
            // En el año (regla de la vista Año): por mes, o en cuántos meses te pasaste del objetivo.
            const anio = vista === "anio" ? delAnio(c.cat.id) : null;
            const hayDebajo = prev >= 1 || (proy != null && proy.seguro + proy.opcional > 0);
            // Ingresos con un recurrente: lo que entró contra lo esperado (regla de Ingresos).
            const esp = esIng ? esperadoPorCat.get(c.cat.id) : undefined;
            // Columnas alineadas: el % debajo del nombre; el monto con su objetivo arriba y lo previsto debajo.
            return (
              <button key={c.cat.id} className="fila" style={{ width: "100%", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 0 }} onClick={() => nav.abrir({ p: "detalle-categoria", id: c.cat.id, desde, hasta: fin, vista })}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Punto cat={c.cat} chico />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div>{c.cat.nombre}</div>
                    {anio ? <div className={`mini ${anio.pasados ? "ambar" : "tenue"}`}>{anio.pasados ? `te pasaste ${anio.pasados} ${anio.pasados === 1 ? "mes" : "meses"}` : `${num(c.total / anio.meses, 0)} por mes`}</div>
                      : c.total > 0 && <div className="mini tenue">{Math.round(c.pct * 100)}% {enEsto === "este mes" ? "del mes" : ""}</div>}
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
      {movs.length > 0 && <>
        <div className="grupo-t"><span>Últimos movimientos</span><span className="num">{tituloRango(vista, desde, fin).toLowerCase()}</span></div>
        <div className="caja lista">
          {[...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)).slice(0, 5).map(m => <FilaMovimiento key={m.id} m={m} />)}
          <button className="viol chico" style={{ width: "100%", padding: "10px 0 8px", borderTop: "1px solid #1A1A24" }} onClick={() => nav.abrir({ p: "movimientos", tipo })}>
            Ver todos los {tipo === "gasto" ? "gastos" : "ingresos"} ›
          </button>
        </div>
      </>}
      {esMes && cats.some(c => c.cat.objetivo) && (
        <div className="mini tenue centro">La marca es el 80% del objetivo</div>
      )}



      {<BotonAgregar tipo={tipo} abrir={t => nav.abrir({ p: "editor", tipo: t, fecha: fechaParaCargar(desde, fin) })} />}

      <Hoja abierta={elegirPeriodo} cerrar={() => setElegirPeriodo(false)}>
        <h2>Elegir período</h2>
        <div className="campo"><label>Desde</label><input type="date" value={ancla} max={hasta} onChange={e => e.target.value && setAncla(e.target.value)} /></div>
        <div className="campo"><label>Hasta</label><input type="date" value={hasta} min={ancla} onChange={e => e.target.value && setHasta(e.target.value)} /></div>
        <div className="espacio" />
        <button className="btn" onClick={() => setElegirPeriodo(false)}>Listo</button>
      </Hoja>

    </div>
  );
}

/** Una fila de movimiento como en Movimientos: arriba lo que fue, abajo la categoría y la
 *  cuenta (con la moneda original), un solo monto con ↻ y «3×». Se toca para editar. */
function FilaMovimiento({ m, sinCategoria }: { m: Movimiento; sinCategoria?: boolean }) {
  const d = useDatos();
  const nav = useNav();
  const cat = d.catPorId.get(m.categoriaId);
  const cuenta = d.cuentaPorId.get(m.cuentaId);
  const r = m.recurrenteId ? d.recurrentes.find(x => x.id === m.recurrenteId) : undefined;
  const queFue = m.comentario || m.etiquetas.join(", ");
  const nombreCat = cat?.nombre ?? "Sin categoría";
  return (
    <button className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: m.id })}>
      <span className="izq">
        <Punto cat={cat} chico />
        <span style={{ minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{queFue || nombreCat}</div>
          <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {queFue && !sinCategoria ? `${nombreCat} · ` : ""}{cuenta?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {cuenta?.nombre}{m.moneda !== "USD" ? ` · ${num(m.monto)} ${m.moneda}` : ""}
          </div>
        </span>
      </span>
      <span className="derecha num">
        <div className={m.tipo === "ingreso" ? "ok" : ""} style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
          {r && <T.IconRepeat size={13} className="viol" aria-label={`Pago de ${r.nombre}`} />}
          {m.cuotas && m.cuotas > 1 ? <span className="mini" style={{ color: "var(--azul)" }}>{m.cuotas}×</span> : null}
          <span>{m.tipo === "ingreso" ? "+" : ""}{m.usd != null ? num(m.usd) : "…"}</span>
        </div>
      </span>
    </button>
  );
}

/** La vista Año (regla de la vista Año): el total grande con lo que va por mes en
 *  promedio, y dos líneas, gastos y lo que entró, mes a mes. Se toca un mes y abajo
 *  aparece su detalle; desde ahí se abre ese mes. */
function Anio({ tipo, anio, total, abrirMes }: { tipo: Tipo; anio: string; total: number; abrirMes: (p: string) => void }) {
  const d = useDatos();
  const hoyP = periodoHoy();
  const meses = Array.from({ length: 12 }, (_, k) => `${anio}-${String(k + 1).padStart(2, "0")}`);
  const sumaDe = (p: string, t: Tipo) => d.movimientos.filter(m => m.tipo === t && m.fecha.slice(0, 7) === p).reduce((s, m) => s + usdDe(m), 0);
  const gastos = meses.map(p => (p <= hoyP ? sumaDe(p, "gasto") : null));
  const entro = meses.map(p => (p <= hoyP ? sumaDe(p, "ingreso") : null));
  const pasados = meses.filter(p => p <= hoyP).length || 1;
  const [sel, setSel] = useState(() => { const i = meses.indexOf(hoyP); if (i >= 0) return i; let k = 11; while (k > 0 && !gastos[k]) k--; return k; });
  const W = 320, H = 130, pad = 10;
  const tope = Math.max(1, ...gastos.map(v => v ?? 0), ...entro.map(v => v ?? 0)) * 1.1;
  const x = (i: number) => pad + i * (W - 2 * pad) / 11, y = (v: number) => H - 14 - v / tope * (H - 30);
  const camino = (arr: (number | null)[]) => arr.map((v, i) => v == null ? "" : `${i && arr[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const paso = tope > 6000 ? 2000 : tope > 3000 ? 1000 : tope > 1200 ? 500 : 200;
  const guias = [1, 2].map(k => k * Math.ceil(tope / 3 / paso) * paso).filter(v => v < tope);
  const VIOL = "#A78BFA", VERDE = "#5DD39E";
  const g = gastos[sel] ?? 0, e = entro[sel] ?? 0, q = e - g;
  return (
    <>
      <div style={{ margin: "8px 2px 14px" }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(total, 0)} <span className="chico tenue">USD</span></div>
        <div className="mini tenue" style={{ marginTop: 4 }}>{num(total / pasados, 0)} por mes en promedio</div>
      </div>
      <div className="caja">
        <div style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--tenue)", marginBottom: 4 }}>
          <span><i style={{ display: "inline-block", width: 12, height: 2, background: VIOL, verticalAlign: 3, marginRight: 5 }} />gastos</span>
          <span><i style={{ display: "inline-block", width: 12, height: 2, background: VERDE, verticalAlign: 3, marginRight: 5 }} />entró</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} role="img" aria-label={`${tipo === "gasto" ? "Gastos" : "Ingresos"} e ingresos de ${anio}, mes a mes`}>
          {guias.map(v => <g key={v}><line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke="#1F1F2A" /><text x={W - pad} y={y(v) - 3} textAnchor="end" fontSize="10" fill="#8E8BA3">{num(v, 0)}</text></g>)}
          <line x1={x(sel)} x2={x(sel)} y1={8} y2={H - 14} stroke="#2F2F3C" strokeDasharray="3 3" />
          <path d={camino(entro)} fill="none" stroke={VERDE} strokeWidth={2} strokeLinejoin="round" />
          <path d={camino(gastos)} fill="none" stroke={VIOL} strokeWidth={2} strokeLinejoin="round" />
          {[[entro, VERDE], [gastos, VIOL]].map(([arr, col]) => (arr as (number | null)[]).map((v, i) => v == null ? null :
            <circle key={`${col}${i}`} cx={x(i)} cy={y(v)} r={i === sel ? 4.5 : 2.5} fill={i === sel ? col as string : "#07070B"} stroke={col as string} strokeWidth={1.6} />))}
          {meses.map((p, i) => (
            <g key={p}>
              <text x={x(i)} y={H} textAnchor="middle" fontSize="10" fill={i === sel ? "#EDEBF5" : "#8E8BA3"}>{mesCorto(p)}</text>
              {gastos[i] != null && <rect x={x(i) - 13} y={0} width={26} height={H} fill="transparent" style={{ cursor: "pointer" }} onClick={() => setSel(i)} />}
            </g>
          ))}
        </svg>
        <button style={{ width: "100%", textAlign: "left", marginTop: 10, paddingTop: 10, borderTop: "1px solid #1A1A24", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }} onClick={() => abrirMes(meses[sel])}>
          <span><span style={{ fontWeight: 500 }}>{nombreMes(meses[sel], false)}</span> <span className="mini tenue">· gastaste {num(g, 0)} · entró {num(e, 0)}</span></span>
          <span className={`num mini ${q >= 0 ? "ok" : "mal"}`} style={{ whiteSpace: "nowrap" }}>{q >= 0 ? "+" : "−"}{num(Math.abs(q), 0)} ›</span>
        </button>
      </div>
    </>
  );
}

/** «◷ Lo que viene: 1.230 por pagar · tarjetas ~980 ›», arriba de Gastos (regla de las
 *  pestañas): lo que falta pagar este mes de tus cuentas y lo que vence de las tarjetas. */
function LineaLoQueViene() {
  const d = useDatos();
  const nav = useNav();
  const p = periodoHoy();
  const tasa = d.tasaRec;
  const insts = useMemo(() => recurrentesDelMes(d.recurrentes, d.movimientos, p, tasa), [d.recurrentes, d.movimientos, p, tasa]);
  const { todos } = porCargarDelMes(insts, d.cuentas);
  const porPagar = todos.reduce((s, i) => { const t = tasa(i.rec); return s + (t ? (i.estado === "parcial" ? i.falta : i.esperado) / t : 0); }, 0);
  const tarjetas = d.cuentas.filter(c => c.esTarjeta && !c.archivada).map(c => aPagarTarjeta(c, d.movimientos, d.recurrentes, p, tasa, d.resumenesCargados));
  const totalTarjetas = tarjetas.reduce((s, x) => s + x.total, 0);
  const estimado = tarjetas.some(x => !x.real);
  const partes = [porPagar >= 1 && `${num(porPagar, 0)} por pagar`, totalTarjetas >= 1 && `tarjetas ${estimado ? "~" : ""}${num(totalTarjetas, 0)}`].filter(Boolean);
  return (
    <button style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "4px 2px" }} onClick={() => nav.abrir({ p: "viene" })}>
      <span className="ambar chico" style={{ flex: "none" }}>◷ Lo que viene:</span>
      <span className="mini tenue" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partes.length ? partes.join(" · ") : "nada pendiente este mes"}</span>
      <T.IconChevronRight size={16} className="tenue" style={{ flex: "none" }} />
    </button>
  );
}

/** La pestaña Proyecciones. */
export function PantallaProyecciones() {
  const nav = useNav();
  const revisar = usePendientes()?.total ?? 0;
  return (
    <div className="pantalla">
      <div className="enc">
        <h1>Proyecciones</h1>
        <span style={{ marginLeft: "auto" }}><BotonMandar /></span>
        <button className="accion" aria-label="Para revisar" onClick={() => nav.abrir({ p: "revisar" })} style={{ position: "relative" }}>
          <T.IconInbox size={22} />
          {revisar > 0 && <span className="badge" style={{ position: "absolute", top: -2, right: -6 }}>{revisar}</span>}
        </button>
      </div>
      <Proyecciones />
    </div>
  );
}

/* El detalle de una categoría (regla de Detalle de categoría): pantalla completa; arriba
   el total con el objetivo y lo previsto; lo que falta pagar; los últimos 6 meses; y la
   lista como en Movimientos, agrupada por día. */
export function DetalleCategoria({ id, desde, hasta, vista }: { id: string; desde: string; hasta: string; vista: Vista }) {
  const d = useDatos();
  const nav = useNav();
  const cat = d.catPorId.get(id);
  if (!d.listo || !cat) return <div className="pantalla sin-tabs" />;
  const esGasto = cat.tipo === "gasto";
  const periodo = periodoDe(desde);
  const esMes = vista === "mes";
  const lista = d.movimientos.filter(m => m.categoriaId === id && m.fecha >= desde && m.fecha <= hasta).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  const total = suma(lista);
  const tasa = d.tasaRec;
  const insts = esMes ? recurrentesDelMes(d.recurrentes, d.movimientos, periodo, tasa).filter(i => i.rec.categoriaId === id && !i.cero) : [];
  const enUsdI = (i: (typeof insts)[number], x: number) => { const t = tasa(i.rec); return t ? x / t : 0; };
  const falta = periodo >= periodoHoy() ? insts.filter(i => i.estado !== "cargado") : [];
  const previsto = falta.reduce((s, i) => s + enUsdI(i, i.falta), 0);
  const obj = esMes && esGasto && cat.objetivo ? cat.objetivo : null;
  const pasado = obj != null && total + previsto > obj, ritmo = obj != null && !pasado && total + previsto >= obj * ALERTA;
  const delMes = (p: string) => d.movimientos.filter(m => m.categoriaId === id && m.fecha.slice(0, 7) === p).reduce((s, m) => s + usdDe(m), 0);
  const seis = esMes ? Array.from({ length: 6 }, (_, k) => sumarMeses(periodo, k - 5)).map(p => ({ p, v: p === periodo ? total : delMes(p) })) : [];
  const previos = esMes ? [1, 2, 3].map(k => delMes(sumarMeses(periodo, -k))).filter(x => x > 0) : [];
  const promedio = previos.length ? previos.reduce((a, b) => a + b, 0) / previos.length : null;
  const porDia: [string, typeof lista][] = [];
  for (const m of lista) { const u = porDia[porDia.length - 1]; if (u && u[0] === m.fecha) u[1].push(m); else porDia.push([m.fecha, [m]]); }
  const rec = new Map(d.recurrentes.map(r => [r.id, r]));
  const max = Math.max(1, ...seis.map(x => x.v + (x.p === periodo ? previsto : 0)), obj ?? 0), H = 70;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}><Punto cat={cat} chico />{cat.nombre}</h1>
        <span className="mini tenue">{tituloRango(vista, desde, hasta)}</span>
      </div>

      <div style={{ margin: "2px 2px 6px" }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>
          <span className={pasado ? "mal" : ritmo ? "ambar" : ""}>{num(total, 0)}</span> <span className="chico tenue">{obj != null ? `/ ${num(obj)} USD` : "USD"}</span>
        </div>
        {obj != null && <Barra valor={total / obj} previsto={previsto / obj} color={pasado ? "var(--mal)" : ritmo ? "var(--ambar)" : cat.color} colorPrevisto={cat.color} marca={ALERTA} />}
        <div className="mini tenue">
          {previsto >= 1 && <>+ ~{num(previsto, 0)} previsto</>}
          {obj != null && previsto >= 1 && " · "}
          {obj != null && (total + previsto > obj ? <span className="mal">te pasarías por {num(total + previsto - obj, 0)}</span> : <>te quedan {num(obj - total - previsto, 0)}</>)}
          {obj == null && promedio != null && <>tu promedio: {num(promedio, 0)}</>}
          {obj == null && promedio == null && !(previsto >= 1) && <>{lista.length} {lista.length === 1 ? (esGasto ? "gasto" : "ingreso") : (esGasto ? "gastos" : "ingresos")}</>}
        </div>
      </div>

      {falta.length > 0 && <>
        <div className="grupo-t"><span>{esGasto ? "Falta pagar" : "Falta cobrar"} · {falta.length}</span><span className="num">~{num(previsto, 0)}</span></div>
        <div className="caja lista">
          {falta.map(i => (
            <div key={i.rec.id + i.clave} className="fila">
              <button className="izq" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                <Dia dia={Number(i.fecha.slice(8))} abajo={mesCorto(i.fecha.slice(0, 7))} />
                <Puntito cat={cat} />
                <span style={{ minWidth: 0 }}><div>{i.rec.nombre}</div><div className="mini tenue">{d.cuentaPorId.get(i.rec.cuentaId)?.nombre}{i.rec.moneda !== "USD" ? ` · ${num(i.falta)} ${i.rec.moneda}` : ""}</div></span>
              </button>
              <span className="derecha">
                <div className="num tenue">~{num(enUsdI(i, i.falta), 0)}</div>
                <button className="btn1" style={{ padding: "3px 10px", fontSize: 13, marginTop: 3 }} onClick={() => nav.abrir({ p: "editor", recurrenteId: i.rec.id, periodo: i.clave, monto: i.estimado ? undefined : i.falta || undefined, fecha: fechaDePago(i) })}>{esGasto ? "Cargar" : "Cobrar"}</button>
              </span>
            </div>
          ))}
        </div>
      </>}

      {seis.some(x => x.v > 0) && <>
        <div className="grupo-t"><span>Los últimos 6 meses</span>{obj != null ? <span className="num">objetivo {num(obj)}</span> : promedio != null ? <span className="num">promedio {num(promedio, 0)}</span> : null}</div>
        <div className="caja">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
            {seis.map(({ p, v }) => {
              const ahora = p === periodo, linea = obj ?? promedio;
              return (
                <div key={p} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <small className="num tenue" style={{ fontSize: 12 }}>{v > 0 ? num(v, 0) : ""}</small>
                  <div style={{ position: "relative", height: H, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                    {linea != null && <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.round(linea / max * H), borderTop: "1px dashed #8E8BA3", zIndex: 1 }} />}
                    {ahora && previsto >= 1 && <i style={{ width: "62%", height: Math.round(previsto / max * H), background: `repeating-linear-gradient(-45deg, ${cat.color} 0 3px, transparent 3px 6px)`, borderRadius: "4px 4px 0 0", display: "block" }} />}
                    <i style={{ width: "62%", height: Math.max(v > 0 ? 2 : 0, Math.round(v / max * H)), background: ahora ? cat.color : "#3a3156", borderRadius: ahora && previsto >= 1 ? 0 : "4px 4px 0 0", display: "block" }} />
                  </div>
                  <small className="tenue" style={{ fontSize: 12 }}>{mesCorto(p)}</small>
                </div>
              );
            })}
          </div>
        </div>
      </>}

      {!lista.length && <div className="vacio">Nada en {tituloRango(vista, desde, hasta).toLowerCase()}.</div>}
      {porDia.map(([fecha, ms]) => (
        <div key={fecha}>
          <div className="grupo-t"><span>{Number(fecha.slice(8))} {mesCorto(fecha.slice(0, 7))} · {DIAS_CORTOS[aFecha(fecha).getDay()]}</span><span className="num">{esGasto ? "−" : "+"}{num(ms.reduce((s, m) => s + usdDe(m), 0))}</span></div>
          <div className="caja lista">
            {ms.map(m => {
              const cuenta = d.cuentaPorId.get(m.cuentaId);
              const queFue = m.comentario || m.etiquetas.join(", ");
              return (
                <button key={m.id} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "editor", id: m.id })}>
                  <span className="izq">
                    <Punto cat={cat} chico />
                    <span style={{ minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{queFue || cat.nombre}</div>
                      <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cuenta?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {cuenta?.nombre}{m.moneda !== "USD" ? ` · ${num(m.monto)} ${m.moneda}` : ""}</div>
                    </span>
                  </span>
                  <span className="derecha num">
                    <div className={m.tipo === "ingreso" ? "ok" : ""} style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                      {m.recurrenteId && rec.get(m.recurrenteId) && <T.IconRepeat size={13} className="viol" aria-label={`Pago de ${rec.get(m.recurrenteId)!.nombre}`} />}
                      {m.cuotas && m.cuotas > 1 ? <span className="mini" style={{ color: "var(--azul)" }}>{m.cuotas}×</span> : null}
                      <span>{m.tipo === "ingreso" ? "+" : ""}{m.usd != null ? num(m.usd) : "…"}</span>
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
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

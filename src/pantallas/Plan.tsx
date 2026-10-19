import { Fragment, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { leerDestinos, leerEtapa, type Etapa } from "../lib/finanzas";
import { PLAN, deDondeEntro, leerReparto, planDelMes, repartoValido, vivirPorCategoria, type PlanDelMes, type Reparto } from "../lib/plan";
import { guardarAjuste } from "../db";
import { Puntito, useToast } from "../ui/piezas";
import { nombreMes, periodoHoy, sumarMeses, mesCorto } from "../lib/fecha";
import { num } from "../lib/formato";
import { T } from "../ui/Icono";

/* El Plan (reglas del Plan): cómo se reparte lo que entra contra la distribución que
   querés. Vivir sale de la app; liquidez, inversión y deuda, de Finanzas por el buzón. */

type Clave = "vivir" | "liquidez" | "inversion" | "deuda";
const PARTES: { clave: Clave; nombre: string; color: string; gasto: boolean }[] = [
  { clave: "vivir", nombre: "Vivir", color: "#A78BFA", gasto: true },
  { clave: "liquidez", nombre: "Liquidez", color: "#93C5FD", gasto: false },
  { clave: "inversion", nombre: "Inversión", color: "#5DD39E", gasto: false },
  { clave: "deuda", nombre: "Deuda", color: "#F08A8A", gasto: true },
];
const SUB: [keyof typeof PLAN.vivirPartes, string][] = [["fijos", "Recurrentes"], ["variables", "No recurrentes"], ["sinCulpa", "Libre de culpa"], ["eventuales", "Eventuales"]];
const real = (p: PlanDelMes, k: Clave) => (k === "vivir" ? p.vivir.real : p[k]);

/** Los planes de los meses, con lo que mandó Finanzas. */
export function usePlanes(meses: string[]) {
  const d = useDatos();
  const destinos = useLiveQuery(leerDestinos, []);
  return useMemo(() => (!d.listo || !destinos ? null : meses.map(p => planDelMes(p, d.movimientos, d.categorias, d.recurrentes, destinos[p]))),
    [d, destinos, meses.join()]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** El reparto guardado (Más → Ordenar → Plan) o el de arranque. */
export const useReparto = () => useLiveQuery(leerReparto, []) ?? PLAN;

const pct = (x: number, de: number) => (de > 0 ? Math.round((x / de) * 100) : 0);

/** «◎ Plan: vivir 57% de 40 · inversión 41% de 40 ›», en la caja de arriba de Gastos. */
export function LineaPlan({ periodo }: { periodo: string }) {
  const nav = useNav();
  const R = useReparto();
  const planes = usePlanes([periodo]);
  if (!planes) return null;
  const p = planes[0];
  const texto = p.entro <= 0 ? "sin ingresos cargados este mes"
    : [`vivir ${pct(p.vivir.real, p.entro)}% de ${R.vivir}`, p.inversion != null && `inversión ${pct(p.inversion, p.entro)}% de ${R.inversion}`].filter(Boolean).join(" · ");
  return (
    <button style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "4px 2px" }} onClick={() => nav.abrir({ p: "plan", periodo })}>
      <span className="ok chico" style={{ flex: "none" }}>◎ Plan:</span>
      <span className="mini tenue" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
      <T.IconChevronRight size={16} className="tenue" style={{ flex: "none" }} />
    </button>
  );
}

/** Una barra con la meta marcada: la meta queda a 2/3 del ancho, así se ve cuánto te pasás. */
function BarraMeta({ valor, meta, color, fina }: { valor: number; meta: number; color: string; fina?: boolean }) {
  const rel = meta > 0 ? valor / meta : 0;
  return (
    <div className="barra" style={{ height: fina ? 5 : 7, margin: fina ? "5px 0 0" : "7px 0 0" }}>
      <i style={{ width: `${Math.min(100, (rel * 100) / 1.5)}%`, background: color }} />
      <s style={{ left: `${100 / 1.5}%` }} />
    </div>
  );
}

/** Bien, corto o pasado contra el plan: a menos del 10% del plan es bien; en lo que es
 *  gasto (Vivir, Deuda) pasarse es rojo; en lo que se guarda, quedarse corto es amarillo. */
function estado(r: number, meta: number, gasto: boolean): "" | "mal" | "ambar" {
  if (Math.abs(r - meta) <= meta * 0.1 + 0.5) return "";
  return gasto ? (r > meta ? "mal" : "") : r < meta ? "ambar" : "";
}

/* El Plan (reglas del Plan, simplificado en octubre 2026): arriba lo que entró y el
   reparto en una sola barra con las marcas del plan; cada parte en una fila cerrada que
   se abre ahí mismo para ver de qué está hecha y sus últimos 6 meses; la etapa abajo. */
export function PantallaPlan({ periodo: inicial }: { periodo?: string }) {
  const nav = useNav();
  const d = useDatos();
  const R = useReparto();
  const [periodo, setPeriodo] = useState(inicial ?? periodoHoy());
  const [abierta, setAbierta] = useState<Clave | "entro" | null>(null);
  const [verEtapa, setVerEtapa] = useState(false);
  const etapa = useLiveQuery(leerEtapa, []);
  const seis = useMemo(() => Array.from({ length: 6 }, (_, k) => sumarMeses(periodo, k - 5)), [periodo]);
  const planes = usePlanes(seis);
  if (!planes) return <div className="pantalla sin-tabs" />;
  const p = planes[planes.length - 1];
  const tocar = (k: Clave | "entro") => setAbierta(abierta === k ? null : k);
  const irA = (q: string) => { setPeriodo(q); setAbierta(null); };

  // La barra del reparto: cada parte por lo que fue (lo que falta de Finanzas no se dibuja).
  const partesBarra = PARTES.map(x => ({ x, v: Math.max(0, real(p, x.clave) ?? 0) }));
  const base = Math.max(p.entro, partesBarra.reduce((t, y) => t + y.v, 0));
  let acum = 0;
  const marcas = (["vivir", "liquidez", "inversion"] as Clave[]).map(k => (acum += R[k]));

  const detalle = (k: Clave) => {
    if (k === "vivir") {
      const meta = (p.entro * R.vivir) / 100;
      return <>
        <div className="sub" style={{ marginLeft: 0 }}>
          {SUB.map(([sk, n]) => {
            const m = (meta * R.vivirPartes[sk]) / 100, v = p.vivir[sk], ps = v > m;
            return (
              <div key={sk}>
                <div className="fila" style={{ padding: 0 }}><span className="chico">{n} <span className="mini tenue">· plan {R.vivirPartes[sk]}%</span></span><span className={`num chico ${ps ? "mal" : ""}`}>{num(v, 0)}</span></div>
                <BarraMeta valor={v} meta={m} color={ps ? "var(--mal)" : "#6D5BB8"} fina />
              </div>
            );
          })}
        </div>
        <div className="mini tenue" style={{ margin: "12px 0 4px" }}>Lo que más pesa</div>
        <div className="calc">
          {vivirPorCategoria(periodo, d.movimientos, d.categorias).map(c => <Fragment key={c.cat?.id ?? "?"}><span><Puntito cat={c.cat ?? { color: "var(--tenue)" }} /> {c.cat?.nombre ?? "Sin categoría"}</span><span className="num">{num(c.usd, 0)}</span></Fragment>)}
        </div>
      </>;
    }
    if (k === "liquidez") {
      if (p.inversion == null) return <div className="mini tenue">Se calcula cuando Finanzas manda la inversión y la deuda del mes.</div>;
      return p.liquidezCalculada
        ? <>
          <div className="calc">
            <span className="tenue">Entró</span><span className="num">{num(p.entro, 0)}</span>
            <span className="tenue">− Vivir</span><span className="num">{num(p.vivir.real, 0)}</span>
            <span className="tenue">− Inversión</span><span className="num">{num(p.inversion, 0)}</span>
            <span className="tenue">− Deuda</span><span className="num">{num(p.deuda ?? 0, 0)}</span>
            <span className="r">Lo que quedó</span><span className="num r">{num(p.liquidez ?? 0, 0)}</span>
          </div>
          <div className="mini tenue" style={{ marginTop: 6 }}>Mientras no tengas una cuenta aparte para la liquidez, es lo que quedó.</div>
        </>
        : <div className="calc">
          <span className="tenue">A la cuenta de liquidez (Finanzas)</span><span className="num">{num(p.liquidez ?? 0, 0)}</span>
          {p.quedo != null && <><span className="tenue">Quedó en las cuentas</span><span className="num">{num(p.quedo, 0)}</span></>}
        </div>;
    }
    if (k === "inversion") return p.inversion == null
      ? <div className="mini tenue">Todavía no llegó de Finanzas.</div>
      : <><div className="calc"><span className="tenue">Lo que mandó Finanzas</span><span className="num">{num(p.inversion, 0)}</span></div><div className="mini tenue" style={{ marginTop: 6 }}>Nexo, Invertir Online y lo que Finanzas llama inversión. El detalle está en Finanzas.</div></>;
    return <><div className="calc"><span className="tenue">{p.inversion == null ? "Categoría «Deuda» (app)" : "Préstamos (Finanzas)"}</span><span className="num">{num(p.deuda ?? 0, 0)}</span></div><div className="mini tenue" style={{ marginTop: 6 }}>Sin el pago de la tarjeta: esas compras ya cuentan en Vivir.</div></>;
  };

  // Los últimos 6 meses de una parte, en barritas con la marca del plan; tocar un mes va a ese mes.
  const meses = (k: Clave, color: string) => {
    const pcts = planes.map(q => { const r = real(q, k); return q.entro > 0 && r != null ? Math.max(0, (r / q.entro) * 100) : null; });
    const max = Math.max(R[k], ...pcts.map(x => x ?? 0)) * 1.25 || 1;
    const cerca = pcts.filter(x => x != null && Math.abs(x - R[k]) <= R[k] * 0.1 + 0.5).length, con = pcts.filter(x => x != null).length;
    return <>
      <div className="mini tenue" style={{ marginTop: 12 }}>Los últimos 6 meses</div>
      <div className="plan-meses">
        <em style={{ bottom: (R[k] / max) * 52 + 20 }} />
        {planes.map((q, i) => (
          <button key={q.periodo} onClick={() => irA(q.periodo)} aria-label={`Ir a ${nombreMes(q.periodo)}`}>
            {pcts[i] == null ? <b style={{ height: 2, background: "var(--linea-2)" }} /> : <b style={{ height: Math.max(2, (pcts[i]! / max) * 52), background: color, opacity: q.periodo === periodo ? 1 : 0.55 }} />}
            <span style={q.periodo === periodo ? { color: "var(--tinta)" } : undefined}>{mesCorto(q.periodo)}</span>
          </button>
        ))}
      </div>
      <div className="mini tenue" style={{ marginTop: 4 }}>la línea es el plan ({R[k]}%){con ? ` · ${cerca} de ${con} meses cerca` : ""}</div>
    </>;
  };

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Plan</h1></div>
      <div className="navega">
        <button aria-label="Mes anterior" onClick={() => irA(sumarMeses(periodo, -1))}><T.IconChevronLeft size={20} /></button>
        <button onClick={() => irA(periodoHoy())}><span style={{ color: "var(--tinta)" }}>{nombreMes(periodo)}</span></button>
        <button aria-label="Mes siguiente" onClick={() => irA(sumarMeses(periodo, 1))}><T.IconChevronRight size={20} /></button>
      </div>

      {/* Lo que entró: se toca para ver de dónde vino. */}
      <button style={{ margin: "12px 2px 6px", width: "100%", textAlign: "left" }} onClick={() => tocar("entro")}>
        <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(p.entro, 0)} <span className="chico tenue">USD entraron ›</span></div>
      </button>
      {abierta === "entro" && (
        <div className="caja" style={{ marginTop: 4 }}>
          {p.entro > 0
            ? <div className="calc">
              {deDondeEntro(periodo, d.movimientos, d.recurrentes).map(x => <Fragment key={x.nombre}><span className="tenue">{x.nombre}</span><span className="num">{num(x.usd, 0)}</span></Fragment>)}
              <span className="r">Entró</span><span className="num r">{num(p.entro, 0)}</span>
            </div>
            : <div className="mini tenue">Sin ingresos este mes.</div>}
          <div className="mini tenue" style={{ marginTop: 6 }}>La clínica llega de Finanzas; el resto lo cargás en la app.</div>
        </div>
      )}

      {/* El reparto en una sola barra, con las marcas blancas del plan. */}
      {p.entro > 0 && (
        <div style={{ margin: "2px 0 4px" }}>
          <div className="plan-marcas">{marcas.map(m => <s key={m} style={{ left: `calc(${(m * p.entro) / base}% - 1px)` }} />)}</div>
          <div className="plan-apilada">{partesBarra.filter(y => y.v > 0).map(y => <i key={y.x.clave} style={{ width: `${(y.v / base) * 100}%`, background: y.x.color }} />)}</div>
          <div className="plan-ley">{PARTES.map(x => { const r = real(p, x.clave); return <span key={x.clave}><i style={{ background: x.color }} />{x.nombre} {r == null ? "—" : `${pct(r, p.entro)}%`}</span>; })}</div>
          <div className="mini tenue" style={{ marginTop: 6 }}>las marcas blancas son tu plan: {R.vivir} · {R.liquidez} · {R.inversion} · {R.deuda}</div>
        </div>
      )}

      {/* Cada parte, cerrada; se abre ahí mismo. */}
      <div className="caja lista" style={{ marginTop: 12 }}>
        {PARTES.map(x => {
          const r = real(p, x.clave), meta = (p.entro * R[x.clave]) / 100, abre = abierta === x.clave;
          const est = r == null || p.entro <= 0 ? "" : estado(r, meta, x.gasto);
          return (
            <div key={x.clave} className={abre ? "plan-abierta" : undefined}>
              <button className="fila" style={{ width: "100%", textAlign: "left", padding: "11px 0" }} onClick={() => tocar(x.clave)}>
                <span className="izq"><Puntito cat={{ color: x.color }} /><span><div>{x.nombre}</div><div className="mini tenue">{r == null ? "—" : <span className={est}>{pct(r, p.entro)}%</span>} · plan {R[x.clave]}</div></span></span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="num">{r == null ? "—" : num(r, 0)}</span>
                  <T.IconChevronRight size={16} className="tenue" style={{ transform: abre ? "rotate(90deg)" : undefined }} />
                </span>
              </button>
              {abre && <div style={{ paddingBottom: 12 }}>{detalle(x.clave)}{meses(x.clave, x.color)}</div>}
            </div>
          );
        })}
      </div>
      {p.inversion == null && p.entro > 0 && <div className="mini tenue" style={{ margin: "2px 2px 0" }}>Inversión y deuda llegan de Finanzas.</div>}

      {/* La etapa, abajo y chica; se toca para ver la barra (regla de la etapa). */}
      {etapa && <>
        <button className="fila" style={{ width: "100%", textAlign: "left", marginTop: 10, padding: "10px 2px" }} onClick={() => setVerEtapa(!verEtapa)}>
          <span className="mini"><span className="azul">◆</span> <span className="tenue">Etapa:</span> {etapa.nombre.toLowerCase()}{etapa.meses != null && etapa.objetivo ? ` · ${num(etapa.meses, 1)} de ${num(etapa.objetivo, 0)} meses de vida` : ""}</span>
          <T.IconChevronRight size={16} className="tenue" style={{ transform: verEtapa ? "rotate(90deg)" : undefined }} />
        </button>
        {verEtapa && <CajaEtapa />}
      </>}
    </div>
  );
}

/** La etapa de la cascada que manda Finanzas, en su caja arriba de las partes (regla de
 *  la etapa): el nombre, cuántos meses de vida llevás de los que pide, y una barrita por
 *  mes. Si Finanzas no la manda, no se muestra. */
function CajaEtapa() {
  const etapa = useLiveQuery(leerEtapa, []);
  if (!etapa) return null;
  const { nombre, texto, meses, objetivo } = etapa as Etapa;
  const conMeses = meses != null && objetivo != null && objetivo > 0;
  const barritas = conMeses ? Math.min(12, Math.ceil(objetivo!)) : 0;
  return (
    <div className="caja" style={{ marginTop: 4 }}>
      <div className="fila" style={{ padding: 0, alignItems: "flex-start" }}>
        <span><div className="mini tenue">Etapa de la cascada</div><div>{nombre}</div></span>
        {conMeses && <span className="derecha"><div className="num">{num(meses!, 1)} <span className="tenue chico">de {num(objetivo!, 0)}</span></div><div className="mini tenue">meses de vida</div></span>}
      </div>
      {conMeses && (
        <div className="etapa-meses" aria-hidden="true">
          {Array.from({ length: barritas }, (_, k) => <i key={k}><b style={{ width: `${Math.max(0, Math.min(1, (meses! / objetivo!) * barritas - k)) * 100}%` }} /></i>)}
        </div>
      )}
      <div className="mini tenue" style={{ marginTop: 8 }}>{conMeses ? "Lo que guardás llena primero este balde." : texto}</div>
    </div>
  );
}

/* Configurar el Plan (Más → Ordenar → Plan): los porcentajes se escriben, y no se guarda
   hasta que las cuatro partes sumen 100 y las cuatro de Vivir también. */
export function EditorPlan() {
  const nav = useNav();
  const toast = useToast();
  const guardado = useLiveQuery(leerReparto, []);
  const [r, setR] = useState<Reparto | null>(null);
  const v = r ?? guardado;
  if (!v) return <div className="pantalla sin-tabs" />;
  const n = (txt: string) => Math.max(0, Math.min(100, Number(txt.replace(/\D/g, "")) || 0));
  const set = (k: "vivir" | "liquidez" | "inversion" | "deuda", txt: string) => setR({ ...v, [k]: n(txt) });
  const setSub = (k: keyof Reparto["vivirPartes"], txt: string) => setR({ ...v, vivirPartes: { ...v.vivirPartes, [k]: n(txt) } });
  const tot = v.vivir + v.liquidez + v.inversion + v.deuda, totV = Object.values(v.vivirPartes).reduce((a, b) => a + b, 0);
  const estado = (t: number) => t === 100 ? <span className="ok">suman 100%</span> : <span className="ambar">suman {t}%: {t < 100 ? `faltan ${100 - t}` : `sobran ${t - 100}`}</span>;
  const campo = (valor: number, cambiar: (t: string) => void, etiqueta: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input inputMode="numeric" value={valor} onChange={e => cambiar(e.target.value)} aria-label={etiqueta} className="num"
        style={{ width: 46, textAlign: "right", borderBottom: "1px solid var(--linea-2)", padding: "2px 0", fontSize: 17 }} />
      <span className="tenue">%</span>
    </span>
  );
  async function guardar() {
    if (!repartoValido(v!)) return;
    await guardarAjuste("plan", v);
    toast({ texto: "Plan guardado" });
    nav.volver();
  }
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Plan</h1></div>
      <div className="mini tenue" style={{ margin: "0 2px 4px" }}>Cómo querés repartir lo que entra cada mes.</div>
      <div className="grupo-t"><span>Lo que entra</span><span className="num mini">{estado(tot)}</span></div>
      <div className="caja lista">
        {PARTES.map(x => <div key={x.clave} className="fila"><span>{x.nombre}</span>{campo(v[x.clave], t => set(x.clave, t), x.nombre)}</div>)}
      </div>
      <div className="grupo-t"><span>Cómo se divide Vivir</span><span className="num mini">{estado(totV)}</span></div>
      <div className="caja lista">
        {SUB.map(([k, nombre]) => (
          <div key={k} className="fila">
            <span>{nombre} <span className="mini tenue">· {Math.round((v.vivir * v.vivirPartes[k]) / 10) / 10}% de lo que entra</span></span>
            {campo(v.vivirPartes[k], t => setSub(k, t), nombre)}
          </div>
        ))}
      </div>
      <div className="pie-fijo"><button className="btn" disabled={!repartoValido(v)} onClick={guardar}>Guardar</button></div>
    </div>
  );
}

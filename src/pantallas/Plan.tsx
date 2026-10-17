import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { leerDestinos } from "../lib/finanzas";
import { PLAN, leerReparto, planDelMes, repartoValido, type PlanDelMes, type Reparto } from "../lib/plan";
import { guardarAjuste } from "../db";
import { useToast } from "../ui/piezas";
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
const SUB: [keyof typeof PLAN.vivirPartes, string][] = [["fijos", "Fijos"], ["variables", "Variables"], ["sinCulpa", "Libre de culpa"], ["eventuales", "Eventuales"]];
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

export function PantallaPlan({ periodo: inicial }: { periodo?: string }) {
  const nav = useNav();
  const R = useReparto();
  const [periodo, setPeriodo] = useState(inicial ?? periodoHoy());
  const [parte, setParte] = useState<Clave>("vivir");
  const seis = useMemo(() => Array.from({ length: 6 }, (_, k) => sumarMeses(periodo, k - 5)), [periodo]);
  const planes = usePlanes(seis);
  if (!planes) return <div className="pantalla sin-tabs" />;
  const p = planes[planes.length - 1];
  const faltaFinanzas = p.inversion == null;
  const elegida = PARTES.find(x => x.clave === parte)!;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Plan</h1></div>
      <div className="navega">
        <button aria-label="Mes anterior" onClick={() => setPeriodo(sumarMeses(periodo, -1))}><T.IconChevronLeft size={20} /></button>
        <button onClick={() => setPeriodo(periodoHoy())}><span style={{ color: "var(--tinta)" }}>{nombreMes(periodo)}</span></button>
        <button aria-label="Mes siguiente" onClick={() => setPeriodo(sumarMeses(periodo, 1))}><T.IconChevronRight size={20} /></button>
      </div>

      <div style={{ margin: "12px 2px 6px" }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{num(p.entro, 0)} <span className="chico tenue">USD entraron</span></div>
        <div className="mini tenue" style={{ marginTop: 4 }}>
          {faltaFinanzas ? "inversión y deuda llegan de Finanzas"
            : p.entro <= 0 ? "sin ingresos este mes"
            : p.liquidezCalculada ? "la liquidez es lo que te quedó"
            : p.repartido == null ? "sin ingresos este mes"
            : p.repartido > 1.005 ? <>repartiste el <span className="ambar">{Math.round(p.repartido * 100)}%</span>: salió {num(p.entro * (p.repartido - 1), 0)} más de lo que entró</>
            : <>repartiste el {Math.round(p.repartido * 100)}%{p.repartido < 0.995 ? ` · quedan ${num(p.entro * (1 - p.repartido), 0)} sin repartir` : ""}</>}
        </div>
      </div>

      <div className="caja lista" style={{ marginTop: 14 }}>
        {PARTES.map(x => {
          const meta = (p.entro * R[x.clave]) / 100, r = real(p, x.clave);
          const pasa = x.gasto && r != null && r > meta;
          return (
            <div key={x.clave} style={{ padding: "10px 0", borderTop: x.clave === "vivir" ? undefined : "1px solid #1A1A24" }}>
              <div className="fila" style={{ padding: 0 }}>
                <span><div>{x.nombre}</div><div className="mini tenue">plan {R[x.clave]}% · {num(meta, 0)}{x.clave === "liquidez" && p.liquidezCalculada ? " · lo que quedó" : ""}</div></span>
                <span className="derecha">
                  {r == null ? <div className="tenue">—</div> : <>
                    <div className={`num ${pasa ? "mal" : ""}`}>{pct(r, p.entro)}%</div>
                    <div className="mini tenue num">{num(r, 0)}</div>
                  </>}
                </span>
              </div>
              {r != null && <BarraMeta valor={r} meta={meta} color={pasa ? "var(--mal)" : x.color} />}
              {x.clave === "vivir" && (
                <div style={{ margin: "8px 0 0 14px", paddingLeft: 10, borderLeft: "1px solid var(--linea-2)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {SUB.map(([k, n]) => {
                    const m = (meta * R.vivirPartes[k]) / 100, v = p.vivir[k], ps = v > m;
                    return (
                      <div key={k}>
                        <div className="fila" style={{ padding: 0 }}>
                          <span className="chico">{n} <span className="mini tenue">· plan {R.vivirPartes[k]}% · {num(m, 0)}</span></span>
                          <span className={`num chico ${ps ? "mal" : ""}`}>{num(v, 0)}</span>
                        </div>
                        <BarraMeta valor={v} meta={m} color={ps ? "var(--mal)" : "#6D5BB8"} fina />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mini tenue" style={{ margin: "2px 2px 0" }}>La marca blanca es la meta del plan.</div>

      {/* Mes a mes, de a una parte: cuánto debería haber sido y cuánto fue. */}
      <div className="grupo-t" style={{ marginTop: 28 }}><span>Mes a mes</span><span className="num">{elegida.nombre}: plan {R[parte]}%</span></div>
      <div className="pills" style={{ marginBottom: 8 }}>
        {PARTES.map(x => <button key={x.clave} className={`pill${x.clave === parte ? " on" : ""}`} onClick={() => setParte(x.clave)}>{x.nombre}</button>)}
      </div>
      <div className="caja">
        <table className="tabla-plan">
          <thead><tr><th>mes</th><th>debería</th><th>fue</th><th>diferencia</th></tr></thead>
          <tbody>
            {planes.map(q => {
              // Sin ingresos ese mes no hay contra qué comparar.
              if (q.entro <= 0) return <tr key={q.periodo}><td>{mesCorto(q.periodo)}</td><td colSpan={3} className="tenue">sin ingresos cargados</td></tr>;
              const deb = (q.entro * R[parte]) / 100, fue = real(q, parte);
              const dif = fue == null ? null : fue - deb;
              const color = dif == null ? "tenue" : Math.abs(dif) < deb * 0.1 ? "ok" : (elegida.gasto ? dif > 0 : dif < 0) ? (elegida.gasto ? "mal" : "ambar") : "ok";
              return (
                <tr key={q.periodo}>
                  <td>{mesCorto(q.periodo)}</td>
                  <td className="tenue">{num(deb, 0)}</td>
                  <td>{fue == null ? <span className="tenue">—</span> : <>{num(fue, 0)} <span className="mini tenue">({pct(fue, q.entro)}%)</span></>}</td>
                  <td className={color}>{dif == null ? "—" : `${dif >= 0 ? "+" : "−"}${num(Math.abs(dif), 0)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mini tenue" style={{ marginTop: 8 }}>
          «Debería» es el {R[parte]}% de lo que entró ese mes. {elegida.gasto ? "Rojo: te pasaste." : "Amarillo: pusiste menos de lo planeado."} Verde: a menos del 10% del plan.{!elegida.gasto && " «—»: Finanzas todavía no lo mandó."}{parte === "liquidez" && " Mientras no haya cuenta aparte, la liquidez es lo que quedó."}
        </div>
      </div>
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

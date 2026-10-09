import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { leerAjuste } from "../db";
import { useNav } from "../nav";
import { calcularInsights } from "../lib/insights";
import { mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num } from "../lib/formato";
import { Barra, Dia, GrupoT, Puntito, Punto } from "../ui/piezas";
import { T } from "../ui/Icono";

/** Se recalcula solo si cambian los datos o el mes, no en cada dibujo. */
export function useInsights(periodo: string) {
  const d = useDatos();
  const cache = useLiveQuery(() => leerAjuste<Record<string, number>>("cotizaciones", {}), []);
  return useMemo(() => (!d.listo || !cache ? null
    : calcularInsights(periodo, d.movimientos, d.categorias, d.cuentas, d.recurrentes, d.tasaRec, f => cache[`EUR|${f}`] ?? null, d.resumenesCargados)), [d, cache, periodo]);
}

const Num = ({ n }: { n: number }) => <span className="num">{num(n, 0)}</span>;
const veces = (a: number, b: number) => (b > 0 && a / b >= 1.5 ? `${num(a / b, a / b >= 3 ? 0 : 1)}× tu promedio` : null);

/* Reglas de Cómo venís: el título de cada parte afuera, con su número a la derecha;
   cada dato en su fila alineada; las suscripciones como en Recurrentes; y las
   aclaraciones detrás de un «?» en el título. */
function Parte({ titulo, derecha, ayuda, children }: { titulo: string; derecha?: React.ReactNode; ayuda?: string; children: React.ReactNode }) {
  return <><GrupoT titulo={titulo} derecha={derecha} ayuda={ayuda} /><div className="caja">{children}</div></>;
}
/** Filas alineadas dentro de una caja, separadas por una línea. */
const Filas = ({ children }: { children: React.ReactNode }) => <div className="filas">{children}</div>;
const Dato = ({ a, b }: { a: string; b: React.ReactNode }) => <div className="fila"><span className="tenue chico">{a}</span><span className="num chico derecha">{b}</span></div>;

export function ComoVenis({ periodo }: { periodo: string }) {
  const nav = useNav();
  const d = useDatos();
  const x = useInsights(periodo);
  if (!x) return <div className="pantalla sin-tabs" />;
  const { tarjeta: t, comprometido: c, suscripciones: s, cambios } = x;
  const enCurso = periodo === periodoHoy();
  const difTarjeta = t.anterior != null ? t.total - t.anterior : null;
  const mesSig = nombreMes(c.periodo, false);
  const susCat = d.categorias.find(k => k.nombre === "Suscripciones");

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Cómo venís · {nombreMes(periodo, false)}</h1></div>

      <Parte titulo="Tarjeta" derecha={<>{num(t.total, 0)} USD</>} ayuda="Lo que pagás con tarjeta sale el mes siguiente. El banco pasa los euros a dólares con una cotización peor que la oficial.">
        <div className="fila" style={{ padding: 0 }}><span className="chico">{t.pct}% de lo que gastaste en el mes</span><span className="mini tenue">mejor si baja</span></div>
        <Barra valor={t.pct / 100} />
        <Filas>
          <Dato a={`Contra ${nombreMes(sumarMeses(periodo, -1), false)}${enCurso ? " a esta altura" : ""}`} b={difTarjeta == null ? <span className="tenue">todavía sin comparar</span> : difTarjeta <= 0 ? <span className="ok">−{num(-difTarjeta, 0)} USD</span> : <span className="ambar">+{num(difTarjeta, 0)} USD</span>} />
          {t.categorias.length > 0 && <Dato a="Lo que más va a tarjeta" b={t.categorias.map(k => k.cat.nombre).join(", ")} />}
          <Dato a="Cuotas que siguen" b={<><Num n={t.cuotas} /> USD</>} />
          <Dato a="Te cobra el banco por el cambio" b={t.costoCambio ? <span className="ambar">~{num(t.costoCambio.pct, 1)}% · <Num n={t.costoCambio.usd} /> USD</span> : <span className="tenue">al subir el resumen</span>} />
        </Filas>
      </Parte>

      <Parte titulo={`${mesSig[0].toUpperCase()}${mesSig.slice(1)} ya comprometido`} derecha={<>~{num(c.total, 0)} USD</>}>
        <div className="mini tenue">con lo cargado hasta hoy</div>
        <Filas>
          <Dato a="Resúmenes de tarjeta" b={<Num n={c.tarjetas} />} />
          <Dato a="Recurrentes de tus cuentas" b={<Num n={c.recurrentes} />} />
          {c.entra > 0 && <Dato a="Entra fijo" b={<span className="ok">+<Num n={c.entra} /></span>} />}
        </Filas>
      </Parte>

      <Parte titulo="Suscripciones" derecha={<>{num(s.total, 0)} USD/mes</>} ayuda="«Previsto»: todavía no se cobró; va con su monto estimado.">
        <div className="fila" style={{ padding: 0 }}><span className="mini tenue">≈ {num(s.anual, 0)} USD por año</span>{s.promedio != null && veces(s.total, s.promedio) && <span className="ambar mini">{veces(s.total, s.promedio)}</span>}</div>
        {!s.items.length ? <div className="tenue chico" style={{ marginTop: 6 }}>No hay suscripciones este mes.</div> : (
          <Filas>
            {s.items.map(i => {
              const cta = d.cuentaPorId.get(i.cuentaId);
              return (
                <div key={i.nombre} className="fila">
                  <span className="izq"><Dia dia={Number(i.fecha.slice(8))} abajo={mesCorto(i.fecha.slice(0, 7))} /><Puntito cat={susCat} />
                    <span style={{ minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}{i.nueva && <span className="etiq e-pend" style={{ marginLeft: 6 }}>nueva</span>}</div>
                      <div className="mini tenue">{cta?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {cta?.nombre}{i.previsto ? " · previsto" : ""}</div>
                    </span>
                  </span>
                  <span className={`num derecha${i.previsto ? " tenue" : ""}`}>{i.previsto ? "~" : ""}{num(i.usd)}</span>
                </div>
              );
            })}
          </Filas>
        )}
      </Parte>

      <Parte titulo="Qué cambió contra tu promedio" derecha={cambios.length ? `${cambios.length} ${cambios.length === 1 ? "categoría" : "categorías"}` : undefined}
        ayuda="Solo lo que se movió bastante. Solo datos, sin juicios ni metas. Antes de septiembre los montos son aproximados (la app anterior no registraba la tarjeta).">
        <div className="mini tenue">contra tus 3 meses anteriores{enCurso ? ", a esta altura" : ""}</div>
        {!cambios.length ? <div className="tenue chico" style={{ marginTop: 6 }}>Nada cambió mucho: venís parecido a tu promedio.</div> : (
          <Filas>
            {cambios.map(k => (
              <div key={k.cat.id} className="fila">
                <span className="izq"><Punto cat={k.cat} chico /><span><div>{k.cat.nombre}</div><div className="mini tenue">promedio {num(k.promedio, 0)}</div></span></span>
                <span className={`num derecha ${k.dif > 0 ? "ambar" : "ok"}`}>{k.dif > 0 ? "+" : "−"}{num(Math.abs(k.dif), 0)}</span>
              </div>
            ))}
          </Filas>
        )}
      </Parte>
    </div>
  );
}

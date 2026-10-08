import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos } from "../datos";
import { leerAjuste } from "../db";
import { useNav } from "../nav";
import { calcularInsights } from "../lib/insights";
import { nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num } from "../lib/formato";
import { Barra, Punto } from "../ui/piezas";
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

export function ComoVenis({ periodo }: { periodo: string }) {
  const nav = useNav();
  const x = useInsights(periodo);
  if (!x) return <div className="pantalla sin-tabs" />;
  const { tarjeta: t, comprometido: c, suscripciones: s, cambios } = x;
  const enCurso = periodo === periodoHoy();
  const difTarjeta = t.anterior != null ? t.total - t.anterior : null;

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Cómo venís · {nombreMes(periodo, false)}</h1></div>

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span className="chico">1 · Tarjeta</span><span className="mini tenue">mejor si baja</span></div>
        <div className="fila" style={{ paddingBottom: 0 }}><span className="mediano"><Num n={t.total} /> <span className="chico tenue">USD</span></span><span className="ambar chico">{t.pct}% del mes</span></div>
        <Barra valor={t.pct / 100} />
        <div className="fila chico"><span className="tenue">Contra {nombreMes(sumarMeses(periodo, -1), false)}{enCurso ? " a esta altura" : ""}</span>
          <span>{difTarjeta == null ? <span className="tenue">todavía sin comparar</span> : difTarjeta <= 0 ? <span className="ok">−{num(-difTarjeta, 0)} USD</span> : <span className="ambar">+{num(difTarjeta, 0)} USD</span>}</span>
        </div>
        {t.categorias.length > 0 && <div className="fila chico" style={{ paddingTop: 0 }}><span className="tenue">Lo que más va a tarjeta</span><span>{t.categorias.map(k => k.cat.nombre).join(", ")}</span></div>}
        <div className="fila chico" style={{ paddingTop: 0 }}><span className="tenue">Cuotas que siguen</span><span><Num n={t.cuotas} /> USD</span></div>
        <div className="fila chico" style={{ paddingTop: 0 }}><span className="tenue">Te cobra el banco por el cambio</span>
          {t.costoCambio ? <span className="ambar">~{num(t.costoCambio.pct, 1)}% · <Num n={t.costoCambio.usd} /> USD</span> : <span className="tenue">al subir el resumen</span>}
        </div>
        <div className="mini tenue">Lo que pagás con tarjeta sale el mes siguiente. El banco pasa los euros a dólares con una cotización peor que la oficial.</div>
      </div>

      <div className="caja">
        <div className="chico">2 · {nombreMes(c.periodo, false)[0].toUpperCase() + nombreMes(c.periodo, false).slice(1)} ya comprometido</div>
        <div className="fila" style={{ paddingBottom: 0 }}><span className="mediano">~<Num n={c.total} /> <span className="chico tenue">USD</span></span><span className="tenue chico">con lo cargado hasta hoy</span></div>
        <div className="fila chico"><span className="tenue">Resúmenes de tarjeta</span><span><Num n={c.tarjetas} /></span></div>
        <div className="fila chico" style={{ paddingTop: 0 }}><span className="tenue">Recurrentes de tus cuentas</span><span><Num n={c.recurrentes} /></span></div>
        {c.entra > 0 && <div className="fila chico" style={{ paddingTop: 0 }}><span className="tenue">Entra fijo</span><span className="ok">+<Num n={c.entra} /></span></div>}
      </div>

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span className="chico">3 · Suscripciones</span>{s.promedio != null && veces(s.total, s.promedio) && <span className="ambar mini">{veces(s.total, s.promedio)}</span>}</div>
        <div className="fila" style={{ paddingBottom: 0 }}><span className="mediano"><Num n={s.total} /> <span className="chico tenue">USD/mes</span></span><span className="tenue chico">≈ <Num n={s.anual} /> por año</span></div>
        {s.items.map(i => (
          <div key={i.nombre} className="fila chico" style={{ padding: "3px 0" }}>
            <span>{i.nombre}{i.nueva && <span className="etiq e-pend" style={{ marginLeft: 6 }}>nueva</span>}{i.previsto && <span className="tenue mini"> · previsto</span>}</span><span className={`num${i.previsto ? " tenue" : ""}`}>{i.previsto ? "~" : ""}{num(i.usd, 0)}</span>
          </div>
        ))}
        {!s.items.length && <div className="tenue chico">No hay suscripciones este mes.</div>}
        {s.items.some(i => i.previsto) && <div className="mini tenue" style={{ marginTop: 4 }}>"Previsto": todavía no se cobró; va con su monto estimado.</div>}
      </div>

      <div className="caja">
        <div className="chico">4 · Qué cambió contra tu promedio</div>
        <div className="mini tenue" style={{ marginBottom: 4 }}>Contra los 3 meses anteriores{enCurso ? ", hasta el mismo día" : ""}. Solo lo que se movió bastante.</div>
        {!cambios.length && <div className="tenue chico">Nada cambió mucho: venís parecido a tu promedio.</div>}
        {cambios.map(k => (
          <div key={k.cat.id} className="fila chico">
            <span className="izq"><Punto cat={k.cat} chico /><span>{k.cat.nombre} <span className="tenue mini">· promedio {num(k.promedio, 0)}</span></span></span>
            <span className={`num ${k.dif > 0 ? "ambar" : "ok"}`}>{k.dif > 0 ? "+" : "−"}{num(Math.abs(k.dif), 0)}</span>
          </div>
        ))}
      </div>
      <div className="mini tenue centro">Solo datos, sin juicios ni metas. Antes de septiembre los montos son aproximados (la app anterior no registraba la tarjeta).</div>
    </div>
  );
}


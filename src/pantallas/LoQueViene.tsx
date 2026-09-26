import { useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { recurrentesDelMes } from "../lib/analisis";
import { fechaCorta, mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num, redondear } from "../lib/formato";
import { cuotasFuturas, resumenQueVence } from "../lib/tarjeta";
import type { EstadoInstancia } from "../lib/recurrentes";
import { Barra, Punto } from "../ui/piezas";
import { T } from "../ui/Icono";

const ETIQ: Record<EstadoInstancia["estado"], [string, string]> = {
  "cargado": ["e-ok", "cargado"], "parcial": ["e-parcial", "parcial"], "por-cargar": ["e-pend", "por cargar"], "proximo": ["e-prox", ""],
};

/* Todo lo que está por salir o entrar: los resúmenes de tarjeta (lo que compraste
   el mes anterior), los recurrentes y lo que falta de los pagos en partes. */
export function LoQueViene() {
  const d = useDatos();
  const nav = useNav();
  const [periodo, setPeriodo] = useState(periodoHoy());
  const tasa = (r: Parameters<typeof d.tasas.rec>[0]) => d.tasas.rec(r, d.cuentas);
  const aUsd = (i: EstadoInstancia, x: number) => { const t = tasa(i.rec); return t ? x / t : 0; };

  const tarjetas = d.cuentas.filter(c => c.esTarjeta && !c.archivada);
  // Lo que se paga este mes: el resumen de cada tarjeta que VENCE en este mes.
  const resumenes = tarjetas.map(c => resumenQueVence(c, d.movimientos, periodo)).filter(r => r.items.length);
  const insts = recurrentesDelMes(d.recurrentes, d.movimientos, periodo, tasa);
  const cat = new Map(d.categorias.map(c => [c.id, c]));

  const aPagar = redondear(resumenes.reduce((s, r) => s + r.total, 0) + insts.filter(i => i.rec.tipo === "gasto").reduce((s, i) => s + aUsd(i, i.falta), 0));
  const aCobrar = redondear(insts.filter(i => i.rec.tipo === "ingreso").reduce((s, i) => s + aUsd(i, i.falta), 0));

  // Suscripciones: los recurrentes mensuales fijos de la categoría Suscripciones.
  const subs = d.recurrentes.filter(r => r.activo && cat.get(r.categoriaId)?.nombre === "Suscripciones" && r.tipo === "gasto");
  const subsMes = redondear(subs.reduce((s, r) => { const t = tasa(r); const porMes = r.frecuencia === "anual" ? r.monto / 12 : r.frecuencia === "semanal" ? r.monto * 52 / 12 : r.monto; return s + (t ? porMes / t : 0); }, 0));

  const proximos = [0, 1, 2].map(i => {
    const p = sumarMeses(periodo, i);
    return { p, total: redondear(tarjetas.reduce((s, c) => s + resumenQueVence(c, d.movimientos, p).total, 0)) };
  });
  const maxProx = Math.max(1, ...proximos.map(x => x.total));
  const comprometido = redondear(tarjetas.flatMap(c => cuotasFuturas(c, d.movimientos, resumenQueVence(c, d.movimientos, periodo).periodo)).reduce((s, q) => s + q.usd, 0));
  const meses = Array.from({ length: 4 }, (_, i) => sumarMeses(periodoHoy(), i));

  return (
    <div className="pantalla">
      <div className="enc"><h1>Lo que viene</h1><button className="accion" aria-label="Recurrentes" onClick={() => nav.abrir({ p: "recurrentes" })}><T.IconRepeat size={22} /></button></div>
      <div className="pills scroll" style={{ marginBottom: 12 }}>
        {meses.map(p => <button key={p} className={`pill${p === periodo ? " on" : ""}`} onClick={() => setPeriodo(p)}>{nombreMes(p, false)}</button>)}
      </div>

      <div className="dos">
        <div className="caja"><div className="etq">A pagar en {nombreMes(periodo, false)}</div><div className="mediano num">{num(aPagar)} <span className="chico tenue">USD</span></div></div>
        <div className="caja"><div className="etq">A cobrar</div><div className="mediano num ok">{aCobrar ? `+${num(aCobrar)}` : "—"} {aCobrar ? <span className="chico tenue">USD</span> : null}</div></div>
      </div>

      {resumenes.length > 0 && <div className="titulo-sec"><span>Tarjetas</span></div>}
      {resumenes.map(r => (
        <button key={r.cuenta.id} className="caja" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "tarjeta", id: r.cuenta.id, periodo: r.periodo })}>
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><T.IconCreditCard size={18} /><span>Resumen {r.cuenta.nombre}</span></span>
            <span className="num">{num(r.total)} USD</span>
          </div>
          <div className="mini tenue" style={{ marginTop: 2 }}>
            cierra ~{fechaCorta(r.cierre, false)}{r.confirmado ? "" : " (sin confirmar)"} · vence ~{fechaCorta(r.vence, false)}
            {r.enCuotas > 0 && ` · ${num(r.enCuotas)} en cuotas`}
          </div>
          {r.items.slice(0, 3).map(q => (
            <div key={q.mov.id + q.numero} className="fila chico" style={{ padding: "3px 0" }}>
              <span className="tenue">{cat.get(q.mov.categoriaId)?.nombre}{q.mov.comentario ? ` · ${q.mov.comentario}` : ""} · {fechaCorta(q.mov.fecha, false)}{q.de > 1 ? ` · ${q.numero}/${q.de}` : ""}</span>
              <span className="num">{num(q.usd)}</span>
            </div>
          ))}
          {r.items.length > 3 && <div className="mini viol">+ {r.items.length - 3} más</div>}
        </button>
      ))}

      <div className="titulo-sec"><span>Recurrentes</span><button className="viol" onClick={() => nav.abrir({ p: "recurrente" })}>+ agregar</button></div>
      {!insts.length && <div className="caja tenue chico">No hay recurrentes para {nombreMes(periodo, false)}. Cargá el alquiler, las expensas o un ingreso fijo y te aviso cuando toque.</div>}
      {insts.length > 0 && (
        <div className="caja lista">
          {insts.map(i => {
            const [clase, texto] = ETIQ[i.estado];
            return (
              <button key={i.rec.id + i.clave} className="fila" style={{ width: "100%", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 2 }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Punto cat={cat.get(i.rec.categoriaId)} chico />
                  <span style={{ flex: 1 }}>{i.rec.nombre}</span>
                  {texto ? <span className={`etiq ${clase}`}>{texto}</span> : <span className="mini tenue">{fechaCorta(i.fecha)}</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 38 }} className="mini">
                  <span className="tenue">{fechaCorta(i.fecha, false)} · <span className={`etiq e-${i.rec.clase}`}>{i.rec.clase}</span>{i.rec.modo === "auto" ? " · se carga solo" : ""}</span>
                  <span className={`num ${i.rec.tipo === "ingreso" ? "ok" : ""}`}>
                    {i.estado === "parcial" ? <span className="ambar">faltan {num(i.falta)}</span> : <>{i.estimado ? "~" : ""}{i.rec.tipo === "ingreso" ? "+" : ""}{num(i.esperado)}</>} {i.rec.moneda}
                  </span>
                </div>
                {i.estado === "parcial" && <div style={{ paddingLeft: 38 }}><Barra valor={i.pagado / i.esperado} color="#60A5FA" /></div>}
              </button>
            );
          })}
        </div>
      )}

      {tarjetas.length > 0 && (
        <>
          <div className="titulo-sec"><span>Próximos resúmenes</span><span>Visa + Mastercard</span></div>
          <div className="caja">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 110 }}>
              {proximos.map(x => (
                <div key={x.p} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                  <div className="mini tenue centro num">{num(x.total)}</div>
                  <div style={{ height: `${(x.total / maxProx) * 80}%`, minHeight: 2, background: "var(--viol)", borderRadius: "4px 4px 0 0" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14 }} className="mini tenue">{proximos.map(x => <span key={x.p} style={{ flex: 1, textAlign: "center" }}>{mesCorto(x.p)}</span>)}</div>
            {comprometido > 0 && <div className="fila chico" style={{ paddingBottom: 0 }}><span className="tenue">Cuotas comprometidas después de {nombreMes(periodo, false)}</span><span className="num">{num(comprometido)} USD</span></div>}
          </div>
        </>
      )}

      {subs.length > 0 && (
        <div className="caja">
          <div className="fila" style={{ padding: 0 }}><span>Suscripciones</span><span className="num">{num(subsMes)} USD/mes</span></div>
          <div className="mini tenue">{num(subsMes * 12)} USD por año</div>
        </div>
      )}
    </div>
  );
}

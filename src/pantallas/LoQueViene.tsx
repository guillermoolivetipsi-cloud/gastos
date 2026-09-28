import { useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { aPagarTarjeta, descartesSet, porCargarDelMes, recurrentesDelMes } from "../lib/analisis";
import { cuotasFuturas, resumenQueVence } from "../lib/tarjeta";
import { fechaCorta, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num, redondear } from "../lib/formato";
import type { EstadoInstancia } from "../lib/recurrentes";
import { Barra, Punto, useToast } from "../ui/piezas";
import { descartar, marcarEnCero, vincular } from "../lib/acciones";
import { enUsdDe, fechaDePago, sugerirVinculos } from "../lib/recurrentes";
import { T } from "../ui/Icono";

/* Lo que está por salir o entrar, en dos pestañas:
   - Recurrentes: lo que se paga de tus cuentas este mes (con "Cargar" a mano), lo
     que va a la tarjeta (se paga con el resumen del mes siguiente, no se suma acá)
     y lo que ya pagaste.
   - Tarjetas: el resumen que vence este mes de cada tarjeta, estimado hasta que
     subas el PDF, y lo que se va juntando para el mes que viene. */

type Pestana = "recurrentes" | "tarjetas";

export function LoQueViene() {
  const d = useDatos();
  const nav = useNav();
  const [periodo, setPeriodo] = useState(nav.periodoViene ?? periodoHoy());
  const [pestana, setPestana] = useState<Pestana>("recurrentes");
  const meses = Array.from({ length: 4 }, (_, i) => sumarMeses(periodoHoy(), i - 1));
  if (!meses.includes(periodo)) meses.unshift(periodo);
  return (
    <div className="pantalla">
      <div className="enc"><h1>Lo que viene</h1></div>
      <div className="pills scroll" style={{ marginBottom: 10 }}>
        {meses.map(p => <button key={p} className={`pill${p === periodo ? " on" : ""}`} onClick={() => setPeriodo(p)}>{nombreMes(p, false)}</button>)}
      </div>
      <div className="solapas">
        <button className={pestana === "recurrentes" ? "on" : ""} onClick={() => setPestana("recurrentes")}>RECURRENTES</button>
        <button className={pestana === "tarjetas" ? "on" : ""} onClick={() => setPestana("tarjetas")}>TARJETAS</button>
      </div>
      {!d.listo ? null : pestana === "recurrentes" ? <Recurrentes periodo={periodo} /> : <Tarjetas periodo={periodo} />}
    </div>
  );
}

function Recurrentes({ periodo }: { periodo: string }) {
  const d = useDatos();
  const nav = useNav();
  const [verPagados, setVerPagados] = useState(false);
  const tasa = d.tasaRec;
  const enUsd = (i: EstadoInstancia, x: number) => { const t = tasa(i.rec); return t ? x / t : 0; };
  const cuenta = new Map(d.cuentas.map(c => [c.id, c]));
  const cat = new Map(d.categorias.map(c => [c.id, c]));
  const insts = recurrentesDelMes(d.recurrentes, d.movimientos, periodo, tasa);
  const conTarjeta = (i: EstadoInstancia) => !!cuenta.get(i.rec.cuentaId)?.esTarjeta;

  const deCuenta = insts.filter(i => i.rec.tipo === "gasto" && !conTarjeta(i));
  const aTarjeta = insts.filter(i => i.rec.tipo === "gasto" && conTarjeta(i));
  const ingresos = insts.filter(i => i.rec.tipo === "ingreso");
  const { todos: porPagar, vencidos } = porCargarDelMes(insts, d.cuentas);
  const pagados = deCuenta.filter(i => i.estado === "cargado");

  const total = redondear(deCuenta.reduce((s, i) => s + enUsd(i, i.esperado), 0));
  const totalTarjeta = redondear(aTarjeta.reduce((s, i) => s + enUsd(i, i.estado === "cargado" ? i.pagado : i.esperado), 0));
  const tarjetaPendientes = aTarjeta.filter(i => i.estado !== "cargado").length;
  const pagado = redondear(deCuenta.reduce((s, i) => s + enUsd(i, Math.min(i.pagado, i.esperado)), 0));

  const toast = useToast();
  const descartados = descartesSet(d.descartes);
  const sugeridos = sugerirVinculos(insts, d.movimientos, tasa, (m, r) => descartados.has(`vinc|${m}|${r}`));
  async function esEste(m: (typeof d.movimientos)[number], i: EstadoInstancia) {
    const deshacer = await vincular(m.id, i.rec.id, i.clave);
    toast({ texto: `Vinculado como pago de ${i.rec.nombre}`, deshacer });
  }
  async function enCero(i: EstadoInstancia) {
    await marcarEnCero(i.rec, i.clave, true);
    toast({ texto: `${i.rec.nombre}: este mes en 0`, deshacer: () => { marcarEnCero(i.rec, i.clave, false); } });
  }
  const monto = (i: EstadoInstancia) => `${i.estimado ? "~" : ""}${num(i.estado === "parcial" ? i.falta : i.esperado)} ${i.rec.moneda}`;
  /** "≈ X USD" debajo del monto, si está en otra moneda. */
  const usd = (i: EstadoInstancia, x = i.estado === "cargado" ? i.pagado : i.estado === "parcial" ? i.falta : i.esperado) => {
    const u = enUsdDe(i.rec, x, tasa(i.rec));
    return u != null ? <div className="mini tenue num">≈ {num(u, 0)} USD</div> : null;
  };
  const totalCobrar = redondear(ingresos.reduce((s, i) => s + enUsd(i, i.estado === "cargado" ? i.pagado : i.esperado), 0));
  const cargar = (i: EstadoInstancia) => nav.abrir({ p: "editor", recurrenteId: i.rec.id, periodo: i.clave, monto: i.estimado ? undefined : i.falta || undefined, fecha: fechaDePago(i) });

  if (!insts.length) return (
    <div className="vacio">
      No hay recurrentes en {nombreMes(periodo, false)}.
      <div style={{ marginTop: 12 }}><button className="btn1" onClick={() => nav.abrir({ p: "recurrente" })}>Agregar un recurrente</button></div>
    </div>
  );

  return (
    <>
      {deCuenta.length > 0 && (
        <div className="caja">
          <div className="fila" style={{ padding: 0 }}><span className="tenue chico">De tus cuentas en {nombreMes(periodo, false)}</span><span className="mediano num">{num(total, 0)} <span className="chico tenue">USD</span></span></div>
          <Barra valor={total ? pagado / total : 0} color="#60A5FA" />
          <div className="fila mini" style={{ padding: 0 }}><span className="tenue">pagado {num(pagado, 0)}</span>{porPagar.length > 0 ? <span className="ambar">{porPagar.length} por cargar{vencidos.length && vencidos.length < porPagar.length ? ` (${vencidos.length} ${vencidos.length === 1 ? "vencido" : "vencidos"})` : ""}</span> : <span className="ok">todo pagado</span>}</div>
          {aTarjeta.length > 0 && (
            <div className="fila chico sep" style={{ paddingBottom: 0, marginTop: 6 }}>
              <span className="tenue"><T.IconCreditCard size={13} style={{ verticalAlign: -2 }} /> Con tarjeta: {aTarjeta.length} {tarjetaPendientes ? `(${tarjetaPendientes} por cobrar)` : "(ya cobrados)"}</span>
              <span className="num">~{num(totalTarjeta, 0)} USD</span>
            </div>
          )}
        </div>
      )}

      {porPagar.length > 0 && <div className="titulo-sec"><span>Por pagar de tus cuentas</span><span>{porPagar.length}</span></div>}
      {porPagar.length > 0 && (
        <div className="caja lista">
          {porPagar.map(i => {
            const ya = sugeridos.get(i.rec.id + i.clave);
            return (
            <div key={i.rec.id + i.clave}>
            <div className="fila">
              <button className="izq" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                <Punto cat={cat.get(i.rec.categoriaId)} chico />
                <span>
                  <div>{i.rec.nombre}</div>
                  <div className="mini tenue">{fechaCorta(i.fecha, false)} · {cuenta.get(i.rec.cuentaId)?.nombre}{i.estado === "parcial" ? <span className="ambar"> · parcial</span> : ""}</div>
                </span>
              </button>
              <span className="derecha">
                <div className="num chico">{monto(i)}</div>
                {usd(i)}
                <span style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 3 }}>
                  <button className="btn2" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => enCero(i)}>Fue 0</button>
                  <button className="btn1" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => cargar(i)}>Cargar</button>
                </span>
              </span>
            </div>
            {ya && (
              <div className="caja sug" style={{ margin: "0 0 8px", padding: "8px 10px" }}>
                <div className="mini">¿Ya lo cargaste? <span className="tenue">{fechaCorta(ya.fecha, false)} · {cat.get(ya.categoriaId)?.nombre}{ya.comentario ? ` · ${ya.comentario}` : ""} · {num(ya.monto)} {ya.moneda}</span></div>
                <div className="botones" style={{ marginTop: 6 }}>
                  <button className="btn1" style={{ padding: "4px 8px" }} onClick={() => esEste(ya, i)}>Es este</button>
                  <button className="btn2" style={{ padding: "4px 8px" }} onClick={() => descartar(`vinc|${ya.id}|${i.rec.id}`)}>No</button>
                </div>
              </div>
            )}
            </div>
          );})}
        </div>
      )}

      {aTarjeta.length > 0 && (
        <>
          <div className="titulo-sec"><span>Van a la tarjeta</span><span>{aTarjeta.length}</span></div>
          <div className="mini tenue" style={{ margin: "-4px 2px 8px" }}>Se pagan con el resumen de {nombreMes(sumarMeses(periodo, 1), false)}: no se suman acá.</div>
          <div className="caja lista">
            {aTarjeta.map(i => (
              <button key={i.rec.id + i.clave} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                <span className="izq"><Punto cat={cat.get(i.rec.categoriaId)} chico /><span>
                  <div>{i.rec.nombre}</div>
                  <div className="mini tenue"><T.IconCreditCard size={11} style={{ verticalAlign: -1 }} /> {cuenta.get(i.rec.cuentaId)?.nombre} · {fechaCorta(i.fecha, false)}</div>
                </span></span>
                <span className="derecha num chico">{i.estado === "cargado" ? <span className="ok"><T.IconCheck size={13} style={{ verticalAlign: -2 }} /> {num(i.pagado)} {i.rec.moneda}</span> : monto(i)}{usd(i)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {ingresos.length > 0 && (
        <>
          <div className="titulo-sec"><span>A cobrar</span><span className="ok num">+{num(totalCobrar, 0)} USD</span></div>
          <div className="caja lista">
            {ingresos.map(i => (
              <div key={i.rec.id + i.clave} className="fila">
                <button className="izq" style={{ textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                  <Punto cat={cat.get(i.rec.categoriaId)} chico />
                  <span><div>{i.rec.nombre}</div><div className="mini tenue">{fechaCorta(i.fecha, false)} · {cuenta.get(i.rec.cuentaId)?.nombre}</div></span>
                </button>
                <span className="derecha">
                  {i.estado === "cargado"
                    ? <div className="ok num chico">{i.cero ? "0 · no se cobró" : `+${num(i.pagado)} ${i.rec.moneda}`}</div>
                    : <div className="num chico">+{monto(i)}</div>}
                  {!i.cero && usd(i)}
                  {i.estado !== "cargado" && (
                    <span style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 3 }}>
                      <button className="btn2" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => enCero(i)}>Fue 0</button>
                      <button className="btn1" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => cargar(i)}>Cargar</button>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <button className="mini viol" style={{ margin: "-4px 2px 0" }} onClick={() => nav.abrir({ p: "recurrente", tipo: "ingreso" })}>+ Agregar ingreso</button>
        </>
      )}

      {pagados.length > 0 && (
        <>
          <button className="titulo-sec" style={{ width: "100%" }} onClick={() => setVerPagados(!verPagados)}>
            <span>Ya pagados ({pagados.length})</span>{verPagados ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
          </button>
          {verPagados && (
            <div className="caja lista">
              {pagados.map(i => (
                <button key={i.rec.id + i.clave} className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
                  <span className="izq"><Punto cat={cat.get(i.rec.categoriaId)} chico /><span>{i.rec.nombre}</span></span>
                  {i.cero ? <span className="tenue chico">0 · no se pagó</span> : <span className="ok num chico"><T.IconCheck size={13} style={{ verticalAlign: -2 }} /> {num(i.pagado)} {i.rec.moneda}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="botones" style={{ marginTop: 16 }}>
        <button className="btn2" onClick={() => nav.abrir({ p: "recurrentes" })}>Ver todos</button>
        <button className="btn2" onClick={() => nav.abrir({ p: "recurrente", tipo: "gasto" })}>+ Agregar</button>
      </div>
    </>
  );
}

function Tarjetas({ periodo }: { periodo: string }) {
  const d = useDatos();
  const nav = useNav();
  const tarjetas = d.cuentas.filter(c => c.esTarjeta && !c.archivada);
  const tasaR = d.tasaRec;
  const aPagar = tarjetas.map(c => aPagarTarjeta(c, d.movimientos, d.recurrentes, periodo, tasaR));
  const total = redondear(aPagar.reduce((s, x) => s + x.total, 0));
  const hayEstimados = aPagar.some(x => (x.resumen.items.length || x.insts.length) && !x.resumen.confirmado);
  const siguiente = sumarMeses(periodo, 1);
  const juntando = redondear(tarjetas.reduce((s, c) => s + aPagarTarjeta(c, d.movimientos, d.recurrentes, siguiente, tasaR).total, 0));

  if (!tarjetas.length) return <div className="vacio">No tenés tarjetas cargadas.</div>;
  return (
    <>
      <div className="caja">
        <div className="tenue chico">Tarjetas a pagar en {nombreMes(periodo, false)}</div>
        <div className="mediano num">{hayEstimados ? "~" : ""}{num(total, 0)} <span className="chico tenue">USD</span></div>
        {hayEstimados && <div className="mini tenue">Estimado con lo que cargaste. Se confirma al subir cada resumen.</div>}
      </div>

      {aPagar.map(({ resumen: r, insts, previsto, total: totalR, desde }) => {
        return (
          <div key={r.cuenta.id} className="caja">
            <div className="fila" style={{ padding: 0 }}>
              <span className="izq"><T.IconCreditCard size={18} /><span>{r.cuenta.nombre}</span></span>
              {r.items.length > 0 && <span className={`etiq ${r.confirmado ? "e-ok" : "e-pend"}`}>{r.confirmado ? "confirmado" : "estimado"}</span>}
            </div>
            {r.items.length === 0 && !insts.length ? <div className="tenue chico" style={{ marginTop: 6 }}>Nada para pagar en {nombreMes(periodo, false)}.</div> : (
              <>
                <div className="fila" style={{ paddingBottom: 0 }}>
                  <span className="mediano num">{r.confirmado ? "" : "~"}{num(totalR)} <span className="chico tenue">USD</span></span>
                  <span className="tenue chico">vence ~{fechaCorta(r.vence, false)}</span>
                </div>
                <div className="mini tenue">compras del {fechaCorta(desde, false)} al {fechaCorta(r.cierre, false)} · {r.items.length} consumos{r.enCuotas > 0 ? ` · ${num(r.enCuotas)} en cuotas` : ""}</div>
                {insts.length > 0 && (
                  <div className="sep" style={{ marginTop: 8, paddingTop: 6 }}>
                    <div className="mini tenue" style={{ marginBottom: 2 }}>Recurrentes de este resumen{previsto > 0 && !r.confirmado ? ` · ${num(previsto, 0)} USD previstos incluidos` : ""}</div>
                    {insts.map(i => (
                      <div key={i.rec.id + i.clave} className="fila mini" style={{ padding: "2px 0" }}>
                        <span>{i.estado === "cargado" ? <span className="ok"><T.IconCheck size={12} style={{ verticalAlign: -2 }} /> </span> : <span className="ambar">◷ </span>}{i.rec.nombre} <span className="tenue">· {fechaCorta(i.fecha, false)}</span></span>
                        <span className={`num ${i.estado === "cargado" ? "" : "tenue"}`}>{i.estado === "cargado" ? `${num(i.pagado)} ${i.rec.moneda}` : `previsto ~${num(i.esperado)} ${i.rec.moneda}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="botones">
              <button className="btn1" onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: r.cuenta.id })}>Subir resumen</button>
              <button className="btn2" onClick={() => nav.abrir({ p: "tarjeta", id: r.cuenta.id, periodo: r.periodo })}>Ver consumos</button>
            </div>
          </div>
        );
      })}

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span className="chico">Se va juntando para {nombreMes(siguiente, false)}</span><span className="num">{num(juntando, 0)} USD</span></div>
        <div className="mini tenue">Lo que compraste después del cierre, más cuotas.</div>
      </div>
      {(() => {
        const cuotas = redondear(tarjetas.flatMap(c => cuotasFuturas(c, d.movimientos, resumenQueVence(c, d.movimientos, periodo).periodo)).reduce((s, q) => s + q.usd, 0));
        return cuotas > 0 ? <div className="mini tenue centro">Cuotas comprometidas a futuro: {num(cuotas)} USD</div> : null;
      })()}
    </>
  );
}

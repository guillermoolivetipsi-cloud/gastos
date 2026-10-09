import { useState } from "react";
import { useDatos } from "../datos";
import { useNav } from "../nav";
import { aPagarTarjeta, descartesSet, porCargarDelMes, recurrentesDelMes } from "../lib/analisis";
import { cuotasFuturas } from "../lib/tarjeta";
import { fechaCorta, hoy, mesCorto, nombreMes, periodoHoy, sumarMeses } from "../lib/fecha";
import { num, redondear } from "../lib/formato";
import type { EstadoInstancia } from "../lib/recurrentes";
import { Dia, GrupoT, Montos, Puntito, textoOriginal, useToast } from "../ui/piezas";
import { descartar, vincular } from "../lib/acciones";
import { fechaDePago, sugerirVinculos } from "../lib/recurrentes";
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
  return (
    <div className="pantalla">
      <div className="enc"><h1>Lo que viene</h1></div>
      {/* El mes con flechas, como en Resumen (regla de orden). */}
      <div className="navega" style={{ marginBottom: 6 }}>
        <button aria-label="Mes anterior" onClick={() => setPeriodo(sumarMeses(periodo, -1))}><T.IconChevronLeft size={20} /></button>
        <button onClick={() => setPeriodo(periodoHoy())}><span style={{ color: "var(--tinta)" }}>{nombreMes(periodo)}</span></button>
        <button aria-label="Mes siguiente" onClick={() => setPeriodo(sumarMeses(periodo, 1))}><T.IconChevronRight size={20} /></button>
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

  const totalTarjeta = redondear(aTarjeta.reduce((s, i) => s + enUsd(i, i.estado === "cargado" ? i.pagado : i.esperado), 0));
  const tarjetaPendientes = aTarjeta.filter(i => i.estado !== "cargado").length;
  const pagado = redondear(deCuenta.reduce((s, i) => s + enUsd(i, i.pagado), 0));

  const toast = useToast();
  const descartados = descartesSet(d.descartes);
  const sugeridos = sugerirVinculos(insts, d.movimientos, tasa, (m, r) => descartados.has(`vinc|${m}|${r}`));
  async function esEste(m: (typeof d.movimientos)[number], i: EstadoInstancia) {
    const deshacer = await vincular(m.id, i.rec.id, i.clave);
    toast({ texto: `Vinculado como pago de ${i.rec.nombre}`, deshacer });
  }
  const totalCobrar = redondear(ingresos.reduce((s, i) => s + enUsd(i, i.estado === "cargado" ? i.pagado : i.esperado), 0));
  const cargar = (i: EstadoInstancia) => nav.abrir({ p: "editor", recurrenteId: i.rec.id, periodo: i.clave, monto: i.estimado ? undefined : i.falta || undefined, fecha: fechaDePago(i) });

  if (!insts.length) return (
    <div className="vacio">
      No hay recurrentes en {nombreMes(periodo, false)}.
      <div style={{ marginTop: 12 }}><button className="btn1" onClick={() => nav.abrir({ p: "recurrente" })}>Agregar un recurrente</button></div>
    </div>
  );

  // Una fila de recurrente, con las reglas de las listas: el día a la izquierda, los
  // dólares arriba, el estado como texto de color y una sola acción (Cargar / Cobrar).
  const fila = (i: EstadoInstancia, accion?: "Cargar" | "Cobrar") => {
    const c = cuenta.get(i.rec.cuentaId);
    const vencido = i.estado !== "cargado" && i.estado !== "proximo" && i.fecha <= hoy();
    const valor = i.estado === "cargado" ? i.pagado : i.estado === "parcial" ? i.falta : i.esperado;
    const t = tasa(i.rec);
    const ing = i.rec.tipo === "ingreso";
    return (
      <div className="fila">
        <button className="izq" style={{ textAlign: "left", flex: 1, minWidth: 0 }} onClick={() => nav.abrir({ p: "instancia", id: i.rec.id, clave: i.clave })}>
          <Dia dia={Number(i.fecha.slice(8))} abajo={mesCorto(i.fecha.slice(0, 7))} vencido={vencido} />
          <Puntito cat={cat.get(i.rec.categoriaId)} />
          <span style={{ minWidth: 0 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.rec.nombre}</div>
            <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c?.esTarjeta && <T.IconCreditCard size={12} style={{ verticalAlign: -2 }} />} {c?.nombre}{!i.cero && textoOriginal({ usd: t ? valor / t : null, monto: valor, moneda: i.rec.moneda, estimado: i.estimado, signo: ing ? "+" : "" })}
              {i.estado === "parcial" && <span className="ambar"> · parcial</span>}
              {vencido && i.estado !== "parcial" && <span className="mal"> · vencido</span>}
              {i.cero && <span> · fue 0</span>}
            </div>
          </span>
        </button>
        <span className="derecha">
          {i.cero ? <div className="tenue chico">0</div>
            : <Montos usd={t ? redondear(valor / t) : null} monto={valor} moneda={i.rec.moneda} estimado={i.estimado} signo={ing ? "+" : ""} clase={i.estado === "cargado" ? "ok" : ""} />}
          {accion && i.estado !== "cargado" && <button className="btn1" style={{ padding: "3px 10px", fontSize: 12, marginTop: 3 }} onClick={() => cargar(i)}>{accion}</button>}
        </span>
      </div>
    );
  };
  const porPagarUsd = redondear(porPagar.reduce((s, i) => s + enUsd(i, i.estado === "parcial" ? i.falta : i.esperado), 0));
  const aCobrar = redondear(ingresos.filter(i => i.estado !== "cargado").reduce((s, i) => s + enUsd(i, i.esperado - i.pagado), 0));

  return (
    <>
      {/* Tres números arriba: lo que falta pagar, lo pagado y lo que entra. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 4 }}>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">Por pagar</div>
          <div className="num" style={{ fontSize: 20, color: porPagarUsd > 0 ? "var(--ambar)" : undefined }}>{num(porPagarUsd, 0)}</div>
          <div className="mini tenue">{porPagar.length ? `${porPagar.length} · ` : ""}{vencidos.length ? <span className="mal">{vencidos.length} vencido{vencidos.length > 1 ? "s" : ""}</span> : "USD"}</div>
        </div>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">Pagado</div>
          <div className="num" style={{ fontSize: 20 }}>{num(pagado, 0)}</div>
          <div className="mini tenue">{porPagar.length ? "USD" : <span className="ok">todo pagado</span>}</div>
        </div>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">A cobrar</div>
          <div className="num ok" style={{ fontSize: 20 }}>{aCobrar ? `+${num(aCobrar, 0)}` : "0"}</div>
          <div className="mini tenue">USD</div>
        </div>
      </div>

      {porPagar.length > 0 && <div className="grupo-t"><span>Por pagar de tus cuentas · {porPagar.length}</span><span className="num">{num(porPagarUsd, 0)}</span></div>}
      {porPagar.length > 0 && (
        <div className="caja lista">
          {porPagar.map(i => {
            const ya = sugeridos.get(i.rec.id + i.clave);
            return (
            <div key={i.rec.id + i.clave}>
            {fila(i, "Cargar")}
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
          <div className="grupo-t"><span>Van a la tarjeta · {aTarjeta.length}</span><span className="num">~{num(totalTarjeta, 0)}</span></div>
          <div className="mini tenue" style={{ margin: "-4px 2px 8px" }}>Se pagan con el resumen de {nombreMes(sumarMeses(periodo, 1), false)}: no se suman acá.{tarjetaPendientes ? ` ${tarjetaPendientes} todavía sin cargar.` : ""}</div>
          <div className="caja lista">{aTarjeta.map(i => <div key={i.rec.id + i.clave}>{fila(i)}</div>)}</div>
        </>
      )}

      {ingresos.length > 0 && (
        <>
          <div className="grupo-t"><span>A cobrar</span><span className="ok num">+{num(totalCobrar, 0)}</span></div>
          <div className="caja lista">{ingresos.map(i => <div key={i.rec.id + i.clave}>{fila(i, "Cobrar")}</div>)}</div>
          <button className="mini viol" style={{ margin: "-4px 2px 0" }} onClick={() => nav.abrir({ p: "recurrente", tipo: "ingreso" })}>+ Agregar ingreso</button>
        </>
      )}

      {pagados.length > 0 && (
        <>
          <button className="grupo-t" style={{ width: "100%" }} onClick={() => setVerPagados(!verPagados)}>
            <span>Ya pagados ({pagados.length})</span>{verPagados ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
          </button>
          {verPagados && <div className="caja lista">{pagados.map(i => <div key={i.rec.id + i.clave}>{fila(i)}</div>)}</div>}
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
  const aPagar = tarjetas.map(c => aPagarTarjeta(c, d.movimientos, d.recurrentes, periodo, tasaR, d.resumenesCargados));
  const total = redondear(aPagar.reduce((s, x) => s + x.total, 0));
  const hayEstimados = aPagar.some(x => (x.resumen.items.length || x.insts.length) && !x.real);
  const siguiente = sumarMeses(periodo, 1);
  const juntando = redondear(tarjetas.reduce((s, c) => s + aPagarTarjeta(c, d.movimientos, d.recurrentes, siguiente, tasaR, d.resumenesCargados).total, 0));
  // Las mismas que "Cuotas que siguen" de Cómo venís: después del resumen que se junta.
  const cuotas = redondear(tarjetas.flatMap(c => cuotasFuturas(c, d.movimientos, periodo)).reduce((s, q) => s + q.usd, 0));

  if (!tarjetas.length) return <div className="vacio">No tenés tarjetas cargadas.</div>;
  return (
    <>
      {/* Tres números arriba: lo que se paga este mes, lo que se junta para el que viene
          y las cuotas que siguen después. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">A pagar en {mesCorto(periodo)}</div>
          <div className="num" style={{ fontSize: 20 }}>{hayEstimados ? "~" : ""}{num(total, 0)}</div>
          <div className="mini tenue">{hayEstimados ? "estimado" : "USD"}</div>
        </div>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">Se junta para {mesCorto(siguiente)}</div>
          <div className="num" style={{ fontSize: 20 }}>{num(juntando, 0)}</div>
          <div className="mini tenue">USD</div>
        </div>
        <div className="caja" style={{ padding: "8px 10px" }}>
          <div className="mini tenue">Cuotas después</div>
          <div className="num" style={{ fontSize: 20 }}>{num(cuotas, 0)}</div>
          <div className="mini tenue">USD</div>
        </div>
      </div>
      <div style={{ height: 10 }} />

      {aPagar.map(({ resumen: r, insts, previsto, real, total: totalR }) => {
        return (
          <div key={r.cuenta.id} className="caja">
            <div className="fila" style={{ padding: 0 }}>
              <span className="izq"><T.IconCreditCard size={18} /><span>{r.cuenta.nombre}</span></span>
              {r.items.length > 0 && <span className={`etiq ${real ? "e-ok" : "e-pend"}`}>{real ? "confirmado" : "estimado"}</span>}
            </div>
            {r.items.length === 0 && !insts.length ? <div className="tenue chico" style={{ marginTop: 6 }}>Nada para pagar en {nombreMes(periodo, false)}.</div> : (
              <>
                {/* Caja corta (regla de Tarjetas): el total grande y una línea; tocarla abre los consumos. */}
                <button style={{ width: "100%", textAlign: "left", marginTop: 8 }} onClick={() => nav.abrir({ p: "tarjeta", id: r.cuenta.id, periodo: r.periodo })}>
                  <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>{real ? "" : "~"}{num(totalR, 0)} <span className="chico tenue">USD</span></div>
                  <div className="mini tenue" style={{ marginTop: 4 }}>vence ~{fechaCorta(r.vence, false)} · {r.items.length} consumos ›</div>
                </button>
                {insts.length > 0 && (
                  <div className="sep" style={{ marginTop: 8, paddingTop: 6 }}>
                    <div className="mini tenue" style={{ marginBottom: 2 }}>Recurrentes de este resumen{previsto > 0 && !real ? ` · ${num(previsto, 0)} USD previstos incluidos` : ""}</div>
                    {insts.map(i => (
                      <div key={i.rec.id + i.clave} className="fila mini" style={{ padding: "2px 0" }}>
                        <span>{i.estado === "cargado" ? <span className="ok"><T.IconCheck size={12} style={{ verticalAlign: -2 }} /> </span> : <span className="ambar">◷ </span>}{i.rec.nombre} <span className="tenue">· {fechaCorta(i.fecha, false)}</span></span>
                        <span className={`num ${i.estado === "cargado" ? "" : "tenue"}`}>{i.estado === "cargado" ? (() => { const t = tasaR(i.rec); return t && i.rec.moneda !== "USD" ? `${num(i.pagado / t, 0)} USD` : `${num(i.pagado)} ${i.rec.moneda}`; })() : `${i.estado === "parcial" ? "falta" : "previsto"} ~${(() => { const t = tasaR(i.rec); return t && i.rec.moneda !== "USD" ? `${num(i.falta / t, 0)} USD` : `${num(i.falta)} ${i.rec.moneda}`; })()}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="botones">
              <button className="btn1" onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: r.cuenta.id })}><T.IconFileImport size={15} style={{ verticalAlign: -3 }} /> Subir resumen</button>
            </div>
          </div>
        );
      })}

      <GrupoT titulo={<span className="tenue" style={{ fontWeight: 400 }}>Qué es cada número</span>} ayuda={`"A pagar": ${hayEstimados ? "estimado con lo que cargaste; se confirma al subir cada resumen. " : ""}"Se junta": lo que compraste después del cierre, más cuotas. "Cuotas después": las que siguen en los resúmenes siguientes.`} />
    </>
  );
}

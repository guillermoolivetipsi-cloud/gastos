import { useEffect, useMemo, useRef, useState } from "react";
import { useDatos } from "../datos";
import { db, leerAjuste, nuevoId } from "../db";
import { useLiveQuery } from "dexie-react-hooks";
import { useNav, type Pantalla } from "../nav";
import { MONEDAS, type Cuenta, type Moneda, type Movimiento, type Tipo } from "../tipos";
import { eliminarMovimiento, guardarMovimiento } from "../lib/acciones";
import { recurrentesDelMes } from "../lib/analisis";
import { esClaro, nombraA, parecido } from "../lib/recurrentes";
import { fechaCorta, hoy, nombreMes, periodoDe, sumarDias, sumarMeses } from "../lib/fecha";
import { leerNumero, num, redondear } from "../lib/formato";
import { cuotasDe, esDudosa, resumenDe, vencimiento } from "../lib/tarjeta";
import { Hoja, Interruptor, Punto, Seg, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

type Props = Extract<Pantalla, { p: "editor" }>;

/** La cuenta de todos los días, la que se usa cuando no pagás con tarjeta. */
export function cuentaDiaria(cuentas: Cuenta[]) {
  const activas = cuentas.filter(c => !c.archivada && !c.esTarjeta);
  return activas.find(c => c.nombre === "Revolut") ?? activas[0];
}

export function Editor(props: Props) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const existente = props.id ? d.movimientos.find(m => m.id === props.id) : undefined;
  const cargado = useRef(false);

  const [tipo, setTipo] = useState<Tipo>(props.tipo ?? "gasto");
  const [montoTxt, setMontoTxt] = useState(props.monto ? String(props.monto).replace(".", ",") : "");
  const [moneda, setMoneda] = useState<Moneda>("EUR");
  const [cuentaId, setCuentaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fecha, setFecha] = useState(props.fecha ?? hoy());
  const [cuotas, setCuotas] = useState(1);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [comentario, setComentario] = useState("");
  const [vinculo, setVinculo] = useState<{ recurrenteId: string; periodo: string } | null>(props.recurrenteId ? { recurrenteId: props.recurrenteId, periodo: props.periodo! } : null);
  const [rechazados, setRechazados] = useState<string[]>([]);
  const [detalles, setDetalles] = useState(false);
  const [todas, setTodas] = useState(false);
  const [enPartes, setEnPartes] = useState(false);
  const [totalTxt, setTotalTxt] = useState("");
  const [nuevaEtq, setNuevaEtq] = useState<string | null>(null);
  const [otrasCuotas, setOtrasCuotas] = useState(false);
  const [otrasCuentas, setOtrasCuentas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cuentas = d.cuentas.filter(c => !c.archivada || c.id === cuentaId);
  const cuenta = d.cuentas.find(c => c.id === cuentaId);

  // Valores iniciales: al editar, los del movimiento; si es nuevo, la última cuenta
  // usada para ese tipo, o la del recurrente que estás pagando.
  useEffect(() => {
    if (cargado.current || !d.listo) return;
    cargado.current = true;
    if (existente) {
      setTipo(existente.tipo); setMontoTxt(String(existente.monto).replace(".", ",")); setMoneda(existente.moneda);
      setCuentaId(existente.cuentaId); setCategoriaId(existente.categoriaId); setFecha(existente.fecha);
      setCuotas(existente.cuotas ?? 1); setEtiquetas(existente.etiquetas); setComentario(existente.comentario ?? "");
      setVinculo(existente.recurrenteId ? { recurrenteId: existente.recurrenteId, periodo: existente.periodo! } : null);
      setDetalles(!!(existente.comentario || existente.etiquetas.length));
      return;
    }
    const rec = props.recurrenteId ? d.recurrentes.find(r => r.id === props.recurrenteId) : undefined;
    if (rec) {
      setTipo(rec.tipo); setCategoriaId(rec.categoriaId); setCuentaId(rec.cuentaId); setMoneda(rec.moneda); setComentario(rec.nombre);
      return;
    }
    // Nuevo: arranca "sin tarjeta" (la cuenta de todos los días) y en la moneda que
    // más usaste en el último mes.
    const desde = sumarDias(hoy(), -30);
    const uso = new Map<Moneda, number>();
    for (const m of d.movimientos) if (m.tipo === (props.tipo ?? "gasto") && m.fecha >= desde) uso.set(m.moneda, (uso.get(m.moneda) ?? 0) + 1);
    const masUsada = [...uso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const c = cuentaDiaria(d.cuentas);
    if (c) { setCuentaId(c.id); setMoneda(masUsada ?? c.moneda); }
  }, [d.listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = leerNumero(montoTxt);
  const tasa = d.tasas.de(moneda, cuenta?.dolar);
  const enUsd = tasa ? redondear(monto / tasa) : null;

  // Categorías: primero las que más usás para este tipo en los últimos 90 días.
  const cats = useMemo(() => {
    const desde = sumarDias(hoy(), -90);
    const uso = new Map<string, number>();
    for (const m of d.movimientos) if (m.tipo === tipo && m.fecha >= desde) uso.set(m.categoriaId, (uso.get(m.categoriaId) ?? 0) + 1);
    return d.categorias.filter(c => c.tipo === tipo && (!c.archivada || c.id === categoriaId))
      .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.orden - b.orden);
  }, [d.categorias, d.movimientos, tipo, categoriaId]);
  const visibles = todas ? cats : (() => {
    const top = cats.slice(0, 7);
    const sel = cats.find(c => c.id === categoriaId);
    return sel && !top.includes(sel) ? [...top.slice(0, 6), sel] : top;
  })();

  // Lo que más repetís (mismo comercio o categoría, mismo monto): se carga con un toque.
  const frecuentes = useMemo(() => {
    if (existente || props.recurrenteId) return [];
    const desde = sumarDias(hoy(), -60);
    const grupos = new Map<string, { m: Movimiento; n: number }>();
    for (const m of d.movimientos) {
      if (m.tipo !== "gasto" || m.fecha < desde || m.recurrenteId || (m.cuotas ?? 1) > 1) continue;
      const k = [m.categoriaId, (m.comentario ?? "").toLowerCase(), m.monto, m.moneda, m.cuentaId].join("|");
      const g = grupos.get(k);
      grupos.set(k, { m: !g || m.fecha > g.m.fecha ? m : g.m, n: (g?.n ?? 0) + 1 });
    }
    return [...grupos.values()].filter(g => g.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6).map(g => g.m);
  }, [d.movimientos, existente, props.recurrenteId]);

  async function repetir(m: Movimiento) {
    const nuevo = await guardarMovimiento({ tipo: "gasto", fecha, monto: m.monto, moneda: m.moneda, cuentaId: m.cuentaId, categoriaId: m.categoriaId, etiquetas: m.etiquetas, comentario: m.comentario }, d.cuentas.find(c => c.id === m.cuentaId));
    toast({ texto: `${m.comentario || d.categorias.find(c => c.id === m.categoriaId)?.nombre} guardado`, deshacer: () => { eliminarMovimiento(nuevo.id); } });
    nav.volver();
  }

  const ocultas = useLiveQuery(() => leerAjuste<string[]>("etiquetasOcultas", []), []) ?? [];
  const etiquetasUsadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const m of d.movimientos) for (const e of m.etiquetas) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).filter(e => !ocultas.includes(e)).slice(0, 14);
  }, [d.movimientos, ocultas]);

  // ¿Es parte de un recurrente que falta pagar? Mismo tipo y categoría, este mes o el anterior.
  // ¿Este gasto es el pago de un recurrente pendiente? Se busca el más parecido
  // (lo nombra en el comentario, misma categoría, monto cercano), este mes o el anterior.
  const candidato = useMemo(() => {
    if (vinculo || existente || (!categoriaId && !comentario.trim())) return null;
    const tasaR = (r: Parameters<typeof d.tasas.rec>[0]) => d.tasas.rec(r, d.cuentas);
    const p = periodoDe(fecha);
    const borrador = { id: "", tipo, fecha, monto: monto || 0, moneda, usd: enUsd, cuentaId, categoriaId, etiquetas: [], comentario, creado: "", modificado: "" } as Movimiento;
    const insts = [...recurrentesDelMes(d.recurrentes, d.movimientos, p, tasaR), ...recurrentesDelMes(d.recurrentes, d.movimientos, sumarMeses(p, -1), tasaR)]
      .filter(i => i.estado !== "cargado" && !rechazados.includes(i.rec.id + i.clave));
    let mejor: { i: (typeof insts)[number]; s: number } | null = null;
    for (const i of insts) {
      // Sin monto todavía, alcanza con la categoría o el nombre para sugerir.
      const sc = monto > 0 ? parecido({ ...borrador, fecha: i.fecha }, i, tasaR(i.rec)) : (nombraA(borrador, i.rec) ? 0 : i.rec.categoriaId === categoriaId && i.estado !== "proximo" ? 1 : null);
      if (sc != null && (!mejor || sc < mejor.s)) mejor = { i, s: sc };
    }
    return mejor?.i ?? null;
  }, [vinculo, categoriaId, comentario, fecha, tipo, monto, moneda, enUsd, cuentaId, d.recurrentes, d.movimientos, rechazados, existente]); // eslint-disable-line react-hooks/exhaustive-deps

  const recVinculado = vinculo ? d.recurrentes.find(r => r.id === vinculo.recurrenteId) : undefined;
  const esTarjeta = !!cuenta?.esTarjeta && tipo === "gasto";
  const puedeGuardar = monto > 0 && !!cuentaId && !!categoriaId && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    let v = vinculo;
    // Si no contestaste la pregunta pero la coincidencia es clara, se vincula igual.
    let autoVinculado: string | null = null;
    if (!v && candidato && monto > 0 && esClaro({ monto, moneda, comentario }, candidato)) {
      v = { recurrenteId: candidato.rec.id, periodo: candidato.clave };
      autoVinculado = `${candidato.rec.nombre} de ${candidato.clave.length === 7 ? nombreMes(candidato.clave, false) : fechaCorta(candidato.fecha)}`;
    }
    // "Pago en partes" de algo que no es recurrente: se crea un recurrente de una
    // sola vez con el total, y este es el primer pago.
    const total = leerNumero(totalTxt);
    if (enPartes && !v && total > monto) {
      const id = nuevoId();
      const cat = d.categorias.find(c => c.id === categoriaId);
      await db.recurrentes.add({
        id, nombre: comentario || cat?.nombre || "Gasto en partes", tipo, categoriaId, cuentaId, monto: total, moneda,
        clase: "fijo", frecuencia: "una-vez", dia: Number(fecha.slice(8)), inicio: fecha, modo: "avisar", activo: true,
      });
      v = { recurrenteId: id, periodo: periodoDe(fecha) };
    }
    await guardarMovimiento({
      id: existente?.id, tipo, fecha, monto, moneda, cuentaId, categoriaId, etiquetas,
      comentario: comentario.trim() || undefined,
      cuotas: esTarjeta && cuotas > 1 ? cuotas : undefined,
      recurrenteId: v?.recurrenteId, periodo: v?.periodo,
    }, cuenta);
    toast({ texto: autoVinculado ? `Guardado como pago de ${autoVinculado}` : existente ? "Cambios guardados" : tipo === "gasto" ? "Gasto guardado" : "Ingreso guardado" });
    nav.volver();
  }

  async function borrar() {
    if (!existente) return;
    const deshacer = await eliminarMovimiento(existente.id);
    toast({ texto: tipo === "gasto" ? "Gasto eliminado" : "Ingreso eliminado", deshacer });
    nav.volver();
  }

  const fechas = [hoy(), sumarDias(hoy(), -1), sumarDias(hoy(), -2)];

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Cerrar" onClick={nav.volver}><T.IconX size={22} /></button>
        <h1>{existente ? "Editar" : tipo === "gasto" ? "Nuevo gasto" : "Nuevo ingreso"}</h1>
        {existente && <button className="accion peligro" aria-label="Eliminar" onClick={borrar}><T.IconTrash size={21} /></button>}
      </div>

      <Seg opciones={[["gasto", "Gasto"], ["ingreso", "Ingreso"]]} valor={tipo} cambiar={t => { setTipo(t); setCategoriaId(""); setVinculo(null); }} />

      {tipo === "gasto" && frecuentes.length > 0 && !montoTxt && (
        <div style={{ marginTop: 10 }}>
          <div className="etq">Repetir con un toque{fecha !== hoy() ? ` (${fechaCorta(fecha, false)})` : ""}</div>
          <div className="pills scroll">
            {frecuentes.map(m => {
              const c = d.categorias.find(x => x.id === m.categoriaId);
              return (
                <button key={m.id} className="pill" onClick={() => repetir(m)}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c?.color ?? "#555", display: "inline-block" }} />
                  {m.comentario || c?.nombre} · {num(m.monto)} {m.moneda === "EUR" ? "€" : m.moneda === "ARS" ? "$" : "USD"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="monto-grande">
        <input inputMode="decimal" placeholder="0" value={montoTxt} autoFocus={!existente && !props.monto}
          onChange={e => setMontoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto" />
      </div>
      <div style={{ maxWidth: 240, margin: "0 auto 6px" }}>
        <Seg opciones={MONEDAS.map(m => [m, m] as [Moneda, string])} valor={moneda} cambiar={setMoneda} />
      </div>
      <div className="conversion num">
        {moneda === "USD" ? "" : monto > 0 ? (enUsd != null ? `≈ ${num(enUsd)} USD${moneda === "ARS" ? ` · dólar ${cuenta?.dolar ?? "blue"}` : ""}` : "se convierte al tener conexión") : ""}
      </div>

      {/* Lo único que importa elegir es si fue con tarjeta: cambia cuándo lo pagás.
          Las demás cuentas quedan en "otra cuenta". */}
      <div className="titulo-sec"><span>{tipo === "gasto" ? "Pagaste con" : "Entró en"}</span></div>
      <div className="pills">
        {(() => {
          const diaria = cuentaDiaria(d.cuentas);
          const tarjetas = tipo === "gasto" ? cuentas.filter(c => c.esTarjeta) : [];
          const otra = cuenta && !cuenta.esTarjeta && cuenta.id !== diaria?.id;
          return <>
            {diaria && <button className={`pill${cuentaId === diaria.id ? " on" : ""}`} onClick={() => { setCuentaId(diaria.id); setCuotas(1); }}>{tipo === "gasto" ? "Sin tarjeta" : diaria.nombre}</button>}
            {tarjetas.map(c => (
              <button key={c.id} className={`pill${c.id === cuentaId ? " on" : ""}`} onClick={() => setCuentaId(c.id)}><T.IconCreditCard size={14} />{c.nombre}</button>
            ))}
            <button className={`pill${otra ? " on" : ""}`} onClick={() => setOtrasCuentas(true)}>{otra ? cuenta!.nombre : "otra cuenta"}</button>
          </>;
        })()}
      </div>

      {esTarjeta && cuenta && (
        <div className="caja" style={{ marginTop: 10 }}>
          <div className="etq">Cuotas</div>
      <div className="pills">
            {[1, 3, 6, 12].map(n => <button key={n} className={`pill${cuotas === n ? " on" : ""}`} onClick={() => setCuotas(n)}>{n === 1 ? "1 pago" : n}</button>)}
            <button className={`pill${![1, 3, 6, 12].includes(cuotas) ? " on" : ""}`} onClick={() => setOtrasCuotas(true)}>{![1, 3, 6, 12].includes(cuotas) ? cuotas : "otra"}</button>
          </div>
          {(() => {
            const r = resumenDe(cuenta, fecha);
            const dudosa = esDudosa(cuenta, fecha);
            const qs = cuotasDe(cuenta, { usd: enUsd, monto, fecha, cuotas, tipo } as never);
            return (
              <div className="chico" style={{ marginTop: 6 }}>
                <div>Cuenta como gasto del <b style={{ fontWeight: 500 }}>{fechaCorta(fecha, false)}</b>.</div>
                <div className="tenue">
                  {cuotas === 1 ? <>Lo pagás en el resumen de {nombreMes(r, false)}, vence ~{fechaCorta(vencimiento(cuenta, r), false)}.</> :
                    <>{cuotas} cuotas de {num(qs[0].monto)} {moneda}, de {nombreMes(r, false)} a {nombreMes(qs[qs.length - 1].periodo, false)}.</>}
                  {dudosa && <span className="ambar"> Puede caer en el próximo resumen si la tarjeta cerró antes.</span>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="titulo-sec"><span>Categoría</span></div>
      <div className="cats">
        {visibles.map(c => (
          <button key={c.id} className={`cat${c.id === categoriaId ? " on" : ""}`} onClick={() => setCategoriaId(c.id)}>
            <Punto cat={c} /><span>{c.nombre}</span>
          </button>
        ))}
        {!todas && cats.length > 7 && (
          <button className="cat" onClick={() => setTodas(true)}><Punto icono="question-mark" color="#2A2A36" /><span>Todas</span></button>
        )}
      </div>

      {/* Etiquetas siempre a mano: las más usadas, y "+" para una nueva. */}
      <div className="titulo-sec"><span>Etiquetas</span></div>
      <div className="pills">
        {[...new Set([...etiquetas, ...etiquetasUsadas])].map(e => (
          <button key={e} className={`pill${etiquetas.includes(e) ? " on" : ""}`} onClick={() => setEtiquetas(x => x.includes(e) ? x.filter(y => y !== e) : [...x, e])}>{e}</button>
        ))}
        {nuevaEtq == null ? (
          <button className="pill" onClick={() => setNuevaEtq("")}><T.IconPlus size={14} /> etiqueta</button>
        ) : (
          <input className="pill" autoFocus value={nuevaEtq} placeholder="Nueva" style={{ width: 120 }}
            onChange={e => setNuevaEtq(e.target.value)}
            onBlur={() => { const t = nuevaEtq.trim(); if (t) setEtiquetas(x => [...new Set([...x, t])]); setNuevaEtq(null); }}
            onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        )}
      </div>

      {candidato && (
        <div className="caja sug">
          <div className="viol chico" style={{ display: "flex", gap: 6, alignItems: "center" }}><T.IconLink size={15} /> ¿Es parte de esto?</div>
          <div className="fila" style={{ padding: "6px 0 0" }}>
            <span>{candidato.rec.nombre} · {candidato.clave.length === 7 ? nombreMes(candidato.clave, false) : fechaCorta(candidato.fecha)}</span>
            <span className="ambar chico">{candidato.estado === "parcial" ? `faltan ${num(candidato.falta)}` : `~${num(candidato.esperado)}`} {candidato.rec.moneda}</span>
          </div>
          <div className="botones">
            <button className="btn1" onClick={() => {
              setVinculo({ recurrenteId: candidato.rec.id, periodo: candidato.clave });
              if (!montoTxt) setMontoTxt(String(candidato.estado === "parcial" ? candidato.falta : candidato.esperado).replace(".", ","));
              if (!comentario) setComentario(candidato.rec.nombre);
            }}>Sí</button>
            <button className="btn2" onClick={() => setRechazados(r => [...r, candidato.rec.id + candidato.clave])}>No</button>
          </div>
        </div>
      )}
      {recVinculado && (
        <div className="caja">
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><T.IconRepeat size={16} className="viol" /><span>{recVinculado.nombre} · {vinculo!.periodo.length === 7 ? nombreMes(vinculo!.periodo, false) : fechaCorta(vinculo!.periodo)}</span></span>
            <button className="tenue chico" onClick={() => setVinculo(null)}>quitar</button>
          </div>
        </div>
      )}

      <div className="titulo-sec"><span>Fecha</span></div>
      <div className="pills">
        {fechas.map((f, i) => <button key={f} className={`pill${fecha === f ? " on" : ""}`} onClick={() => setFecha(f)}>{["hoy", "ayer", "anteayer"][i]}</button>)}
        <label className={`pill${!fechas.includes(fecha) ? " on" : ""}`} style={{ position: "relative" }}>
          <T.IconCalendar size={15} />{!fechas.includes(fecha) ? fechaCorta(fecha, false) : "otro día"}
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0 }} aria-label="Elegir fecha" />
        </label>
      </div>

      <button className="titulo-sec" style={{ width: "100%" }} onClick={() => setDetalles(!detalles)}>
        <span>Más detalles</span>{detalles ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
      </button>
      {detalles && (
        <>
          <div className="campo"><label>Comentario</label><input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Verdulería, cena con amigos…" /></div>
          {tipo === "gasto" && !vinculo && !existente && (
            <>
              <div className="fila" style={{ marginTop: 6 }}>
                <span>Es una parte de un total más grande</span>
                <Interruptor on={enPartes} cambiar={setEnPartes} />
              </div>
              {enPartes && (
                <div className="campo">
                  <label>Total a pagar ({moneda})</label>
                  <input inputMode="decimal" value={totalTxt} onChange={e => setTotalTxt(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Ej: 478" />
                  {leerNumero(totalTxt) > monto && monto > 0 && <div className="mini tenue">Faltan {num(leerNumero(totalTxt) - monto)} {moneda}: te lo muestro en "Lo que viene".</div>}
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="pie-fijo"><button className="btn" disabled={!puedeGuardar} onClick={guardar}>{existente ? "Guardar cambios" : "Guardar"}</button></div>

      <Hoja abierta={otrasCuentas} cerrar={() => setOtrasCuentas(false)}>
        <h2>¿De qué cuenta?</h2>
        {cuentas.filter(c => !c.esTarjeta).map(c => (
          <button key={c.id} className="opcion" onClick={() => { setCuentaId(c.id); setMoneda(c.moneda); setCuotas(1); setOtrasCuentas(false); }}>
            <div className="fila" style={{ padding: 0 }}><span>{c.nombre}</span><span className="viol chico">{c.moneda}</span></div>
          </button>
        ))}
      </Hoja>

      <Hoja abierta={otrasCuotas} cerrar={() => setOtrasCuotas(false)}>
        <h2>¿En cuántas cuotas?</h2>
        <div className="pills">
          {[2, 4, 5, 9, 18, 24].map(n => <button key={n} className={`pill${cuotas === n ? " on" : ""}`} onClick={() => { setCuotas(n); setOtrasCuotas(false); }}>{n}</button>)}
        </div>
      </Hoja>
    </div>
  );
}

import { useState } from "react";
import { useDatos } from "../datos";
import { leerAjuste } from "../db";
import { useNav } from "../nav";
import type { Cuenta } from "../tipos";
import { conciliar, type Conciliacion, type Fila } from "../lib/conciliar";
import { aplicarResumen } from "../lib/aplicarResumen";
import { fechaCorta, mesCorto, nombreMes, periodoDe, sumarDias } from "../lib/fecha";
import { num } from "../lib/formato";
import { textoDePdf } from "../lib/pdf";
import { leerResumen, type Resumen } from "../lib/resumen-tarjeta";
import { Dia, GrupoT, useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/* Subir el PDF del resumen: se lee, se compara con lo cargado y se proponen los
   cambios. Nada se guarda hasta tocar "Guardar". Lo que no sabe categorizar, lo pregunta. */

export function SubirResumen({ cuentaId }: { cuentaId?: string }) {
  const d = useDatos();
  const nav = useNav();
  const toast = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resumen | null>(null);
  const [tarjetaId, setTarjetaId] = useState(cuentaId ?? "");
  const [cierre, setCierre] = useState("");
  const [vence, setVence] = useState("");
  const [conc, setConc] = useState<Conciliacion | null>(null);
  const [cats, setCats] = useState<Record<number, string>>({});
  const [aplicar, setAplicar] = useState<Record<number, boolean>>({});
  const [guardando, setGuardando] = useState(false);
  const tarjetas = d.cuentas.filter(c => c.esTarjeta && !c.archivada);
  const tarjeta = d.cuentas.find(c => c.id === tarjetaId);
  const catsGasto = d.categorias.filter(c => c.tipo === "gasto" && !c.archivada);

  async function leer(f: File | undefined) {
    if (!f) return;
    setError(null); setLeyendo(true); setConc(null);
    try {
      const r = leerResumen(await textoDePdf(new Uint8Array(await f.arrayBuffer())));
      if (!r.consumos.length) throw new Error("No encontré consumos en ese PDF. ¿Es el resumen de la tarjeta?");
      setRes(r);
      // La tarjeta desde la que viniste manda, salvo que su nombre sea de la otra marca.
      const marca = r.tarjeta.startsWith("Master") ? "master" : "visa", otra = marca === "visa" ? "master" : "visa";
      const elegida = tarjetas.find(c => c.id === tarjetaId);
      const t = elegida && !elegida.nombre.toLowerCase().includes(otra) ? elegida
        : tarjetas.find(c => c.nombre.toLowerCase().includes(marca)) ?? elegida;
      if (t) setTarjetaId(t.id);
      setCierre(r.cierre ?? "");
      setVence(r.vencimiento ?? "");
      if (t) await cruzar(r, t, r.cierre);
    } catch (e) { setError((e as Error).message); }
    setLeyendo(false);
  }

  async function cruzar(r: Resumen, t: Cuenta, fechaCierre: string | null) {
    const reglas = await leerAjuste<Record<string, string>>("reglasComercio", {});
    const fechas = r.consumos.map(c => c.fecha).sort();
    const desde = sumarDias(fechas[0], -3), hasta = sumarDias(fechaCierre ?? fechas[fechas.length - 1], 3);
    const c = conciliar(r.consumos, t, d.movimientos, reglas, desde, hasta);
    setConc(c);
    setCats(Object.fromEntries(c.filas.map((f, i) => [i, f.categoriaId ?? ""])));
    setAplicar(Object.fromEntries(c.filas.map((f, i) => [i, f.tipo !== "coincide"])));
  }

  const filas = conc?.filas ?? [];
  const faltan = filas.map((f, i) => [f, i] as [Fila, number]).filter(([f]) => f.tipo === "falta");
  const sinCategoria = faltan.filter(([, i]) => aplicar[i] && !cats[i]).length;

  async function guardar() {
    if (!conc || !tarjeta || !res || guardando) return;
    setGuardando(true);
    try {
      const { nuevos, corregidos: cambiados } = await aplicarResumen({ filas, aplicar, cats, tarjeta, cierre, vence, datos: d });
      toast({ texto: `Resumen guardado: ${nuevos} nuevos, ${cambiados} corregidos` });
      nav.volver();
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}. No se cambió nada.`);
    } finally {
      setGuardando(false);
    }
  }

  const etiqueta: Record<Fila["tipo"], string> = { coincide: "Ya cargados", "otra-cuenta": "Cargados en otra cuenta", moneda: "Cargados con la moneda equivocada", falta: "No están en la app", credito: "Devoluciones y bonificaciones" };
  const ayudas: Partial<Record<Fila["tipo"], string>> = {
    falta: `Se agregan como gastos de ${tarjeta?.nombre ?? "la tarjeta"}. La categoría queda aprendida para ese comercio.`,
    credito: `Se suman como ingreso de ${tarjeta?.nombre ?? "la tarjeta"}, en "Otros ingresos".`,
  };
  const [verYa, setVerYa] = useState(false);
  const fechaCh = (f: string) => f ? fechaCorta(f, false) : "elegir";
  // El monto del consumo en una línea: lo de la columna en dólares, o los pesos.
  const montoDe = (c: Fila["consumo"]) => c.columna === "ARS" ? `$ ${num(c.importe)}` : c.usd != null ? num(c.usd) : `${num(c.importe)} ${c.moneda}`;
  const original = (c: Fila["consumo"]) => c.columna === "ARS" ? "" : c.usd != null && c.moneda !== "USD" ? `${num(c.importe)} ${c.moneda}` : "";

  // Reglas de Subir el resumen: lo que hay que decidir primero, el día a la izquierda,
  // un solo monto (o antes → después) a la derecha y «se agrega / se corrige» para sacarlo.
  const fila = (f: Fila, i: number) => {
    const c = f.consumo;
    const cambio = f.tipo === "moneda" || f.tipo === "otra-cuenta";
    const antes = f.tipo === "moneda" && f.mov ? `${num(f.mov.monto)} ${f.mov.moneda}` : f.tipo === "otra-cuenta" && f.mov ? d.cuentas.find(x => x.id === f.mov!.cuentaId)?.nombre ?? "" : "";
    const despues = f.tipo === "moneda" ? `${num(c.importe)} ${c.moneda}` : tarjeta?.nombre ?? "";
    const gris = f.tipo === "moneda" ? `cambia la moneda${c.usd != null ? ` · ${num(c.usd)} USD` : ""}`
      : f.tipo === "otra-cuenta" ? `cambia la cuenta · ${montoDe(c)}`
      : f.tipo === "credito" ? "devolución · entra como ingreso"
      : original(c);
    const si = !!aplicar[i];
    return (
      <div key={i} className="fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 6, opacity: si || f.tipo === "coincide" ? 1 : .6 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Dia dia={Number(c.fecha.slice(8))} abajo={mesCorto(c.fecha.slice(0, 7))} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.comercio}</div>
            {gris && <div className="mini tenue" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gris}</div>}
          </span>
          <span className="derecha num">
            {cambio ? <span className="mini"><span className="tenue">{antes}</span> → {despues}</span>
              : f.tipo === "credito" ? <span className="ok">+{montoDe(c).replace("-", "").replace("−", "")}</span> : montoDe(c)}
          </span>
        </div>
        {f.tipo !== "coincide" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", paddingLeft: 42 }}>
            {f.tipo === "falta" && si ? (
              <select value={cats[i] ?? ""} onChange={e => setCats(x => ({ ...x, [i]: e.target.value }))}
                style={{ background: "var(--panel-2)", borderRadius: 8, padding: "6px 8px", color: cats[i] ? "var(--tinta)" : "var(--ambar)", minWidth: 0 }}
                aria-label={`Categoría de ${c.comercio}`}>
                <option value="">¿Qué categoría es?</option>
                {catsGasto.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            ) : <span />}
            <button className={`toggle ${si ? "si" : "no"}`} aria-pressed={si} onClick={() => setAplicar(a => ({ ...a, [i]: !a[i] }))}>
              {si ? (cambio ? "se corrige" : "se agrega") : "no"}
            </button>
          </div>
        )}
      </div>
    );
  };
  const grupoDe = (tipo: Fila["tipo"]) => filas.map((f, i) => [f, i] as [Fila, number]).filter(([f]) => f.tipo === tipo);
  const ya = grupoDe("coincide");

  return (
    <div className="pantalla sin-tabs">
      <div className="enc">
        <button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button>
        <h1>{res ? "Resumen" : "Subir resumen"}
          {res && (
            <select className="fecha-titulo" value={tarjetaId} aria-label="Tarjeta" style={{ appearance: "none", background: "none", border: 0, fontFamily: "inherit" }}
              onChange={e => { const t = tarjetas.find(x => x.id === e.target.value); if (t) { setTarjetaId(t.id); cruzar(res, t, cierre || null); } }}>
              {!tarjeta && <option value="">· elegir tarjeta ▾</option>}
              {tarjetas.map(t => <option key={t.id} value={t.id}>· {t.nombre} ▾</option>)}
            </select>
          )}
        </h1>
      </div>

      {!res && (
        <div className="caja">
          <div className="chico">Bajá el PDF del resumen desde el home banking y elegilo acá. Lo comparo con lo que cargaste y te muestro qué falta y qué corregir. No se guarda nada hasta que confirmes.</div>
          <label className="btn1" style={{ display: "block", marginTop: 10 }}>
            {leyendo ? "Leyendo el resumen…" : "Elegir el PDF del resumen"}
            <input type="file" hidden disabled={leyendo} onChange={e => { leer(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {error && <div className="mal chico" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {res && (
        <>
          {/* Un número y una línea (regla de Subir el resumen); las fechas se tocan para corregirlas. */}
          <div style={{ margin: "2px 2px 6px" }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1 }}>
              {num(res.sumaUsd)} <span className="chico tenue">USD</span>{res.sumaArs > 0 && <span className="chico tenue"> + $ {num(res.sumaArs)}</span>}
            </div>
            <div className="mini tenue" style={{ marginTop: 4 }}>
              {res.consumos.length} consumos
              {res.cuadra === true && <span className="ok"> · ✓ cuadra con el banco</span>}
              {res.cuadra === false && <span className="mal"> · no cuadra con el total</span>}
            </div>
            <div className="mini tenue">
              cierra <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>{fechaCh(cierre)} ▾<input type="date" value={cierre} aria-label="Cierre" onChange={e => setCierre(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }} /></label>
              {" · "}vence <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>{fechaCh(vence)} ▾<input type="date" value={vence} aria-label="Vencimiento" onChange={e => setVence(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }} /></label>
              {cierre && <> (resumen de {nombreMes(periodoDe(cierre), false)})</>}
            </div>
            {!res.cierre && <div className="mini ambar">No encontré las fechas en el PDF: completalas, así ubico bien cada compra.</div>}
          </div>

          {(["falta", "credito", "moneda", "otra-cuenta"] as const).map(tipo => {
            const grupo = grupoDe(tipo);
            if (!grupo.length) return null;
            return (
              <div key={tipo}>
                <GrupoT titulo={etiqueta[tipo]} derecha={grupo.length} ayuda={ayudas[tipo]} />
                <div className="caja lista">{grupo.map(([f, i]) => fila(f, i))}</div>
              </div>
            );
          })}

          {conc && conc.sobrantes.length > 0 && (
            <>
              <GrupoT titulo={`Cargados con ${tarjeta?.nombre ?? "la tarjeta"} que el resumen no trae`} derecha={conc.sobrantes.length} ayuda="Pueden caer en el próximo resumen, o haberse pagado con otra cuenta. Revisalos." />
              <div className="caja lista">
                {conc.sobrantes.map(m => (
                  <div key={m.id} className="fila">
                    <span className="izq"><Dia dia={Number(m.fecha.slice(8))} abajo={mesCorto(m.fecha.slice(0, 7))} /><span style={{ minWidth: 0 }}>{m.comentario || d.categorias.find(c => c.id === m.categoriaId)?.nombre}</span></span>
                    <span className="num derecha tenue">{num(m.monto)} {m.moneda}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {ya.length > 0 && (
            <>
              <button className="grupo-t" style={{ width: "100%", color: "var(--tenue)", fontWeight: 400 }} onClick={() => setVerYa(!verYa)}>
                <span><span className="ok">✓</span> {ya.length} ya cargados, coinciden</span>{verYa ? <T.IconChevronDown size={16} /> : <T.IconChevronRight size={16} />}
              </button>
              {verYa && <div className="caja lista">{ya.map(([f, i]) => fila(f, i))}</div>}
            </>
          )}

          {error && <div className="mal chico" style={{ marginTop: 10 }}>{error}</div>}
          <div className="pie-fijo">
            <button className="btn" disabled={!tarjeta || sinCategoria > 0 || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : sinCategoria > 0 ? `Falta la categoría de ${sinCategoria}` : "Guardar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

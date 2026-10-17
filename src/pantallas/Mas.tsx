import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatos, usePendientes } from "../datos";
import { leerAjuste } from "../db";
import { diasEntre, hoy } from "../lib/fecha";
import { useReparto } from "./Plan";
import { useNav, type Pantalla } from "../nav";
import { T } from "../ui/Icono";
import { useToast } from "../ui/piezas";
import { esApp } from "../lib/guardar";
import { ItemActualizar, useActualizacion } from "./Actualizaciones";

export function Mas() {
  return esApp() ? <MasConVersion /> : <Menu />;
}

/** En la app: si hay versión nueva, arriba; si no, buscarla se hace tocando la versión al pie. */
function MasConVersion() {
  const a = useActualizacion();
  const toast = useToast();
  const buscar = async () => { const n = await a.buscar(); if (!n) toast({ texto: `Tenés la última versión${a.version ? ` (${a.version})` : ""}` }); };
  return <Menu arriba={a.nueva ? <ItemActualizar a={a} /> : null}
    pie={<button disabled={a.buscando} onClick={buscar}>Gastos <b style={{ fontWeight: 500 }}>{a.version ?? ""}</b> · app de Android · <span className="viol">{a.buscando ? "buscando…" : "buscar actualización"}</span></button>} />;
}

/** El estado de cada cosa, en una línea gris debajo del nombre (regla de Más). */
function useEstados() {
  const d = useDatos();
  const p = usePendientes();
  const respaldo = useLiveQuery(() => leerAjuste<string | null>("ultimoRespaldo", null), []);
  const avisos = useLiveQuery(() => leerAjuste<boolean>("notificaciones", false), []);
  const reparto = useReparto();
  if (!d.listo) return null;
  const etiquetas = new Set(d.movimientos.flatMap(m => m.etiquetas)).size;
  const conObjetivo = d.categorias.filter(c => c.tipo === "gasto" && !c.archivada && c.objetivo).length;
  const activos = d.recurrentes.filter(r => r.activo && r.frecuencia !== "una-vez" && (!r.fin || r.fin >= hoy())).length;
  const cuentas = d.cuentas.filter(c => !c.archivada);
  const tarjetas = cuentas.filter(c => c.esTarjeta).length;
  const diasCopia = respaldo ? diasEntre(respaldo.slice(0, 10), hoy()) : null;
  return {
    revisar: p?.total ? `${p.total} ${p.total === 1 ? "pregunta" : "preguntas"}` : "nada pendiente",
    categorias: conObjetivo ? `${conObjetivo} con objetivo` : "sin objetivos",
    etiquetas: `${etiquetas} ${etiquetas === 1 ? "etiqueta" : "etiquetas"}`,
    recurrentes: `${activos} ${activos === 1 ? "activo" : "activos"}`,
    cuentas: `${cuentas.length - tarjetas} ${cuentas.length - tarjetas === 1 ? "cuenta" : "cuentas"} · ${tarjetas} ${tarjetas === 1 ? "tarjeta" : "tarjetas"}`,
    respaldo: diasCopia == null ? <span className="ambar">todavía no hiciste ninguna</span>
      : <span className={diasCopia > 30 ? "ambar" : ""}>última copia: {diasCopia === 0 ? "hoy" : diasCopia === 1 ? "ayer" : `hace ${diasCopia} días`}</span>,
    ajustes: avisos ? "avisos activados" : "avisos apagados",
    plan: `Vivir ${reparto.vivir} · Liquidez ${reparto.liquidez} · Inversión ${reparto.inversion} · Deuda ${reparto.deuda}`,
  };
}

function Menu({ arriba, pie = "Gastos · prueba en el navegador" }: { arriba?: ReactNode; pie?: ReactNode }) {
  const nav = useNav();
  const revisar = usePendientes()?.total ?? 0;
  const e = useEstados();
  const item = (p: Pantalla, icono: ReactNode, texto: string, estado?: ReactNode, extra?: ReactNode) => (
    <button className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir(p)}>
      <span className="izq"><span className="viol" style={{ display: "flex" }}>{icono}</span><span><div>{texto}</div>{estado && <div className="mini tenue">{estado}</div>}</span></span>
      {extra ?? <T.IconChevronRight size={18} className="tenue" />}
    </button>
  );
  // Reglas de Más: grupos con título, el estado de cada cosa en gris y al pie solo la versión.
  return (
    <div className="pantalla">
      <div className="enc"><h1>Más</h1></div>
      {arriba && <div className="caja lista">{arriba}</div>}
      <div className="caja lista">
        {item({ p: "revisar" }, <T.IconInbox size={20} />, "Para revisar", e?.revisar, revisar ? <span className="badge">{revisar}</span> : undefined)}
      </div>
      <div className="grupo-t"><span>Ordenar</span></div>
      <div className="caja lista">
        {item({ p: "categorias" }, <T.IconCategory size={20} />, "Categorías y objetivos", e?.categorias)}
        {item({ p: "plan-config" }, <T.IconTarget size={20} />, "Plan", e?.plan)}
        {item({ p: "etiquetas" }, <T.IconTag size={20} />, "Etiquetas", e?.etiquetas)}
        {item({ p: "recurrentes" }, <T.IconRepeat size={20} />, "Recurrentes", e?.recurrentes)}
        {item({ p: "cuentas" }, <T.IconBuildingBank size={20} />, "Cuentas y tarjetas", e?.cuentas)}
      </div>
      {/* Subir resumen está en cada tarjeta (Lo que viene) y el Excel, adentro de la copia (regla de simplificar). */}
      <div className="grupo-t"><span>Archivos</span></div>
      <div className="caja lista">
        {item({ p: "respaldo" }, <T.IconDatabaseExport size={20} />, "Copia de seguridad e importar", e?.respaldo)}
      </div>
      <div className="grupo-t"><span>La app</span></div>
      <div className="caja lista">
        {item({ p: "ajustes" }, <T.IconSettings size={20} />, "Ajustes", e?.ajustes)}
      </div>
      {/* Para saber cuál es cuál si quedaron instaladas las dos. */}
      <div className="chico centro" style={{ marginTop: 20 }}>{pie}</div>
    </div>
  );
}

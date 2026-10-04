import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useNav, type Pantalla, type Solapa } from "./nav";
import { leerAjuste, sembrar } from "./db";
import { alTocarAviso, registrar } from "./lib/notificaciones";
import { buscarActualizacion, type Actualizacion } from "./lib/actualizacion";
import { useDatos } from "./datos";
import { AvisoVersion } from "./pantallas/Actualizaciones";
import { completarPendientes } from "./lib/cotizaciones";
import { cargarAutomaticos } from "./lib/recurrentes";
import { Resumen } from "./pantallas/Resumen";
import { Movimientos } from "./pantallas/Movimientos";
import { LoQueViene } from "./pantallas/LoQueViene";
import { Mas } from "./pantallas/Mas";
import { Editor } from "./pantallas/Editor";
import { EditorCategoria, ListaCategorias, Objetivos } from "./pantallas/Categorias";
import { EditorCuenta, ListaCuentas, Tarjeta } from "./pantallas/Cuentas";
import { EditorRecurrente, Instancia, ListaRecurrentes } from "./pantallas/Recurrentes";
import { Clases, Revisar } from "./pantallas/Revisar";
import { Exportar, Respaldo } from "./pantallas/Archivos";
import { Ajustes } from "./pantallas/Ajustes";
import { SubirResumen } from "./pantallas/SubirResumen";
import { Etiquetas } from "./pantallas/Etiquetas";
import { ComoVenis } from "./pantallas/ComoVenis";
import { EditorProyeccion } from "./pantallas/Proyecciones";
import { AvisoRespuesta, ConectarFinanzas, MandarFinanzas, RespuestaFinanzas } from "./pantallas/Finanzas";
import { buscarRespuestas, marcarVisto, type EnvioHecho } from "./lib/finanzas";
import { T } from "./ui/Icono";

function Encima({ p }: { p: Pantalla }) {
  switch (p.p) {
    case "editor": return <Editor {...p} />;
    case "categorias": return <ListaCategorias />;
    case "categoria": return <EditorCategoria id={p.id} tipo={p.tipo} />;
    case "cuentas": return <ListaCuentas />;
    case "cuenta": return <EditorCuenta id={p.id} />;
    case "tarjeta": return <Tarjeta id={p.id} periodo={p.periodo} />;
    case "recurrentes": return <ListaRecurrentes />;
    case "recurrente": return <EditorRecurrente {...p} />;
    case "instancia": return <Instancia id={p.id} clave={p.clave} />;
    case "objetivos": return <Objetivos />;
    case "revisar": return <Revisar />;
    case "exportar": return <Exportar />;
    case "respaldo": return <Respaldo />;
    case "ajustes": return <Ajustes />;
    case "subir-resumen": return <SubirResumen cuentaId={p.cuentaId} />;
    case "etiquetas": return <Etiquetas />;
    case "como-venis": return <ComoVenis periodo={p.periodo} />;
    case "clases": return <Clases />;
    case "proyeccion": return <EditorProyeccion {...p} />;
    case "finanzas-conectar": return <ConectarFinanzas />;
    case "finanzas-mandar": return <MandarFinanzas />;
    case "finanzas-respuesta": return <RespuestaFinanzas nombre={p.nombre} />;
  }
}

const SOLAPAS: [Solapa, string, typeof T.IconHome][] = [
  ["resumen", "Resumen", T.IconChartDonut],
  ["movimientos", "Movimientos", T.IconList],
  ["viene", "Lo que viene", T.IconCalendarDue],
  ["mas", "Más", T.IconDots],
];

export function App() {
  const nav = useNav();

  const d = useDatos();
  // La navegación de ahora, para los avisos de Android (que llegan fuera de React).
  const navRef = useRef(nav);
  navRef.current = nav;
  const abrirAccion = (accion: string, cuentaId?: string) => {
    const n = navRef.current;
    if (accion === "gasto") n.abrir({ p: "editor" });
    if (accion === "resumen") n.abrir({ p: "subir-resumen", cuentaId });
    if (accion === "exportar") n.abrir({ p: "exportar" });
  };

  // Accesos directos del ícono (gastos://gasto | gastos://resumen) y tocar un aviso.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const desdeUrl = (url?: string) => { const m = url?.match(/^gastos:\/\/(\w+)/); if (m) abrirAccion(m[1]); };
    CapApp.getLaunchUrl().then(u => desdeUrl(u?.url));
    const l = CapApp.addListener("appUrlOpen", e => desdeUrl(e.url));
    alTocarAviso(abrirAccion);
    return () => { l.then(x => x.remove()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Botón "atrás" de Android: cierra la pantalla de arriba; si no hay, vuelve a
  // Resumen; en Resumen, minimiza la app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const l = CapApp.addListener("backButton", () => {
      const n = navRef.current;
      if (n.pila.length) n.volver();
      else if (n.solapa !== "resumen") n.irA("resumen");
      else CapApp.minimizeApp();
    });
    return () => { l.then(x => x.remove()); };
  }, []);

  // Versión nueva: al abrir la app y al volver a ella (como mucho cada 6 horas).
  const [nueva, setNueva] = useState<Actualizacion | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let ultima = 0;
    const revisar = () => { if (Date.now() - ultima > 6 * 3600_000) { ultima = Date.now(); buscarActualizacion().then(setNueva); } };
    revisar();
    const l = CapApp.addListener("appStateChange", e => { if (e.isActive) revisar(); });
    return () => { l.then(x => x.remove()); };
  }, []);

  // En la app, los avisos se programan de antemano: se rehacen cuando cambian los datos.
  useEffect(() => {
    if (!d.listo || !Capacitor.isNativePlatform()) return;
    const t = window.setTimeout(() => { leerAjuste<boolean>("notificaciones", false).then(on => { if (on) registrar(); }); }, 1500);
    return () => window.clearTimeout(t);
  }, [d.listo, d.movimientos, d.cuentas, d.descartes]);

  // Respuestas de Finanzas a lo que dejaste en el buzón: se buscan al abrir y al volver.
  const [respuesta, setRespuesta] = useState<EnvioHecho | null>(null);
  const traerRespuestas = async () => {
    const llegaron = (await buscarRespuestas()).filter(e => !e.visto);
    if (llegaron.length) setRespuesta(llegaron[llegaron.length - 1]);
  };

  // Al abrir y al volver a la app: completar cotizaciones pendientes y cargar
  // los recurrentes automáticos que ya vencieron.
  useEffect(() => {
    const ponerAlDia = async () => { await sembrar(); await cargarAutomaticos(); await completarPendientes(); traerRespuestas(); };
    ponerAlDia();
    // Si los avisos están activados, se reprograman.
    leerAjuste<boolean>("notificaciones", false).then(on => { if (on) registrar(); });
    const alVolver = () => document.visibilityState === "visible" && ponerAlDia();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", ponerAlDia);
    return () => { document.removeEventListener("visibilitychange", alVolver); window.removeEventListener("online", ponerAlDia); };
  }, []);

  // Las solapas quedan montadas debajo, así al volver conservan el mes y la vista.
  const arriba = nav.pila[nav.pila.length - 1];
  return (
    <>
      {nueva && <AvisoVersion nueva={nueva} cerrar={() => setNueva(null)} />}
      {!nueva && respuesta && (
        <AvisoRespuesta envio={respuesta}
          abrir={() => { nav.abrir({ p: "finanzas-respuesta", nombre: respuesta.nombre }); setRespuesta(null); }}
          cerrar={() => { marcarVisto(respuesta.nombre); setRespuesta(null); }} />
      )}
      {arriba && <div className="app" key={nav.pila.length}><Encima p={arriba} /></div>}
      <div className="app" style={arriba ? { display: "none" } : undefined}>
      {nav.solapa === "resumen" && <Resumen />}
      {nav.solapa === "movimientos" && <Movimientos />}
      {nav.solapa === "viene" && <LoQueViene />}
      {nav.solapa === "mas" && <Mas />}
      <nav className="tabs"><div>
        {SOLAPAS.map(([s, t, I]) => (
          <button key={s} className={`tab${nav.solapa === s ? " on" : ""}`} onClick={() => nav.irA(s)}><I size={22} stroke={1.7} />{t}</button>
        ))}
      </div></nav>
      </div>
    </>
  );
}

import { useEffect } from "react";
import { useNav, type Pantalla, type Solapa } from "./nav";
import { leerAjuste, sembrar } from "./db";
import { registrar } from "./lib/notificaciones";
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

  // Accesos directos del ícono (?accion=gasto | resumen): abren esa pantalla.
  useEffect(() => {
    const accion = new URLSearchParams(location.search).get("accion");
    if (!accion) return;
    history.replaceState(null, "", location.pathname);
    if (accion === "gasto") nav.abrir({ p: "editor" });
    if (accion === "resumen") nav.abrir({ p: "subir-resumen" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir y al volver a la app: completar cotizaciones pendientes y cargar
  // los recurrentes automáticos que ya vencieron.
  useEffect(() => {
    const ponerAlDia = async () => { await sembrar(); await cargarAutomaticos(); await completarPendientes(); };
    ponerAlDia();
    navigator.storage?.persist?.();
    // Si los avisos están activados, se vuelve a registrar la revisión periódica.
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

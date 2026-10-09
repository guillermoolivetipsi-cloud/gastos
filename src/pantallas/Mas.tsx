import type { ReactNode } from "react";
import { usePendientes } from "../datos";
import { useNav, type Pantalla } from "../nav";
import { T } from "../ui/Icono";
import { esApp } from "../lib/guardar";
import { ItemActualizar, useActualizacion } from "./Actualizaciones";

export function Mas() {
  return esApp() ? <MasConVersion /> : <Menu />;
}

/** En la app: además, actualizar (se fija al entrar a Más). */
function MasConVersion() {
  const a = useActualizacion();
  return <Menu arriba={a.nueva ? <ItemActualizar a={a} /> : null} abajo={a.nueva ? null : <ItemActualizar a={a} />}
    pie={<>Gastos <b style={{ fontWeight: 500 }}>{a.version ?? ""}</b> · app de Android</>} />;
}

function Menu({ arriba, abajo, pie = "Gastos · prueba en el navegador" }: { arriba?: ReactNode; abajo?: ReactNode; pie?: ReactNode }) {
  const nav = useNav();
  const revisar = usePendientes()?.total ?? 0;
  const item = (p: Pantalla, icono: ReactNode, texto: string, extra?: ReactNode) => (
    <button className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir(p)}>
      <span className="izq"><span className="viol" style={{ display: "flex" }}>{icono}</span><span>{texto}</span></span>
      {extra ?? <T.IconChevronRight size={18} className="tenue" />}
    </button>
  );
  return (
    <div className="pantalla">
      <div className="enc"><h1>Más</h1></div>
      {arriba && <div className="caja lista">{arriba}</div>}
      <div className="caja lista">
        {item({ p: "revisar" }, <T.IconInbox size={20} />, "Para revisar", revisar ? <span className="badge">{revisar}</span> : undefined)}
      </div>
      <div className="caja lista">
        {item({ p: "categorias" }, <T.IconCategory size={20} />, "Categorías y objetivos")}
        {item({ p: "etiquetas" }, <T.IconTag size={20} />, "Etiquetas")}
        {item({ p: "recurrentes" }, <T.IconRepeat size={20} />, "Recurrentes")}
        {item({ p: "cuentas" }, <T.IconBuildingBank size={20} />, "Cuentas y tarjetas")}
      </div>
      <div className="caja lista">
        {item({ p: "subir-resumen" }, <T.IconFileImport size={20} />, "Subir resumen de tarjeta")}
        {item({ p: "exportar" }, <T.IconFileExport size={20} />, "Exportar a Finanzas")}
        {item({ p: "respaldo" }, <T.IconDatabaseExport size={20} />, "Copia de seguridad e importar")}
      </div>
      <div className="caja lista">
        {item({ p: "ajustes" }, <T.IconSettings size={20} />, "Ajustes")}
        {abajo}
      </div>
      {/* Para saber cuál es cuál si quedaron instaladas las dos. */}
      <div className="chico centro" style={{ marginTop: 20 }}>{pie}</div>
      <div className="mini tenue centro" style={{ marginTop: 4 }}>Los totales se muestran en USD. Tus datos quedan solo en este celular.</div>
    </div>
  );
}

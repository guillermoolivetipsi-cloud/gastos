import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";
import { useDatos } from "../datos";
import { leerAjuste } from "../db";
import { useNav, type Pantalla } from "../nav";
import { pendientes } from "../lib/revisar";
import { T } from "../ui/Icono";

export function Mas() {
  const d = useDatos();
  const nav = useNav();
  const ultimoRespaldo = useLiveQuery(() => leerAjuste<string | null>("ultimoRespaldo", null), []);
  const revisar = d.listo && ultimoRespaldo !== undefined ? pendientes(d, ultimoRespaldo).total : 0;
  const item = (p: Pantalla, icono: ReactNode, texto: string, extra?: ReactNode) => (
    <button className="fila" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.abrir(p)}>
      <span className="izq"><span className="viol" style={{ display: "flex" }}>{icono}</span><span>{texto}</span></span>
      {extra ?? <T.IconChevronRight size={18} className="tenue" />}
    </button>
  );
  return (
    <div className="pantalla">
      <div className="enc"><h1>Más</h1></div>
      <div className="caja lista">
        {item({ p: "revisar" }, <T.IconInbox size={20} />, "Para revisar", revisar ? <span className="badge">{revisar}</span> : undefined)}
      </div>
      <div className="caja lista">
        {item({ p: "categorias" }, <T.IconCategory size={20} />, "Categorías")}
        {item({ p: "objetivos" }, <T.IconTarget size={20} />, "Objetivos por categoría")}
        {item({ p: "recurrentes" }, <T.IconRepeat size={20} />, "Recurrentes")}
        {item({ p: "cuentas" }, <T.IconBuildingBank size={20} />, "Cuentas y tarjetas")}
      </div>
      <div className="caja lista">
        {item({ p: "exportar" }, <T.IconFileExport size={20} />, "Exportar a Finanzas")}
        {item({ p: "respaldo" }, <T.IconDatabaseExport size={20} />, "Copia de seguridad e importar")}
      </div>
      <div className="caja lista">
        {item({ p: "ajustes" }, <T.IconSettings size={20} />, "Ajustes")}
      </div>
      <div className="mini tenue centro" style={{ marginTop: 20 }}>Los totales se muestran en USD. Tus datos quedan solo en este celular.</div>
    </div>
  );
}

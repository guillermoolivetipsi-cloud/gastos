import { useLiveQuery } from "dexie-react-hooks";
import { guardarAjuste, leerAjuste } from "../db";
import { useNav } from "../nav";
import type { TipoGrafico } from "../ui/Graficos";
import { T } from "../ui/Icono";

const GRAFICOS: [TipoGrafico, string, string][] = [
  ["dia", "Barras por día + ranking", "Cuánto gastaste cada día (cada mes, en la vista de año) contra tu promedio, y las categorías ordenadas."],
  ["barras", "Solo barras", "Las categorías ordenadas de mayor a menor, cada una con su barra."],
  ["rectangulos", "Rectángulos", "Cada categoría es un rectángulo del tamaño de lo que gastaste."],
  ["torta", "Torta", "El gráfico de siempre."],
];

export function Ajustes() {
  const nav = useNav();
  const grafico = useLiveQuery(() => leerAjuste<TipoGrafico>("grafico", "dia"), []);
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Ajustes</h1></div>
      <div className="titulo-sec"><span>Gráfico del resumen</span></div>
      {GRAFICOS.map(([v, t, d]) => (
        <button key={v} className={`opcion${grafico === v ? " sug" : ""}`} style={grafico === v ? { borderColor: "var(--viol)", borderStyle: "solid" } : undefined} onClick={() => guardarAjuste("grafico", v)}>
          <div className="fila" style={{ padding: 0 }}><span>{t}</span>{grafico === v && <T.IconCheck size={18} className="viol" />}</div>
          <div className="mini tenue">{d}</div>
        </button>
      ))}
    </div>
  );
}

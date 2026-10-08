import { useState, type ReactNode } from "react";
import { MONEDAS, type Categoria, type Moneda } from "../tipos";
import { Hoja, Punto } from "./piezas";

/* Piezas de los formularios de carga (gasto, recurrente, proyección), con las reglas
   de CLAUDE.md: el monto con la moneda al lado, la categoría justo después en una
   grilla de 5, y la fecha en el título. */

/** El monto grande con la moneda al lado del número: un toque pasa a la siguiente. */
export function MontoConMoneda({ texto, cambiarTexto, moneda, cambiarMoneda, autoFocus, placeholder = "0", etiqueta = "Monto" }: {
  texto: string; cambiarTexto: (t: string) => void; moneda: Moneda; cambiarMoneda: (m: Moneda) => void;
  autoFocus?: boolean; placeholder?: string; etiqueta?: string;
}) {
  return (
    <div className="monto-grande" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <input inputMode="decimal" placeholder={placeholder} value={texto} autoFocus={autoFocus} aria-label={etiqueta}
        onChange={e => cambiarTexto(e.target.value.replace(/[^\d.,]/g, ""))}
        style={{ width: `${Math.max(1.2, (texto || placeholder).length * 0.62 + 0.4)}em`, maxWidth: "70%", textAlign: "right" }} />
      <button type="button" className="chip-moneda" aria-label={`Moneda: ${moneda}. Tocá para cambiar`}
        onClick={() => cambiarMoneda(MONEDAS[(MONEDAS.indexOf(moneda) + 1) % MONEDAS.length])}>{moneda} ▾</button>
    </div>
  );
}

/** Las categorías de a 5 por fila: 9 a la vista (las más usadas primero; si la elegida
 *  no está entre ellas, ocupa el último lugar) y "Todas". */
export function GrillaCategorias({ categorias, valor, cambiar }: { categorias: Categoria[]; valor: string; cambiar: (id: string) => void }) {
  const [todas, setTodas] = useState(false);
  const top = categorias.slice(0, 9);
  const sel = categorias.find(c => c.id === valor);
  const visibles = todas ? categorias : sel && !top.includes(sel) ? [...top.slice(0, 8), sel] : top;
  return (
    <div className="cats cinco">
      {visibles.map(c => (
        <button key={c.id} type="button" className={`cat${c.id === valor ? " on" : ""}`} onClick={() => cambiar(c.id)}>
          <Punto cat={c} grande /><span>{c.nombre}</span>
        </button>
      ))}
      {!todas && categorias.length > 9 && (
        <button type="button" className="cat" onClick={() => setTodas(true)}><Punto icono="question-mark" color="#2A2A36" grande /><span>Todas</span></button>
      )}
    </div>
  );
}

/** La fecha (o el mes) en el título: "· hoy ▾". Abre una hoja con las opciones. */
export function FechaEnTitulo({ texto, titulo, children }: { texto: string; titulo: string; children: (cerrar: () => void) => ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="fecha-titulo" onClick={() => setAbierta(true)} aria-label={`${titulo}: ${texto}`}>· {texto} ▾</button>
      <Hoja abierta={abierta} cerrar={() => setAbierta(false)}>
        <h2>{titulo}</h2>
        <div className="pills" style={{ marginTop: 8 }}>{children(() => setAbierta(false))}</div>
      </Hoja>
    </>
  );
}

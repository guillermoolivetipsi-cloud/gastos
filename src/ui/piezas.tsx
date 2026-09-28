import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { Categoria, Clase } from "../tipos";
import { Icono, T } from "./Icono";

export function Punto({ cat, chico, icono, color }: { cat?: Pick<Categoria, "icono" | "color">; chico?: boolean; icono?: string; color?: string }) {
  return (
    <span className={`punto${chico ? " chico" : ""}`} style={{ background: color ?? cat?.color ?? "#2A2A36" }}>
      <Icono nombre={icono ?? cat?.icono ?? "question-mark"} size={chico ? 15 : 18} />
    </span>
  );
}

/** Barra de avance. `marca`: dónde deberías ir hoy (0..1). */
export function Barra({ valor, color = "var(--viol)", marca }: { valor: number; color?: string; marca?: number }) {
  return (
    <div className="barra">
      <i style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%`, background: color }} />
      {marca != null && marca > 0 && marca < 1 && <b style={{ left: `${marca * 100}%` }} />}
    </div>
  );
}

export function EtiquetaClase({ clase, sugerida }: { clase?: Clase; sugerida?: boolean }) {
  const c = clase ?? "variable";
  return <span className={`etiq e-${c}`}>{c}{sugerida ? "?" : ""}</span>;
}

export function Interruptor({ on, cambiar }: { on: boolean; cambiar: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`interruptor${on ? " on" : ""}`} onClick={() => cambiar(!on)} />;
}

export function Seg<V extends string>({ opciones, valor, cambiar }: { opciones: [V, string][]; valor: V; cambiar: (v: V) => void }) {
  return (
    <div className="seg">
      {opciones.map(([v, t]) => <button type="button" key={v} className={v === valor ? "on" : ""} onClick={() => cambiar(v)}>{t}</button>)}
    </div>
  );
}

/** Dona: los segmentos van en el orden dado, arrancando arriba. */
export function Dona({ partes, centro, sub, tam = 190 }: { partes: { valor: number; color: string; tenue?: boolean }[]; centro: ReactNode; sub?: ReactNode; tam?: number }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const r = 44, C = 2 * Math.PI * r;
  let acum = 0;
  return (
    <svg className="dona" viewBox="0 0 120 120" width={tam} height={tam} role="img">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--linea)" strokeWidth="15" />
      {total > 0 && partes.filter(p => p.valor > 0).map((p, i) => {
        const largo = (p.valor / total) * C;
        const hueco = partes.length > 1 ? Math.min(1.2, largo / 3) : 0;
        const el = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="15" strokeOpacity={p.tenue ? 0.4 : 1}
            strokeDasharray={`${Math.max(0, largo - hueco)} ${C}`} strokeDashoffset={-acum} transform="rotate(-90 60 60)" />
        );
        acum += largo;
        return el;
      })}
      <text x="60" y={sub ? 58 : 64} textAnchor="middle" fill="var(--tinta)" fontSize="14" fontFamily="inherit">{centro}</text>
      {sub && <text x="60" y="73" textAnchor="middle" fill="var(--tenue)" fontSize="8" fontFamily="inherit">{sub}</text>}
    </svg>
  );
}

export function Hoja({ abierta, cerrar, children }: { abierta: boolean; cerrar: () => void; children: ReactNode }) {
  if (!abierta) return null;
  return (
    <div className="velo" onClick={cerrar}>
      <div className="hoja" onClick={e => e.stopPropagation()}>
        <div className="asa" />
        {children}
      </div>
    </div>
  );
}

/* ── Aviso con "Deshacer" ── */
type Toast = { texto: string; deshacer?: () => void };
const ToastCtx = createContext<(t: Toast) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast | null>(null);
  const timer = useRef<number>(undefined);
  const mostrar = useCallback((x: Toast) => {
    setT(x);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), x.deshacer ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      {t && (
        <div className="toast" role="status">
          <span>{t.texto}</span>
          {t.deshacer && <button onClick={() => { t.deshacer!(); setT(null); }}>Deshacer</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/** Fila que se desliza a la izquierda para mostrar "borrar". */
export function Deslizable({ children, borrar, tocar }: { children: ReactNode; borrar: () => void; tocar: () => void }) {
  const [x, setX] = useState(0);
  const ini = useRef<{ x: number; y: number; base: number; mueve: boolean } | null>(null);
  return (
    <div className="deslizable">
      <button className="borrar" aria-label="Eliminar" onClick={borrar}><T.IconTrash size={20} /></button>
      <div
        className="frente"
        style={{ transform: `translateX(${x}px)`, transition: ini.current ? "none" : undefined }}
        onPointerDown={e => { ini.current = { x: e.clientX, y: e.clientY, base: x, mueve: false }; }}
        onPointerMove={e => {
          const s = ini.current; if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.mueve && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - s.y)) s.mueve = true;
          if (s.mueve) setX(Math.min(0, Math.max(-84, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = ini.current; ini.current = null;
          if (!s?.mueve) { if (x === 0) tocar(); else setX(0); return; }
          setX(x < -42 ? -84 : 0);
        }}
        onPointerCancel={() => { ini.current = null; setX(0); }}
      >
        {children}
      </div>
    </div>
  );
}

/** El "+" flotante. Abre la carga ya como gasto o como ingreso, según dónde estés. */
export function BotonAgregar({ tipo, abrir }: { tipo: "gasto" | "ingreso"; abrir: (tipo: "gasto" | "ingreso") => void }) {
  return (
    <button className="fab" aria-label={tipo === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto"} onClick={() => abrir(tipo)}>
      <T.IconPlus size={28} />
    </button>
  );
}

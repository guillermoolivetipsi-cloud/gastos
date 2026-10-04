import { useEffect, useState } from "react";
import { buscarActualizacion, descargar, versionInstalada, type Actualizacion } from "../lib/actualizacion";
import { useToast } from "../ui/piezas";
import { T } from "../ui/Icono";

/** La versión instalada y si hay una nueva. Se fija al montarse (al entrar a Más). */
export function useActualizacion() {
  const [version, setVersion] = useState<string | null>(null);
  const [nueva, setNueva] = useState<Actualizacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const buscar = async () => {
    setBuscando(true);
    const a = await buscarActualizacion();
    setBuscando(false);
    setNueva(a);
    return a;
  };
  useEffect(() => { versionInstalada().then(v => setVersion(v ? v.nombre : null)); buscar(); }, []);
  return { version, nueva, buscando, buscar };
}

/** En Más (solo en la app): arriba y resaltada si hay una nueva; al final si no. */
export function ItemActualizar({ a }: { a: ReturnType<typeof useActualizacion> }) {
  const toast = useToast();
  if (a.nueva) return (
    <button className="fila" style={{ width: "100%", textAlign: "left", background: "var(--viol-fondo)" }} onClick={() => descargar(a.nueva!)}>
      <span className="izq"><span className="viol" style={{ display: "flex" }}><T.IconDownload size={20} /></span>
        <span><div>Actualizar la app</div><div className="mini tenue">Tenés la {a.version} · hay {a.nueva.version}</div></span></span>
      <span className="badge" style={{ background: "var(--viol)" }}>nueva</span>
    </button>
  );
  return (
    <button className="fila" style={{ width: "100%", textAlign: "left" }} disabled={a.buscando} onClick={async () => {
      const n = await a.buscar();
      if (!n) toast({ texto: `Tenés la última versión${a.version ? ` (${a.version})` : ""}` });
    }}>
      <span className="izq"><span className="viol" style={{ display: "flex" }}><T.IconRefresh size={20} /></span>
        <span><div>{a.buscando ? "Buscando…" : "Buscar actualización"}</div>{a.version && <div className="mini tenue">Versión {a.version}</div>}</span></span>
    </button>
  );
}

/** Aviso arriba de todo cuando hay una versión nueva (se busca al abrir y al volver, cada 6 horas como mucho). */
export function AvisoVersion({ nueva, cerrar }: { nueva: Actualizacion; cerrar: () => void }) {
  return (
    <div className="aviso-version" role="status">
      <div style={{ flex: 1 }}>
        <div>Hay una versión nueva</div>
        <div className="mini tenue">{nueva.version}{nueva.notas ? ` · ${nueva.notas.split("\n")[0]}` : ""}</div>
      </div>
      <button className="btn1" onClick={() => descargar(nueva)}>Actualizar</button>
      <button className="tenue" aria-label="Ahora no" onClick={cerrar} style={{ padding: 6 }}>✕</button>
    </div>
  );
}

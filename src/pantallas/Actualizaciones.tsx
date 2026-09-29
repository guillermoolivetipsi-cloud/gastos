import { useEffect, useState } from "react";
import { buscarActualizacion, descargar, versionInstalada, type Actualizacion } from "../lib/actualizacion";
import { useToast } from "../ui/piezas";

/** En Ajustes (solo en la app): la versión instalada y "Buscar" una nueva. */
export function Actualizaciones() {
  const toast = useToast();
  const [version, setVersion] = useState<string | null>(null);
  const [nueva, setNueva] = useState<Actualizacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => { versionInstalada().then(v => setVersion(v ? v.nombre : null)); }, []);
  return (
    <>
      <div className="titulo-sec"><span>Versión</span></div>
      <div className="caja">
        <div className="fila" style={{ padding: 0 }}>
          <span><div>Gastos {version ?? ""}</div><div className="mini tenue">{nueva ? `Disponible: ${nueva.version}` : "Se fija sola al abrir la app"}</div></span>
          {nueva
            ? <button className="btn1" onClick={() => descargar(nueva)}>Actualizar</button>
            : <button className="btn2" disabled={buscando} onClick={async () => {
                setBuscando(true);
                const a = await buscarActualizacion();
                setBuscando(false);
                setNueva(a);
                if (!a) toast({ texto: "Tenés la última versión" });
              }}>{buscando ? "Buscando…" : "Buscar"}</button>}
        </div>
      </div>
    </>
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

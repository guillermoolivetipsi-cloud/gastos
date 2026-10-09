import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { guardarAjuste, leerAjuste } from "../db";
import { useNav } from "../nav";
import { RECORDATORIOS, type Recordatorios } from "../lib/recordatorios";
import { activar, estado, probar, registrar, type Estado } from "../lib/notificaciones";
import { GrupoT, Interruptor } from "../ui/piezas";
import { T } from "../ui/Icono";

export function Ajustes() {
  const nav = useNav();
  const r = useLiveQuery(() => leerAjuste<Recordatorios>("recordatorios", RECORDATORIOS), []);
  const avisos = useLiveQuery(() => leerAjuste<boolean>("notificaciones", false), []);
  const [est, setEst] = useState<Estado | null>(null);
  useEffect(() => { estado().then(setEst); }, []);
  if (!r) return <div className="pantalla sin-tabs" />;

  async function cambiarAvisos(on: boolean) {
    await guardarAjuste("notificaciones", on);
    if (on) setEst(await activar());
    else await registrar(); // en la app: borra los avisos programados
  }
  const set = async <K extends keyof Recordatorios>(k: K, v: Partial<Recordatorios[K]>) => {
    await guardarAjuste("recordatorios", { ...r, [k]: { ...r[k], ...v } });
    if (avisos) await registrar(); // en la app: se reprograma con los horarios nuevos
  };
  const dia = (v: string) => Math.min(28, Math.max(1, Number(v.replace(/\D/g, "")) || 1));

  // Reglas de Ajustes: los avisos en una fila con su estado en gris, los recordatorios
  // como lista (el cuándo se toca para cambiarlo) y las explicaciones detrás de un «?».
  const cuando = (k: "resumen" | "exportar") => (
    <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>
      el día {r[k].dia} ▾
      <select value={r[k].dia} aria-label="Día del mes" onChange={e => set(k, { dia: dia(e.target.value) })} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }}>
        {Array.from({ length: 28 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
      </select>
    </label>
  );
  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Ajustes</h1></div>

      <GrupoT titulo="Avisos" ayuda="Te aviso a la hora de cada recordatorio. Los avisos se preparan para los próximos 14 días cada vez que abrís la app: si no la abrís en dos semanas, dejan de llegar." />
      <div className="caja lista">
        <div className="fila">
          <span style={{ minWidth: 0 }}>
            <div>Avisarme lo pendiente</div>
            <div className="mini">
              {!avisos ? <span className="tenue">apagados</span>
                : !est ? null
                : !est.soportado ? <span className="ambar">en el navegador no hay avisos: solo en la app</span>
                : est.permiso === "denied" ? <span className="mal">bloqueados: activalos en Ajustes de Android → Apps → Gastos → Notificaciones</span>
                : est.permiso === "default" ? <button className="viol mini" onClick={async () => setEst(await activar())}>dar permiso</button>
                : <><span className="ok">activados</span><span className="tenue"> · </span><button className="viol mini" onClick={probar}>probar un aviso</button></>}
            </div>
          </span>
          <Interruptor on={!!avisos} cambiar={cambiarAvisos} />
        </div>
      </div>

      <GrupoT titulo="Recordatorios" ayuda="Aparecen en «Para revisar» y no se van hasta que los hacés. Cargar los gastos: si a esa hora no cargaste nada en el día. Subir el resumen: el que cerró el mes anterior. Exportar: si quedan movimientos del mes pasado sin mandar." />
      <div className="caja lista">
        <div className="fila">
          <span style={{ minWidth: 0 }}>
            <div>Cargar los gastos del día</div>
            <div className="mini tenue">{r.diario.activo ? <>desde las{" "}
              <label className="viol" style={{ position: "relative", textDecoration: "underline dotted" }}>{r.diario.hora} ▾
                <input type="time" value={r.diario.hora} aria-label="Hora" onChange={e => e.target.value && set("diario", { hora: e.target.value })} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }} />
              </label></> : "apagado"}</div>
          </span>
          <Interruptor on={r.diario.activo} cambiar={v => set("diario", { activo: v })} />
        </div>
        <div className="fila">
          <span style={{ minWidth: 0 }}>
            <div>Subir el resumen de cada tarjeta</div>
            <div className="mini tenue">{r.resumen.activo ? <>desde {cuando("resumen")} de cada mes</> : "apagado"}</div>
          </span>
          <Interruptor on={r.resumen.activo} cambiar={v => set("resumen", { activo: v })} />
        </div>
        <div className="fila">
          <span style={{ minWidth: 0 }}>
            <div>Exportar el mes a Finanzas</div>
            <div className="mini tenue">{r.exportar.activo ? <>desde {cuando("exportar")} de cada mes</> : "apagado"}</div>
          </span>
          <Interruptor on={r.exportar.activo} cambiar={v => set("exportar", { activo: v })} />
        </div>
      </div>
    </div>
  );
}

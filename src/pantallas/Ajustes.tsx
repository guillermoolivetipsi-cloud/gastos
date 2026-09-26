import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { guardarAjuste, leerAjuste } from "../db";
import { useNav } from "../nav";
import { RECORDATORIOS, type Recordatorios } from "../lib/recordatorios";
import { activar, estado, probar, type Estado } from "../lib/notificaciones";
import { Interruptor } from "../ui/piezas";
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
  }
  const set = <K extends keyof Recordatorios>(k: K, v: Partial<Recordatorios[K]>) => guardarAjuste("recordatorios", { ...r, [k]: { ...r[k], ...v } });
  const dia = (v: string) => Math.min(28, Math.max(1, Number(v.replace(/\D/g, "")) || 1));

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Ajustes</h1></div>
      <div className="titulo-sec"><span>Notificaciones</span></div>
      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span>Avisarme lo pendiente</span><Interruptor on={!!avisos} cambiar={cambiarAvisos} /></div>
        <div className="mini tenue" style={{ marginTop: 6 }}>Android despierta la app más o menos una vez al día y, si hay algo pendiente, te avisa. No es a una hora exacta: el aviso diario puede llegar más tarde o saltearse un día.</div>
        {avisos && est && (
          <div className="chico" style={{ marginTop: 8 }}>
            {est.permiso === "denied" && <div className="mal">Las notificaciones están bloqueadas. Activalas en Ajustes de Android → Apps → Gastos → Notificaciones.</div>}
            {est.permiso === "granted" && !est.soportado && <div className="ambar">Este navegador no despierta la app en segundo plano. Instalala desde Chrome para recibir los avisos.</div>}
            {est.permiso === "granted" && est.soportado && !est.sincroniza && <div className="ambar">Android todavía no habilitó la revisión en segundo plano. Suele activarse después de usar la app unos días.</div>}
            {est.permiso === "granted" && est.sincroniza && <div className="ok">Activadas.</div>}
            {est.permiso === "default" && <button className="btn1" style={{ marginTop: 6 }} onClick={async () => setEst(await activar())}>Dar permiso</button>}
            {est.permiso === "granted" && <button className="btn2" style={{ marginTop: 8, width: "100%" }} onClick={probar}>Probar un aviso</button>}
          </div>
        )}
      </div>

      <div className="titulo-sec"><span>Recordatorios</span></div>
      <div className="mini tenue" style={{ margin: "-4px 2px 8px" }}>Aparecen en "Para revisar" y no se van hasta que los hacés.</div>

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span>Cargar los gastos del día</span><Interruptor on={r.diario.activo} cambiar={v => set("diario", { activo: v })} /></div>
        {r.diario.activo && (
          <div className="campo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <label>A partir de las</label>
            <input type="time" value={r.diario.hora} onChange={e => e.target.value && set("diario", { hora: e.target.value })} />
            <div className="mini tenue">Si a esa hora no cargaste nada en el día.</div>
          </div>
        )}
      </div>

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span>Subir el resumen de cada tarjeta</span><Interruptor on={r.resumen.activo} cambiar={v => set("resumen", { activo: v })} /></div>
        {r.resumen.activo && (
          <div className="campo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <label>Desde el día del mes</label>
            <input inputMode="numeric" value={r.resumen.dia} onChange={e => set("resumen", { dia: dia(e.target.value) })} />
            <div className="mini tenue">El resumen que cerró el mes anterior. Queda pendiente hasta que lo subas.</div>
          </div>
        )}
      </div>

      <div className="caja">
        <div className="fila" style={{ padding: 0 }}><span>Exportar el mes a Finanzas</span><Interruptor on={r.exportar.activo} cambiar={v => set("exportar", { activo: v })} /></div>
        {r.exportar.activo && (
          <div className="campo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <label>Desde el día del mes</label>
            <input inputMode="numeric" value={r.exportar.dia} onChange={e => set("exportar", { dia: dia(e.target.value) })} />
            <div className="mini tenue">Si quedan movimientos del mes pasado sin exportar.</div>
          </div>
        )}
      </div>
    </div>
  );
}

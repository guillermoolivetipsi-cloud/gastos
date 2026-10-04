import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { avisosAProgramar, type Aviso } from "./avisos";

/* Los avisos: notificaciones locales programadas de antemano (los próximos 14 días),
   que se rehacen cada vez que abrís la app o cambian los datos. Solo en la app de
   Android; en el navegador (para probar) no hay avisos. */

const esApp = () => Capacitor.isNativePlatform();

export interface Estado { soportado: boolean; permiso: NotificationPermission | "no-soportado" }

export async function estado(): Promise<Estado> {
  if (!esApp()) return { soportado: false, permiso: "no-soportado" };
  const p = (await LocalNotifications.checkPermissions()).display;
  return { soportado: true, permiso: p === "granted" ? "granted" : p === "denied" ? "denied" : "default" };
}

/** Pide permiso (si hace falta) y programa los avisos. */
export async function activar(): Promise<Estado> {
  if (esApp()) {
    await LocalNotifications.requestPermissions();
    await registrar();
  }
  return estado();
}

/** Reprograma los avisos con lo que hay pendiente ahora. */
export async function registrar() {
  if (esApp()) await programar(await avisosAProgramar());
}

/** Reemplaza todo lo programado por la lista nueva (vacía = apagar). */
export async function programar(avisos: Aviso[]) {
  if (!esApp() || (await LocalNotifications.checkPermissions()).display !== "granted") return;
  const pendientes = await LocalNotifications.getPending();
  if (pendientes.notifications.length) await LocalNotifications.cancel({ notifications: pendientes.notifications.map(n => ({ id: n.id })) });
  if (!avisos.length) return;
  await LocalNotifications.schedule({
    notifications: avisos.map(a => ({
      id: a.id, title: a.titulo, body: a.cuerpo,
      schedule: { at: a.cuando, allowWhileIdle: true },
      extra: { accion: a.accion, cuentaId: a.cuentaId },
    })),
  });
}

/** Tocar un aviso abre lo que pide: cargar un gasto, subir el resumen o exportar. */
export async function alTocarAviso(abrir: (accion: Aviso["accion"], cuentaId?: string) => void) {
  if (!esApp()) return;
  await LocalNotifications.addListener("localNotificationActionPerformed", e => {
    const x = e.notification.extra as { accion?: Aviso["accion"]; cuentaId?: string } | undefined;
    if (x?.accion) abrir(x.accion, x.cuentaId);
  });
}

export async function probar() {
  if (!esApp()) return;
  await LocalNotifications.schedule({ notifications: [{ id: 999999, title: "Así se ven los avisos de Gastos", body: "Cuando tengas algo pendiente te aviso así.", schedule: { at: new Date(Date.now() + 1500) } }] });
}

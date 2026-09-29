import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { avisosAProgramar, type Aviso } from "./avisos";

/* Activar los avisos.
   - En la app de Android: notificaciones locales programadas de antemano (los
     próximos 14 días), que se rehacen cada vez que abrís la app o cambian los datos.
   - En el navegador (PWA): permiso de notificaciones + sincronización periódica.
     Solo existe en Chrome/Android con la app instalada; Android decide cuándo la
     corre (más o menos una vez al día). */

const esApp = () => Capacitor.isNativePlatform();

type ConSync = ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void>; getTags(): Promise<string[]> } };

export interface Estado { soportado: boolean; permiso: NotificationPermission | "no-soportado"; sincroniza: boolean }

export async function estado(): Promise<Estado> {
  if (esApp()) {
    const p = (await LocalNotifications.checkPermissions()).display;
    return { soportado: true, permiso: p === "granted" ? "granted" : p === "denied" ? "denied" : "default", sincroniza: true };
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return { soportado: false, permiso: "no-soportado", sincroniza: false };
  const reg = (await navigator.serviceWorker.getRegistration()) as ConSync | undefined;
  const tags = reg?.periodicSync ? await reg.periodicSync.getTags().catch(() => []) : [];
  return { soportado: !!reg?.periodicSync, permiso: Notification.permission, sincroniza: tags.includes("recordatorios") };
}

/** Pide permiso (si hace falta) y deja los avisos andando. */
export async function activar(): Promise<Estado> {
  if (esApp()) {
    await LocalNotifications.requestPermissions();
    await registrar();
    return estado();
  }
  if (!("Notification" in window)) return estado();
  if (Notification.permission === "default") await Notification.requestPermission();
  await registrar();
  return estado();
}

/** En la app: reprograma los avisos. En el navegador: registra la revisión periódica. */
export async function registrar() {
  if (esApp()) return programar(await avisosAProgramar());
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
  const reg = (await navigator.serviceWorker.ready) as ConSync;
  try { await reg.periodicSync?.register("recordatorios", { minInterval: 12 * 60 * 60 * 1000 }); } catch { /* sin permiso de Android */ }
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
  if (esApp()) {
    await LocalNotifications.schedule({ notifications: [{ id: 999999, title: "Así se ven los avisos de Gastos", body: "Cuando tengas algo pendiente te aviso así.", schedule: { at: new Date(Date.now() + 1500) } }] });
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("Así se ven los avisos de Gastos", { body: "Cuando tengas algo pendiente te aviso así.", icon: "icono-192.png", tag: "prueba" });
}

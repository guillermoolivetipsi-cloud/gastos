/* Activar los avisos: permiso de notificaciones + sincronización periódica.
   La sincronización periódica solo existe en Chrome/Android con la app instalada;
   Android decide cuándo la corre (más o menos una vez al día). */

type ConSync = ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void>; getTags(): Promise<string[]> } };

export interface Estado { soportado: boolean; permiso: NotificationPermission | "no-soportado"; sincroniza: boolean }

export async function estado(): Promise<Estado> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return { soportado: false, permiso: "no-soportado", sincroniza: false };
  const reg = (await navigator.serviceWorker.getRegistration()) as ConSync | undefined;
  const tags = reg?.periodicSync ? await reg.periodicSync.getTags().catch(() => []) : [];
  return { soportado: !!reg?.periodicSync, permiso: Notification.permission, sincroniza: tags.includes("recordatorios") };
}

/** Pide permiso (si hace falta) y registra la revisión periódica. */
export async function activar(): Promise<Estado> {
  if (!("Notification" in window)) return estado();
  if (Notification.permission === "default") await Notification.requestPermission();
  await registrar();
  return estado();
}

export async function registrar() {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
  const reg = (await navigator.serviceWorker.ready) as ConSync;
  try { await reg.periodicSync?.register("recordatorios", { minInterval: 12 * 60 * 60 * 1000 }); } catch { /* sin permiso de Android */ }
}

export async function probar() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("Así se ven los avisos de Gastos", { body: "Cuando tengas algo pendiente te aviso así.", icon: "icono-192.png", tag: "prueba" });
}

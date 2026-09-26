/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";
import { avisosPendientes } from "./lib/avisos";

/* El service worker: guarda la app para que abra sin conexión y, cuando Android
   la despierta (sincronización periódica, más o menos una vez al día), revisa los
   pendientes y avisa. No hay servidor: todo sale de la base del celular. */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
self.skipWaiting();
clientsClaim();

async function avisar() {
  for (const t of await avisosPendientes()) {
    await self.registration.showNotification(t.titulo, {
      body: t.detalle,
      tag: t.clave,
      icon: "icono-192.png",
      badge: "icono-192.png",
      data: { tipo: t.tipo },
    });
  }
}

self.addEventListener("periodicsync", (e: Event) => {
  const ev = e as ExtendableEvent & { tag: string };
  if (ev.tag === "recordatorios") ev.waitUntil(avisar());
});

// Tocar el aviso abre la app (o la trae adelante si ya estaba abierta).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (abiertas[0]) return abiertas[0].focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});

// La app abierta puede pedir una revisión (el botón "Probar" de Ajustes).
self.addEventListener("message", e => {
  if (e.data === "avisar") e.waitUntil(avisar());
});

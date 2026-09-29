/* En la app de Android no hay service worker: esto reemplaza a "virtual:pwa-register". */
export function registerSW(_opciones?: unknown) {
  return () => Promise.resolve();
}

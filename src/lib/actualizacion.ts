import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Busca en GitHub si hay una versión más nueva que la instalada.
 * Android no permite instalar sola una app que no viene de Play Store: la app avisa,
 * descarga el APK con el navegador y Android pide confirmar la instalación.
 */
const ULTIMA = "https://api.github.com/repos/guillermoolivetipsi-cloud/gastos/releases/latest";

export interface Actualizacion { version: string; url: string; notas: string }

/** Número de compilación de la versión instalada (el versionCode de Android). */
export async function versionInstalada(): Promise<{ nombre: string; numero: number } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const info = await App.getInfo();
  return { nombre: info.version, numero: Number(info.build) || 0 };
}

/** El número va al final del tag: "v1.0.7" → 7. */
export const numeroDeTag = (tag: string) => Number(tag.split(".").pop()) || 0;

export async function buscarActualizacion(): Promise<Actualizacion | null> {
  const instalada = await versionInstalada();
  if (!instalada) return null;
  try {
    const r = await fetch(ULTIMA, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const ultima = (await r.json()) as { tag_name: string; body?: string; assets: { name: string; browser_download_url: string }[] };
    const apk = ultima.assets.find((a) => a.name.endsWith(".apk"));
    if (!apk || numeroDeTag(ultima.tag_name) <= instalada.numero) return null;
    return { version: ultima.tag_name.replace(/^v/, ""), url: apk.browser_download_url, notas: ultima.body ?? "" };
  } catch {
    return null; // Sin conexión: se vuelve a intentar la próxima vez.
  }
}

/** Abre la descarga en el navegador del teléfono; al terminar, Android ofrece instalar. */
export function descargar(a: Actualizacion) {
  window.location.href = a.url;
}

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/* Guardar un archivo que genera la app (el Excel para Finanzas, la copia de
   seguridad). En Android queda en Documentos/Gastos y, si se pide, se abre
   "Compartir" (Drive, mail, WhatsApp). En el navegador se descarga. */

export const CARPETA = "Gastos";
export const esApp = () => Capacitor.isNativePlatform();

const aBase64 = (blob: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => mal(r.error);
  r.readAsDataURL(blob);
});

/** Devuelve dónde quedó (para mostrarlo), o null en el navegador. */
export async function guardarArchivo(blob: Blob, nombre: string, opciones: { compartir?: boolean; titulo?: string } = {}): Promise<string | null> {
  if (!esApp()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  }
  const data = await aBase64(blob);
  await Filesystem.writeFile({ path: `${CARPETA}/${nombre}`, data, directory: Directory.Documents, recursive: true });
  if (opciones.compartir) {
    // Se comparte una copia en la caché: Documentos no siempre se puede pasar a otras apps.
    const c = await Filesystem.writeFile({ path: nombre, data, directory: Directory.Cache });
    try { await Share.share({ title: opciones.titulo ?? nombre, files: [c.uri] }); }
    catch { /* cerraste "Compartir" sin elegir: el archivo igual quedó guardado */ }
  }
  return `Documentos/${CARPETA}/${nombre}`;
}

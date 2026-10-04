import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";

/* Guardar un archivo que genera la app (el Excel para Finanzas, la copia de
   seguridad). En Android queda en Documentos/Gastos y después se puede abrir o
   compartir (Drive, mail, WhatsApp). En el navegador se descarga. */

export const CARPETA = "Gastos";
export const esApp = () => Capacitor.isNativePlatform();

const aBase64 = (blob: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => mal(r.error);
  r.readAsDataURL(blob);
});

/** Un archivo guardado en Documentos/Gastos (solo en la app). */
export interface Guardado { nombre: string; ruta: string; uri: string; tipo: string }

/** Lo guarda. En la app queda en Documentos/Gastos y devuelve dónde, para ofrecer
 *  Abrir o Compartir; en el navegador se descarga y devuelve null. */
export async function guardarArchivo(blob: Blob, nombre: string): Promise<Guardado | null> {
  if (!esApp()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  }
  const r = await Filesystem.writeFile({ path: `${CARPETA}/${nombre}`, data: await aBase64(blob), directory: Directory.Documents, recursive: true });
  return { nombre, ruta: `Documentos/${CARPETA}/${nombre}`, uri: r.uri, tipo: blob.type };
}

/** Abre el archivo con la app que corresponda (Sheets, Excel…). */
export async function abrirArchivo(g: Guardado) {
  await FileOpener.open({ filePath: g.uri, contentType: g.tipo, openWithDefault: true });
}

/** "Compartir" (Drive, mail, WhatsApp). Se comparte una copia en la caché:
 *  Documentos no siempre se puede pasar a otras apps. */
export async function compartirArchivo(g: Guardado, titulo: string) {
  const { data } = await Filesystem.readFile({ path: `${CARPETA}/${g.nombre}`, directory: Directory.Documents });
  const c = await Filesystem.writeFile({ path: g.nombre, data, directory: Directory.Cache });
  try { await Share.share({ title: titulo, files: [c.uri] }); }
  catch { /* cerraste "Compartir" sin elegir: el archivo igual quedó guardado */ }
}

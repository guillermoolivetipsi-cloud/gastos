// Copiado de Finanzas (lib/pdf.ts). pdf.js pesa: se carga solo al subir un resumen.

/** El texto de un PDF, renglón por renglón.
 *
 *  pdf.js no entrega renglones: entrega pedazos sueltos, cada uno con su posición. Un
 *  renglón del resumen —fecha, comercio, cupón, importe— suele venir en cuatro pedazos.
 *  Se agrupan por altura y se ordenan de izquierda a derecha, que es como se lee el
 *  papel y como los esperan las reglas de lib/resumen-tarjeta. */
export async function textoDePdf(datos: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(datos);
  const paginas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const piezas = items
      .flatMap(it => ("str" in it && it.str.trim() ? [{ texto: it.str, x: it.transform[4], y: it.transform[5] }] : []))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    // Misma altura con dos puntos de tolerancia: la línea base no siempre coincide exacto.
    const renglones: { y: number; piezas: typeof piezas }[] = [];
    for (const p of piezas) {
      const ultimo = renglones.at(-1);
      if (ultimo && Math.abs(ultimo.y - p.y) <= 2) ultimo.piezas.push(p);
      else renglones.push({ y: p.y, piezas: [p] });
    }
    paginas.push(renglones.map(r => r.piezas.sort((a, b) => a.x - b.x).map(p => p.texto).join(" ")).join("\n"));
  }
  return paginas.join("\n");
}

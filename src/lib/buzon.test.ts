import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { db, guardarAjuste } from "../db";
import type { Movimiento } from "../tipos";

/* El buzón contra una API de GitHub simulada: dejar el envío, esperar la respuesta,
   leerla y marcar lo exportado. */

const repo: Record<string, string> = {}; // ruta → contenido
let rechazar = false;
const API = "https://api.github.com/repos/guillermoolivetipsi-cloud/gastos-buzon";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-29T12:40:05Z"));
  for (const k of Object.keys(repo)) delete repo[k];
  rechazar = false;
  for (const t of db.tables) await t.clear();
  await db.cuentas.add({ id: "rev", nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 0 });
  await db.categorias.add({ id: "cafe", nombre: "Café", tipo: "gasto", icono: "", color: "", orden: 0 });
  const mov = (id: string, fecha: string): Movimiento => ({ id, tipo: "gasto", fecha, monto: 2.4, moneda: "EUR", usd: 2.7, cuentaId: "rev", categoriaId: "cafe", etiquetas: [], comentario: "cortado con leche ñ", creado: `${fecha}T10:00:00Z`, modificado: `${fecha}T10:00:00Z` });
  await db.movimientos.bulkAdd([mov("a", "2026-08-10"), mov("b", "2026-09-20"), mov("julio", "2026-07-01"), mov("viejo", "2026-03-31")]);
  await guardarAjuste("buzonToken", "tok");
  vi.stubGlobal("fetch", vi.fn(async (url: string, o: RequestInit = {}) => {
    const h = o.headers as Record<string, string>;
    if (rechazar || h.Authorization !== "Bearer tok") return new Response("{}", { status: 401 });
    const ruta = url.replace(`${API}/contents/`, "");
    if (o.method === "PUT") {
      const { content } = JSON.parse(o.body as string);
      repo[ruta] = new TextDecoder().decode(Uint8Array.from(atob(content), c => c.charCodeAt(0)));
      return new Response("{}", { status: 201 });
    }
    return repo[ruta] ? new Response(repo[ruta], { status: 200 }) : new Response("{}", { status: 404 });
  }));
});

it("deja el envío en envios/<fecha>.json, y lee la respuesta cuando Finanzas la deja", async () => {
  const { mandar, buscarRespuestas, leerEnvios } = await import("./finanzas");
  const r = await mandar("tok");
  expect(r).toMatchObject({ tipo: "dejado", envio: { nombre: "2026-09-29T12-40-05Z.json", meses: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"], cantidad: 3 } });
  const envio = JSON.parse(repo["envios/2026-09-29T12-40-05Z.json"]);
  expect([envio.app, envio.contrato, envio.desde, envio.hasta, envio.movimientos.map((m: { id: string }) => m.id)]).toEqual(["gastos", "1.0", "2026-04", "2026-09", ["julio", "a", "b"]]);
  expect(envio.movimientos[0]).toMatchObject({ monto: 2.4, moneda: "EUR", cuenta: "Revolut", comentario: "cortado con leche ñ" });

  // Finanzas todavía no lo levantó.
  expect(await buscarRespuestas()).toEqual([]);
  expect((await db.movimientos.get("a"))!.exportado).toBeUndefined();

  repo["respuestas/2026-09-29T12-40-05Z.json"] = JSON.stringify({ app: "finanzas", respondido: "2026-09-29T21:30:02.000Z", envio: "2026-09-29T12-40-05Z.json", ok: true, nuevos: 2, corregidos: 0, iguales: 0, avisos: [], porMes: [{ periodo: "2026-09", nuevos: 1, cambian: 0, iguales: 0 }] });
  const llegaron = await buscarRespuestas();
  expect(llegaron.map(e => [e.resultado?.tipo, e.visto, e.respondido])).toEqual([["listo", false, "2026-09-29T21:30:02.000Z"]]);
  expect([(await db.movimientos.get("a"))!.exportado, (await db.movimientos.get("viejo"))!.exportado]).toEqual(["2026-09-29T12:40:05.000Z", undefined]);
  // Ya tiene respuesta: no se vuelve a buscar.
  expect(await buscarRespuestas()).toEqual([]);
  expect((await leerEnvios())[0].resultado?.tipo).toBe("listo");
});

it("con el token vencido no deja nada y lo dice", async () => {
  const { mandar, leerEnvios } = await import("./finanzas");
  rechazar = true;
  expect(await mandar("tok")).toEqual({ tipo: "token" });
  expect(Object.keys(repo)).toEqual([]);
  expect(await leerEnvios()).toEqual([]);
});

it("sin conexión, nada se manda", async () => {
  const { mandar } = await import("./finanzas");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  expect(await mandar("tok")).toEqual({ tipo: "sin-respuesta" });
});

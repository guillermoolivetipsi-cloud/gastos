# Contrato: Finanzas → la app de gastos del celular

Versión **1.0** (octubre 2026; la app ya lo lee). Es la vuelta del buzón que ya existe
(`../Finanzas/CONTRATO-GASTOS.md`, de la app hacia Finanzas). Lo escribe Finanzas y lo lee
la app de gastos (`src/lib/finanzas.ts`).

Para qué: la app de gastos muestra un **Plan** (cómo se reparte lo que ganás: Vivir 40% ·
Liquidez 15% · Inversión 40% · Deuda 5%). Para eso necesita tres cosas que solo sabe
Finanzas: los **ingresos de la clínica** (Psicología, que entran por PsicoTracker), lo que
fue a **inversión y deuda** cada mes (y a **liquidez**, cuando haya una cuenta aparte para
eso), la **proyección de la clínica** para el mes en curso y los que vienen, y **en qué etapa de la
cascada** estás.

**Un solo plan, dos vistas.** Los porcentajes de la app dicen *cuánto* de lo que entra va
a cada lado; la cascada de Finanzas dice *en qué orden* se llenan los baldes de lo que se
guarda (primero el fondo de liquidez hasta X meses de vida, después libertad, después
invertir). Finanzas manda la etapa y la app la muestra junto a los porcentajes.

## 1 · El buzón

El mismo repo privado: **`guillermoolivetipsi-cloud/gastos-buzon`**, con los mismos tokens
(cada lado el suyo, Contents lectura y escritura, solo ese repo).

- Finanzas escribe **`hacia-gastos/<fecha ISO con guiones>.json`**, por ejemplo
  `hacia-gastos/2026-10-14T21-30-02Z.json`. Un archivo por vez.
- Cuándo: en la misma tarea de las 9:30 y 21:30 (después de procesar los envíos del
  celular), y cuando se toca «Mandar al celular» en Finanzas, si existe.
- La app los busca al abrirse y al volver (igual que hoy busca las respuestas), aplica
  **el más nuevo** y **borra todos** los que leyó: cada archivo trae los meses completos,
  así que el último manda.
- Si la app no lo puede leer, no borra nada y lo vuelve a intentar la próxima vez.

**No se pisa con la ida.** Son archivos distintos en carpetas distintas, y cada carpeta
tiene un solo dueño que escribe:

| carpeta | la escribe | la lee y la borra | qué lleva |
|---|---|---|---|
| `envios/` | la app | Finanzas | los movimientos del celular (contrato de ida) |
| `respuestas/` | Finanzas | la app | cómo le fue a cada envío (contrato de ida) |
| `hacia-gastos/` | Finanzas | la app | lo de este contrato |

Además cada archivo lleva la fecha y la hora en el nombre: dos envíos nunca tienen el mismo.

## 2 · Lo que no se negocia

1. **Los meses van completos y el último manda.** Si viene octubre, la app reemplaza todo
   lo que tenía de Finanzas para octubre (ingresos y destinos) por lo que llega.
2. **El id de cada ingreso es estable.** Es la huella que Finanzas ya usa para los ingresos
   de PsicoTracker: **período + moneda** (`pt-2026-10-ARS`), no el id de la fila (que cambia
   en cada sincronización). La app lo guarda como `finanzas:<id>`: volver a mandarlo lo
   corrige, no lo duplica. Además, cada archivo reemplaza todo lo de Finanzas de esos meses.
3. **Los ingresos van en su moneda natural**, como en la ida. Además, `usd` con el cambio
   que usó Finanzas, para que los dos lados muestren el mismo número. **USDT va como
   `"USD"`** (la app solo conoce ARS, USD y EUR), con el mismo importe.
4. **Hasta el mes en curso, no después.** `meses` son los últimos 6 terminando en el mes
   en curso, y no viaja ningún ingreso con fecha posterior (los cobros adelantados de
   noviembre esperan a noviembre). La app rechaza el archivo entero si un ingreso cae
   fuera de `meses`.
5. **Una fuente por hecho, por categoría.** Psicología y todo lo que entra por PsicoTracker
   se carga **solo en Finanzas**; el resto de los ingresos (alquiler, ventas, licencias),
   **solo en la app**. Finanzas manda los ingresos cargados allá que no llegaron del celular
   (nada con `gastos:<id>`), y la app no manda lo que llegó de Finanzas (`finanzas:<id>`).
   Los préstamos y deudas se registran **solo en Finanzas** (la categoría «Deuda» de la app
   se archiva).
6. **Si igual el mismo ingreso quedó cargado en los dos lados** (mismo día, mismo importe, misma
   moneda), no se pisa: Finanzas lo avisa en la respuesta del envío (`atencion: «… parece
   repetido con …»`). La app no pregunta por repetidos de Psicología: la clínica entra
   solo por PsicoTracker → Finanzas → app. Nadie borra nada solo.

## 3 · Forma

```json
{
  "app": "finanzas",
  "contrato": "1.0",
  "generado": "2026-10-14T21:30:02.000Z",
  "meses": ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  "ingresos": [
    {
      "id": "pt-2026-10-ARS",
      "fecha": "2026-10-31",
      "monto": 2950000,
      "moneda": "ARS",
      "usd": 1903.2,
      "categoria": "Psicología",
      "comentario": "Clínica · octubre en pesos"
    }
  ],
  "destinos": [
    { "periodo": "2026-10", "inversion": 2000, "deuda": 83 }
  ]
}
```

| campo | obligatorio | qué es |
|---|---|---|
| `app` | sí | siempre `"finanzas"` |
| `contrato` | sí | `"1.0"` |
| `generado` | sí | ISO |
| `meses` | sí | `YYYY-MM`, los meses que trae completos. Los últimos 6, como la ida. |
| `ingresos[].id` | sí | la huella de PsicoTracker: `pt-<YYYY-MM>-<moneda>` |
| `ingresos[].fecha` | sí | `YYYY-MM-DD`; para los totales del mes, el último día del mes (o hoy, si es el mes en curso) |
| `ingresos[].monto` | sí | positivo, en su moneda |
| `ingresos[].moneda` | sí | `ARS`, `USD` o `EUR` |
| `ingresos[].usd` | sí | el mismo ingreso en dólares, con el cambio de Finanzas |
| `ingresos[].categoria` | sí | la categoría de Finanzas (`"Psicología"` para los de la clínica). La app usa la de ingresos con ese nombre o la crea. |
| `ingresos[].cuenta` | no | dónde entró |
| `ingresos[].comentario` | no | texto libre |
| `destinos[].periodo` | sí | `YYYY-MM`, uno por cada mes de `meses` |
| `destinos[].liquidez` | **no, todavía** | Solo cuando exista una **cuenta aparte para la liquidez**: USD transferidos a esa cuenta en el mes (neto, puede ser negativo). Mientras no exista, **no se manda** y la app calcula la liquidez como *lo que quedó*: lo que entró − Vivir − Inversión − Deuda. No se usa la variación de los saldos de las cuentas corrientes: se corre un mes con las compras con tarjeta (la app las cuenta el mes de la compra; la plata sale el mes siguiente). |
| `destinos[].inversion` | sí | USD que fueron a inversión: **Nexo (el colchón), Invertir Online** y lo que Finanzas ya llama inversión. Cocos no. |
| `destinos[].deuda` | sí | USD que fueron a **préstamos y deudas**. **Sin el pago del resumen de la tarjeta**: esas compras ya cuentan como gasto en la app el mes de la compra; contarlas acá sería contarlas dos veces. |
| `etapa` | no | la etapa de la cascada hoy (ver abajo). Si no viene, la app no la muestra. |
| `estimados` | no | la proyección de la clínica para el mes en curso y los que vienen (ver abajo). |

`inversion` y `deuda` van **en dólares y positivos**; `liquidez`, cuando venga, en dólares y
puede ser negativa. Ya sumados por mes: la app no los muestra uno por uno,
solo los compara con el plan.

### La etapa de la cascada

```json
"etapa": { "nombre": "Llenar liquidez", "meses": 2.1, "objetivo": 3, "texto": "fondo de liquidez: 2,1 de 3 meses de vida" }
```

| campo | obligatorio | qué es |
|---|---|---|
| `etapa.nombre` | sí | la etapa en la que estás hoy, como la llama Finanzas |
| `etapa.meses` / `etapa.objetivo` | no | cuántos meses de vida tenés y cuántos pide la etapa |
| `etapa.texto` | sí | una línea corta para mostrar tal cual |

**La deuda, una sola vez.** Los préstamos se registran solo en Finanzas. Lo que haya quedado
cargado en la app con la categoría «Deuda» (meses anteriores) la app no lo cuenta en Vivir,
y cuando Finanzas manda `deuda` para un mes usa ese número y no el suyo.

### La proyección de la clínica (el mes en curso y los que vienen)

```json
"estimados": [
  { "periodo": "2026-10", "usd": 3784, "texto": "74 sesiones agendadas" },
  { "periodo": "2026-11", "usd": 3900, "texto": "agenda de PsicoTracker" }
]
```

| campo | obligatorio | qué es |
|---|---|---|
| `estimados[].periodo` | sí | **siempre el mes en curso y los 5 siguientes** (la proyección de la clínica que ya tiene Finanzas, la de `proyeccion_mes`/PsicoTracker). Nunca meses pasados. |
| `estimados[].usd` | sí | cuánto se espera que entre por la clínica **en total** ese mes, según la proyección de PsicoTracker/Finanzas |
| `estimados[].texto` | no | de dónde sale, corto |

Para qué lo usa la app:

- **El mes en curso**, en el Plan: en gris, como estimado, para tener contra qué comparar
  (lo que entró de la clínica hasta hoy y lo que falta hasta el estimado, aparte). No se
  suma como si fuera real.
- **Los meses que vienen**, en Proyecciones: la línea «normal» de ingresos usa la agenda
  para la clínica y los recurrentes de ingreso de la app para el resto. Si un mes no viene,
  la app repite la última proyección que llegó (no el promedio, que achica una clínica que
  crece). Cada archivo reemplaza todos los estimados anteriores.

**Lo ejecutado y lo proyectado, siempre.** Lo ejecutado son los `ingresos` (hasta el mes en
curso); lo proyectado, los `estimados` (del mes en curso a 5 meses adelante). Los dos van en
cada archivo.

**No son cobros sueltos.** Finanzas tiene los ingresos de la clínica como **totales por mes
y por moneda** (pesos, euros, USDT): llegan unos tres por mes, y la app los muestra así.

## 4 · Lo que hace la app con esto

- Los ingresos entran como ingresos de su categoría, marcados como **de Finanzas**: se ven en Ingresos y en el Plan, no se editan en el celular (se corrigen en
  Finanzas) y **no se vuelven a mandar** a Finanzas.
- Los destinos se guardan por mes y solo se usan en el Plan.
- No hay respuesta de la app a Finanzas: si algo está mal, la app lo avisa en el celular.

## 5 · Salvaguarda del lado de Finanzas

El importador de la ida (`envios/`) **ignora cualquier movimiento con id que empiece con
`finanzas:`**. La app no los manda, pero si algún día se confundiera, el ingreso de la
clínica no queda contado dos veces.

## 6 · Todavía no

- Borrar: si un mes deja de venir, la app conserva lo último que recibió de ese mes.

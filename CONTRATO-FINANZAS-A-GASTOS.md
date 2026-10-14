# Contrato: Finanzas → la app de gastos del celular

Versión **1.0** (octubre 2026; la app ya lo lee). Es la vuelta del buzón que ya existe
(`../Finanzas/CONTRATO-GASTOS.md`, de la app hacia Finanzas). Lo escribe Finanzas y lo lee
la app de gastos (`src/lib/finanzas.ts`).

Para qué: la app de gastos muestra un **Plan** (cómo se reparte lo que ganás: Vivir 40% ·
Liquidez 15% · Inversión 40% · Deuda 5%). Para eso necesita dos cosas que solo sabe
Finanzas: los **cobros de Psicología** (entran por PsicoTracker) y lo que fue a
**liquidez, inversión y deuda** cada mes.

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
2. **El id de cada ingreso es estable.** La app lo guarda como `finanzas:<id>`: volver a
   mandarlo lo corrige, no lo duplica.
3. **Los ingresos van en su moneda natural**, como en la ida. Además, `usd` con el cambio
   que usó Finanzas, para que los dos lados muestren el mismo número.
4. **Una fuente por hecho.** Solo viaja lo que la app no tiene: los cobros de Psicología.
   Nada que haya llegado desde la app (lo que tiene `gastos:<id>`) vuelve.

## 3 · Forma

```json
{
  "app": "finanzas",
  "contrato": "1.0",
  "generado": "2026-10-14T21:30:02.000Z",
  "meses": ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  "ingresos": [
    {
      "id": "psico-2026-10-07-0042",
      "fecha": "2026-10-07",
      "monto": 85000,
      "moneda": "ARS",
      "usd": 54.8,
      "categoria": "Psicología",
      "cuenta": "Galicia débito",
      "comentario": "Sesiones semana 1"
    }
  ],
  "destinos": [
    { "periodo": "2026-10", "liquidez": 500, "inversion": 2000, "deuda": 100 }
  ]
}
```

| campo | obligatorio | qué es |
|---|---|---|
| `app` | sí | siempre `"finanzas"` |
| `contrato` | sí | `"1.0"` |
| `generado` | sí | ISO |
| `meses` | sí | `YYYY-MM`, los meses que trae completos. Los últimos 6, como la ida. |
| `ingresos[].id` | sí | estable, único |
| `ingresos[].fecha` | sí | `YYYY-MM-DD` |
| `ingresos[].monto` | sí | positivo, en su moneda |
| `ingresos[].moneda` | sí | `ARS`, `USD` o `EUR` |
| `ingresos[].usd` | sí | el mismo ingreso en dólares, con el cambio de Finanzas |
| `ingresos[].categoria` | sí | hoy siempre `"Psicología"` |
| `ingresos[].cuenta` | no | dónde entró |
| `ingresos[].comentario` | no | texto libre |
| `destinos[].periodo` | sí | `YYYY-MM`, uno por cada mes de `meses` |
| `destinos[].liquidez` | sí | USD que fueron a liquidez ese mes (0 si nada) |
| `destinos[].inversion` | sí | USD que fueron a inversión |
| `destinos[].deuda` | sí | USD que fueron a pagar deuda (tarjeta no: eso ya es gasto) |

`liquidez`, `inversion` y `deuda` van **en dólares y positivos**, ya sumados por mes: la app
no los muestra uno por uno, solo los compara con el plan.

**La deuda, una sola vez.** En la app hay una categoría de gastos «Deuda»; esos movimientos
viajan a Finanzas por la ida. La app **no** los cuenta en Vivir sino en Deuda, y cuando
Finanzas manda `deuda` para un mes, usa ese número y no el suyo. Por eso `deuda` tiene que
incluir lo que llegó del celular con categoría «Deuda» (además de lo que Finanzas sabe por
otro lado), así no queda contado dos veces ni se pierde.

## 4 · Lo que hace la app con esto

- Los ingresos entran como ingresos de la categoría Psicología, marcados como **de
  Finanzas**: se ven en Ingresos y en el Plan, no se editan en el celular (se corrigen en
  Finanzas) y **no se vuelven a mandar** a Finanzas.
- Los destinos se guardan por mes y solo se usan en el Plan.
- No hay respuesta de la app a Finanzas: si algo está mal, la app lo avisa en el celular.

## 5 · Todavía no

- Mandar otros ingresos que no sean de Psicología.
- Borrar: si un mes deja de venir, la app conserva lo último que recibió de ese mes.

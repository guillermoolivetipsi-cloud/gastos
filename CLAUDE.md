# Gastos

App personal para anotar gastos e ingresos y ver cómo viene el mes. Reemplaza a la app de gastos anterior y se integra con Finanzas (`../Finanzas`, otra app, no tocar) exportando un Excel. React + TypeScript + Vite, datos locales en el teléfono con Dexie (IndexedDB), textos y nombres de código en español. Totales en USD.

Hay dos versiones de la misma app:
- **App de Android** (la principal): empaquetada con Capacitor, proyecto en `android/`, igual que `../Habitos`.
- **PWA** en GitHub Pages (https://guillermoolivetipsi-cloud.github.io/gastos/): la versión anterior. Se mantiene hasta pasar los datos a la app; después se puede apagar (borrar `.github/workflows/publicar.yml`, `vite-plugin-pwa`, `src/sw.ts` y `tsconfig.sw.json`).

## Reglas que no se negocian

- Antes de cambiar algo que se ve, mostrar una maqueta y esperar el OK.
- No pisar datos: cambios de la base con `db.version(n).upgrade`, con prueba en `migracion.test.ts`.
- Una compra con tarjeta cuenta en el mes de la compra; se paga con el resumen del mes siguiente.
- El Excel a Finanzas va siempre por meses enteros y en el mismo orden (Finanzas numera los duplicados).

## Estructura

- `src/tipos.ts`: modelo. `src/db.ts`: base (Dexie) y carga inicial de cuentas y categorías. `src/datos.ts`: los datos leídos una vez y compartidos.
- `src/lib/analisis.ts`, `recurrentes.ts`, `tarjeta.ts`, `insights.ts`, `proyecciones.ts`: cálculos, funciones puras con pruebas.
- `src/lib/resumen-tarjeta.ts` + `pdf.ts` + `conciliar.ts` + `aplicarResumen.ts`: leer el PDF del resumen, compararlo con lo cargado y guardarlo.
- `src/lib/archivos.ts`: exportar a Finanzas, importar el Excel de la app anterior, copia de seguridad, restaurar y "paquetes" que suman sin borrar.
- `src/lib/guardar.ts`: guarda archivos. En Android: Documentos/Gastos y "Compartir"; en el navegador, descarga.
- `src/lib/recordatorios.ts`: qué está pendiente en un momento dado (puro). `src/lib/avisos.ts`: qué avisar; en Android, `planificar` arma los avisos de los próximos 14 días. `src/lib/notificaciones.ts`: los programa (Android) o registra la sincronización periódica (PWA).
- `src/lib/finanzas.ts` + `src/pantallas/Finanzas.tsx`: «Mandar a Finanzas» por el buzón, según `../Finanzas/CONTRATO-GASTOS.md`. La app sube el envío (el mes en curso y el anterior, completos, en su moneda, con el id de la app) a `envios/<fecha>.json` del repo privado `guillermoolivetipsi-cloud/gastos-buzon`, con un token de GitHub de grano fino (Contents lectura y escritura, solo ese repo) guardado en el ajuste `buzonToken`. Finanzas deja `respuestas/<mismo nombre>.json`; la app las busca al abrirse y al volver (`buscarRespuestas`), avisa arriba y marca esos meses como exportados. Los envíos quedan en el ajuste `buzonEnvios`. No viajan los cobros de Psicología (entran por PsicoTracker). Todavía no: borrados y recurrentes.
- `src/lib/actualizacion.ts`: busca en GitHub Releases una versión más nueva y ofrece descargarla.
- `src/sw.ts`: service worker, solo de la PWA. `src/lib/sin-pwa.ts` lo reemplaza en la compilación de Android.
- `src/App.tsx`: solapas, pila de pantallas, botón atrás de Android, atajos del ícono (`gastos://gasto`, `gastos://resumen`), tocar un aviso, aviso de versión nueva.
- `src/pantallas/`: una por pantalla.
- `android/`: proyecto de Capacitor. Ícono adaptable (fondo violeta + la dona), ícono de notificación, atajos en `res/xml/shortcuts.xml`, permisos en `AndroidManifest.xml`, firma y número de versión en `app/build.gradle`.

## Comandos

- `npm run dev`: servidor de desarrollo (versión web).
- `npm test`: pruebas (Vitest).
- `npm run build`: compilación web (PWA, con service worker).
- `npm run build:android`: compilación para Android (`vite build --mode android`, sin service worker).
- `npm run android`: `build:android` + `npx cap sync android`.
- `npm run apk`: además arma un APK de prueba (requiere JDK/Android Studio; en esta Mac no hay, se compila en GitHub).

## Publicar

Cada push a `main` corre dos workflows:
- `.github/workflows/apk.yml`: prueba, compila, firma y publica el APK como Release `v1.0.<número>` (`gastos.apk`). La app avisa sola que hay versión nueva.
- `.github/workflows/publicar.yml`: publica la PWA en GitHub Pages (mientras exista).

Firma: `firma/gastos.p12` y `firma/contrasena.txt`, fuera de git. En GitHub están en los secretos `FIRMA_P12` (el .p12 en base64) y `FIRMA_CONTRASENA`. No cambiar la clave: si cambia, el teléfono no deja actualizar sin desinstalar, y desinstalar borra los datos.

## Pasar los datos de la PWA a la app

Los datos no pasan solos: cada una tiene su propia base.
1. En la PWA: Más → Copia de seguridad e importar → **Hacer copia ahora**. Se baja `gastos-respaldo-AAAA-MM-DD.json`: guardalo en Drive o mandátelo.
2. Instalar la app: en el teléfono, abrir la última Release del repo y bajar `gastos.apk`. Android pide permiso para instalar apps de esa fuente.
3. En la app: Más → Copia de seguridad e importar → **Restaurar o sumar desde archivo** → elegir el .json. Reemplaza todo por lo de la copia (movimientos, recurrentes, proyecciones, cuentas, categorías, ajustes).
4. Revisar que estén los movimientos. Recién ahí dejar de usar la PWA.
5. En la app: Ajustes → activar "Avisarme lo pendiente" (Android pide permiso de notificaciones).

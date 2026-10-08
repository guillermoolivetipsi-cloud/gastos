# Gastos

App personal para anotar gastos e ingresos y ver cómo viene el mes. Reemplaza a la app de gastos anterior y se integra con Finanzas (`../Finanzas`, otra app, no tocar) exportando un Excel. React + TypeScript + Vite, datos locales en el teléfono con Dexie (IndexedDB), textos y nombres de código en español. Totales en USD.

Es una **app de Android**, empaquetada con Capacitor (proyecto en `android/`), igual que `../Habitos`. Antes fue una PWA en GitHub Pages: se dio de baja en octubre de 2026 y ya no existe. El navegador (`npm run dev`) queda solo para probar cambios: ahí no hay avisos, ni Abrir/Compartir, ni actualizaciones.

## Reglas que no se negocian

- Antes de cambiar algo que se ve, mostrar una maqueta y esperar el OK.
- No pisar datos: cambios de la base con `db.version(n).upgrade`, con prueba en `migracion.test.ts`.
- Una compra con tarjeta cuenta en el mes de la compra; se paga con el resumen del mes siguiente.
- El Excel a Finanzas va siempre por meses enteros y en el mismo orden (Finanzas numera los duplicados).

## Reglas visuales (definidas por Guillermo; respetarlas en todo lo nuevo)

Se van sumando a medida que él decide. Antes de cambiar algo que se ve, igual mostrar la maqueta.

- **Tamaños de texto** (`src/estilos.css`): texto general 15 px y título de pantalla 20 px (no se cambian). Textos grises de aclaración: `.mini` 13 px, `.chico` 14 px; títulos de sección 14 px. Etiquetas de color (`.etiq`: fijo, variable, seguro…) 12 px. **Nada de contenido nuevo por debajo de 13 px**, salvo los números de los gráficos.
- **Categorías:** las grillas para elegir (al cargar un gasto y en Categorías) van de a **5 por fila** (`.cats.cinco`): círculo de 46 px, ícono de 24 px (`<Punto grande />`), nombre de 13 px cortado con "…"; se ven 9 y "Todas". En las listas el círculo sigue de 28 px (`chico`). El selector de íconos queda en 6 por fila, de 48 px.
- **Se probaron y no se cambian** (octubre 2026): el texto general, los íconos de las listas, los botones dentro de las filas, los montos, la barra de abajo y los números de los gráficos.
- **Barras con objetivo:** la marca blanca va fija al 80% del objetivo; la barra es del color de la categoría, amarilla desde el 80% y roja al pasarse. Lo previsto (recurrentes sin cargar) va como tramo rayado y cuenta para el color.
- **Números que todavía no pasaron:** con "~" y en gris, con la palabra "previsto" o "estimado". Nunca mezclar lo real con lo previsto sin marcarlo.
- **Comparaciones de un mes en curso:** siempre contra los meses anteriores hasta el mismo día, y el texto lo dice ("a esta altura").
- **Proyecciones:** "seguro" y "opcional" (nunca "capricho"); en la torta, lo seguro en tono claro y lo opcional rayado.
- **Listas** (decididas sobre Lo que viene, octubre 2026; valen para toda la app):
  - **Fecha:** en las listas con fecha, el día grande a la izquierda con el mes abajo (`<Dia />`); en rojo si venció. En Recurrentes, el día de cobro con "c/mes", "c/sem" o el mes. Movimientos no lo lleva porque ya agrupa por día.
  - **Montos:** los dólares arriba y la moneda original abajo en gris (`<Montos />`), igual que los totales. Si el monto está en USD, una sola línea.
  - **Acciones:** una sola por fila ("Cargar", o "Cobrar" en los ingresos). Lo demás ("Fue 0", saltear, elegir un gasto ya cargado) va en la pantalla que se abre tocando la fila.
  - **Estado:** como texto de color en la línea gris (· vencido en rojo, · parcial en amarillo), sin píldoras.
  - **Resumen de arriba:** tres números uno al lado del otro (en Lo que viene: Por pagar · Pagado · A cobrar; en Tarjetas: A pagar · Se junta · Cuotas después).
  - **Orden:** por secciones, como estaba (de tus cuentas, a la tarjeta, a cobrar, ya pagados).
- **Formularios de carga** (decididos sobre "Nuevo gasto", octubre 2026; valen para cargar recurrentes, proyecciones y lo que venga):
  - **Orden:** el monto, después la categoría, después con qué pagaste (y cuotas), después etiquetas. Lo que se elige siempre va arriba.
  - **Moneda:** un botón chico al lado del número ("EUR ▾"); un toque pasa a la siguiente. Arranca en la que más usás.
  - **Fecha:** en el título ("Nuevo gasto · hoy ▾"); un toque abre hoy / ayer / anteayer / otro día.
  - **Comentario:** en "Más detalles", como estaba.
  - **Guardar:** un botón grande fijo abajo, como estaba.
  - **"Repetir con un toque":** debajo de las categorías.
  - **Piezas compartidas** en `src/ui/formulario.tsx`: `MontoConMoneda`, `GrillaCategorias` y `FechaEnTitulo`. Las usan "Nuevo gasto", el recurrente ("· desde hoy ▾") y la proyección ("· oct ▾"); cualquier formulario nuevo las usa también.
- **Avisos y acciones de un toque:** el resultado va en el aviso de abajo, sin cambiar de pantalla (como la nube de Mandar a Finanzas).

## Estructura

- `src/tipos.ts`: modelo. `src/db.ts`: base (Dexie) y carga inicial de cuentas y categorías. `src/datos.ts`: los datos leídos una vez y compartidos.
- `src/lib/analisis.ts`, `recurrentes.ts`, `tarjeta.ts`, `insights.ts`, `proyecciones.ts`: cálculos, funciones puras con pruebas.
- `src/lib/resumen-tarjeta.ts` + `pdf.ts` + `conciliar.ts` + `aplicarResumen.ts`: leer el PDF del resumen, compararlo con lo cargado y guardarlo.
- `src/lib/archivos.ts`: exportar a Finanzas, importar el Excel de la app anterior, copia de seguridad, restaurar y "paquetes" que suman sin borrar.
- `src/lib/guardar.ts`: guarda archivos. En Android: Documentos/Gastos y "Compartir"; en el navegador, descarga.
- `src/lib/recordatorios.ts`: qué está pendiente en un momento dado (puro). `src/lib/avisos.ts`: `planificar` arma los avisos de los próximos 14 días. `src/lib/notificaciones.ts`: los programa.
- `src/lib/finanzas.ts` + `src/pantallas/Finanzas.tsx`: «Mandar a Finanzas» por el buzón, según `../Finanzas/CONTRATO-GASTOS.md`. La app sube el envío (los últimos 6 meses, completos, en su moneda, con el id de la app y el medio de pago en `cuenta`) a `envios/<fecha>.json` del repo privado `guillermoolivetipsi-cloud/gastos-buzon`, con un token de GitHub de grano fino (Contents lectura y escritura, solo ese repo) guardado en el ajuste `buzonToken`. Finanzas deja `respuestas/<mismo nombre>.json`; la app las busca al abrirse y al volver (`buscarRespuestas`), avisa arriba y marca esos meses como exportados. Los envíos quedan en el ajuste `buzonEnvios`. No viajan los cobros de Psicología (entran por PsicoTracker). Todavía no: borrados y recurrentes.
- `src/lib/actualizacion.ts`: busca en GitHub Releases una versión más nueva y ofrece descargarla (aviso arriba al abrir, y en Más: "Actualizar la app" o "Buscar actualización", con la versión instalada al pie).
- `src/App.tsx`: solapas, pila de pantallas, botón atrás de Android, atajos del ícono (`gastos://gasto`, `gastos://resumen`), tocar un aviso, aviso de versión nueva.
- `src/pantallas/`: una por pantalla.
- `android/`: proyecto de Capacitor. Ícono adaptable (fondo violeta + la dona), ícono de notificación, atajos en `res/xml/shortcuts.xml`, permisos en `AndroidManifest.xml`, firma y número de versión en `app/build.gradle`.

## Comandos

- `npm run dev`: servidor de desarrollo, para probar en el navegador.
- `npm test`: pruebas (Vitest).
- `npm run build`: chequeo de tipos y compilación.
- `npm run android`: `build` + `npx cap sync android`.
- `npm run apk`: además arma un APK de prueba (requiere JDK/Android Studio; en esta Mac no hay, se compila en GitHub).

## Publicar

Cada push a `main` corre `.github/workflows/apk.yml`: prueba, compila, firma y publica el APK como Release `v1.0.<número>` (`gastos.apk`). La app avisa sola que hay versión nueva.

Firma: `firma/gastos.p12` y `firma/contrasena.txt`, fuera de git. En GitHub están en los secretos `FIRMA_P12` (el .p12 en base64) y `FIRMA_CONTRASENA`. No cambiar la clave: si cambia, el teléfono no deja actualizar sin desinstalar, y desinstalar borra los datos.

## Pasar los datos a otro celular

1. En el celular viejo: Más → Copia de seguridad e importar → **Hacer copia ahora** → Compartir (Drive o mail).
2. En el nuevo: bajar `gastos.apk` de la última Release del repo e instalarlo.
3. Más → Copia de seguridad e importar → **Restaurar o sumar desde archivo** → elegir el .json. Reemplaza todo por lo de la copia.
4. Ajustes → activar "Avisarme lo pendiente".

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
  - **Montos:** un solo número a la derecha, en dólares y sin "USD" (`<Montos />`); la moneda original va al final de la línea gris («Revolut · 55 EUR», con `textoOriginal`). Sin cotización, el monto en su moneda.
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
- **Resumen y pantallas de números** (decididas en octubre 2026; valen también para Cómo venís, Proyecciones y la tarjeta):
  - **Período:** como estaba, tres filas: pestañas (GASTOS · INGRESOS · PROYECCIONES), vistas (Día · Semana · Mes · Año · Período) y «‹ Octubre 2026 ›».
  - **Números de arriba:** como estaban, las cajas Fijos y Variables con su barra y «te quedan X para N días».
  - **Gráfico del mes:** la torta chica (120 px) con el total grande al lado (30 px), y debajo del total lo previsto y lo proyectado. Nunca una torta grande centrada.
  - **Lista por categoría:** como estaba, con el porcentaje.
  - **«Cómo venís»:** una sola línea arriba ("✦ Cómo venís: tarjeta 22% · noviembre ~1.982 · suscripciones 57 ›"), con textos cortos; se toca para el detalle.
  - **Botones de arriba:** la nube (Mandar a Finanzas) y la bandeja (Para revisar), como estaban.
- **Movimientos** (decididas en octubre 2026; valen para cualquier lista de movimientos, como el detalle de una categoría):
  - **Buscar y filtrar:** como estaba, tres filas (buscador · Todos/Gastos/Ingresos · medio de pago y categoría).
  - **Encabezado de cada día:** fecha corta y el total del día ("8 oct · jue … −86,60").
  - **Cada fila:** arriba lo que fue (el comentario o las etiquetas; si no hay, la categoría); abajo la categoría y la cuenta.
  - **Cuotas y recurrentes:** íconos chicos junto al monto: "3×" en azul para cuotas y ↻ en violeta para el pago de un recurrente.
  - **Borrar:** deslizando a la izquierda, con "Deshacer".
  - **Totales:** siempre una línea arriba; sin filtros, el mes en curso ("Octubre: −1.761 gastos · +3.000 ingresos USD"); con filtros, lo filtrado.
- **Para revisar** (decididas en octubre 2026; valen para cualquier pregunta que haga la app):
  - **Agrupadas por tipo:** un encabezado por tipo con la cantidad, que se abre y se cierra; arranca abierto el primero.
  - **Orden:** lo urgente primero (lo que tiene fecha: tareas del mes, pagos de recurrentes, cierres de tarjeta), después las sugerencias (cambios de precio, recurrentes encontrados, fijas o variables).
  - **Cada pregunta:** corta, con un solo dato abajo en gris ("¿Es el pago de Expensas?" · "5 oct · 179.100 ARS").
  - **Botones:** "Sí" (o la acción principal), "No" (o "Fue una vez", "Ya lo hice") y "⋯", que abre "Otra cosa…" y "Ahora no".
  - **"Ahora no":** la esconde 30 días, como estaba.
  - **Acceso:** la bandeja con número en Resumen, como estaba.
- **Orden** (decidido en octubre 2026, después de probar letra más grande y más aire, que no se cambian; vale para toda la app):
  - **Una sola fila de controles arriba:** en Movimientos la lupa va en el título y los filtros en una fila de desplegables (Gastos e ingresos · Todas las cuentas · Categoría); en Resumen la vista («Mes ▾») y «‹ Octubre 2026 ›» comparten la fila; en Lo que viene, el mes con flechas, igual que en Resumen.
  - **Un solo monto por fila** (ver Montos, en Listas).
  - **Grupos que se ven:** cada día o sección tiene su título (`.grupo-t`: 14 px, en blanco, con el total a la derecha) y su propia caja; hay más espacio entre grupos que entre filas.
  - **Columnas alineadas:** nada de columnas sueltas en el medio (el % va debajo del nombre); el objetivo al lado del monto y lo previsto debajo; la torta con su texto pegado a la izquierda y «Con proyecciones» debajo del total; en las listas con el día a la izquierda, la categoría es un puntito de color (`<Puntito />`), no el círculo.
  - **Se probaron y no se cambian:** los colores, los bordes de las cajas, el tamaño de letra y el espacio entre filas.
- **Recurrentes** (decididas en octubre 2026, sobre Más → Recurrentes):
  - **Arriba:** tres números, sin párrafo de explicación: Gastos/mes · Ingresos/mes · A la tarjeta (USD por mes).
  - **Gastos e ingresos:** dos solapas, GASTOS · INGRESOS, como en Resumen.
  - **Orden:** por monto, lo más caro arriba.
  - **Fijo o variable:** sin etiqueta; los variables llevan «~» en el monto.
  - **Lo semanal y lo anual:** pasado a dólares por mes («97/mes»), como estaba.
  - **En partes y terminados:** «Lo que debés en partes» arriba de la lista; «Terminados» plegado al final.
- **Recurrente del mes** (decididas en octubre 2026, la pantalla que se abre al tocar una fila de Lo que viene):
  - **Título:** «Alquiler · octubre» y debajo, en gris, cada cuánto y con qué cuenta («todos los meses, el 25 · Wise»).
  - **El monto:** un número grande y una línea («1.100 EUR · vence el 25 oct · falta todo»); la barra solo si está pagado en parte.
  - **Si ya cargaste algo parecido:** se pregunta arriba («¿Es este el pago?» con Sí y No), como en Para revisar.
  - **Los meses anteriores:** barritas de los últimos 6 meses, con el monto cuando cambia.
  - **Acciones:** una sola grande abajo («Cargar el pago», «Cargar lo que falta», «+ Agregar otro pago»), con «¿Ya lo cargaste? Elegilo» como enlace arriba.
  - **«⋯» arriba:** Editar el recurrente · Fue 0 este mes · Dejar de pedirlo · Saltear solo este mes · Eliminarlo del todo. Sin tacho ni botones sueltos abajo.
- **Cómo venís** (decididas en octubre 2026, el detalle que se abre desde Resumen):
  - **Orden:** como estaba, igual que la línea de Resumen: Tarjeta, el mes que viene, Suscripciones y Qué cambió. Sin resumen arriba (la línea de Resumen ya lo muestra).
  - **Títulos:** afuera de la caja (`.grupo-t`), sin número de orden, con el número principal a la derecha («Tarjeta … 565 USD»).
  - **Datos:** cada uno en su fila alineada (nombre a la izquierda, número a la derecha), separadas por una línea (`.filas`).
  - **Suscripciones:** como en Recurrentes: el día, el puntito de color, con qué tarjeta y el monto; lo más caro arriba.
  - **Aclaraciones:** detrás de un «?» en el título (`.ayuda`), que las muestra al tocarlo; nunca a la vista todo el tiempo.
- **Tarjetas** (decididas en octubre 2026, la solapa TARJETAS de Lo que viene y el detalle de una tarjeta):
  - **Cada tarjeta en la solapa:** caja corta: el total grande y una línea («vence ~5 nov · 12 consumos ›», que abre el detalle), los recurrentes del resumen como estaban, y un solo botón, «Subir resumen».
  - **Arriba del detalle:** un número y una línea («cierra 28 oct ▾ (estimado) · vence ~5 nov»); la fecha de cierre se toca para cambiarla. «Subir el resumen» grande y fijo abajo.
  - **Consumos del resumen:** como en Movimientos: arriba lo que fue, abajo la categoría; «3×» en azul para las cuotas y ↻ para un recurrente.
  - **Cuotas que siguen:** la lista al final, como estaba.
  - **Aclaraciones** («Se junta…», «Pagar la tarjeta no es un gasto nuevo…»): detrás de un «?» (`<GrupoT ayuda>`).
- **Subir el resumen** (decididas en octubre 2026, la pantalla que compara el PDF con lo cargado):
  - **Arriba:** la tarjeta en el título («Resumen · Visa ▾», se cambia ahí), el total grande, «N consumos · ✓ cuadra con el banco» y «cierra 28 oct ▾ · vence 5 nov ▾» (se tocan para corregir).
  - **Orden:** primero lo que hay que decidir (lo nuevo, devoluciones, moneda equivocada, otra cuenta), después lo cargado que el resumen no trae, y «✓ N ya cargados, coinciden» plegado al final.
  - **Categoría de lo nuevo:** la lista desplegable «¿Qué categoría es?», como estaba.
  - **Qué se aplica:** sin casillas: cada fila dice a la derecha qué va a pasar («se agrega», «se corrige») y se toca para pasarla a «no».
  - **Cambios de moneda o de cuenta:** «55 USD → 55 EUR» (o «Revolut → Visa») a la derecha, alineado con los montos; abajo en gris qué cambia.
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

# QA final de Clara v2 (Fase 12)

Fecha: 2026-10-07 · Rama `feature/clara-v2` · Esquema de datos v10.

## Alcance y límites de esta revisión

- Se recorrió **cada pantalla** contra la sección 7 del *master prompt* y la lista de anti-patrones de
  la sección 13. La sección 3 de `spec-clara-referencia-lukas.md` **no se pudo revisar: el archivo no está
  en el repositorio** (pendiente desde el Paso 0; ver `docs/PLAN-CLARA.md`). Cuando se reciba, hay que
  repetir el recorrido de §3 y completar este informe.
- «Verificado» significa: hay una prueba automática (unitaria o Playwright) que lo comprueba, o se comprobó
  en el navegador de pruebas (Chromium headless) con capturas en `docs/qa/`. No se afirma nada probado en
  un teléfono real ni en Safari/Firefox: no se usaron.
- Evidencia reproducible: `npm run check` (typecheck, lint, lint:i18n, tests) y `npm run test:e2e`.

## Estado de verificación (definición de hecho, §12)

| Criterio | Resultado |
|---|---|
| Compila; lint y typecheck en verde | `npm run build` ✓ · `npx tsc -b` ✓ · `npx oxlint` ✓ (0 errores) |
| Pruebas unitarias | 526 pasan, 1 omitida (52 archivos) |
| Pruebas Playwright (celular, celular 320 px, escritorio, con axe) | 354 pruebas; las ejecuciones completas de cada fase quedaron en verde (las únicas fallas fueron *timeouts* del *service worker* en escritorio bajo carga, que pasaron al repetirse en aislamiento) |
| Cada criterio de aceptación marcado en `docs/PLAN-CLARA.md` | ✓ salvo los que requieren servicios externos (sesión, sincronización, pagos) y el archivo de spec ausente |
| Claro, oscuro y sistema; 4 idiomas | Temas: `theme.spec.ts` + auditoría axe en claro y oscuro. Idiomas: prueba de completitud de claves en es/en/pt/fr y `english.spec.ts` recorre las pantallas nuevas en inglés sin texto en español. PT y FR solo se verificaron por claves, no visualmente |
| Sin textos fijos ni flotantes en importes | `scripts/find-literals.mjs` (AST) en `npm run check`; importes en enteros (`money.ts`, `floorDiv`/`mulDivFloor`) |
| Commit e informe por fase | Commits `2293a9c`, `375abfb`, `33dbe61`, `1ca47ca`, `b2e9924`, `5506419`, `05522a5` |

## Recorrido por pantalla (sección 7)

### 7.1 Onboarding
- Bienvenida con idioma (ES/EN/PT/FR), 4 preguntas de Clara, aviso de privacidad y **mención del modo invitado** (anti-patrón 11). Capturas: `qa/01-bienvenida.jpg`.
- «Tus categorías»: 16 + 6 propuestas marcadas, crear propias, contador por tipo (`categories-v2.spec.ts`).
- Moneda y periodo (mensual por defecto; «hasta mi próximo ingreso» disponible). Saldo inicial = saldo de referencia.
- Pasos opcionales con «Ver mi resultado ahora» (< 60 s). Verificado en `setup.spec.ts`, `full-flow.spec.ts`.

### 7.2 Inicio
- Tarjeta de saldo con periodo y días restantes; *safe to spend* Día/Semana/Periodo visible con un selector (no tras pulsación larga, anti-patrón 8); explicación «¿Cómo se calculó?» con cada paso; arrastre entre periodos (anti-patrón 7). `categories-v2.spec.ts`, `demo-and-home.spec.ts`.
- Privacidad de 3 niveles desde un botón con pista; FAB con hoja (gasto, ingreso, transferencia, asistente, entradas comunes); tour de 3 pistas que no se repite (anti-patrón 4). `personalize.spec.ts`, `assistant.spec.ts`. Capturas: `qa/02-inicio.jpg`, `qa/03-inicio-privado.jpg`.

### 7.3 Registro y 7.4 Historial
- Formulario manual con comercio, etiquetas, foto de recibo, divisiones, plantillas, favoritos (solo rellenan). Asistente de texto/voz/foto con vista previa editable y registro todo o nada. `assistant.spec.ts`, `assistant-photo.spec.ts`, `settings-v2.spec.ts`.
- Historial con búsqueda, filtros (tipo, estado, cuenta, categoría, etiqueta, fechas), selección múltiple, deslizar + deshacer, exportación CSV del filtro, edición rápida (anti-patrón 12). `history-tools.spec.ts`, `movements.spec.ts`. Capturas: `qa/04-historial.jpg`.

### 7.5 Planes
- Onboarding de 3 pantallas (una vez), lista Activos/Completados, tarjetas por estado, límites de **varias categorías**, metas con **aportes** (anti-patrón 13), cierre automático y recurrencia con historial, resultados, «Repetir», alertas 80/100 % con horas de silencio, resumen automático. `plans.spec.ts`, `plans.test.ts`. Capturas: `qa/05-planes.jpg`, `qa/06-plan-detalle.jpg`.

### 7.6 Estadísticas
- Chips de periodo (todos gratis, anti-patrón 5), navegador, 3 cifras con delta, donut, barras de 6 periodos con tooltip con `formatMoney` (anti-patrón 6), tendencia, top 5, promedio diario, saldo futuro a 90 días con banda (oculto sin datos, anti-patrón 3), tablas alternativas, modo privado, PDF por impresión. `statistics.spec.ts`. Capturas: `qa/07-estadisticas.jpg`.

### 7.7 Ajustes
- Cuenta y Pro (tarjetas), apariencia (idioma con bandera, tema, moneda con búsqueda y 56 monedas), gestión de gastos (periodo con «Periodo actual», categorías, entradas comunes con usos, etiquetas, programados con pausa y próximos 30 días, *safe to spend*), datos y seguridad (copias locales cada 24 h y últimas 10 —sin tope de 2 MB/5 copias, anti-patrón 10—, copia cifrada, bloqueo PIN/biometría, exportar CSV/PDF, notificaciones con «Desactivar todas»), legal, acerca de, zona de peligro con casilla + palabra + copia previa (anti-patrón 14). `settings-v2.spec.ts`, `account-pro.spec.ts`, `backup*.spec.ts`. Capturas: `qa/08-ajustes.jpg`, `qa/09-bloqueo.jpg`.

### 7.8 Cuenta, sincronización y Pro
- Modo invitado real. **No implementado por falta de servicio:** inicio de sesión con Google/Apple, sincronización en la nube, pagos. La app lo dice y no muestra botones que no funcionan. `FeatureGate` central con Pro simulado solo en desarrollo. `account-pro.spec.ts`. Capturas: `qa/10-cuenta.jpg`, `qa/11-pro.jpg`.

## Anti-patrones (sección 13), uno por uno

| # | Anti-patrón | Estado en Clara | Dónde se comprueba |
|---|---|---|---|
| 1 | Idiomas mezclados en una pantalla | No: diccionarios completos y detector de literales; prueba en inglés sin palabras en español | `i18n.test.ts`, `english.spec.ts`, `lint:i18n` |
| 2 | Formatos de importe distintos | No: una sola familia `formatMoney` con el locale de la persona; CSV usa formato neutro y lo dice | `formatters.test.ts`, `compatibility.spec.ts` |
| 3 | Gráficos vacíos a pantalla completa; proyección plana sin datos | No: estados vacíos compactos; saldo futuro oculto sin 14 días de historial | `statistics.spec.ts` (periodo sin datos) |
| 4 | Tour de 9 pasos; pistas que se repiten | No: 3 pistas en Inicio, 3 pantallas en Planes, una sola vez (`toursSeen`) | `Home.tsx`, `Plans.tsx` |
| 5 | Candados Pro en funciones básicas | No: todo lo esencial es gratis; solo cupo del proveedor remoto | `featureGate.test.ts` |
| 6 | Tooltips con interpolación rota | No: tooltips construidos con `formatMoney` y claves con parámetros probadas | `statistics.spec.ts` (regex de importe) |
| 7 | Saldo $0 al cambiar de mes | No: arrastre entre periodos (ajuste «Arrastrar saldo») | `periods.test.ts`, `budget.test.ts` |
| 8 | *Safe to spend* solo por día y oculto tras pulsación larga | No: selector Día/Semana/Periodo visible; ajuste de granularidad | `categories-v2.spec.ts` |
| 9 | Iconos de cabecera sin etiqueta | No: cada botón de icono lleva texto visible o `sr-only`; auditoría axe | `layout-a11y.spec.ts` |
| 10 | Copias limitadas a 2 MB / 5 | No: copias locales de cualquier tamaño que quepa en IndexedDB, últimas 10; exportación sin tope práctico (100 MB) | `autoBackup.test.ts` |
| 11 | Inicio de sesión escondido tras el avatar y sin mención en onboarding | No: tarjeta de cuenta en Ajustes, pantalla Cuenta, nota en la bienvenida | `account-pro.spec.ts` |
| 12 | Sin búsqueda, filtros ni edición rápida en el historial | No | `movements.spec.ts`, `history-tools.spec.ts` |
| 13 | Planes de una sola categoría sin aportes | No: límites multicategoría; metas con aportes y aporte periódico | `plans.spec.ts` |
| 14 | Borrar datos con un toque y sin copia previa | No: casilla + palabra + copia local previa | `settings-v2.spec.ts` |

## Hallazgos del recorrido con capturas (corregidos en esta fase)

| Hallazgo | Dónde | Corrección |
|---|---|---|
| Un «0» suelto bajo el título de Inicio al pasar la privacidad a niveles numéricos (React renderiza `0 && …`) | `Home.tsx` | Condición explícita `> 0` |
| «Septiembre De 2026» en Estadísticas: `text-transform: capitalize` ponía mayúscula a cada palabra | `styles.css` (`.month-nav__label`) | Solo la primera letra en mayúscula (`::first-letter`), como en el resumen del mes |

Capturas (celular 390 px, tema oscuro salvo `12-inicio-claro.jpg`): `docs/qa/01-bienvenida.jpg` … `12-inicio-claro.jpg`, generadas con `scripts/qa-screenshots.mjs` sobre la versión compilada con datos de demostración.

## Pendientes conocidos y riesgos

- `spec-clara-referencia-lukas.md` ausente: el recorrido de su §3 no se hizo.
- Sesión, sincronización y pagos requieren servicios y credenciales: no se simulan.
- Lectura de recibos solo donde el navegador ofrece `TextDetector` (Chrome Android); Tesseract.js se descartó por tamaño y CSP (decisión 45).
- PT y FR verificados por claves y pseudo-locale, no visualmente por una persona.
- Rendimiento medido en Chromium de escritorio (`docs/PERFORMANCE.md`), no en teléfonos.
- Listas muy largas (10 000+ movimientos) sin virtualizar: el historial se pinta por páginas con «Ver más»; virtualizar queda pendiente.

## Mejoras tras la revisión general

Fuente Inter incluida, banner de demostración en una línea, pestañas de Planes desplazables con fundido, índice de Ajustes en chips agrupados, barra Pro sin cortes, enlaces de Movimientos como chips, avisos arriba en el celular, indicador «Guardado» que se desvanece, etiquetas de ejes legibles, idiomas bajo demanda, CSP con el proveedor remoto configurado, «Ver periodo» desde las barras, introducción en Estadísticas, etiquetas visibles en el formulario y aviso de tamaño de recibos (decisiones 55–61). Capturas en `docs/qa/` retomadas tras los cambios.

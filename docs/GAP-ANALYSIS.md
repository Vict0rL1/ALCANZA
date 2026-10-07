# Análisis de brechas (sección 7 del prompt → estado en Clara)

Estado: ✅ existe · 🟡 parcial · ❌ falta. Esfuerzo: S (horas) · M (un día) · L (varios días).
Archivos relevantes relativos a `src/`.

## 7.1 Onboarding

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Bienvenida con logo, 3 beneficios, botón y selector de idioma (ES/EN/PT/FR, cambio instantáneo) | 🟡 Hay bienvenida con ES/EN; faltan PT/FR y el diseño de 3 beneficios | `ui/screens/Setup.tsx`, `i18n/` | S |
| Pantalla «Tus categorías»: segmento Gastos/Ingresos, cuadrícula 3 columnas, tarjeta «Crear nueva», contador | ❌ | `ui/screens/Setup.tsx`, `domain/categories.ts` | M |
| Categorías predeterminadas (16 gasto / 6 ingreso) y 6 grupos | 🟡 14 gasto / 6 ingreso sin grupos, iconos ni colores | `domain/categories.ts`, `i18n/` | M |
| Moneda sugerida por el dispositivo; periodo de presupuesto (mensual por defecto) | 🟡 Moneda se elige; no hay periodos | `ui/screens/Setup.tsx`, `domain/types.ts` | M |
| Saldo inicial opcional como ingreso `isInitialBalance` | 🟡 Se pide saldo de referencia por cuenta (modelo distinto) | `ui/screens/Setup.tsx`, `domain/operations.ts` | S |
| Completar en < 60 s, volver atrás, no repetir (`onboardingDone`) | 🟡 Hay pasos con «atrás»; no hay `onboardingDone` | `ui/screens/Setup.tsx`, `App.tsx` | S |

## 7.2 Inicio

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Cabecera: logo, `MonthNavigator` del periodo, ojo de privacidad (3 niveles, háptica, tooltip), avatar | 🟡 Hay botón «Ocultar importes» (2 estados); no hay navegador de periodo ni avatar | `ui/screens/Home.tsx`, `ui/preferences.ts` | M |
| Tarjeta Saldo disponible (degradado) con «?», barra «DISPONIBLE · N %», sub-tarjetas Ingresos/Gastos, *count-up* | 🟡 Tarjeta héroe «Puedes gastar» con explicación; falta el modelo de periodo y el diseño | `ui/screens/Home.tsx`, `domain/budget.ts` | M |
| Safe to Spend con segmento Día/Semana/Periodo visible, «$X / día · N días», plegable, ocultable | 🟡 Por día y por semana calculados; sin segmento ni «periodo» | `domain/budget.ts`, `ui/screens/Home.tsx` | M |
| Banner de programados pendientes de confirmar | 🟡 Hay avisos de pagos vencidos; no «por confirmar» | `ui/screens/Home.tsx`, `domain/planItems.ts` | S |
| Banner «Estás viendo otro periodo» con volver | ❌ | `ui/screens/Home.tsx` | S |
| Historial agrupado por día con total del día; fila con icono de color, título, subtítulo, importe; deslizar borrar/editar; tocar = detalle | 🟡 Lista existe sin agrupar por día, sin deslizar | `ui/screens/Movements.tsx`, `ui/screens/Home.tsx` | M |
| Inicio vacío («Hi there!», tarjeta EMPIEZA AQUÍ con demo animada del parser, filas de acceso) | ❌ | `ui/screens/Home.tsx` | M |
| Tour de ≤ 3 *coach marks* una sola vez (`toursSeen`) | ❌ | `ui/components/`, `domain/types.ts` | S |
| FAB «+» siempre visible sobre la barra | 🟡 Hay pestaña «+ Agregar» en la barra; no FAB flotante | `App.tsx`, `styles.css` | S |
| Arrastre de saldo entre periodos | ❌ (modelo distinto) | `domain/period.ts` (nuevo) | M |

## 7.3 Registro

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Hoja del FAB: Asistente inteligente, Gasto manual, Ingreso manual, entradas comunes (6 chips, un toque = registrado con Deshacer) | 🟡 Favoritos rellenan el formulario (no registran); no hay hoja | `ui/favoritesUi.tsx` | M |
| Formulario manual: importe grande, segmento, categoría con búsqueda y grupos, fecha, nota/comercio, etiquetas, Repetir, Guardar como común; Guardar deshabilitado; háptica + toast + *count-up* | 🟡 Formulario corto existe; faltan etiquetas, comercio, Repetir, búsqueda de categoría, háptica | `ui/screens/MovementForm.tsx` | M |
| Asistente texto: textarea, Analizar, skeleton, vista previa editable con confianza, «Guardar N»; 200 líneas pegadas | ❌ | `domain/parser/` (nuevo), `ui/screens/Assistant.tsx` (nuevo) | L |
| Asistente voz (Web Speech API) | ❌ | `ui/assistant/voice.ts` (nuevo) | M |
| Asistente foto (OCR) | ❌ | `ui/assistant/receipt.ts` (nuevo) | L |
| Detalle del movimiento: campos, recibo, mapa, Duplicar, Editar, Eliminar | 🟡 Editar/Duplicar/Eliminar existen; sin recibo ni mapa | `ui/screens/MovementForm.tsx` | S |
| Parser cubre los casos de §8 con pruebas | ❌ | `domain/parser/*.test.ts` | L |

## 7.4 Historial completo y búsqueda

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Búsqueda por nota/comercio/categoría; chips de tipo, categorías, etiquetas, rango de fechas (atajos), rango de importe, origen | 🟡 Búsqueda, tipo, categoría, cuenta y fechas existen; faltan etiquetas, importe, origen, atajos | `ui/screens/Movements.tsx`, `domain/search.ts` | M |
| Totales del filtro (ingresos, gastos, neto) | 🟡 Resumen mensual, no del filtro | `ui/screens/Movements.tsx` | S |
| Exportar el filtro a CSV | ❌ | `domain/exportCsv.ts` (nuevo) | S |
| Selección múltiple: borrar, recategorizar, etiquetar | ❌ | `ui/screens/Movements.tsx` | M |

## 7.5 Planes

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Onboarding de planes (≤ 3 pantallas) | ❌ | `ui/screens/Plans.tsx` (nuevo) | S |
| Lista Activos/Completados con tarjetas por estado | 🟡 Metas listadas; límites mensuales en resumen | `ui/screens/Plan.tsx`, `ui/components/LimitsSection.tsx` | M |
| Crear: hoja Controlar gasto / Ahorrar para una meta | ❌ | `ui/screens/Plans.tsx` | S |
| Límite: importe, varias categorías, periodo, recurrente, alertas 80/100 % | 🟡 Límite mensual de una categoría | `domain/plans.ts` (nuevo), `domain/insights.ts` | M |
| Meta: nombre, icono/color, objetivo, fecha, aporte recurrente, aportar ahora | 🟡 Metas con aportes y fecha; sin icono/color ni aporte recurrente | `domain/goals.ts`, `ui/screens/Goals.tsx` | M |
| Detalle: gráfico diario vs ritmo ideal, movimientos relacionados, editar, pausar, borrar; resultado y «Repetir» | ❌ | `ui/screens/PlanDetail.tsx` (nuevo) | M |
| Cierre automático y recurrencia (al abrir y a medianoche), con pruebas | ❌ | `domain/plans.ts`, `state/store.ts` | M |
| Resumen automático al abrir Planes | ❌ | `ui/screens/Plans.tsx` | S |

## 7.6 Estadísticas

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Cabecera con navegador y chips de periodo (todos gratis) | ❌ | `ui/screens/Statistics.tsx` (nuevo) | S |
| 3 tarjetas con delta vs periodo anterior | 🟡 Revisión semanal compara semanas | `domain/comparison.ts` (nuevo), `domain/weeklyReview.ts` | M |
| Donut por categoría + lista; tocar → historial filtrado | 🟡 Barras por categoría en resumen mensual | `ui/components/charts.tsx` | M |
| Ingresos vs gastos (6 periodos, barras, tooltip) | ❌ | `ui/components/charts.tsx` | M |
| Tendencia acumulada vs periodo anterior | ❌ | `ui/components/charts.tsx` | M |
| Top 5 comercios/notas; promedio diario; día de la semana con más gasto | ❌ | `domain/insights.ts` | S |
| Saldo futuro 90 días con banda y puntos Hoy/30/60/90; oculto sin datos | 🟡 Proyección 30/60/90 con eventos; sin promedio ponderado ni banda | `domain/projection.ts`, `domain/projection90.ts` (nuevo) | M |
| Exportar la vista como PDF | ❌ | `ui/export/pdf.ts` (nuevo) | M |

## 7.7 Ajustes

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Tarjeta de cuenta (invitado / con sesión) | ❌ | `ui/screens/Settings.tsx` | S |
| Tarjeta Pro con uso de IA | ❌ | `ui/screens/Settings.tsx`, `domain/featureGate.ts` (nuevo) | S |
| Idioma con bandera (4), tema (3), moneda con búsqueda y grupos (≥ 45) | 🟡 Idioma (2), tema (3), moneda solo al inicio | `ui/screens/Settings.tsx`, `domain/currencies.ts` (nuevo) | M |
| Periodo de presupuesto con todas las opciones, «Periodo actual», arrastre | ❌ | `ui/screens/settings/BudgetPeriod.tsx` (nuevo) | M |
| Categorías: pestañas, búsqueda, grupos, contador, crear/editar (≥ 60 iconos, 16 colores), archivar con reasignación, reordenar, grupos | 🟡 Crear/renombrar/archivar personalizadas | `ui/screens/CategoriesSection.tsx` | L |
| Entradas comunes: explicación, lista con usos, registrar con un toque | 🟡 Favoritos sin contador | `ui/screens/Favorites.tsx` | S |
| Etiquetas | ❌ | `ui/screens/settings/Tags.tsx` (nuevo) | M |
| Programados: lista, próximos 30 días, pausar | 🟡 Programados existen (calendario); sin pausa ni vista 30 días | `ui/screens/Calendar.tsx`, `ui/screens/ScheduleForm.tsx` | M |
| Safe to Spend: mostrar, granularidad, restar programados/aportes, explicación | ❌ | `ui/screens/settings/SafeToSpend.tsx` (nuevo) | S |
| Copias: automática local cada 24 h, últimas 10, antes de operaciones críticas, lista, restaurar con vista previa, exportar/importar | 🟡 Exportar/verificar/importar con vista previa; sin copias automáticas | `storage/backup.ts`, `storage/autoBackup.ts` (nuevo) | M |
| Bloqueo biométrico/PIN (al abrir y tras 60 s) | ❌ | `ui/lock/` (nuevo) | M |
| Exportar CSV (4 alcances, BOM, separador por locale) y PDF | ❌ | `domain/exportCsv.ts`, `ui/export/pdf.ts` | M |
| Notificaciones: programados, recordatorio diario, resumen diario, planes, horas de silencio, desactivar todo, permiso explicado | ❌ | `ui/notifications/` (nuevo), `pwa/sw.template.js` | L |
| Legal, Acerca de, Contacto, Valorar | 🟡 Acerca de existe | `ui/screens/Settings.tsx` | S |
| Zona de peligro: borrar con doble confirmación + copia previa | 🟡 Borrar con confirmación; sin escribir BORRAR ni copia previa | `ui/screens/Settings.tsx` | S |

## 7.8 Cuenta, sincronización y Pro

| Requisito | Estado | Archivos | Esfuerzo |
|---|---|---|---|
| Pantalla de inicio de sesión (Google/Apple) y modo invitado | ❌ Requiere proveedor y credenciales | `ui/screens/Account.tsx` (nuevo) | M (+ credenciales) |
| Sincronización cifrada, *last write wins*, migrar datos del invitado | ❌ Requiere servicio | `storage/sync/` (nuevo) | L (+ servicio) |
| Paywall Pro, `FeatureGate` central, modo de desarrollo para simular Pro | ❌ | `domain/featureGate.ts`, `ui/screens/Paywall.tsx` | M (pagos reales: + servicio) |

## Secciones transversales

| Requisito | Estado | Esfuerzo |
|---|---|---|
| §2 Cero literales en componentes + prueba de claves faltantes en todos los idiomas + script de detección | 🟡 Regla cumplida a mano; falta la prueba multi-idioma y el script | S |
| §2 Formateador único con `privacy` y `compact` | 🟡 `formatMoney` existe; falta `compact`, `formatRelativeDate` como función pura | S |
| §4 Tokens exactos, 3 temas, componentes base con galería | 🟡 Tokens propios; faltan BottomSheet, CoachMark, FAB, Skeleton, SearchBar, TimePickerRow, CategoryChip, Toggle y galería | M |
| §5 Modelo de datos (grupos, etiquetas, planes, entradas comunes, programados, ajustes, perfil) con migraciones | 🟡 | M |
| §6 Fórmulas puras con pruebas (periodo, arrastre, safe to spend, límites, metas, cierre, proyección 90 d, comparación, programados, privacidad) | 🟡 Varias existen con otro modelo | L |
| §8 Parser local (≥ 40 casos) y `AIProvider` | ❌ | L |
| §9 Notificaciones locales con horas de silencio y enlaces profundos | ❌ | L |
| §10 `pt` y `fr` completos; prueba de pseudo-locale | ❌ | L (volumen: ~1900 claves × 2) |
| §2 Inicio < 300 ms con 10 000 movimientos | ✅ Medido: 63 ms con 10k en Chromium de escritorio (`docs/PERFORMANCE.md`) | — |

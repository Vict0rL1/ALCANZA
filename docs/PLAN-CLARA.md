# Plan Clara v2 (fases de §11 ajustadas a lo encontrado)

Se marca cada punto al cumplir su criterio de aceptación. Las fases se cierran con `npm run check`,
`npm run build` y `npm run test:e2e` en verde, un commit y el informe de §14.

## Fase 0 — Descubrimiento ✅
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/GAP-ANALYSIS.md`
- [x] `docs/PLAN-CLARA.md`
- [x] `docs/DECISIONS.md`
- [ ] `spec-clara-referencia-lukas.md` recibido (falta en el repositorio; necesario para la Fase 12)

## Fase 1 — Cimientos: tokens, temas, i18n, formateadores, componentes, modelo de datos
- [ ] Tokens de §4 en `styles.css` (oscuro, claro, 16 colores de categoría, radios, espaciado, tipografía, movimiento)
- [ ] Oscuro por defecto; sistema y claro siguen disponibles; nada se rompe en los tres
- [ ] `pt.ts` y `fr.ts` completos con el mismo tipo que `en.ts`
- [ ] Prueba: clave ausente o vacía en cualquier idioma = rojo; pseudo-locale para literales
- [ ] Script `scripts/find-literals.mjs` que detecta texto visible escrito en componentes
- [ ] `formatMoney(minor, currency, locale, {privacy, compact})`, `formatNumber`, `formatDate`, `formatRelativeDate` como funciones puras con pruebas (ejemplos de §2)
- [ ] Componentes base nuevos: `BottomSheet`, `Toggle`, `CoachMark`, `FAB`, `Skeleton`, `SearchBar`, `TimePickerRow`, `CategoryChip`, `ListRow`, `ProgressBar` (por estado), `AmountInput` con prefijo de moneda
- [ ] Galería de componentes (`/galeria`) en los tres temas
- [ ] Modelo v9: categorías materializadas (grupo, icono, color, orden, `nameKey`), grupos, etiquetas, planes (límites), entradas comunes, programados ampliados, ajustes (periodo, arrastre, safe to spend, notificaciones, bloqueo, copias, onboarding, tours, Pro), perfil, uso de IA
- [ ] Migración v8 → v9 con prueba (incluye `categoryLimits` → planes y copias v1–v8 restaurables)

## Fase 2 — Onboarding y categorías
- [ ] Bienvenida con selector ES/EN/PT/FR y 3 beneficios
- [ ] «Tus categorías» (cuadrícula, crear nueva, contador)
- [ ] Moneda sugerida + periodo (mensual por defecto; todos gratis)
- [ ] Saldo inicial opcional (`isInitialBalance`)
- [ ] `onboardingDone`; vuelta atrás en cada paso; < 60 s
- [ ] Gestión de categorías: pestañas, búsqueda, grupos con contador, crear/editar (≥ 60 iconos, 16 colores), archivar con reasignación, reordenar, grupos

## Fase 3 — Inicio
- [ ] `getPeriod` para todos los tipos (incl. `untilIncome`), con etiquetas localizadas y pruebas
- [ ] Saldo del periodo con arrastre, `availablePct`, *safe to spend* (día/semana/periodo) con pruebas
- [ ] Cabecera, tarjeta de saldo, Safe to Spend, banners, historial por día con deslizar, Inicio vacío, tour, FAB
- [ ] Privacidad de 3 niveles con háptica y tooltip
- [ ] Todo en 3 temas y 4 idiomas

## Fase 4 — Registro y búsqueda
- [ ] Hoja del FAB con entradas comunes de un toque
- [ ] Formulario manual completo (etiquetas, comercio, Repetir, Guardar como común)
- [ ] `LocalParser` (≥ 40 casos) y `AIProvider`
- [ ] Vista previa editable con confianza; 200 líneas
- [ ] Deslizar + Deshacer; detalle con Duplicar
- [ ] Historial con filtros completos, totales, CSV y selección múltiple

## Fase 5 — Programados y notificaciones
- [ ] Frecuencias diaria/trimestral/personalizada, `autoConfirm`, generación al abrir y a medianoche, banner de pendientes
- [ ] Notificaciones locales (programados, recordatorio, resumen, planes, horas de silencio) con enlaces profundos

## Fase 6 — Planes
- [ ] Onboarding de planes, lista, crear, formularios, detalle, cierre, recurrencia, resultados, alertas, resumen automático

## Fase 7 — Estadísticas
- [ ] Cabecera con periodos, 3 tarjetas con delta, donut, barras 6 periodos, tendencia, top 5, promedio diario, saldo futuro 90 d, PDF

## Fase 8 — Ajustes
- [ ] Cuenta, Pro, apariencia (moneda ≥ 45), gestión de gastos (todas las subpantallas), datos y seguridad (copias automáticas, PIN/WebAuthn, exportar, notificaciones), legal, acerca de, zona de peligro

## Fase 9 — Asistente
- [ ] Voz (Web Speech API), foto (Tesseract.js), proveedor remoto por variable de entorno, contador de uso

## Fase 10 — Cuenta, sincronización y Pro
- [ ] `FeatureGate` y modo de desarrollo; perfil invitado; pantalla de inicio de sesión y sincronización preparadas; proveedores reales solo con credenciales

## Fase 11 — Pulido
- [ ] Háptica, *count-up*, skeletons, auditoría de accesibilidad, rendimiento con 10 000 movimientos

## Fase 12 — QA final
- [ ] Recorrido de cada pantalla contra §7 (y §3 del spec cuando exista); lista de anti-patrones §13; `docs/QA-REPORT.md`

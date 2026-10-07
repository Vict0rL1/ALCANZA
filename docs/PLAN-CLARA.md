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
- [x] Tokens de §4 en `styles.css` (oscuro, claro, 16 colores de categoría, radios, espaciado, tipografía, movimiento)
- [x] Oscuro por defecto; sistema y claro siguen disponibles; nada se rompe en los tres (prueba e2e con axe en ambos)
- [x] `pt.ts` y `fr.ts` completos con el mismo tipo que `en.ts` (1979 claves cada uno)
- [x] Prueba: clave ausente o vacía en cualquier idioma = rojo; pseudo-locale (`?pseudo=1`, `i18n/pseudo.ts`)
- [x] Script `scripts/find-literals.mjs` (AST de TypeScript) en `npm run check`
- [x] `formatMoney(minor, currency, locale, {privacy, compact})`, `formatNumber`, `formatPercent`, `formatDate`, `formatRelativeDate`, `currencyName` como funciones puras con pruebas (ejemplos de §2)
- [x] Componentes base nuevos (`ui/components/base.tsx`): `PrimaryButton`/`SecondaryButton`/`TextButton`, `BottomSheet`, `Toggle`, `CoachMark`, `FAB`, `Skeleton`, `SearchBar`, `TimePickerRow`, `CategoryChip`, `ListRow`, `ProgressBar` (por estado), `MonthNavigator`; `MoneyField` ya tenía prefijo de moneda
- [x] Galería de componentes (`#/galeria`) con selector de tema
- [x] Modelo v9: categorías del sistema con grupo, icono, color y orden + `categoryPrefs` (decisión 17), grupos, etiquetas, planes (límites), favoritos ampliados (entradas comunes), programados ampliados, ajustes (periodo, arrastre, safe to spend, notificaciones, bloqueo, onboarding, tours, Pro, uso de IA), perfil
- [x] Migración v8 → v9 con prueba (copias v1–v8 restaurables). `categoryLimits` → planes se hace en la Fase 6, cuando exista la pantalla que los muestra
- [ ] Pendiente para fases siguientes: usar los componentes nuevos en las pantallas existentes (Fase 3 en adelante)

## Fase 2 — Onboarding y categorías
- [x] Bienvenida con selector ES/EN/PT/FR (los 4 beneficios de Clara se conservan)
- [x] «Tus categorías» (cuadrícula con las 16 + 6 marcadas, crear propias, contador por tipo)
- [x] Moneda + periodo (mensual por defecto; «hasta mi próximo ingreso» disponible; todos gratis)
- [x] Saldo inicial = saldo de referencia de la cuenta (ya existía); `onboardingDone` en datos nuevos; vuelta atrás en cada paso; «Ver mi resultado ahora» para < 60 s
- [x] Gestión de categorías (`#/ajustes/categorias`): pestañas, búsqueda, grupos con contador, crear/editar (82 iconos, 16 colores, grupo), archivar con reasignación, reordenar, grupos propios
- [ ] Pendiente: los formularios siguen usando <select> de categorías; los chips con icono/color llegan con el rediseño del formulario (Fase 4)

## Fase 3 — Inicio
- [x] `getPeriod` para todos los tipos (incl. `untilIncome`), etiquetas localizadas (`ui/periodLabel.ts`) y pruebas
- [x] Saldo del periodo con arrastre, `availablePct`, *safe to spend* (día/semana/periodo) con pruebas; `computeBudget` usa el periodo de calendario cuando el ajuste no es «hasta mi próximo ingreso»
- [x] Tarjeta de saldo con periodo y días restantes, selector Día/Semana/Periodo, explicación con arrastre/ingresos/gastos, tour de 3 pistas, ajustes de periodo (inicio de semana, arrastre, fechas personalizadas)
- [ ] Historial por día con deslizar e Inicio vacío con demo del parser: Fase 4 (van con el registro)
- [ ] Privacidad de 3 niveles con háptica y tooltip: Fase 11 (pulido); hoy hay 2 niveles (visible / oculto)
- [x] Todo en 3 temas y 4 idiomas

## Fase 4 — Registro y búsqueda
- [x] FAB en Inicio con hoja: gasto, ingreso, transferencia, asistente y entradas comunes (favoritos)
- [ ] Formulario manual: comercio y etiquetas en el formulario, «Repetir» y «Guardar como común» (favoritos ya existen) — pendiente
- [x] `parser.ts` (81 casos: separadores, importes regionales, k/mil/palabras, tipo, fechas, diccionario en 4 idiomas, aprendizaje, reglas, confianza) y `aiProvider.ts` (local; remoto solo con credenciales, nunca simulado)
- [x] Asistente (`#/asistente`): texto o dictado (Web Speech API si existe), vista previa editable con confianza y pistas, registro todo o nada, contador mensual
- [x] Inicio vacío con demo del parser; deslizar + Deshacer en el historial; Duplicar ya existía
- [x] Historial: selección múltiple a la papelera y exportación CSV del filtro (totales y filtros ya existían)

## Fase 5 — Programados y notificaciones
- [x] Frecuencias diaria/trimestral/personalizada (`intervalDays`), `autoConfirm` (apagado por defecto, ventana de 7 días), pausa; confirmación al abrir y al cambiar el día (`useScheduledJobs`); aviso de lo registrado; el banner de vencidos ya existía
- [x] Notificaciones locales: reglas puras (`domain/notifications.ts`: programados vencidos/hoy/mañana, recordatorio diario, resumen diario, horas de silencio), Notification API con permiso explícito, lista dentro de la app, enlaces profundos. Alertas de planes: Fase 6

## Fase 6 — Planes
- [x] `domain/plans.ts`: ciclo, gastado neto por categorías (vacío = todas), estados, ritmo ideal, serie diaria, cierre automático con resultado, recurrencia con historial, repetir, resumen, alertas; pruebas
- [x] Migración v9 → v10: `categoryLimits` → planes mensuales recurrentes (prueba); metas con `contribution`
- [x] Pantalla Planes (`#/plan/planes`): onboarding de 3 pantallas (una vez), resumen automático, Activos | Completados, tarjetas (límites y metas) con barra por estado, FAB + hoja «Controlar gasto / Ahorrar para una meta»
- [x] Formulario de límite (importe, nombre opcional, categorías múltiples con chips, periodo con vista del rango, personalizado, recurrente, alertas 80/100 %); detalle con gráfico acumulado vs. ritmo ideal (+ tabla), movimientos, editar, pausar, eliminar con deshacer, tarjeta de resultado y «Repetir»
- [x] Metas: icono/color, aporte periódico (recordatorio) y «Aportar ahora» con el importe propuesto
- [x] Cierre/renovación al abrir y al cambiar el día (`useScheduledJobs`); alertas de planes en Notificaciones (horas de silencio); Inicio y pendientes avisan desde los planes
- [ ] Pendiente: gráfico diario en las metas (hoy solo barra), onboarding de planes dentro de la demo (se omite en demo)

## Fase 7 — Estadísticas
- [x] `domain/statistics.ts`: rangos y navegación, tres cifras con delta (sin porcentaje con base 0 o no comparable), desglose por categoría, series de 6 periodos, tendencia acumulada, top 5, promedio diario y día de la semana, saldo futuro a 90 días con banda (oculto sin datos); pruebas
- [x] Pantalla `#/estadisticas` (enlaces desde Inicio y Movimientos): chips de periodo (todos gratis), navegador, 3 tarjetas con delta, donut + lista (toca → historial filtrado), barras con tooltip accesible, tendencia (dos series), top 5, promedio diario, saldo futuro con marcas Hoy/30/60/90; tablas alternativas; modo privado oculta gráficos
- [x] Exportar PDF = impresión del navegador con estilos `@media print` (decisión 36)
- [ ] Pendiente: medir con 10 000 movimientos en la Fase 11 (hoy un solo recorrido por métrica, memoizado)

## Fase 8 — Ajustes
- [x] Apariencia: idioma con bandera (4), tema (3), selector de moneda con búsqueda y grupos (56 monedas; cambio solo sin registros, decisión 41); periodo con caja «Periodo actual»
- [x] Gestión de gastos: categorías (enlace), entradas comunes con contador de usos, etiquetas (sección, chips en el formulario, filtro del historial), programados (lista, pausar, próximos 30 días), safe to spend (mostrar, granularidad, qué restar, explicación); comercio en el formulario
- [x] Datos y seguridad: copias locales automáticas (24 h, últimas 10, antes de restaurar/borrar, hacer ahora, lista con fecha y tamaño, restaurar con vista previa y deshacer); bloqueo con PIN + biometría WebAuthn (al abrir y tras 60 s); exportar CSV (movimientos, categorías, planes, todo; BOM; separador por locale) e informe PDF; notificaciones con «Desactivar todas» y nota de zona horaria
- [x] Legal (términos y privacidad en 4 idiomas), Acerca de (versión y compilación; contacto solo si está configurado), zona de peligro con casilla + palabra y copia previa
- [ ] Tarjetas de Cuenta y Pro: Fase 10 (con `FeatureGate`)

## Fase 9 — Asistente
- [x] Voz: dictado con la Web Speech API (desde la Fase 4); estado visible en Ajustes › Asistente
- [x] Foto: `domain/receipt.ts` (total, fecha, comercio, categoría, confianza; pruebas), OCR en el dispositivo con `TextDetector` si existe (decisión 45), imagen reducida adjunta al movimiento (`receiptUri`, decisión 46), vista y retirada en el formulario
- [x] Proveedor remoto solo por variables de compilación (`VITE_AI_ENDPOINT` + `VITE_AI_KEY`); Ajustes muestra cuál está activo y el host
- [x] Contador `aiUsage` mensual visible en Ajustes; solo cuenta el proveedor remoto (decisión 47)
- [ ] Pendiente: `transcribe` y `parseReceipt` remotos (sin servicio no se simulan)

## Fase 10 — Cuenta, sincronización y Pro
- [x] `domain/featureGate.ts` con pruebas: lo esencial gratis, cupo mensual del proveedor remoto, Pro solo simulado en desarrollo (decisión 48); el asistente cae a local al agotar el cupo
- [x] Pantalla Cuenta (`#/cuenta`): invitado real, explicación honesta de lo que harían sesión y sincronización, vías locales; tarjeta de cuenta en Ajustes; mención en la bienvenida (anti-patrón 11)
- [x] Pantalla Pro (`#/pro`): lo gratis, barra de uso del asistente, beneficios (marcando lo que aún no existe), sin precio ni compra; interruptor «Simular Pro» solo en desarrollo; tarjeta Pro en Ajustes con «Uso del asistente remoto N %»
- [x] Copia cifrada con frase (AES-GCM + PBKDF2, `storage/encryptedBackup.ts`, pruebas): exportar desde Cuenta y Copias; importar detecta el sobre y pide la frase (decisión 50)
- [ ] Pendiente (requiere servicio y credenciales): inicio de sesión con Google/Apple, sincronización, pagos

## Fase 11 — Pulido
- [ ] Háptica, *count-up*, skeletons, auditoría de accesibilidad, rendimiento con 10 000 movimientos

## Fase 12 — QA final
- [ ] Recorrido de cada pantalla contra §7 (y §3 del spec cuando exista); lista de anti-patrones §13; `docs/QA-REPORT.md`

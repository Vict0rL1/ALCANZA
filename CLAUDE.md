# CLAUDE.md — reglas esenciales de Margen

Margen es un **prototipo local** de finanzas personales (React + TypeScript + Vite).
Sin backend, sin cuentas de usuario, sin conexión bancaria y sin IA dentro del producto.
Interfaz en español e inglés (`src/i18n/es.ts` y `en.ts`).

## Comandos (ejecutar antes de cada commit)

```bash
npm run typecheck      # tsc -b (app, pruebas y config)
npm run lint           # oxlint
npm test               # Vitest: lógica financiera y almacenamiento
npm run test:e2e       # Playwright: celular, celular 320 px y escritorio (+ axe)
npm run build
```

En entornos con Chromium preinstalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chrome npm run test:e2e`.

## Arquitectura (no mezclar capas)

- `src/domain/` — **lógica financiera pura**. Sin React, sin `localStorage`, sin `Date.now()`
  implícito: "hoy" y "ahora" llegan como parámetros (`OpContext`). Aquí viven todas las
  fórmulas y validaciones. Toda regla nueva lleva prueba en `*.test.ts`.
- `src/storage/` — persistencia detrás de `DataRepository` (hoy `localStorage`), copias
  de seguridad (`backup.ts`) y migraciones (`migrations.ts`).
- `src/state/` — estado en memoria (`AppStore`) y hooks. Aplica resultados de
  `domain/operations.ts`; no calcula dinero.
- `src/ui/` — pantallas y componentes. Solo muestran y llaman operaciones.
- `src/i18n/` — todos los textos visibles. **Nunca** escribir texto de interfaz
  directamente en componentes: añadir la clave a `es.ts` **y** a `en.ts` (el tipo de
  `en.ts` obliga a tener todas las claves).

## Reglas financieras (ver `docs/FORMULAS.md`)

- Dinero = **enteros en unidades menores**. Prohibido usar flotantes para importes.
  Divisiones con `floorDiv`/`ceilDiv`/`mulDivFloor`.
- Una moneda por presupuesto; cada registro guarda `currency` y se valida.
- Fechas de calendario (`'AAAA-MM-DD'`) separadas de marcas de tiempo (ISO UTC).
  "Hoy" = `todayInTimeZone(settings.timeZone)`.
- Saldo actual = saldo de referencia + movimientos realizados posteriores
  (`txAppliesToAccount`). Los previstos nunca cambian el saldo.
- Disponible = saldo del presupuesto − pagos pendientes/vencidos hasta el día del próximo
  ingreso (incluido) − apartados de metas del presupuesto. El día del ingreso NO cuenta
  en los días del periodo. Ingresos futuros nunca se suman. Sin ingreso → horizonte;
  nunca dividir entre cero.
- Una ocurrencia programada está pagada si hay un movimiento realizado con su
  `scheduleId` + `occurrenceDate`: cuenta como reserva **o** como movimiento, nunca ambos.
- Transferencias entre cuentas propias no son ingresos ni gastos.
- Tarjetas de crédito: cuenta `credit` con saldo negativo (deuda). Compra = gasto de la
  tarjeta; pago = **transferencia** banco → tarjeta, nunca un gasto.
- Mensuales en 29/30/31 → último día del mes corto.
- Operaciones idempotentes: el id se genera al abrir el formulario; guardar dos veces
  actualiza el mismo registro.
- Importación CSV (`domain/bankImport.ts`): huella `importRef` evita reimportar; posibles
  duplicados desmarcados; todo o nada; el archivo nunca sale del dispositivo.
- Papelera: eliminar saca el movimiento de `transactions` a `trash` (nunca participa en
  cálculos). Restaurar no deja vínculos rotos ni liquida dos veces una ocurrencia; filas
  CSV en la papelera no se reimportan. Sin borrado automático.
- Ajuste de conciliación = `kind: 'adjustment'`: corrige el saldo, NO es ingreso ni gasto.
  Nunca se crea sin confirmación ni se toca el saldo de referencia al conciliar.
- Ingresos variables: el disponible jamás suma ingresos futuros; la proyección usa el
  escenario mínimo por defecto. Cobros parciales con `partialSettlement`; como mucho una
  liquidación final por ocurrencia.
- Favoritos solo rellenan el formulario; nunca registran movimientos.
- Registro de copias (`backup`): no modifica `updatedAt`. Una exportación fallida no se
  registra; «exportada» ≠ «verificada».

## Interfaz y accesibilidad

- Móvil primero; sin desplazamiento horizontal de 320 px a escritorio; texto ampliable (rem).
- Estados siempre con icono + texto, nunca solo color. Contraste AA (claro y oscuro).
- Cada campo con etiqueta, ayuda y error asociados (`FieldShell`). Botones ≥ 40–44 px.
- Cada cifra principal tiene su explicación ("¿Cómo se calculó?").
- No mostrar botones de funciones que no existen. No simular notificaciones,
  sincronización, autenticación ni integraciones.
- Gráficos: seguir la paleta validada (`--series-*`), etiquetas selectivas, tabla alternativa.

## Seguridad y datos

- Ningún secreto, clave o credencial en el código, el navegador o los registros.
  No hace falta `.env` en esta fase.
- La importación valida TODO el archivo y no aplica nada si hay un error.
- Cambios de formato de datos: subir `SCHEMA_VERSION` (hoy 5) y añadir migración con prueba.
  Las migraciones solo rellenan campos ausentes; nunca borran datos mal formados.
- Datos de demostración siempre marcados con `isDemo: true`.
- El *service worker* (`pwa/sw.template.js`, generado por `vite.config.ts`) solo cachea
  archivos de la app, nunca datos. Solo se registra en producción y contexto seguro.

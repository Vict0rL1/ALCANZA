# Ampliación de Playwright: criterios para el próximo cambio

Estado: **diseño de pruebas**, no una ejecución adicional ni código ya validado.
Reutilizar `tests/e2e/helpers.ts`, sus fixtures, `page.clock`, los tres proyectos de
`playwright.config.ts` y las aserciones de `data-testid="available"`.

| Caso | Recorrido y oráculo observable |
|---|---|
| Moneda y saldo | Crear cuenta CAD 2000 sin movimientos ni metas; intentar JPY y USD desde Formato. Debe bloquearse con explicación; tras recargar siguen CAD 2000 y los mismos datos. Repetir con saldo cero y con límite de tarjeta no nulo. |
| Cobro parcial automático | Programar ingreso CAD 1000 para hoy; registrar 400 con remanente pendiente; activar autoconfirmación y recargar. Historial total 1000, último registro 600. Una segunda recarga no añade nada. Repetir para gasto y con ingreso variable. |
| Sin arrastre y sobregiro | Referencia -500, ingreso realizado 1000; periodo mensual y arrastre apagado. Saldo 500 y dinero sugerido para gastar como máximo 500 antes de reservas. Repetir con ingreso en cuenta excluida y transferencia al ahorro. |
| Historia y metas | Con reloj fijo en agosto guardar saldo 1000; avanzar a septiembre y apartar 300. Navegar a agosto: apartado posterior no resta. Liberar dinero en octubre y comprobar que septiembre conserva su situación. |
| Monedas CSV | Presupuesto CAD; importar columna con `USD 100.00` y otra fila `CAD 20.00`. USD muestra error no seleccionable; CAD se acepta. Repetir EUR, JPY, moneda en columna propia, símbolo ambiguo y locales ES/EN. |
| Recurrencia antigua | Restaurar copia válida con plan diario desde 2020 y 2000 ocurrencias saldadas; ir a fecha actual. Deben mostrarse y reservarse vencidos y pagos actuales; comparar saldo con suma independiente. No admitir truncado silencioso. |
| Fórmula CSV | Guardar notas `=1+1`, `+...`, `@...`, tabulaciones y comillas. Descargar CSV e inspeccionar bytes/celdas como texto. Verificar que importes negativos siguen siendo números. No ejecutar cargas externas. |
| Copia cifrada no válida | Cargar envelope con KDF excesivo, cero, negativo, fracción, IV/salt incorrectos o versión desconocida. Error inmediato y datos sin cambios; no ejecutar KDF cara. Control positivo: copia propia válida restaura. |

## Matriz de aceptación transversal

- Para cada operación financiera: guardar → recargar → comparar historial, saldo, reservado,
  disponible, proyección y exportación. Comprobar que la misma acción repetida es idempotente.
- Para cada P0: fixture previa, acción UI, oráculo financiero independiente y ausencia de cambios
  cuando se rechaza; ejecutar en 320 px, móvil y escritorio.
- Para importación: anular/revertir lote, reimportar y verificar el contrato de deduplicación;
  probar archivo vacío, columnas equivocadas, comillas sin cerrar y límites de filas/tamaño.
- Dispositivos reales pendientes: Safari iOS instalado como PWA, Chrome Android, VoiceOver/TalkBack,
  teclado nativo, cambio de zona/DST, cierre forzado durante guardado y almacenamiento sin cuota.
- Accesibilidad: axe existente más tareas completas por teclado y lector de pantalla; los análisis
  automáticos no certifican por sí solos WCAG.
- Rendimiento: medir p50/p95 y memoria con 1k/10k/50k, tarjetas/metas/planes vinculados,
  importaciones múltiples y hardware modesto. El test CI actual elige la mejor de dos cargas.

La suite de ocho regresiones debe quedar verde por correcciones reales antes de integrarla
como requisito de CI. Mantener el caso nominal S01 como control, sin usar su resultado para
dar por correctas todas las combinaciones de ajustes.

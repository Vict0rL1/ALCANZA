# Hoja de ruta de Margen

Estado actual: **Fase 1 — prototipo local** (sin servidor, sin cuentas, sin banco, sin IA).
Nada de lo que aparece en las fases siguientes está implementado; la app no muestra
botones de esas funciones.

> Antes de contratar cualquier servicio, generar cargos o publicar la app, hay que
> decidirlo con la persona responsable del proyecto.

---

## Fase 1 — Prototipo local ✅ (esta entrega)

- Configuración inicial y modo demostración con datos ficticios identificados.
- Inicio con disponible hasta el próximo ingreso, por día y por semana, explicación.
- Movimientos (ingreso, gasto, transferencia, devolución; previstos y realizados).
- «¿Me alcanza?» sin modificar datos.
- Calendario de pagos únicos y recurrentes, recordatorios dentro de la app.
- Metas con apartados virtuales sin doble reserva.
- Proyección a 30 días con suposiciones visibles.
- Ajustes: formato, zona horaria, cuentas, copia de seguridad validada, reinicio.
- Datos solo en `localStorage` del navegador. Manifiesto PWA e iconos.

## Fase 1.5 — Pulido local (sin servicios externos)

Hecho:

- ✅ **Uso sin conexión:** *service worker* propio generado al compilar (sin
  dependencias), caché por versión y aviso «Actualizar ahora» cuando hay una versión
  nueva. Funciona en `https` o `localhost`; no en modo desarrollo.
- ✅ **Tarjetas de crédito:** cuenta tipo tarjeta con deuda; el pago es una
  transferencia, no un gasto.
- ✅ **Tarjetas completas:** límite, tasa anual, días de corte y de pago, pago mínimo
  e intereses estimados (en enteros) y recordatorio del pago en Inicio.
- ✅ **Categorías personalizadas:** crear, renombrar, archivar y eliminar si no se usan.
  Formato de datos v2 con migración probada desde v1.
- ✅ **Resumen mensual y límites por categoría:** ingresos, gasto neto por categoría,
  límites mensuales con aviso en Inicio (informativos).
- ✅ **Importar CSV del banco:** mapeo de columnas, formatos de fecha, cargos/abonos,
  vista previa, duplicados exactos (huella) y posibles (±3 días), todo o nada, deshacer.
  Formato de datos v3 (`importRef`). Todo en el dispositivo.
- ✅ **Reglas de categoría:** «si la descripción contiene…» → categoría; se aplican al
  importar CSV (con opción de crear una regla desde una fila) y al escribir la nota de un
  movimiento nuevo. Formato de datos v4 con migración.
- ✅ **Papelera:** los movimientos eliminados se guardan (persistente), se restauran o se
  eliminan definitivamente con confirmación; vínculos y reimportaciones sin doble conteo.
- ✅ **Favoritos:** plantillas de gastos e ingresos frecuentes (nunca registran solas).
- ✅ **Recordatorio de copia de seguridad:** exportación solicitada vs. copia verificada,
  recordatorio semanal/mensual con posponer, dentro de la app.
- ✅ **Conciliación de saldos:** saldo calculado vs. observado a una fecha, ajustes
  explícitos, historial y revisión si cambian movimientos del periodo.
- ✅ **Ingresos variables:** mínimo/esperado/extra, escenarios en la proyección, cobros
  parciales. Formato de datos v5 con migración probada y copia previa.
- ✅ **Herramientas de planificación (formato v6):** gastos planificados anuales con
  pago y liberación en un paso; presupuestos por semestre/viaje/periodo con asociación
  de movimientos sin duplicarlos; revisión semanal con reglas fijas; comparador de hasta
  3 escenarios guardados; búsqueda global local.
- ✅ **Bandeja de pendientes, compras divididas y distribución de ingresos (formato v7):**
  avisos calculados con ids estables (posponer/descartar sin tocar cifras), compras
  repartidas entre categorías con devoluciones coherentes, y reparto de un ingreso recibido
  entre pagos y metas sin crear dinero ni restar dos veces. La bandeja también avisa de
  tarjetas cerca o sobre el límite, metas vencidas, límites de categoría superados y reglas
  de categoría sin uso o con la categoría archivada.
- ✅ **Inglés:** interfaz completa en inglés (el tipo de `en.ts` exige todas las
  claves), selector en la bienvenida y en Ajustes, datos de demostración traducidos.

- ✅ **Preparación para la prueba con usuarios:** casos financieros calculados a mano
  (`independent.test.ts`) — corrigió un doble descuento al pagar desde el calendario un
  gasto planificado vinculado —, guardado sin sobrescrituras entre pestañas, aviso
  persistente si no se puede guardar, apertura correcta con el almacenamiento lleno,
  datos de versiones futuras protegidos, actualización de la PWA solo a petición, Inicio
  con la cifra principal primero y avisos agrupados, bienvenida con cálculo provisional,
  política de seguridad de contenido y guía `docs/USER_TESTING.md`.

---

## Trabajo pendiente ordenado

### A. Errores que bloquean una prueba controlada

Ninguno conocido tras esta revisión (ver la conclusión del PR). Antes de la prueba hay que
completar la **lista manual de `docs/USER_TESTING.md` §8 en un iPhone y un Android reales**:
no se pudo hacer en este entorno. Si allí aparece un error de guardado, de cálculo o un
flujo bloqueado, pasa a esta sección.

### B. Necesario antes de admitir usuarios reales (con su dinero)

| Tarea | Por qué |
|---|---|
| Probar en Safari/iPhone, Firefox y Android reales | Solo se automatizó Chromium. WebKit automatizado tampoco equivale a Safari en iOS. |
| Revisión con lector de pantalla real (VoiceOver, TalkBack, NVDA) | axe solo detecta parte de los problemas. |
| Resultados de la prueba con usuarios corregidos | En especial cualquier mala interpretación de «Puedes gastar» (gravedad 4). |
| Copias de seguridad automáticas fuera del navegador | Hoy dependen de que la persona exporte. Requiere decidir un destino (archivo local programado, nube) → ver D. |
| Publicar en https con un dominio propio | Necesario para usar sin conexión e instalar en el teléfono fuera de la red local. Requiere decidir alojamiento (ver D). |
| Política de privacidad y términos | Aunque los datos no salgan del dispositivo, hay que explicarlo por escrito. |
| Almacenamiento IndexedDB | Solo si se comprueba un problema real: hoy `localStorage` (≈5 MB) cubre años de movimientos de una persona; el guardado ya es atómico y detecta conflictos. Reevaluar si aparecen errores de cuota. |

### C. Funciones opcionales (sin servicios externos)

| Función | Notas |
|---|---|
| Plantillas de división con nombre | Hoy se propone repetir el último reparto del mismo comercio. |
| Plantillas de distribución del ingreso | Hoy el asistente propone según prioridad; nunca aplica nada solo. |
| Planificación de deudas | Bola de nieve / avalancha con enteros y redondeo documentado. |
| Varias monedas con tasas **manuales** | La persona escribe la tasa fechada; nunca se suman monedas sin convertir. Sin proveedor externo. |
| Importar OFX/QFX | Reutilizaría la vista previa y la huella del CSV. |

### D. Integraciones que requieren decisiones, cuentas o credenciales

| Integración | Qué hay que decidir |
|---|---|
| Alojamiento https | Proveedor, dominio y costo. |
| Cuentas de usuario y sincronización (Fase 2) | Proveedor de autenticación, base de datos, costos, privacidad y cumplimiento legal. Requiere *tombstones* (los eliminados definitivamente también se registran). |
| Tasas de cambio automáticas | Proveedor de tasas con histórico (puede tener costo o límites). |
| Conexión bancaria, OCR, voz, notificaciones push | Ver Fases 3–5. Ninguna está implementada ni simulada. |

## Fase 2 — Cuentas de usuario y sincronización

**Servicios externos necesarios (requieren cuenta y posiblemente pago):**

| Necesidad | Opciones típicas | Para qué |
|---|---|---|
| Autenticación | Proveedor gestionado (Auth0, Clerk, Supabase Auth, Firebase Auth, Cognito) o propio con *passkeys* | Identificar a cada persona de forma segura |
| Base de datos | PostgreSQL gestionado | Guardar datos por usuario |
| API / servidor | Funciones o servidor Node/TypeScript | Validar y aplicar operaciones en el servidor |
| Alojamiento | Hosting con HTTPS | Servir la app y la API |
| Correo transaccional | Postmark, SES, Resend… | Verificación, recuperación de cuenta |
| Monitoreo de errores | Sentry u otro | Detectar fallos sin registrar datos financieros |

**Requisitos técnicos de esta fase (a documentar e implementar):**

1. **Autenticación real.** Nada de contraseñas guardadas en el navegador ni claves
   privadas en el código. Sesiones con cookies `HttpOnly`/`Secure` o tokens de corta
   duración. MFA o *passkeys* recomendados.
2. **Permisos por usuario en el servidor.** Cada tabla lleva `user_id` (o
   `budget_id` + membresía). El servidor filtra SIEMPRE por el usuario autenticado
   (por ejemplo, *Row Level Security* en PostgreSQL). Nunca confiar en ids enviados
   por el cliente.
3. **Validación en el servidor.** Reutilizar las funciones de `src/domain`
   (validación y operaciones) en el backend: el cliente no es fuente de verdad.
4. **Idempotencia y duplicados.** Los ids (UUID) ya se generan en el cliente; el
   servidor debe aceptar `PUT` por id (crear-o-actualizar) y una clave de
   idempotencia por operación. Restricción única para `(scheduleId, occurrenceDate)`
   en movimientos realizados y para ids de apartados.
5. **Sincronización.** Registro de cambios con `updatedAt` + `revision` por
   registro, *tombstones* para eliminados, resolución de conflictos
   (último en escribir gana por campo, o preguntar si choca un importe).
6. **Migraciones.** Esquema versionado (herramienta de migraciones SQL) y
   `schemaVersion` en los datos del cliente (ya existe, con `src/storage/migrations.ts`).
   Cada migración con prueba y reversión documentada.
7. **Copias de seguridad y recuperación.** Copias automáticas diarias cifradas,
   retención definida (p. ej. 30 días), prueba periódica de restauración, objetivo de
   recuperación (RPO/RTO) por escrito.
8. **Exportación.** Mantener el formato `margen-backup` y añadir CSV.
9. **Eliminación de cuenta.** Borrado de datos del usuario en la base y en copias
   dentro del plazo de retención, confirmación explícita, exportación previa ofrecida.
10. **Privacidad y legal.** Política de privacidad y términos; cumplimiento de la ley
    aplicable (en Canadá, PIPEDA y leyes provinciales como la Ley 25 de Quebec);
    cifrado en tránsito (TLS) y en reposo; registros sin datos financieros.
11. **Migración desde el prototipo.** Importar la copia local al crear la cuenta.

## Fase 3 — Más funciones financieras

| Función | Requisitos externos | Notas |
|---|---|---|
| Presupuestos compartidos | Fase 2 | Invitaciones, roles (ver/editar), auditoría de cambios. |
| Varias monedas | Proveedor de tasas de cambio con histórico (de pago o gratuito con límites) | Guardar la **tasa fechada** usada en cada conversión; nunca sumar monedas sin convertir. |
| Importar OFX/QFX | Ninguno | CSV ya está hecho (Fase 1.5); OFX/QFX reutilizaría la misma vista previa y huella. |
| Conexión bancaria automática | Agregador (Plaid, Flinks, MX…) con contrato y costos | Requiere seguridad y cumplimiento adicionales; opcional. |
| Planificación de deudas | Ninguno | Métodos bola de nieve / avalancha, intereses con enteros y redondeo documentado. |

## Fase 4 — Captura asistida

| Función | Requisitos externos | Condición |
|---|---|---|
| Recibos (OCR) | Servicio de OCR o modelo local | La lectura solo **propone** un movimiento; la persona lo confirma. Nunca modifica saldos por sí sola. |
| Registro por voz | Reconocimiento de voz (del sistema o servicio) | Igual: propuesta editable + confirmación. |

## Fase 5 — Presencia y negocio

| Función | Requisitos externos | Notas |
|---|---|---|
| Notificaciones | Web Push (claves VAPID en el **servidor**), APNs/FCM si hay app nativa | Pedir permiso con contexto; preferencias por tipo de aviso. |
| Widgets | App nativa o envoltorio (Capacitor, etc.) y cuentas de desarrollador de Apple/Google | |
| Suscripción Pro | Procesador de pagos (Stripe) o compras dentro de la app; gestión de impuestos | Definir qué es gratis y qué es Pro; nunca bloquear el acceso a los datos propios ni a la exportación. |

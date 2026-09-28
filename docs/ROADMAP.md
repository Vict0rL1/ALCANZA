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

| Tarea | Notas |
|---|---|
| PWA instalable sin conexión | Añadir *service worker* (por ejemplo con `vite-plugin-pwa`/Workbox) y estrategia de actualización visible («Hay una versión nueva»). Requiere servir por HTTPS. |
| Inglés | Completar `src/i18n/en.ts` y añadir el selector de idioma. |
| Tarjetas de crédito | Cuenta tipo tarjeta con saldo deudor; «pago de tarjeta» como **transferencia** (no gasto) para no contar dos veces las compras. |
| Categorías personalizadas | Con id estable y nombre editable. |
| Papelera (*tombstones*) | Marcar eliminados con `deletedAt` en vez de borrar: necesario para sincronizar después. |
| Almacenamiento IndexedDB | Más espacio que `localStorage` y escritura asíncrona. La interfaz `DataRepository` ya lo permite. |

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
| Importar archivos bancarios | Ninguno para CSV/OFX/QFX subidos por la persona | Mapeo de columnas, detección de duplicados (fecha + importe + descripción normalizada + ventana de días), vista previa antes de importar. |
| Conexión bancaria automática | Agregador (Plaid, Flinks, MX…) con contrato y costos | Requiere seguridad y cumplimiento adicionales; opcional. |
| Planificación de deudas | Ninguno | Métodos bola de nieve / avalancha, intereses con enteros y redondeo documentado. |
| Ingresos variables | Ninguno | Rango (mínimo/esperado) por ingreso y presupuesto con el escenario prudente. |
| Modo viaje / presupuesto por semestre | Ninguno | Horizontes personalizados y metas por periodo. |

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

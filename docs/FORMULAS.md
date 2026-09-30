# Fórmulas y decisiones financieras de Margen

Este documento explica **cómo se calcula cada cifra** y qué decisiones tomamos para
evitar errores y dobles conteos. El código que implementa cada regla está en
`src/domain/` (funciones puras, sin interfaz) y está cubierto por pruebas en
`src/domain/*.test.ts`.

> Regla general: **ninguna IA calcula ni modifica saldos.** Todas las cifras salen de
> las fórmulas de este documento.

---

## 1. Dinero: enteros en unidades menores

- Todo importe se guarda como **número entero de unidades menores** (centavos para
  CAD, USD, MXN…; unidades enteras para CLP). Ejemplo: `12,50 $` → `1250`.
- Nunca se usan decimales de punto flotante para sumar, restar o dividir.
  Las divisiones usan aritmética entera (`BigInt`) con redondeo explícito.
- Los decimales de cada moneda están **fijados en el código** (`SUPPORTED_CURRENCIES`),
  no se leen del navegador, para que los datos guardados no cambien de significado.
- Límite por importe: 10¹² unidades menores (10 000 millones de CAD).
- Al escribir importes se aceptan `12,50`, `12.50`, `1,234.56`, `1.234,56`, `$ 45`.
  Si hay un solo separador seguido de exactamente 3 dígitos (`1,234`) se usa el
  formato elegido en Ajustes para decidir si son miles o decimales.
- **Un presupuesto usa una sola moneda.** Cada registro guarda su moneda y se rechaza
  cualquier registro con una moneda distinta. Nunca se suman monedas diferentes.

## 2. Fechas y zona horaria

- **Fechas de calendario** (`LocalDate`, texto `AAAA-MM-DD`): fecha de un movimiento,
  de un pago, de una meta. No tienen hora ni zona.
- **Marcas de tiempo** (`Timestamp`, ISO 8601 en UTC): cuándo se creó o registró algo.
- "Hoy" se calcula con la **zona horaria elegida en Ajustes** (por defecto, la del
  dispositivo). La app vuelve a calcular "hoy" cada 30 segundos y al volver a la
  pestaña, así el cambio de día y de mes se refleja sin recargar.
- La aritmética de días se hace en UTC, por lo que el horario de verano nunca suma
  ni resta un día.

## 3. Saldo actual (sin doble conteo)

Cada cuenta tiene un **saldo de referencia**: el importe que la persona escribe
(copiado de su banco) con su fecha y el momento en que lo registró (`setAt`).

```
Saldo actual de la cuenta = saldo de referencia + Σ efectos de movimientos REALIZADOS posteriores
```

Un movimiento realizado es **posterior** si:

1. su fecha es posterior a la fecha del saldo de referencia, **o**
2. es del mismo día y se marcó como realizado (`realizedAt`) **después** de `setAt`.

Todo lo anterior se considera **ya incluido** en el saldo que escribió la persona.
Consecuencias prácticas:

- Al **actualizar el saldo**, todos los movimientos anteriores quedan incluidos y no
  se vuelven a restar.
- Si registras hoy un gasto que ya aparecía en el saldo que escribiste hoy, marca
  «Ya estaba incluido en el saldo…» y no se resta dos veces.
- Los movimientos **previstos nunca** cambian el saldo.

Efecto de cada tipo sobre una cuenta:

| Tipo | Efecto |
|---|---|
| Ingreso | + importe en su cuenta |
| Gasto | − importe en su cuenta |
| Devolución | + importe en su cuenta (y reduce el gasto de su categoría) |
| Transferencia | − en la cuenta de origen, + en la de destino |

## 4. Cuentas del presupuesto y transferencias

- Cada cuenta indica si **cuenta para el presupuesto** (`includeInBudget`).
- **Saldo del presupuesto (S)** = Σ saldos actuales de las cuentas incluidas.
- Las **transferencias entre cuentas propias no son ingresos ni gastos**:
  - entre dos cuentas incluidas → S no cambia;
  - de una cuenta incluida a una excluida (por ejemplo, ahorro) → S baja;
  - de una excluida a una incluida → S sube.

## 5. Pagos e ingresos previstos

Hay dos fuentes de elementos previstos:

1. **Programados** (calendario): únicos o recurrentes (semanal, cada 2 semanas,
   mensual, anual).
2. **Movimientos con estado «previsto»**.

Cada ocurrencia tiene un estado:

| Estado | Significado | ¿Cuenta en el presupuesto? |
|---|---|---|
| Pendiente | fecha hoy o futura | Pagos: se reservan. Ingresos: **no** se suman. |
| Vencido | fecha pasada, sin marcar | Pagos: se siguen reservando (postura prudente). Ingresos: **no** se suman y se avisa. |
| Pagado / Recibido | existe un movimiento realizado vinculado | Ya está en el saldo; deja de reservarse. |
| Omitido | la persona decidió saltar esa vez | No cuenta. |

**Sin doble conteo:** una ocurrencia está pagada si existe un movimiento realizado con
el mismo `scheduleId` y `occurrenceDate`. Por eso cuenta **o** como reserva **o** como
movimiento, nunca ambas. Marcarla dos veces (o un doble clic) no crea un segundo
movimiento: la operación es idempotente. Si se elimina ese movimiento, la ocurrencia
vuelve a estar pendiente. Al actualizar el saldo se pueden marcar pagos vencidos como
«ya incluidos», y se registran sin volver a restarse.

**Días 29, 30 y 31:** en los pagos mensuales, si un mes no tiene ese día se usa el
**último día del mes**, y el mes siguiente se vuelve al día original
(31-ene → 28/29-feb → 31-mar → 30-abr). En los anuales, el 29-feb pasa al 28-feb en
años no bisiestos.

**Primera fecha:** la «próxima fecha» de un programado es la primera ocurrencia que se
controla; las anteriores no se consideran.

## 6. Disponible hasta el próximo ingreso

```
Próximo ingreso (I) = primera ocurrencia PROGRAMADA de ingreso, pendiente, con fecha > hoy
Días del periodo (D) = días desde hoy (incluido) hasta I (EXCLUIDO)      → D ≥ 1
Pagos reservados (P) = Σ pagos pendientes y vencidos con fecha ≤ I      (incluye el día I)
Apartados (A)        = Σ dinero apartado en metas que se descuentan del presupuesto
Disponible           = S − P − A
Por día              = floor(Disponible / D)                (0 si Disponible ≤ 0)
Por semana           = floor(Disponible × min(7, D) / D)    (0 si Disponible ≤ 0)
```

Decisiones:

- **El día del ingreso queda EXCLUIDO del periodo** (ese día ya cuenta con el dinero
  nuevo), pero **los pagos de ese mismo día SÍ se reservan**, porque el dinero puede
  llegar después de que se cobre el pago.
- **Los ingresos futuros nunca se suman** al disponible. Solo cuenta el dinero que ya
  está en las cuentas.
- Solo los **ingresos programados** definen el periodo. Un ingreso previsto suelto
  (por ejemplo, un reembolso de un amigo) no acorta el periodo.
- **Ingreso de hoy sin marcar:** no se cuenta; el periodo va hasta el siguiente
  ingreso programado y se muestra un aviso para marcarlo como recibido.
- **Ingreso retrasado** (fecha pasada sin marcar): no se cuenta; se muestra un aviso
  con acciones «Marcar como recibido», «No llegará (omitir)» y «Cambiar fecha».
- **Sin próximo ingreso:** no se divide entre cero. Se pide agregar un ingreso o
  elegir un **horizonte** (7, 14 o 30 días); con horizonte, D = días elegidos y se
  reservan los pagos hasta esa fecha.
- **Redondeo hacia abajo** en «por día» y «por semana»: así nunca se sugiere gastar
  más de lo disponible.
- **Saldo negativo:** se permite (sobregiro). El disponible puede ser negativo; en ese
  caso por día = 0 y se muestra cuánto falta.
- **Saldo antiguo:** si el saldo de referencia tiene 3 días o más, se avisa.

Ejemplo (la demo): S = 901.57; P = 42.80 (vencido) + 650.00 + 11.99 = 704.79;
A = 60.00 → Disponible = 136.78; D = 6 → por día = floor(136.78 / 6) = 22.79.

## 7. Metas y apartados virtuales

- Un apartado **no mueve dinero en el banco**; solo marca una parte del saldo.
- Metas **«del presupuesto»**: su dinero apartado se resta del disponible.
- Metas **«en otra cuenta»**: el dinero ya está fuera del presupuesto; solo se
  registra el progreso y **no se resta** (evita descontarlo dos veces).
- **No se puede apartar dos veces el mismo dinero:** un apartado nuevo en una meta del
  presupuesto no puede superar el disponible libre (S − P − A). Tampoco se puede
  apartar más de lo que le falta a la meta ni liberar más de lo apartado.
- Cada apartado tiene un identificador; reintentar la misma operación no la duplica.

Cuota necesaria (si la meta tiene fecha):

```
Restante      = objetivo − apartado
Semanas       = max(1, ceil(días hasta la fecha / 7))
Meses         = max(1, meses completos hasta la fecha)
Por semana    = ceil(Restante / Semanas)
Por mes       = ceil(Restante / Meses)
Por ingreso   = ceil(Restante / nº de ingresos programados hasta la fecha)
```

Se redondea **hacia arriba** al centavo para llegar a tiempo.

## 8. «¿Me alcanza?» (simulación)

La simulación **no modifica ningún registro**. Registrar la compra requiere pulsar
«Registrar esta compra» y luego «Guardar» en el formulario.

```
Disponible después = Disponible − Precio
Por día después    = floor(Disponible después / D)   (0 si ≤ 0)
```

| Veredicto | Condición |
|---|---|
| Sí, te alcanza | Disponible después ≥ la mitad del disponible actual **y** la proyección a 30 días no baja de cero |
| Te alcanza, pero queda justo | Disponible después ≥ 0, pero usa más de la mitad o la proyección a 30 días baja de cero |
| Solo alcanza usando dinero apartado | Disponible después < 0 pero Disponible después + apartados ≥ 0 |
| No te alcanza por ahora | Ni con los apartados alcanza |

Si la proyección ya bajaba de cero **antes** de la compra, se dice explícitamente
(la compra no es la causa, pero empeora el mínimo).

## 9. Proyección a 30 días

```
Punto de partida = S (saldo REAL de hoy)
Para cada día d (hoy … hoy+29):
  saldo(d) = saldo(d−1) + Σ ingresos previstos de d − Σ pagos previstos de d − gasto diario estimado
```

Suposiciones (se muestran en pantalla):

- Los pagos vencidos sin marcar se restan hoy.
- Los ingresos retrasados **no** se suman.
- Los importes aproximados se usan tal cual y se señalan.
- El gasto diario estimado es opcional: por defecto, el promedio de gastos
  variables realizados (sin pagos programados, sin transferencias, menos
  devoluciones) de los últimos 30 días, excluyendo hoy. Con menos de 7 días de
  historial no se ofrece el promedio.
- Los apartados no se restan (el dinero sigue en la cuenta), pero se avisa si el
  saldo proyectado cae por debajo de ellos.
- El gráfico distingue el **punto real de hoy** (círculo) de la **proyección** (línea
  discontinua). Hay una tabla con los mismos valores.

## 10. Devoluciones y tarjetas de crédito

- Una **devolución** suma al saldo. Si se vincula a un gasto, la suma de devoluciones
  no puede superar el importe del gasto (devoluciones parciales permitidas).
- **Tarjeta de crédito** = cuenta de tipo `credit` cuyo saldo es la **deuda**, guardada
  como número negativo (deber 100.00 → `-10000`). En pantalla se escribe y se muestra
  la deuda en positivo («Debes $100.00»).
- **Compra con tarjeta** = gasto de la cuenta tarjeta (la deuda crece).
- **Pago de la tarjeta** = **transferencia** desde el banco hacia la tarjeta. No es un
  gasto: así la compra se cuenta una sola vez.
- Si la tarjeta **cuenta para el presupuesto** (recomendado), su deuda se resta de S y
  el disponible baja en el momento de la compra; el pago posterior no cambia S.
  Si no cuenta, la compra no afecta hasta que se paga (la transferencia baja S).
- Una cuenta no puede convertirse en tarjeta ni al revés (cambiaría el signo del saldo).
- Datos opcionales de la tarjeta (`card`): límite, tasa anual, día de corte, día de
  pago y regla del pago mínimo. Con ellos se muestra (sin cambiar el disponible):

```
Deuda                     = max(0, −saldo)
Crédito disponible        = límite − deuda            (negativo = sobre el límite)
Pago mínimo ESTIMADO      = min(deuda, max(importe fijo, ceil(deuda × % / 100)))   (por defecto 3 % y 10,00)
Interés de un mes ESTIMADO = ceil(deuda × tasa anual / 12)   (si no se paga nada)
Próximo corte / pago      = el día indicado de este mes o del siguiente; en meses cortos, el último día
```

- Las tasas y porcentajes se guardan como **enteros en puntos básicos**
  (19,99 % = 1999), sin decimales flotantes.
- Son estimaciones orientativas: los bancos calculan con saldo diario promedio y
  reglas propias. La app lo dice junto a cada cifra.
- Recordatorio dentro de la app: si hay deuda y el pago vence en los próximos 7 días.

## 10 b. Categorías personalizadas

- Además de las fijas, la persona puede crear categorías de gasto o de ingreso
  (id `c_…`, nombre único por tipo). El tipo no cambia después de crearlas.
- **Archivar** la oculta de los formularios; los movimientos antiguos siguen siendo
  válidos y conservan su nombre. Solo se puede **eliminar** si nadie la usa.
- Las devoluciones usan las categorías de gasto (fijas y personalizadas).

## 10 c. Resumen mensual (Movimientos)

```
Ingresos del mes          = Σ ingresos realizados del mes
Gasto neto de categoría   = Σ gastos realizados − Σ devoluciones realizadas del mes
Gasto neto del mes        = Σ gasto neto de todas las categorías
```

Las transferencias (incluidos los pagos de tarjeta) y los previstos no cuentan.
Incluye todas las cuentas, también las que están fuera del presupuesto.

**Límites mensuales por categoría** (opcionales, solo categorías de gasto):

```
Gastado     = max(0, gasto neto de la categoría en el mes)
Queda       = límite − gastado        (negativo = «pasado por»)
Cerca       = gastado ≥ 80 % del límite y sin pasarse
```

Son informativos: **no** cambian «Puedes gastar». Inicio avisa si en el mes actual
alguna categoría se pasó de su límite.

## 10 d. Importar movimientos del banco (CSV)

El archivo se lee **solo en el dispositivo** (`src/domain/bankImport.ts`); nada se
guarda hasta confirmar la vista previa. Límites: 2 MB y 5000 filas.

- **Lectura:** separador `,`, `;` o tabulador (el más frecuente fuera de comillas),
  comillas dobles con `""`, CRLF, BOM; UTF-8 o, si no lo es, Windows-1252.
- **Fechas:** `AAAA-MM-DD` (también `/`, `.`, compacta o con hora), día/mes/año,
  mes/día/año y `28 Sep 2026`. Solo se proponen los formatos con los que **todas** las
  fechas son válidas; si caben día/mes y mes/día, la persona elige.
- **Importe:** con `parseMoney` (enteros, sin flotantes) y el formato numérico de
  Ajustes. Una columna con signo (− = gasto) o dos columnas (cargo resta, abono suma,
  sin importar su signo). `(12.34)` = −12.34. Opción de invertir el signo (tarjetas).
  Positivo → ingreso; negativo → gasto; cero, fecha futura o inválida → fila con error.
- **Huella** `importRef = cuenta | fecha | importe con signo | descripción normalizada |
  nº de repetición`. La descripción se normaliza (minúsculas, sin acentos, espacios
  simples, 80 caracteres). El nº de repetición distingue dos filas idénticas del mismo
  archivo (dos cafés iguales el mismo día).
- **Duplicado exacto:** ya existe un movimiento con la misma huella → no se puede
  importar. Importar dos veces el mismo archivo no crea nada.
- **Posible duplicado:** movimiento realizado de la misma cuenta, mismo tipo e importe,
  fecha a ±3 días y sin huella (registrado a mano). Cada movimiento empareja una sola
  fila. Se muestra **desmarcado**.
- **Saldo:** se guardan como realizados y siguen la regla del §3. Las filas anteriores a
  la fecha del saldo de referencia quedan como historial y no cambian el saldo. Las del
  mismo día: por defecto «ya incluidas» (`realizedAt = setAt`), con casilla para cambiarlo.
- **Todo o nada:** si una fila elegida no pasa la validación, no se importa ninguna.
  «Deshacer» quita exactamente los movimientos creados. Editar un movimiento importado
  conserva su huella.

## 10 e. Reglas de categoría

```
coincide  = normalizar(descripción) contiene normalizar(texto de la regla)
normalizar = minúsculas, sin acentos, espacios simples
```

- Solo se consideran reglas del mismo tipo (gasto o ingreso; las devoluciones usan las
  de gasto) cuya categoría exista y no esté archivada. El texto tiene al menos 2
  caracteres y no se repite para el mismo tipo.
- Si varias coinciden, gana el texto **más largo** («uber eats» antes que «uber»); si
  empatan, la regla más antigua.
- Una regla solo **propone**: en la importación CSV (cada fila, cambiable) y en la nota de
  un movimiento nuevo mientras no se elija la categoría a mano. Nunca cambia movimientos
  guardados ni importes. Al eliminar una categoría personalizada se quitan sus reglas.

## 11. Integridad de datos

- Identificadores únicos (UUID v4) generados al abrir cada formulario: guardar dos
  veces actualiza el mismo registro (idempotencia).
- Un movimiento realizado no puede tener fecha futura.
- La importación de copias valida todo el archivo (tipos, importes enteros, moneda,
  fechas reales, referencias entre registros, duplicados) y **no aplica nada si hay un
  solo error**.

## 12. Papelera

- Eliminar un movimiento lo **saca de `transactions`** y lo guarda en `trash` con la fecha
  de eliminación. Por eso deja de contar en saldos, disponible, proyección, resúmenes,
  límites y conciliaciones sin que cada cálculo tenga que acordarse de filtrarlo.
- La papelera es persistente (se guarda con los datos y en las copias de seguridad). No hay
  borrado automático por antigüedad: solo «Eliminar definitivamente» (uno) o «Vaciar
  papelera» (todos), ambos con confirmación explícita.
- **Transferencias**: son un único registro con origen y destino, así que se eliminan y
  restauran completas (ambas cuentas a la vez, de forma atómica).
- **Devoluciones**: si se elimina un gasto, sus devoluciones siguen contando (el dinero sí
  volvió) pero pierden el vínculo; la lista se guarda en la papelera y al restaurar el
  gasto se vuelven a vincular si siguen existiendo, sin vínculo y sin superar el importe.
  Una devolución restaurada cuyo gasto ya no existe (o no admite más devoluciones) se
  restaura **sin vínculo**. Nunca quedan referencias rotas.
- **Pagos del calendario**: eliminar el movimiento que liquidó una ocurrencia la deja otra
  vez pendiente o vencida (vuelve a reservarse). Si después se registra otro pago para esa
  misma ocurrencia, restaurar el primero se **bloquea** (`occurrenceAlreadySettled`): se
  contaría dos veces.
- **Ajustes de conciliación**: eliminarlos deja la conciliación «pendiente de revisión».
- **Importaciones CSV**: una fila cuyo movimiento está en la papelera aparece como «En la
  papelera» y no se puede importar (se restaura desde la papelera). Al eliminar
  definitivamente solo se conserva su huella `importRef` (sin importes ni descripciones);
  si se vuelve a importar el archivo, la fila aparece «Eliminado antes», **desmarcada**.
- No se puede eliminar una cuenta ni una categoría usada por movimientos de la papelera.
- «Deshacer» tras eliminar es un acceso rápido a la misma restauración. Deshacer una
  creación (marcar pagado, importar) descarta el registro sin pasar por la papelera.

## 13. Favoritos

- Plantilla de gasto o ingreso: nombre, tipo, cuenta, categoría, importe y nota opcionales,
  y un orden. Abrir un favorito rellena el formulario con la **fecha de hoy**; la persona
  revisa y pulsa Guardar. No es un pago recurrente y **nunca crea movimientos solo**.
- Si su cuenta ya no existe o su categoría fue archivada o eliminada, el formulario deja
  ese campo vacío y pide elegir uno válido; guardar sin elegir da error.
- El id se genera al abrir el diálogo: pulsar Guardar dos veces actualiza el mismo favorito.

## 14. Conciliación de saldos

```
Saldo calculado al final del día D = saldo de referencia
                                   + Σ movimientos REALIZADOS aplicados a ese saldo con fecha ≤ D
Diferencia = saldo observado − saldo calculado
```

- D ≥ fecha del saldo de referencia (antes de esa fecha la app no conoce el saldo) y D ≤ hoy.
- Solo movimientos realizados; nunca previstos ni pagos programados. La regla de «ya
  incluido en el saldo» (§3) es la misma que usa el saldo actual, así que para D = hoy el
  saldo calculado coincide con el saldo de la cuenta.
- **Qué saldo comparar**: el contabilizado o «actual» del banco al final de ese día. El
  «disponible» puede descontar retenciones o movimientos pendientes; esos pendientes
  pueden explicar una diferencia.
- **Tarjetas**: el saldo es negativo = deuda. La persona escribe lo que debe (positivo) y se
  guarda en negativo. El crédito disponible nunca se compara: no es dinero propio.
- **Resolución**: `matched` (diferencia 0), `unresolved` (se guarda la diferencia para
  revisarla) o `adjusted`. Nunca se cambia el saldo de referencia ni se crea un ajuste
  sin confirmación.
- **Ajuste** (`kind: 'adjustment'`): importe = |diferencia|, fecha D, dirección sube/baja,
  motivo obligatorio y `reconciliationId`. Corrige el saldo de la cuenta (y el disponible
  si la cuenta está en el presupuesto) pero **no es ingreso ni gasto**: no entra en el
  resumen del mes, límites, promedio de gasto diario ni proyección de ingresos.
- **Huella**: al conciliar se guarda una huella del saldo de referencia y de los
  movimientos (id, tipo, importe, fecha, cuentas) que forman el saldo hasta D. Si cambia
  (editar importe o fecha, eliminar, restaurar, añadir un movimiento con fecha ≤ D), la
  conciliación pasa a «pendiente de revisión». Cambiar solo una nota no la altera. Un
  saldo de referencia posterior a D la deja «reemplazada».
- **Inicio** muestra por separado «Último movimiento registrado» (fecha del último
  movimiento realizado) y «Saldos verificados» (fecha verificada más antigua entre las
  cuentas del presupuesto, o cuántas faltan). La antigüedad se muestra en días, sin
  porcentajes de confianza inventados.

## 15. Recordatorio de copia de seguridad

- Guardar en el navegador **no es una copia de seguridad**.
- `lastExportAt`: la app generó el archivo y **pidió** al navegador descargarlo; no puede
  comprobar dónde se guardó. Si generar o pedir la descarga falla, no se registra nada.
- `lastVerifiedAt`: la persona eligió un archivo y la app comprobó que es una copia válida
  de **este** presupuesto (`budgetId`). No se importa nada.
- Cambios sin respaldar = `updatedAt` de los datos > `updatedAt` en el momento de exportar.
  Registrar copias, verificarlas o posponer no cuentan como datos nuevos.
- Recordatorio (semanal por defecto; mensual o desactivado): aparece solo en Inicio si hay
  cambios sin respaldar y pasaron 7 / 30 días desde la última exportación (o desde que se
  crearon los datos si nunca se exportó). «Recordar en 7 días» lo pospone. No se muestra
  con datos de demostración y no usa notificaciones del sistema.

## 16. Ingresos variables

- Un ingreso programado puede tener rango: **mínimo ≤ esperado ≤ extra** (enteros ≥ 0; el
  esperado es el importe principal y debe ser > 0). Incluso el mínimo es una estimación.
- **Disponible** (§6): no cambia. Nunca suma ingresos futuros en ningún escenario.
- **Proyección** (§9): usa el escenario elegido; por defecto el **mínimo** (prudente). La
  tabla «Comparar escenarios» muestra, para cada uno, ingresos estimados, saldo más bajo,
  saldo final y primer faltante. «¿Me alcanza?» también usa el mínimo. Cambiar de
  escenario nunca modifica movimientos ni saldos reales.
- **Retrasado**: si pasa la fecha sin registrarlo, queda «vencido»: no se suma al
  disponible ni a la proyección (§9) y el periodo pasa a terminar en el siguiente ingreso
  pendiente. Inicio avisa y ofrece registrarlo, omitirlo o cambiar la fecha.
- **Importe distinto**: se registra lo real y la ocurrencia se cierra con ese importe.
- **Parcial**: si llega menos de lo que falta, la persona elige:
  - «Espero el resto»: movimiento con `partialSettlement: true`; la ocurrencia sigue
    abierta por `esperado − recibido` (y en la proyección, `escenario − recibido`, nunca
    negativo). Se pueden registrar más parciales y una liquidación final.
  - «Dar por terminado»: se cierra con lo recibido (el último parcial pasa a ser final,
    sin crear movimientos).
- Como mucho **una** liquidación final por ocurrencia (se valida también en las copias).
- **Vincular**: al registrar un ingreso (o gasto) a mano, el formulario ofrece vincularlo
  con una ocurrencia abierta cercana; así la previsión queda liquidada y no se cuenta dos
  veces. Una ocurrencia ya cerrada no se ofrece.

## 17. Formato de datos y migraciones

- Versión actual: **6**. Migraciones encadenadas v1 → v2 → v3 → v4 → v5 → v6 en
  `src/storage/migrations.ts`, con pruebas.
- v4 → v5 añade `trash`, `purgedImportRefs`, `favorites`, `reconciliations` y `backup`
  solo si **faltan**; si existen con un formato incorrecto se conservan para que la
  validación rechace el archivo. Nunca se borran datos para resolver un error de esquema.
- v5 → v6 añade `periodBudgets: []`, `scenarios: []` y `settings.weeklyReview: true`
  solo si faltan (una preferencia ya guardada se respeta). Las metas antiguas no cambian:
  `allocations[].reason` y `goal.plan` son opcionales.
- Antes de guardar por primera vez datos migrados, se conserva el texto original en
  `localStorage` (`margen.data.before-v6`).
- Datos o copias de una versión futura se rechazan (`schemaTooNew`) sin tocar los datos
  actuales; si una migración falla, se informa (`migrationFailed`) y no se modifica nada.
- Copias, importación y «Borrar todos los datos» incluyen las entidades nuevas
  (presupuestos por periodo, escenarios y el plan de los gastos planificados); la
  importación valida todo el archivo y no aplica nada si hay un error.

## 18. Gastos planificados (anuales o poco frecuentes)

Son metas con `kind: 'expense'` y `plan` (`src/domain/plannedExpenses.ts`). Reutilizan
los apartados, así que nunca hay una segunda reserva:

- **Plan sugerido** (solo cálculo, no aparta nada): por semana = `ceil(falta / semanas)`,
  por mes = `ceil(falta / meses)` (mismo cálculo que las metas, §7).
- **Confirmado** = suma de `allocations` (aportes confirmados − liberaciones − usos).
  Solo esto se descuenta de «Puedes gastar» (si la meta es del presupuesto).
- Estado: *Pagado* (ciclo único ya pagado) › *Cubierto* (apartado ≥ objetivo) ›
  *Vencido* (hoy ≥ vencimiento) › *Vence en menos de una semana* (< 7 días) › *En camino*.
- **Vínculo opcional** con una ocurrencia abierta de un gasto programado: la fecha pasa
  a ser la de la ocurrencia y esa ocurrencia **no se reserva dos veces**: su reserva en
  el disponible se reduce en lo que la meta ya cubre (`reserves.ts`, `scheduleCoverage`):
  `reserva de la ocurrencia = importe − min(importe, apartado de la meta)`.
  Una ocurrencia solo puede estar vinculada a una meta.
- **Aportar a un gasto vinculado** (`maxBudgetAllocation`): la parte que cubre un pago ya
  reservado no cuesta dinero libre (solo pasa de «reservado para el pago» a «apartado en la
  meta»): `máximo = min(falta, parte neutral + dinero libre)`.
- **Pagar** (una operación, idempotente por el id del gasto generado al abrir el diálogo):
  1. registra el gasto real (o liquida la ocurrencia vinculada con `markOccurrence`);
  2. usa de la reserva `min(apartado, pagado)` (`reason: 'payment'`);
  3. sobrante `apartado − pagado`: se **libera** (`reason: 'release'`) o, si se repite,
     se puede **guardar para el siguiente periodo**; faltante `pagado − apartado`: sale
     del dinero disponible como cualquier gasto y se avisa antes de confirmar;
  4. guarda el ciclo en `plan.history` (vencimiento, objetivo, apartado, pagado, gasto,
     decisión). Si se repite cada *N* meses, el vencimiento avanza *N* meses (o a la
     siguiente ocurrencia vinculada) **sin marcarse como financiado**; si no se repite,
     queda como pagado.

## 19. Presupuestos por periodo (semestre, viaje, personalizado)

`src/domain/periodBudgets.ts`. Una moneda (la del presupuesto).

- **Gastado** = Σ gastos realizados asociados − Σ devoluciones realizadas asociadas.
  Las devoluciones de un gasto asociado cuentan aunque no se asocien.
- **Restante** = asignado − gastado (negativo = excedido, con aviso).
- **Por día** = `floor(restante / días que quedan)`, contando hoy y el último día;
  **por semana** = `mulDivFloor(restante, min(7, días), días)`. Periodo futuro: días
  totales. Terminado: sin cuota.
- **Asignado ≠ disponible:** crear o editar un presupuesto no crea ingresos,
  transferencias ni reservas. Solo «Reservar dinero» (opcional) crea o reutiliza una meta
  del presupuesto vinculada (`goalId`) y aparta dinero con el control habitual de dinero
  libre. Lo gastado en el periodo desde cuentas del presupuesto va **consumiendo** esa
  reserva: `reserva efectiva = max(0, apartado − gastado del periodo)`, para que el
  mismo dinero no se descuente dos veces (una por el gasto y otra por la reserva).
- **Asociación:** solo se guarda el id (`txIds`); el movimiento no se copia ni cambia.
  Solo gastos y devoluciones (transferencias, ingresos y ajustes no).
- **Fuera de fechas:** un movimiento asociado fuera del rango cuenta (se asoció a
  propósito) y se señala. **Previstos** asociados se muestran aparte y no cuentan como
  gastado. **Papelera:** no cuenta; al restaurarlo vuelve a contar; al purgarlo se quita
  la asociación.
- **Sugerencias:** gastos y devoluciones sin asociar **dentro de las fechas** (opcionalmente de
  una categoría). Solo se proponen; «Asociar N gastos sugeridos» los asocia en una operación
  (todo o nada) y se puede deshacer.
- **Regla opcional** (`ruleCategoryIds`): al registrar un gasto o devolución de esas
  categorías dentro de las fechas de un periodo activo, el formulario **marca** el periodo
  como propuesta (`periodsProposedFor`); la persona puede desmarcarlo. Nunca se asocia
  nada sin guardar el formulario.
- **Solapados:** un movimiento en dos presupuestos cuenta en cada uno, pero en el total
  combinado (`consolidatedSpent`) **una sola vez**.
- **Archivar** conserva todo el historial y deja de ofrecerlo en el formulario de
  movimientos; eliminar no toca movimientos ni la meta de reserva y se puede deshacer.

## 20. Revisión semanal

`src/domain/weeklyReview.ts`. Reglas fijas, sin IA; solo dentro de la app (se puede
ocultar en Inicio o en Ajustes; no hay correos ni notificaciones).

- Semana = **lunes a domingo** en fechas de calendario de la zona horaria elegida.
- Ingresos = ingresos realizados; gasto = gastos − devoluciones realizados; balance =
  ingresos − gasto. Transferencias hacia cuentas fuera del presupuesto se muestran como
  «a ahorro» y los apartados para metas aparte: **no son gasto**. Los ajustes de
  conciliación y los previstos no cuentan.
- **Comparación equivalente:** semana en curso = lunes…hoy contra lunes…el mismo día de
  la semana anterior; semanas cerradas = 7 contra 7 días.
- **Datos faltantes:** «desde cuándo hay registros» = el menor entre la fecha de alta,
  los saldos de referencia y el primer movimiento. Si una semana empieza antes, se marca
  «faltan datos» y no se compara. Sin movimientos no significa «sin gastos».
- **Porcentaje** = `floor(diferencia × 100 / anterior)` solo si ambas semanas tienen datos
  completos y la anterior tiene movimientos y es > 0. Nunca se divide entre cero.
- Próximos pagos: 7 días desde hoy (solo en la semana en curso). Metas: progreso real
  (apartado) y lo apartado esa semana (sin contar los usos al pagar).

## 21. Comparador de escenarios

`src/domain/scenarios.ts`. Amplía «¿Me alcanza?» reutilizando `computeBudget` y
`projectBalance`.

- Cada escenario se evalúa sobre una **copia** de los datos: una compra = gasto
  **previsto simulado** en la cuenta elegida (por defecto, la primera del presupuesto) y la
  fecha elegida; cambiar
  un pago programado = otro importe para todas sus ocurrencias; un **ingreso hipotético**
  = ingreso **previsto simulado**: cambia el saldo proyectado y el posible faltante, pero
  «Puedes gastar» nunca lo suma (los ingresos futuros no se cuentan, §6). Guardar, editar o
  eliminar escenarios solo toca `scenarios`.
- Situación actual y hasta **3** escenarios con las **mismas hipótesis**: horizonte (30,
  60 o 90 días), escenario de ingresos variables (mínimo por defecto) y gasto diario
  estimado.
- Resultados: saldo al final, saldo más bajo y su fecha, faltante posible
  (`max(0, −más bajo)`) desde el primer día negativo, «Puedes gastar» y su diferencia con
  la situación actual, y primer día en que se tocaría lo apartado para metas.
- **Datos cambiados:** al guardar se registra una huella (FNV-1a) de cuentas,
  movimientos, programados, metas, presupuestos por periodo y horizonte. Si la huella
  actual es distinta, el escenario se recalcula igualmente y se marca «Datos cambiados»
  hasta que la persona lo revisa.
- Cambios que ya no se pueden aplicar (compra en el pasado, pago eliminado) se ignoran y
  se avisan. Nada se aplica solo; «Crear gasto previsto» abre el formulario normal
  (acción explícita) y antes avisa si ya hay un previsto del mismo importe a ±3 días.
- Nunca se dice que una compra es «segura» o «garantizada».

## 22. Búsqueda global

`src/domain/search.ts`. Todo en el dispositivo.

- Normalización: NFD sin marcas diacríticas, minúsculas, espacios colapsados
  (`normalizeText`). Cada palabra de la consulta debe aparecer (Y lógico, cualquier
  orden). Mínimo 2 caracteres.
- Dónde busca: movimientos (nota/comercio, categoría, cuentas), cuentas, categorías
  (fijas por su nombre **en el idioma activo**; personalizadas tal como se escribieron),
  metas y gastos planificados, pagos programados (nombre y nota), presupuestos por
  periodo y favoritos. La **papelera** solo si se marca «Incluir la papelera».
- **Importes:** una palabra con forma de importe («4.25», «4,25», «$4.25», «650») se compara
  con el importe exacto (texto decimal sin flotantes), no como subcadena: «25» no encuentra
  todos los importes que contienen 25.
- Resultados agrupados por tipo (máximo 50 visibles por grupo con el total); movimientos
  del más reciente al más antiguo.
- **Rendimiento:** el índice (cadenas ya normalizadas) se construye una vez por versión
  de datos e idioma y la escritura usa `useDeferredValue`. Verificado en
  `search.test.ts` con 10 000 movimientos (la prueba falla si el índice supera 1 s o una
  búsqueda 200 ms). Medido en el contenedor de desarrollo (Node, 3 repeticiones):
  índice 18–27 ms; búsqueda concreta («autobus») 3–10 ms; búsqueda amplia («ca») 6–10 ms.

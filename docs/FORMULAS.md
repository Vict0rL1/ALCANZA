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
- Límite de crédito, intereses y fechas de corte: fuera de esta fase.

## 11. Integridad de datos

- Identificadores únicos (UUID v4) generados al abrir cada formulario: guardar dos
  veces actualiza el mismo registro (idempotencia).
- Un movimiento realizado no puede tener fecha futura.
- La importación de copias valida todo el archivo (tipos, importes enteros, moneda,
  fechas reales, referencias entre registros, duplicados) y **no aplica nada si hay un
  solo error**.

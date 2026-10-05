/**
 * Casos financieros con resultados calculados A MANO (en los comentarios), no con las
 * funciones del proyecto. Sirven para detectar errores de fórmula, no solo regresiones.
 *
 * Punto de partida común (fixtures): cuenta «main» del presupuesto con saldo de
 * referencia 1,000.00 registrado hoy (28-sep-2026, lunes) antes de los movimientos de hoy.
 */
import { describe, expect, it } from 'vitest'
import { accountBalance, allAccountBalances, spendableBalance } from './balances'
import { computeBudget } from './budget'
import { cardSummary } from './cards'
import { daysBetween, todayInTimeZone } from './dates'
import { applyDistribution } from './incomeDistribution'
import { periodSummary } from './insights'
import { allocateToGoal, deleteTransaction, importTransactions, markOccurrence, reconcileAccount, restoreFromTrash, saveTransaction } from './operations'
import { projectBalance } from './projection'
import { occurrencesBetween } from './recurrence'
import { savePlannedExpense, settlePlannedExpenseFromCalendar } from './plannedExpenses'
import { evaluate } from './scenarios'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, bill, ctx, deepFreeze, EARLIER, goal, income, TODAY, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}
const S = (d: AppData) => spendableBalance(d).totalMinor
/** Patrimonio = suma de TODAS las cuentas (incluidas las que no cuentan para el presupuesto). */
const netWorth = (d: AppData) => allAccountBalances(d).reduce((s, b) => s + b.balanceMinor, 0)
const available = (d: AppData, today = TODAY) => computeBudget(d, today).availableMinor
const bank = (id: string, amountMinor: number, includeInBudget = true) => account({ id, name: id, includeInBudget, anchor: { amountMinor, date: TODAY, setAt: EARLIER } })
const card = (id: string, debtMinor: number, includeInBudget: boolean, limitMinor = 500000) =>
  account({ id, name: id, kind: 'credit', includeInBudget, anchor: { amountMinor: -debtMinor, date: TODAY, setAt: EARLIER }, card: { limitMinor } })
const valid = (d: AppData) => expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true)

describe('1. saldo inicial, ingreso recibido y gasto normal', () => {
  it('1,000.00 + 250.00 − 40.25 = 1,209.75; próximo ingreso en 7 días → 172.82 por día', () => {
    const d = baseData({
      schedules: [income('2026-10-05', 90000)],
      transactions: [tx({ id: 'in', kind: 'income', amountMinor: 25000 }), tx({ id: 'out', amountMinor: 4025 })],
    })
    const b = computeBudget(d, TODAY)
    expect(b.spendableMinor).toBe(120975)
    // Del 28-sep (incluido) al 5-oct (excluido) = 7 días. 120975 / 7 = 17282.14… → 17282.
    expect(b.horizon?.days).toBe(7)
    expect(b.availableMinor).toBe(120975) // el ingreso futuro de 900.00 NO se suma
    expect(b.dailyMinor).toBe(17282)
    expect(b.weeklyMinor).toBe(120975) // 7 de 7 días
  })

  it('un movimiento previsto no cambia el saldo; uno anterior al saldo de referencia tampoco', () => {
    const d = baseData({
      transactions: [tx({ status: 'planned', amountMinor: 5000, date: '2026-10-02' }), tx({ amountMinor: 7000, date: '2026-09-27' })],
    })
    expect(S(d)).toBe(100000)
  })
})

describe('2. transferencias entre cuentas propias', () => {
  const accounts = [bank('main', 100000), bank('chk', 50000), bank('sav', 200000, false)]

  it('entre dos cuentas del presupuesto: no cambia el saldo consolidado ni el patrimonio', () => {
    const d = baseData({ accounts, transactions: [tx({ kind: 'transfer', categoryId: undefined, accountId: 'main', toAccountId: 'chk', amountMinor: 30000 })] })
    expect(accountBalance(d, accounts[0]!).balanceMinor).toBe(70000)
    expect(accountBalance(d, accounts[1]!).balanceMinor).toBe(80000)
    expect(S(d)).toBe(150000) // 1,000 + 500
    expect(netWorth(d)).toBe(350000) // + 2,000 de ahorro
    // No es ingreso ni gasto.
    const m = periodSummary(d, '2026-09-01', '2026-09-30')
    expect([m.incomeMinor, m.netSpendingMinor]).toEqual([0, 0])
  })

  it('hacia el ahorro (fuera del presupuesto): baja lo que se puede gastar, el patrimonio no cambia', () => {
    const d = baseData({ accounts, transactions: [tx({ kind: 'transfer', categoryId: undefined, accountId: 'main', toAccountId: 'sav', amountMinor: 30000 })] })
    expect(S(d)).toBe(120000) // 1,500 − 300
    expect(netWorth(d)).toBe(350000)
  })
})

describe('3. compra con tarjeta y pago posterior (sin doble gasto)', () => {
  it('tarjeta que cuenta para el presupuesto: la compra baja el disponible; el pago no', () => {
    const accounts = [bank('main', 100000), card('visa', 0, true)]
    const bought = baseData({ accounts, transactions: [tx({ id: 'buy', accountId: 'visa', amountMinor: 8000, categoryId: 'shopping' })] })
    expect(S(bought)).toBe(92000) // 1,000 − 80 de deuda
    const paid = { ...bought, transactions: [...bought.transactions, tx({ id: 'pay', kind: 'transfer', categoryId: undefined, accountId: 'main', toAccountId: 'visa', amountMinor: 8000 })] }
    expect(S(paid)).toBe(92000)
    expect(accountBalance(paid, accounts[1]!).balanceMinor).toBe(0)
    // El gasto del mes es 80.00 una sola vez.
    expect(periodSummary(paid, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(8000)
  })

  it('tarjeta fuera del presupuesto: la compra no baja el disponible hasta pagarla', () => {
    const accounts = [bank('main', 100000), card('visa', 0, false)]
    const bought = baseData({ accounts, transactions: [tx({ id: 'buy', accountId: 'visa', amountMinor: 8000 })] })
    expect(S(bought)).toBe(100000)
    const paid = { ...bought, transactions: [...bought.transactions, tx({ id: 'pay', kind: 'transfer', categoryId: undefined, accountId: 'main', toAccountId: 'visa', amountMinor: 8000 })] }
    expect(S(paid)).toBe(92000)
    expect(periodSummary(paid, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(8000)
  })

  it('el crédito disponible nunca se cuenta como dinero propio', () => {
    // Límite 5,000.00 sin deuda: lo que se puede gastar sigue siendo 1,000.00.
    const d = baseData({ accounts: [bank('main', 100000), card('visa', 0, true, 500000)] })
    expect(S(d)).toBe(100000)
    expect(available(d)).toBe(100000)
    expect(netWorth(d)).toBe(100000)
    expect(cardSummary(d, d.accounts[1]!, TODAY).availableCreditMinor).toBe(500000)
    // Saldo a favor en la tarjeta (pagaste de más): sí es dinero propio.
    const credit = baseData({ accounts: [bank('main', 100000), account({ id: 'visa', kind: 'credit', includeInBudget: true, anchor: { amountMinor: 1500, date: TODAY, setAt: EARLIER } })] })
    expect(S(credit)).toBe(101500)
  })
})

describe('4. devolución parcial de una compra dividida', () => {
  const purchase = () =>
    ok(
      saveTransaction(
        baseData(),
        { id: 'w', kind: 'expense', status: 'realized', amountMinor: 12000, date: TODAY, accountId: 'main', categoryId: 'groceries', splits: [{ id: 'a', categoryId: 'groceries', amountMinor: 9000 }, { id: 'b', categoryId: 'housing', amountMinor: 3000 }] },
        ctx,
      ),
    ).data

  it('120.00 (90 súper + 30 hogar) − 10.00 devuelto de hogar: saldo 890.00; hogar neto 20.00', () => {
    const d = ok(saveTransaction(purchase(), { id: 'r', kind: 'refund', status: 'realized', amountMinor: 1000, date: TODAY, accountId: 'main', categoryId: 'housing', refundOfId: 'w', splits: [{ id: 'ra', categoryId: 'housing', amountMinor: 1000 }] }, ctx)).data
    expect(S(d)).toBe(89000)
    const m = periodSummary(d, '2026-09-01', '2026-09-30')
    expect(m.categories.find((c) => c.categoryId === 'groceries')!.netMinor).toBe(9000)
    expect(m.categories.find((c) => c.categoryId === 'housing')!.netMinor).toBe(2000)
    expect(m.netSpendingMinor).toBe(11000)
  })

  it('no se puede devolver de una categoría más de lo que queda (30.01 de hogar)', () => {
    const r = saveTransaction(purchase(), { id: 'r', kind: 'refund', status: 'realized', amountMinor: 3001, date: TODAY, accountId: 'main', categoryId: 'housing', refundOfId: 'w', splits: [{ id: 'ra', categoryId: 'housing', amountMinor: 3001 }] }, ctx)
    expect(r.ok).toBe(false)
  })
})

describe('5. reservas para metas y gastos planificados', () => {
  it('1,000 − 50 (factura) − 200 (meta) − 150 (gasto planificado) = 600; reservar no crea ni destruye dinero', () => {
    let d = baseData({ schedules: [income('2026-10-05', 90000), bill('2026-10-01', 5000, { id: 'luz' })], goals: [goal({ id: 'trip' })] })
    d = ok(allocateToGoal(d, { goalId: 'trip', amountMinor: 20000 }, ctx)).data
    d = ok(savePlannedExpense(d, { id: 'tax', name: 'Impuesto', targetMinor: 30000, dueDate: '2026-12-01', fundedFrom: 'budget', initialReservedMinor: 15000 }, ctx)).data
    expect(S(d)).toBe(100000) // el dinero sigue en la cuenta
    expect(netWorth(d)).toBe(100000)
    const b = computeBudget(d, TODAY)
    expect([b.reservedTotalMinor, b.goalsReservedMinor, b.availableMinor]).toEqual([5000, 35000, 60000])
    // Identidad: disponible + pagos reservados + apartados = saldo.
    expect(b.availableMinor + b.reservedTotalMinor + b.goalsReservedMinor).toBe(b.spendableMinor)
  })
})

describe('6. pago desde el calendario que libera la reserva correspondiente', () => {
  // Factura de luz de 50.00 el 1-oct; gasto planificado vinculado con 50.00 apartados.
  const linked = () => {
    const d = baseData({ schedules: [income('2026-10-05', 90000), bill('2026-10-01', 5000, { id: 'luz', name: 'Luz' })] })
    return ok(
      savePlannedExpense(d, { id: 'g', name: 'Luz', targetMinor: 5000, dueDate: '2026-10-01', fundedFrom: 'budget', link: { scheduleId: 'luz', occurrenceDate: '2026-10-01' }, initialReservedMinor: 5000 }, ctx),
    ).data
  }

  it('antes de pagar: la factura cubierta por lo apartado se descuenta UNA vez → 950.00', () => {
    expect(available(linked())).toBe(95000)
  })

  it('pagada desde el calendario: 950.00 sin esperar a cerrar el gasto planificado (sin doble resta)', () => {
    const paid = ok(markOccurrence(linked(), { scheduleId: 'luz', occurrenceDate: '2026-10-01', amountMinor: 5000, date: TODAY }, ctx)).data
    expect(S(paid)).toBe(95000) // 1,000 − 50 pagados
    expect(available(paid)).toBe(95000) // nada más se descuenta: lo apartado ya se usó
    // Al cerrarlo desde la bandeja, la cifra no cambia (no se libera dos veces).
    const closed = ok(settlePlannedExpenseFromCalendar(paid, 'g', ctx)).data
    expect(available(closed)).toBe(95000)
  })

  it('pagada por menos (40.00): el sobrante (10.00) sigue apartado hasta cerrarlo; al cerrarlo se libera', () => {
    const paid = ok(markOccurrence(linked(), { scheduleId: 'luz', occurrenceDate: '2026-10-01', amountMinor: 4000, date: TODAY }, ctx)).data
    expect(S(paid)).toBe(96000)
    expect(available(paid)).toBe(95000) // 960 − 10 aún apartados
    expect(available(ok(settlePlannedExpenseFromCalendar(paid, 'g', ctx)).data)).toBe(96000)
  })

  it('pago parcial (30.00 de 50.00, queda 20.00): total descontado = 50.00, no 80.00', () => {
    const partial = ok(markOccurrence(linked(), { scheduleId: 'luz', occurrenceDate: '2026-10-01', amountMinor: 3000, date: TODAY, expectRemainder: true }, ctx)).data
    expect(S(partial)).toBe(97000)
    expect(available(partial)).toBe(95000) // 970 − 20 (apartados, cubren lo que falta)
  })
})

describe('7. distribución de un ingreso ya gastado en parte', () => {
  it('ingreso 1,500 del que ya se gastaron 1,000: apartar 400 deja 1,000 + 1,500 − 1,000 − 400 = 1,100', () => {
    let d = baseData({ schedules: [income('2026-10-12', 150000)], goals: [goal({ id: 'save', targetMinor: 100000 })] })
    d = ok(saveTransaction(d, { id: 'pay', kind: 'income', status: 'realized', amountMinor: 150000, date: TODAY, accountId: 'main', categoryId: 'salary' }, ctx)).data
    d = ok(saveTransaction(d, { id: 'rent', kind: 'expense', status: 'realized', amountMinor: 100000, date: TODAY, accountId: 'main', categoryId: 'housing' }, ctx)).data
    expect(S(d)).toBe(150000)
    const after = ok(applyDistribution(d, { distributionId: 'dist', incomeTxId: 'pay', lines: [{ kind: 'goal', goalId: 'save', amountMinor: 40000 }] }, ctx)).data
    expect(S(after)).toBe(150000) // repartir no mueve dinero
    expect(available(after)).toBe(110000)
    expect(after.transactions).toHaveLength(2) // ni movimientos nuevos
    // Más de lo que quedó libre no se puede apartar (no se crea dinero).
    expect(applyDistribution(d, { distributionId: 'big', incomeTxId: 'pay', lines: [{ kind: 'goal', goalId: 'save', amountMinor: 150001 }] }, ctx).ok).toBe(false)
  })
})

describe('8. ingresos previstos que se retrasan o llegan en parte', () => {
  it('retrasado: no se suma; el periodo se mide hasta el siguiente ingreso con fecha futura', () => {
    const d = baseData({ schedules: [income('2026-09-25', 80000, { id: 'late' }), income('2026-10-09', 80000, { id: 'next' })] })
    const b = computeBudget(d, TODAY)
    expect(b.overdueIncomes.map((i) => i.sourceId)).toEqual(['late'])
    expect(b.availableMinor).toBe(100000)
    expect(b.horizon?.days).toBe(11) // 28-sep → 9-oct
    expect(b.dailyMinor).toBe(9090) // 100000 / 11 = 9090.9…
  })

  it('llega en parte (300 de 800): solo suma lo recibido; lo que falta sigue pendiente y no cuenta', () => {
    const d = baseData({ schedules: [income('2026-09-25', 80000, { id: 'late' }), income('2026-10-09', 80000, { id: 'next' })] })
    const part = ok(markOccurrence(d, { scheduleId: 'late', occurrenceDate: '2026-09-25', amountMinor: 30000, date: TODAY, expectRemainder: true }, ctx)).data
    expect(S(part)).toBe(130000)
    expect(available(part)).toBe(130000)
    // La proyección tampoco suma el resto retrasado (no se sabe cuándo llega).
    const p = projectBalance(part, TODAY, { days: 10 })
    expect(p.lateIncomesExcluded.map((i) => i.amountMinor)).toEqual([50000])
    expect(p.endMinor).toBe(130000) // el 9-oct queda fuera de 10 días (28-sep…7-oct)
  })
})

describe('9. conciliación con ajuste explícito', () => {
  it('calculado 1,000.00, banco 985.00: ajuste de −15.00; no es gasto; el saldo de referencia no cambia', () => {
    const d = baseData()
    const r = ok(reconcileAccount(d, { id: 'rec', accountId: 'main', date: TODAY, observedMinor: 98500, resolution: 'adjusted', reason: 'Comisión no registrada', adjustmentTxId: 'adj' }, ctx)).data
    expect(S(r)).toBe(98500)
    expect(r.transactions.find((t) => t.id === 'adj')).toMatchObject({ kind: 'adjustment', amountMinor: 1500 })
    expect(periodSummary(r, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(0)
    expect(r.accounts[0]!.anchor).toEqual(d.accounts[0]!.anchor)
    // Sin confirmación (diferencia sin resolver) no se crea ningún ajuste.
    const pending = ok(reconcileAccount(d, { id: 'rec2', accountId: 'main', date: TODAY, observedMinor: 98500, resolution: 'unresolved' }, ctx)).data
    expect(pending.transactions).toHaveLength(0)
  })
})

describe('10. eliminar y restaurar operaciones vinculadas', () => {
  it('compra con devolución: borrar la compra conserva la devolución; restaurar recupera el vínculo', () => {
    let d = ok(saveTransaction(baseData(), { id: 'buy', kind: 'expense', status: 'realized', amountMinor: 5000, date: TODAY, accountId: 'main', categoryId: 'shopping' }, ctx)).data
    d = ok(saveTransaction(d, { id: 'ref', kind: 'refund', status: 'realized', amountMinor: 1000, date: TODAY, accountId: 'main', categoryId: 'shopping', refundOfId: 'buy' }, ctx)).data
    expect(S(d)).toBe(96000)
    const deleted = ok(deleteTransaction(d, 'buy', ctx)).data
    expect(S(deleted)).toBe(101000) // la compra ya no cuenta; la devolución sí
    valid(deleted)
    const restored = ok(restoreFromTrash(deleted, 'buy', ctx)).data
    expect(S(restored)).toBe(96000)
    expect(restored.transactions.find((t) => t.id === 'ref')!.refundOfId).toBe('buy')
    expect(restored.trash).toHaveLength(0)
    valid(restored)
  })

  it('pago del calendario: borrarlo reabre la factura; restaurarlo no la paga dos veces', () => {
    const base = baseData({ schedules: [income('2026-10-05', 90000), bill('2026-10-01', 5000, { id: 'luz' })] })
    const paid = ok(markOccurrence(base, { scheduleId: 'luz', occurrenceDate: '2026-10-01', amountMinor: 5000, date: TODAY, txId: 'p' }, ctx)).data
    expect(available(paid)).toBe(95000)
    const deleted = ok(deleteTransaction(paid, 'p', ctx)).data
    expect(S(deleted)).toBe(100000)
    expect(available(deleted)).toBe(95000) // vuelve a reservarse
    // Mientras estaba en la papelera se pagó otra vez: restaurar el primero se rechaza.
    const repaid = ok(markOccurrence(deleted, { scheduleId: 'luz', occurrenceDate: '2026-10-01', amountMinor: 5000, date: TODAY, txId: 'p2' }, ctx)).data
    expect(restoreFromTrash(repaid, 'p', ctx).ok).toBe(false)
    expect(available(ok(restoreFromTrash(deleted, 'p', ctx)).data)).toBe(95000)
  })
})

describe('11. cambio de mes, año y zona horaria', () => {
  it('mensual el día 31 → último día de los meses cortos; febrero bisiesto', () => {
    const s = bill('2027-01-31', 1000, { frequency: 'monthly' })
    expect(occurrencesBetween(s, '2027-01-01', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
    expect(occurrencesBetween({ ...s, startDate: '2028-01-31' }, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  it('de un año al siguiente: 30-dic → ingreso 2-ene = 3 días', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    const d = baseData({ schedules: [income('2027-01-02', 90000)] })
    expect(computeBudget(d, '2026-12-30').horizon?.days).toBe(3)
  })

  it('«hoy» depende de la zona horaria; los movimientos guardan la fecha de calendario', () => {
    const instant = new Date('2026-10-01T03:30:00Z')
    expect(todayInTimeZone('America/Toronto', instant)).toBe('2026-09-30')
    expect(todayInTimeZone('Asia/Tokyo', instant)).toBe('2026-10-01')
    // Un gasto del 30-sep cuenta en septiembre, se mire desde donde se mire.
    const d = baseData({ transactions: [tx({ date: '2026-09-30', amountMinor: 1234 })] })
    expect(periodSummary(d, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(1234)
    expect(periodSummary(d, '2026-10-01', '2026-10-31').netSpendingMinor).toBe(0)
  })
})

describe('12. próximo ingreso hoy, vencido o sin fecha', () => {
  it('hoy (sin registrar): no se suma ni cuenta como periodo de 0 días', () => {
    const d = baseData({ schedules: [income(TODAY, 90000, { frequency: 'biweekly' })] })
    const b = computeBudget(d, TODAY)
    expect(b.incomeDueToday).toHaveLength(1)
    expect(b.availableMinor).toBe(100000)
    expect(b.horizon?.endDate).toBe('2026-10-12') // el siguiente cobro (14 días)
    expect(b.dailyMinor).toBe(7142) // 100000 / 14 = 7142.8…
  })

  it('sin fecha de ingreso ni horizonte: disponible calculado, sin cifra diaria (nunca divide entre 0)', () => {
    const b = computeBudget(baseData({ schedules: [bill('2026-10-20', 5000)] }), TODAY)
    expect(b.status).toBe('needsHorizon')
    expect(b.availableMinor).toBe(95000) // se reservan igualmente los pagos de 30 días
    expect([b.dailyMinor, b.weeklyMinor]).toEqual([null, null])
  })

  it('con un horizonte elegido (14 días): 1,000 / 14 = 71.42 por día', () => {
    const d = baseData()
    const b = computeBudget({ ...d, settings: { ...d.settings, fallbackHorizonDays: 14 } }, TODAY)
    expect([b.horizon?.source, b.dailyMinor]).toEqual(['fallback', 7142])
  })
})

describe('invariantes', () => {
  it('dividir entre categorías no cambia el importe ni el saldo', () => {
    const plain = ok(saveTransaction(baseData(), { id: 'w', kind: 'expense', status: 'realized', amountMinor: 12000, date: TODAY, accountId: 'main', categoryId: 'groceries' }, ctx)).data
    const split = ok(saveTransaction(plain, { ...plain.transactions[0]!, splits: [{ id: 'a', categoryId: 'groceries', amountMinor: 7001 }, { id: 'b', categoryId: 'housing', amountMinor: 4999 }] }, ctx)).data
    expect(split.transactions[0]!.amountMinor).toBe(12000)
    expect(S(split)).toBe(S(plain))
    expect(available(split)).toBe(available(plain))
    expect(periodSummary(split, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(12000)
  })

  it('un escenario no modifica los datos reales', () => {
    const d = deepFreeze(baseData({ schedules: [income('2026-10-05', 90000)] }))
    const snapshot = JSON.stringify(d)
    const r = evaluate(d, TODAY, [{ type: 'purchase', amountMinor: 30000, date: TODAY }, { type: 'income', amountMinor: 99999, date: '2026-10-01' }])
    expect(r.availableMinor).toBe(70000) // compra simulada resta; el ingreso hipotético nunca suma al disponible
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('reimportar el mismo archivo no crea movimientos', () => {
    const items = [{ id: 'i1', kind: 'expense' as const, amountMinor: 450, date: TODAY, accountId: 'main', categoryId: 'dining', note: 'Café', importRef: 'ref-1' }]
    const once = ok(importTransactions(baseData(), { items, sameDayAlreadyInBalance: false }, ctx)).data
    const twice = importTransactions(once, { items: items.map((i) => ({ ...i, id: 'i2' })), sameDayAlreadyInBalance: false }, ctx)
    expect(twice.ok && twice.data.transactions).toHaveLength(1)
    expect(twice.ok && S(twice.data)).toBe(99550)
  })

  it('apartar y liberar no crea ni destruye dinero', () => {
    let d = baseData({ goals: [goal({ id: 'g' })] })
    d = ok(allocateToGoal(d, { goalId: 'g', amountMinor: 12345 }, ctx)).data
    expect([S(d), netWorth(d), available(d)]).toEqual([100000, 100000, 87655])
    d = ok(allocateToGoal(d, { goalId: 'g', amountMinor: -12345 }, ctx)).data
    expect([S(d), available(d)]).toEqual([100000, 100000])
  })
})

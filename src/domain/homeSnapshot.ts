/**
 * Inicio en otro periodo (D1): las mismas cifras del héroe calculadas «al cierre» de un periodo
 * pasado, solo lectura. Nunca toca los datos reales: se construye una copia en la que
 *
 *   - los movimientos realizados después del cierre no existen (los previstos se conservan);
 *   - cada cuenta cuyo saldo de referencia es posterior al cierre retrocede ese saldo quitando los
 *     movimientos realizados que el saldo ya incluía y que ocurrieron después del cierre;
 *   - los apartados de metas tienen fecha (QA-04): los posteriores al cierre no existían entonces
 *     (ni los aportes, ni las liberaciones, ni los pagos desde una meta); una meta creada después
 *     tampoco; un gasto planificado cerrado después sigue abierto, como estaba.
 *
 * Con esa copia, `computeBudget` y `heroFigures` dan el saldo, lo reservado, el disponible, los
 * ingresos y los gastos tal como se habrían visto el último día del periodo. El periodo actual
 * no pasa por aquí: Inicio muestra las cifras vivas.
 *
 * Límite honesto: los programados y los AJUSTES (tipo de periodo, arrastre, cuentas incluidas)
 * no tienen historial propio, así que la instantánea usa los actuales. Inicio lo dice.
 */
import { txAppliesToAccount, txEffectOnAccount } from './balances'
import { computeBudget, type BudgetResult } from './budget'
import { addDays, daysBetween, localDateInTimeZone } from './dates'
import { heroFigures, type HeroFigures } from './heroFigures'
import { sumMinor } from './money'
import { getPeriod, type Period } from './periods'
import type { Account, AppData, BudgetPeriodSettings, LocalDate } from './types'

export interface HomeSnapshot {
  period: Period
  budget: BudgetResult
  hero: HeroFigures
  /** Movimientos realizados dentro del periodo (para decir «sin movimientos»). */
  transactionCount: number
}

/** Ajustes de periodo a usar para navegar: «hasta mi próximo ingreso» navega por meses naturales. */
function navSettings(settings: BudgetPeriodSettings | undefined): BudgetPeriodSettings {
  if (!settings || settings.type === 'untilIncome') return { type: 'month', weekStartsOn: settings?.weekStartsOn ?? 1 }
  return settings
}

/** Periodo que contiene `date` según los ajustes (mes natural si no hay periodo de calendario). */
export function homePeriodAt(settings: BudgetPeriodSettings | undefined, date: LocalDate, today: LocalDate): Period {
  const period = getPeriod(navSettings(settings), date) ?? getPeriod({ type: 'month', weekStartsOn: 1 }, date)!
  // `getPeriod` cuenta los días que quedan desde `date`; aquí importan los que quedan desde hoy.
  const daysLeft = today > period.end ? 0 : today < period.start ? period.days : daysBetween(today, period.end) + 1
  return { ...period, daysLeft }
}

export function previousPeriod(settings: BudgetPeriodSettings | undefined, period: Period, today: LocalDate): Period {
  return homePeriodAt(settings, addDays(period.start, -1), today)
}

/** Periodo siguiente, o null si empezaría después de hoy (el futuro no se navega). */
export function nextPeriod(settings: BudgetPeriodSettings | undefined, period: Period, today: LocalDate): Period | null {
  const start = addDays(period.end, 1)
  if (start > today) return null
  return homePeriodAt(settings, start, today)
}

/** true si `period` es el que contiene hoy (las cifras vivas, no una instantánea). */
export function isCurrentPeriod(period: Period, today: LocalDate): boolean {
  return period.start <= today && today <= period.end
}

/** Saldo de referencia retrocedido a `asOf` cuando fue fijado después de esa fecha. */
function anchorAsOf(account: Account, transactions: AppData['transactions'], asOf: LocalDate): Account {
  if (account.anchor.date <= asOf) return account
  const laterIncluded = transactions.filter((tx) => tx.status === 'realized' && tx.date > asOf && (tx.accountId === account.id || tx.toAccountId === account.id) && !txAppliesToAccount(tx, account))
  const effect = sumMinor(laterIncluded.map((tx) => txEffectOnAccount(tx, account.id)))
  return { ...account, anchor: { ...account.anchor, amountMinor: account.anchor.amountMinor - effect, date: asOf } }
}

/** Copia de los datos tal como estaban al final de `asOf`; los datos reales no cambian. */
export function dataAsOf(data: AppData, asOf: LocalDate): AppData {
  const existedThen = (createdAt: string) => localDateInTimeZone(new Date(createdAt), data.settings.timeZone) <= asOf
  return {
    ...data,
    accounts: data.accounts.map((a) => anchorAsOf(a, data.transactions, asOf)),
    // Los previstos se conservan: nunca cambian saldos y, como entonces, se reservan si caen en el horizonte.
    transactions: data.transactions.filter((tx) => tx.status !== 'realized' || tx.date <= asOf),
    // QA-04: solo los apartados con fecha hasta el cierre; una meta posterior no existía.
    goals: data.goals
      .filter((g) => existedThen(g.createdAt))
      .map((g) => ({
        ...g,
        allocations: g.allocations.filter((a) => a.date <= asOf),
        ...(g.plan?.paidAt && !existedThen(g.plan.paidAt) ? { plan: { ...g.plan, paidAt: undefined } } : {}),
      })),
  }
}

export function homeSnapshotAt(data: AppData, periodEnd: LocalDate, ctx: { today: LocalDate }): HomeSnapshot {
  const period = homePeriodAt(data.settings.budgetPeriod, periodEnd, ctx.today)
  const asOf = period.end < ctx.today ? period.end : ctx.today
  const copy = dataAsOf(data, asOf)
  const budget = computeBudget(copy, asOf)
  const hero = heroFigures(copy, budget, asOf)
  const transactionCount = copy.transactions.filter((tx) => tx.status === 'realized' && tx.date >= period.start && tx.date <= period.end).length
  return { period, budget, hero, transactionCount }
}

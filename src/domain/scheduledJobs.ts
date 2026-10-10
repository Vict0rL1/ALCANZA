/**
 * Programados v2 (§7.5): confirmación automática y pausa.
 *
 * - `autoConfirm` (apagado por defecto, decisión 10): al abrir la app o al cambiar el día, las
 *   ocurrencias vencidas o de hoy de ese programado se registran solas con su importe previsto,
 *   `source: 'scheduled'`. Solo las de los últimos `AUTO_CONFIRM_WINDOW_DAYS` días: activar la
 *   opción en un programado antiguo no registra meses de historia; lo anterior sigue como vencido.
 * - `paused`: el programado no genera ocurrencias (ni se reserva) mientras esté en pausa.
 * - Cobros o pagos parciales (QA-02): la confirmación automática registra solo lo que FALTA de la
 *   ocurrencia (`PlanItem.amountMinor`, la misma regla de remanente que usa el calendario), y si ya
 *   no falta nada la cierra sin crear un movimiento. Nunca vuelve a añadir el importe completo.
 */
import { addDays } from './dates'
import { closeOccurrence, markOccurrence, type OpContext, type OpResult } from './operations'
import { openItemsUntil, settlementIndex } from './planItems'
import type { AppData, LocalDate, Schedule, Transaction } from './types'

export const AUTO_CONFIRM_WINDOW_DAYS = 7

export interface AutoConfirmResult {
  confirmed: Transaction[]
}

/** Registra las ocurrencias debidas de los programados con confirmación automática. Idempotente. */
export function autoConfirmDue(data: AppData, ctx: OpContext): OpResult<AutoConfirmResult> {
  const auto = new Set(data.schedules.filter((s) => s.autoConfirm && !s.paused).map((s) => s.id))
  if (auto.size === 0) return { ok: true, data, value: { confirmed: [] }, unchanged: true }
  const since = addDays(ctx.today, -AUTO_CONFIRM_WINDOW_DAYS)
  const due = openItemsUntil(data, ctx.today, ctx.today).filter((i) => i.source === 'schedule' && auto.has(i.sourceId) && i.date >= since && i.date <= ctx.today)
  let next = data
  const confirmed: Transaction[] = []
  for (const item of due) {
    const schedule = next.schedules.find((s) => s.id === item.sourceId)!
    // `item.amountMinor` ya es lo que falta: importe previsto − parciales registrados (nunca negativo).
    const r =
      item.amountMinor > 0
        ? markOccurrence(next, { scheduleId: schedule.id, occurrenceDate: item.date, amountMinor: item.amountMinor, date: item.date, note: schedule.name, source: 'scheduled' }, ctx)
        : closeOccurrence(next, schedule.id, item.date, ctx)
    if (!r.ok) return r
    if (!r.unchanged) {
      next = r.data
      confirmed.push(r.value)
    }
  }
  if (confirmed.length === 0) return { ok: true, data, value: { confirmed: [] }, unchanged: true }
  return { ok: true, data: next, value: { confirmed } }
}

export function setSchedulePaused(data: AppData, id: string, paused: boolean, ctx: OpContext): OpResult<Schedule> {
  const schedule = data.schedules.find((s) => s.id === id)
  if (!schedule) return { ok: false, issues: [{ path: 'id', code: 'notFound' }] }
  if (!!schedule.paused === paused) return { ok: true, data, value: schedule, unchanged: true }
  const updated: Schedule = { ...schedule, paused, updatedAt: ctx.now }
  return { ok: true, data: { ...data, schedules: data.schedules.map((s) => (s.id === id ? updated : s)), updatedAt: ctx.now }, value: updated }
}

export interface OverstatedAutoConfirm {
  scheduleId: string
  occurrenceDate: LocalDate
  /** Movimiento de la confirmación automática que registró el importe completo. */
  finalTxId: string
  /** Parciales registrados antes para la misma ocurrencia. */
  partialTxIds: string[]
  /** Lo que se registró de más: la suma de los parciales. */
  excessMinor: number
}

/**
 * Detecta ocurrencias que la confirmación automática cerró con el importe COMPLETO del programado
 * aunque ya hubiera cobros o pagos parciales (el defecto QA-02, en datos anteriores a su corrección).
 * Solo detecta: no corrige ni borra nada. La persona decide desde la bandeja de pendientes.
 */
export function overstatedAutoConfirms(data: AppData): OverstatedAutoConfirm[] {
  const found: OverstatedAutoConfirm[] = []
  for (const [key, settlement] of settlementIndex(data.transactions)) {
    const final = settlement.final
    if (!final || settlement.partials.length === 0 || final.source !== 'scheduled') continue
    const schedule = data.schedules.find((s) => s.id === final.scheduleId)
    if (!schedule || final.amountMinor !== schedule.amountMinor) continue
    const partials = settlement.partials.filter((t) => t.date <= final.date)
    if (partials.length === 0) continue
    const [scheduleId, occurrenceDate] = key.split(':') as [string, LocalDate]
    found.push({ scheduleId, occurrenceDate, finalTxId: final.id, partialTxIds: partials.map((t) => t.id), excessMinor: partials.reduce((sum, t) => sum + t.amountMinor, 0) })
  }
  return found
}

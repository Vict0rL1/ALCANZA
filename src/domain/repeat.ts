/**
 * «Repetir» en el formulario de movimiento (D6): guarda el movimiento y crea el programado en UNA
 * operación (todo o nada). El programado empieza en la fecha del movimiento y el movimiento queda
 * enlazado como su primera ocurrencia (`scheduleId` + `occurrenceDate`), así esa ocurrencia cuenta
 * como movimiento y nunca además como reserva; la siguiente aparece en el calendario.
 */
import { saveSchedule, saveTransaction, type ScheduleDraft, type TransactionDraft } from './operations'
import type { OpContext, OpResult } from './operations'
import { addDays } from './dates'
import { occurrencesBetween } from './recurrence'
import type { AppData, LocalDate, Schedule, Transaction } from './types'

export function saveTransactionWithSchedule(data: AppData, tx: TransactionDraft, schedule: ScheduleDraft, ctx: OpContext): OpResult<Transaction> {
  const s = saveSchedule(data, { ...schedule, startDate: tx.date }, ctx)
  if (!s.ok) return s
  const t = saveTransaction(s.data, { ...tx, scheduleId: s.value.id, occurrenceDate: tx.date }, ctx)
  if (!t.ok) return t
  return { ok: true, data: t.data, value: t.value, ...(s.unchanged && t.unchanged ? { unchanged: true } : {}) }
}

/**
 * Primera ocurrencia en o después de `from` que sigue pendiente: ni liquidada por un movimiento
 * realizado (mismo `scheduleId` + `occurrenceDate`, sin ser cobro parcial) ni omitida. Es lo que
 * el calendario muestra como «próximo»: tras «Repetir», la primera ocurrencia ya está pagada y el
 * próximo es el del periodo siguiente.
 */
export function nextPendingOccurrence(data: Pick<AppData, 'transactions'>, schedule: Schedule, from: LocalDate, lookaheadDays = 800): LocalDate | null {
  const settled = new Set(data.transactions.filter((t) => t.status === 'realized' && t.scheduleId === schedule.id && t.occurrenceDate && !t.partialSettlement).map((t) => t.occurrenceDate as LocalDate))
  for (const date of occurrencesBetween(schedule, from, addDays(from, lookaheadDays))) {
    if (settled.has(date) || schedule.skippedDates.includes(date)) continue
    return date
  }
  return null
}

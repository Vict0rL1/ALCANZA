import { describe, expect, it } from 'vitest'
import { autoConfirmDue, setSchedulePaused } from './scheduledJobs'
import { dueNotices, isQuietHour } from './notifications'
import { computeBudget } from './budget'
import { baseData, bill, ctx, income, tx } from '../test/fixtures'
import { DEFAULT_NOTIFICATIONS } from './defaults'
import { validateAppData } from '../storage/backup'

describe('confirmación automática y pausa de programados', () => {
  it('registra las ocurrencias de hoy y de los últimos 7 días de los programados con autoConfirm; es idempotente', () => {
    const data = baseData({
      schedules: [
        bill('2026-09-26', 5000, { id: 'auto', name: 'Gimnasio', frequency: 'weekly', autoConfirm: true }),
        bill('2026-09-27', 9900, { id: 'manual', name: 'Luz' }),
        bill('2026-09-01', 1000, { id: 'old', name: 'Vieja', frequency: 'daily', autoConfirm: true }),
      ],
    })
    const r = autoConfirmDue(data, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // «Gimnasio» 26-sep (dentro de la ventana) y «Vieja» del 21 al 28 (8 días); nada de «Luz» ni de antes del 21.
    const gym = r.value.confirmed.filter((t) => t.scheduleId === 'auto')
    const old = r.value.confirmed.filter((t) => t.scheduleId === 'old')
    expect(gym.map((t) => t.occurrenceDate)).toEqual(['2026-09-26'])
    expect(old.map((t) => t.occurrenceDate)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'])
    expect(r.value.confirmed.every((t) => t.status === 'realized' && t.source === 'scheduled')).toBe(true)
    expect(validateAppData(r.data).ok).toBe(true)
    // Segunda pasada: nada nuevo; «Luz» sigue vencida.
    const again = autoConfirmDue(r.data, ctx)
    expect(again).toMatchObject({ ok: true, unchanged: true })
    // «Luz» sigue vencida; lo anterior a la ventana de «Vieja» queda vencido (no se registra); de «Gimnasio» nada.
    const overdue = computeBudget(r.data, ctx.today).overdueBills
    expect(overdue.some((i) => i.sourceId === 'manual')).toBe(true)
    expect(overdue.filter((i) => i.sourceId === 'old').every((i) => i.date < '2026-09-21')).toBe(true)
    expect(overdue.filter((i) => i.sourceId === 'old').length).toBe(20)
    expect(overdue.some((i) => i.sourceId === 'auto')).toBe(false)
  })

  it('una ocurrencia omitida o ya liquidada no se registra dos veces', () => {
    const data = baseData({
      schedules: [bill('2026-09-27', 5000, { id: 'a', frequency: 'daily', autoConfirm: true, skippedDates: ['2026-09-27'] })],
      transactions: [tx({ id: 'done', scheduleId: 'a', occurrenceDate: '2026-09-28', amountMinor: 5000 })],
    })
    const r = autoConfirmDue(data, ctx)
    expect(r).toMatchObject({ ok: true, unchanged: true })
  })

  it('en pausa no genera ocurrencias ni reserva; al reanudar vuelve', () => {
    const data = baseData({ schedules: [bill('2026-10-01', 5000, { id: 'p' }), income('2026-10-09', 80000)] })
    expect(computeBudget(data, ctx.today).reservedTotalMinor).toBe(5000)
    const paused = setSchedulePaused(data, 'p', true, ctx)
    expect(paused.ok).toBe(true)
    if (!paused.ok) return
    expect(computeBudget(paused.data, ctx.today).reservedTotalMinor).toBe(0)
    expect(validateAppData(paused.data).ok).toBe(true)
    const back = setSchedulePaused(paused.data, 'p', false, ctx)
    expect(back.ok && computeBudget(back.data, ctx.today).reservedTotalMinor).toBe(5000)
    expect(setSchedulePaused(data, 'nope', true, ctx).ok).toBe(false)
  })
})

describe('notificaciones locales (reglas puras)', () => {
  const fmt = { amount: (m: number) => String(m), name: (i: { name: string }) => i.name }

  it('horas de silencio con rango que cruza medianoche', () => {
    expect(isQuietHour('23:00', '22:00', '08:00')).toBe(true)
    expect(isQuietHour('07:59', '22:00', '08:00')).toBe(true)
    expect(isQuietHour('08:00', '22:00', '08:00')).toBe(false)
    expect(isQuietHour('12:00', '22:00', '08:00')).toBe(false)
    expect(isQuietHour('12:00', '09:00', '17:00')).toBe(true)
    expect(isQuietHour('12:00', '12:00', '12:00')).toBe(false)
  })

  it('avisa de vencidos y de lo que vence hoy o mañana, recordatorio diario si no hay registros y resumen a su hora', () => {
    const data = baseData({ schedules: [bill('2026-09-27', 5000, { id: 'late', name: 'Luz' }), bill('2026-09-29', 1200, { id: 'tomorrow', name: 'Internet' }), bill('2026-10-05', 1, { id: 'far' })] })
    const settings = { ...DEFAULT_NOTIFICATIONS, scheduledAlerts: true, dailyReminder: true, dailyReminderTime: '20:00', dailySummary: true, dailySummaryTime: '21:00' }
    const morning = dueNotices(data, { today: ctx.today, now: '09:30', settings }, fmt)
    expect(morning.map((n) => n.kind)).toEqual(['scheduledOverdue', 'scheduledDue'])
    expect(morning[0]).toMatchObject({ params: { name: 'Luz', amount: '5000' }, href: '/plan/calendario' })
    expect(morning[1]!.titleKey).toBe('notify.dueTomorrow.title')
    const evening = dueNotices(data, { today: ctx.today, now: '21:30', settings }, fmt)
    expect(evening.map((n) => n.kind)).toEqual(['scheduledOverdue', 'scheduledDue', 'dailyReminder', 'dailySummary'])
    // Con un registro hoy no hay recordatorio; en horas de silencio no hay nada.
    const withTx = baseData({ ...data, transactions: [tx({ id: 't', date: ctx.today })] })
    expect(dueNotices(withTx, { today: ctx.today, now: '21:30', settings }, fmt).map((n) => n.kind)).not.toContain('dailyReminder')
    expect(dueNotices(data, { today: ctx.today, now: '23:00', settings: { ...settings, quietHours: true } }, fmt)).toEqual([])
    // Todo apagado: nada.
    expect(dueNotices(data, { today: ctx.today, now: '21:30', settings: DEFAULT_NOTIFICATIONS }, fmt)).toEqual([])
  })
})

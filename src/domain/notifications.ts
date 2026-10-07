/**
 * Notificaciones locales (§9): qué avisar y cuándo, como funciones puras. La capa de UI decide
 * cómo mostrarlo (Notification API cuando hay permiso; dentro de la app siempre). Nunca se
 * inventa un envío: si el navegador no lo permite, no hay aviso del sistema.
 */
import { addDays } from './dates'
import { openItemsUntil, type PlanItem } from './planItems'
import type { AppData, ClockTime, LocalDate, NotificationSettings } from './types'

export interface LocalNotice {
  /** Estable por día: sirve para no repetir el mismo aviso. */
  key: string
  kind: 'scheduledDue' | 'scheduledOverdue' | 'dailyReminder' | 'dailySummary'
  /** Claves de i18n y parámetros; la UI traduce. */
  titleKey: string
  bodyKey: string
  params: Record<string, string | number>
  /** Enlace profundo dentro de la app. */
  href: string
  /** Hora local `HH:MM` a partir de la cual procede. */
  at: ClockTime
}

function minutes(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** ¿`time` cae dentro de las horas de silencio? Soporta rangos que cruzan medianoche (22:00–08:00). */
export function isQuietHour(time: ClockTime, from: ClockTime, to: ClockTime): boolean {
  const t = minutes(time)
  const f = minutes(from)
  const e = minutes(to)
  if (f === e) return false
  return f < e ? t >= f && t < e : t >= f || t < e
}

export interface NoticeInput {
  today: LocalDate
  /** Hora local actual `HH:MM`. */
  now: ClockTime
  settings: NotificationSettings
}

/**
 * Avisos que corresponden hoy hasta la hora actual (la UI descarta los ya mostrados por `key`).
 * Horas de silencio: el aviso se pospone hasta que terminan (se emite cuando `now` sale del rango).
 */
export function dueNotices(data: AppData, input: NoticeInput, options: { amount: (minor: number) => string; name: (item: PlanItem) => string }): LocalNotice[] {
  const { today, now, settings } = input
  const out: LocalNotice[] = []
  const quiet = settings.quietHours && isQuietHour(now, settings.quietFrom, settings.quietTo)
  if (quiet) return out
  const open = openItemsUntil(data, today, addDays(today, 1))
  if (settings.scheduledAlerts) {
    for (const item of open) {
      if (item.source !== 'schedule') continue
      if (item.state === 'overdue') {
        out.push({ key: `overdue:${item.key}:${today}`, kind: 'scheduledOverdue', titleKey: 'notify.overdue.title', bodyKey: 'notify.overdue.body', params: { name: options.name(item), amount: options.amount(Math.abs(item.budgetEffectMinor)) }, href: '/plan/calendario', at: '09:00' })
      } else if (item.date === today || item.date === addDays(today, 1)) {
        out.push({ key: `due:${item.key}:${today}`, kind: 'scheduledDue', titleKey: item.date === today ? 'notify.dueToday.title' : 'notify.dueTomorrow.title', bodyKey: 'notify.due.body', params: { name: options.name(item), amount: options.amount(Math.abs(item.budgetEffectMinor)) }, href: '/plan/calendario', at: '09:00' })
      }
    }
  }
  if (settings.dailyReminder) {
    const todayCount = data.transactions.filter((t) => t.date === today && t.status === 'realized').length
    if (todayCount === 0) out.push({ key: `reminder:${today}`, kind: 'dailyReminder', titleKey: 'notify.reminder.title', bodyKey: 'notify.reminder.body', params: {}, href: '/movimientos/nuevo', at: settings.dailyReminderTime })
  }
  if (settings.dailySummary) {
    const spent = data.transactions.filter((t) => t.date === today && t.status === 'realized' && t.kind === 'expense').reduce((s, t) => s + t.amountMinor, 0)
    const refunds = data.transactions.filter((t) => t.date === today && t.status === 'realized' && t.kind === 'refund').reduce((s, t) => s + t.amountMinor, 0)
    out.push({ key: `summary:${today}`, kind: 'dailySummary', titleKey: 'notify.summary.title', bodyKey: 'notify.summary.body', params: { amount: options.amount(spent - refunds) }, href: '/', at: settings.dailySummaryTime })
  }
  return out.filter((n) => minutes(n.at) <= minutes(now))
}

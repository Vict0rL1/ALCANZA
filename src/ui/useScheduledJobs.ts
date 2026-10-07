/**
 * Tareas al abrir la app y al cambiar el día: confirmación automática de programados (§7.4) y
 * cierre/renovación de planes (§7.5).
 * Solo registra lo que la persona marcó con `autoConfirm`; avisa de lo registrado.
 */
import { useEffect, useRef } from 'react'
import { todayInTimeZone } from '../domain/dates'
import { closeDuePlans } from '../domain/plans'
import { autoConfirmDue } from '../domain/scheduledJobs'
import { useT } from '../i18n'
import { useRun, useToday } from '../state/hooks'
import { useData } from '../state/store'
import { useToast } from './components/toastContext'
import { navigate } from './router'

export function useScheduledJobs() {
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const { t, tn } = useT()
  const lastRun = useRef<string | null>(null)
  const hasAuto = data.schedules.some((s) => s.autoConfirm && !s.paused)
  const hasPlans = data.plans.some((p) => p.status === 'active')
  useEffect(() => {
    if ((!hasAuto && !hasPlans) || lastRun.current === today) return
    lastRun.current = today
    const jobs = async () => {
      if (hasAuto) {
        const { result, saved } = await run((d, c) => autoConfirmDue(d, c))
        if (result.ok && !result.unchanged && result.value.confirmed.length > 0) {
          toast({ message: saved ? `${tn('home.autoConfirmed', result.value.confirmed.length)}. ${t('home.autoConfirmedText')}` : t('save.error.generic'), tone: saved ? 'info' : 'critical', durationMs: 10_000 })
        }
      }
      if (hasPlans) {
        // Cierre de planes (§7.5): resultado del ciclo vencido y, si es recurrente, el siguiente ciclo.
        const { result, saved } = await run((d, c) => closeDuePlans(d, c))
        if (result.ok && !result.unchanged && result.value.closed.length > 0) {
          toast({ message: saved ? tn('plans.closedToast', result.value.closed.length) : t('save.error.generic'), tone: saved ? 'info' : 'critical', durationMs: 10_000, action: { label: t('plans.seeResults'), onClick: () => navigate('/plan/planes?vista=completados') } })
        }
      }
    }
    void jobs()
    // Al cambiar el día (useToday lo detecta cada 30 s o al volver a la pestaña) se vuelve a pasar.
  }, [hasAuto, hasPlans, today, run, toast, t, tn])
  // Garantiza que «hoy» se evalúa en la zona horaria elegida aunque el reloj del dispositivo cambie.
  void todayInTimeZone
}

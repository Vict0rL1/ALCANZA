/**
 * Tareas al abrir la app y al cambiar el día (§7.5): confirmación automática de programados.
 * Solo registra lo que la persona marcó con `autoConfirm`; avisa de lo registrado.
 */
import { useEffect, useRef } from 'react'
import { todayInTimeZone } from '../domain/dates'
import { autoConfirmDue } from '../domain/scheduledJobs'
import { useT } from '../i18n'
import { useRun, useToday } from '../state/hooks'
import { useData } from '../state/store'
import { useToast } from './components/toastContext'

export function useScheduledJobs() {
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const { t, tn } = useT()
  const lastRun = useRef<string | null>(null)
  const hasAuto = data.schedules.some((s) => s.autoConfirm && !s.paused)
  useEffect(() => {
    if (!hasAuto || lastRun.current === today) return
    lastRun.current = today
    void run((d, c) => autoConfirmDue(d, c)).then(({ result, saved }) => {
      if (!result.ok || result.unchanged || result.value.confirmed.length === 0) return
      toast({ message: saved ? `${tn('home.autoConfirmed', result.value.confirmed.length)}. ${t('home.autoConfirmedText')}` : t('save.error.generic'), tone: saved ? 'info' : 'critical', durationMs: 10_000 })
    })
    // Al cambiar el día (useToday lo detecta cada 30 s o al volver a la pestaña) se vuelve a pasar.
  }, [hasAuto, today, run, toast, t, tn])
  // Garantiza que «hoy» se evalúa en la zona horaria elegida aunque el reloj del dispositivo cambie.
  void todayInTimeZone
}

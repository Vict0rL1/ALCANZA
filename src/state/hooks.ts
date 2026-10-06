/**
 * Hooks de React para leer "hoy" y ejecutar operaciones del dominio.
 */
import { useCallback, useEffect, useState } from 'react'
import { todayInTimeZone } from '../domain/dates'
import type { HistoryMeta } from '../domain/history'
import type { OpContext, OpResult } from '../domain/operations'
import type { AppData, LocalDate } from '../domain/types'
import { getStore, useData } from './store'

/** Contexto de operación con la fecha de hoy en la zona horaria elegida. */
export function makeContext(timeZone: string): OpContext {
  const now = new Date()
  return { today: todayInTimeZone(timeZone, now), now: now.toISOString() }
}

/**
 * "Hoy" en la zona horaria del usuario. Se actualiza cada 30 s y al volver a la
 * pestaña, para que el cambio de día (y de mes) se refleje sin recargar.
 */
export function useToday(): LocalDate {
  const { settings } = useData()
  const [today, setToday] = useState(() => todayInTimeZone(settings.timeZone))
  useEffect(() => {
    const update = () => setToday(todayInTimeZone(settings.timeZone))
    update()
    const timer = window.setInterval(update, 30_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [settings.timeZone])
  return today
}

export type Operation<T> = (data: AppData, ctx: OpContext) => OpResult<T>

export interface RunOutcome<T> {
  result: OpResult<T>
  saved: boolean
}

/**
 * Ejecuta una operación pura sobre los datos actuales y guarda el resultado.
 * Si la operación no cambia nada (por ejemplo, un doble clic), no se guarda otra vez.
 */
export function useRun() {
  return useCallback(async <T,>(op: Operation<T>, meta?: HistoryMeta): Promise<RunOutcome<T>> => {
    const store = getStore()
    const data = store.data
    if (!data) return { result: { ok: false, issues: [{ path: '', code: 'notFound' }] }, saved: false }
    const result = op(data, makeContext(data.settings.timeZone))
    if (!result.ok) return { result, saved: false }
    if (result.unchanged) return { result, saved: true }
    const saved = await store.commit(result.data, meta)
    return { result, saved }
  }, [])
}

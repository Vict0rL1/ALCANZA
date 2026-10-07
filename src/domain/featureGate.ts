/**
 * FeatureGate central (§7.8): lo esencial es gratis (periodos, estadísticas, planes sin límite,
 * copias, bloqueo…). Lo único limitado es el proveedor remoto del asistente: N usos al mes en el
 * plan gratuito. «Pro» solo puede activarse en modo de desarrollo (simulación) porque no hay
 * pasarela de pago ni servicio: nunca se finge una compra. Ver decisión 48.
 */
import type { LocalDate, Settings } from './types'

export const FEATURES = ['periods', 'statistics', 'plans', 'localBackups', 'lock', 'exportCsv', 'exportPdf', 'aiLocal', 'aiRemote', 'cloudSync', 'widgets'] as const
export type Feature = (typeof FEATURES)[number]

/** Usos del proveedor remoto por mes sin Pro. */
export const FREE_AI_USES_PER_MONTH = 20

/** Funciones que hoy no existen en ninguna compilación (sin servicio): nunca se ofrecen como «Pro». */
export const NOT_AVAILABLE: readonly Feature[] = ['cloudSync', 'widgets']

export interface GateContext {
  today: LocalDate
  /** Compilación de desarrollo: permite simular Pro desde Ajustes. */
  devMode?: boolean
}

export type GateReason = 'ok' | 'aiLimit' | 'notAvailable'

export interface GateResult {
  allowed: boolean
  reason: GateReason
  /** Solo para `aiRemote`: usos restantes este mes (∞ con Pro → `null`). */
  remaining: number | null
}

export function isPro(settings: Pick<Settings, 'proStatus'>, ctx: Pick<GateContext, 'devMode'> = {}): boolean {
  // Sin pagos reales, el estado Pro solo cuenta en desarrollo (simulación). En producción nunca es Pro.
  return !!ctx.devMode && !!settings.proStatus?.active
}

export function aiUsesThisMonth(settings: Pick<Settings, 'aiUsage'>, today: LocalDate): number {
  return settings.aiUsage?.month === today.slice(0, 7) ? settings.aiUsage.count : 0
}

export function gate(feature: Feature, settings: Pick<Settings, 'proStatus' | 'aiUsage'>, ctx: GateContext): GateResult {
  if (NOT_AVAILABLE.includes(feature)) return { allowed: false, reason: 'notAvailable', remaining: null }
  if (feature !== 'aiRemote') return { allowed: true, reason: 'ok', remaining: null }
  if (isPro(settings, ctx)) return { allowed: true, reason: 'ok', remaining: null }
  const remaining = Math.max(0, FREE_AI_USES_PER_MONTH - aiUsesThisMonth(settings, today(ctx)))
  return remaining > 0 ? { allowed: true, reason: 'ok', remaining } : { allowed: false, reason: 'aiLimit', remaining: 0 }
}

function today(ctx: GateContext): LocalDate {
  return ctx.today
}

/** Porcentaje entero de uso del cupo gratuito (para la tarjeta Pro); con Pro simulado, 0. */
export function aiUsagePercent(settings: Pick<Settings, 'proStatus' | 'aiUsage'>, ctx: GateContext): number {
  if (isPro(settings, ctx)) return 0
  return Math.min(100, Math.floor((aiUsesThisMonth(settings, ctx.today) * 100) / FREE_AI_USES_PER_MONTH))
}

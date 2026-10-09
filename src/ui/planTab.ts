/**
 * Última pestaña visitada en «Plan» (preferencia del dispositivo, como el tema): la pestaña
 * inferior «Plan» vuelve a ella; la primera vez abre «Planes». No es un dato del presupuesto.
 */
export const PLAN_TABS = ['planes', 'calendario', 'metas', 'periodos', 'proyeccion'] as const
export type PlanTab = (typeof PLAN_TABS)[number]
const KEY = 'clara.plan.tab'

export function lastPlanTab(): PlanTab {
  try {
    const saved = localStorage.getItem(KEY)
    return (PLAN_TABS as readonly string[]).includes(saved ?? '') ? (saved as PlanTab) : 'planes'
  } catch {
    return 'planes'
  }
}

export function rememberPlanTab(tab: PlanTab) {
  try {
    localStorage.setItem(KEY, tab)
  } catch {
    /* sin almacenamiento disponible: no se recuerda */
  }
}

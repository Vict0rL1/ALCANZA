import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import { PageHeader } from '../components/common'
import { Icon, type IconName } from '../components/Icon'
import { href, navigate, type Route } from '../router'
import { lastPlanTab, rememberPlanTab, type PlanTab } from '../planTab'
import { Calendar } from './Calendar'
import { Goals } from './Goals'
import { PeriodBudgets } from './PeriodBudgets'
import { Plans } from './Plans'
import { Projection } from './Projection'

const TABS: { id: PlanTab; key: 'plan.plans' | 'plan.calendar' | 'plan.goals' | 'plan.periods' | 'plan.projection'; icon: IconName }[] = [
  { id: 'planes', key: 'plan.plans', icon: 'wallet' },
  { id: 'calendario', key: 'plan.calendar', icon: 'calendar' },
  { id: 'metas', key: 'plan.goals', icon: 'target' },
  { id: 'periodos', key: 'plan.periods', icon: 'folder' },
  { id: 'proyeccion', key: 'plan.projection', icon: 'trend' },
]

export function Plan({ route }: { route: Route }) {
  const { t } = useT()
  const requested = TABS.find((x) => x.id === route.segments[1])?.id
  const tab = requested ?? lastPlanTab()
  // «/plan» a secas abre la última pestaña visitada (sin dejar una entrada extra en el historial).
  useEffect(() => {
    if (!requested) navigate(`/plan/${tab}`, { replace: true })
  }, [requested, tab])
  useEffect(() => {
    if (requested) rememberPlanTab(requested)
  }, [requested])
  // La pestaña activa siempre queda a la vista dentro de la fila desplazable.
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])
  return (
    <div className="stack">
      <PageHeader title={t('plan.title')} />
      <nav className="tabs" aria-label={t('plan.tabsAria')}>
        {TABS.map((x) => (
          <a key={x.id} ref={tab === x.id ? activeRef : undefined} className={`tabs__tab${tab === x.id ? ' is-active' : ''}`} href={href(`/plan/${x.id}`)} aria-current={tab === x.id ? 'page' : undefined}>
            <Icon name={x.icon} size={18} />
            {t(x.key)}
          </a>
        ))}
      </nav>
      {tab === 'planes' && <Plans route={route} />}
      {tab === 'calendario' && <Calendar />}
      {tab === 'metas' && <Goals />}
      {tab === 'periodos' && <PeriodBudgets />}
      {tab === 'proyeccion' && <Projection />}
    </div>
  )
}

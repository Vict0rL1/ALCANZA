import { useT } from '../../i18n'
import { PageHeader } from '../components/common'
import { Icon, type IconName } from '../components/Icon'
import { href, type Route } from '../router'
import { Calendar } from './Calendar'
import { Goals } from './Goals'
import { Projection } from './Projection'

const TABS: { id: 'calendario' | 'metas' | 'proyeccion'; key: 'plan.calendar' | 'plan.goals' | 'plan.projection'; icon: IconName }[] = [
  { id: 'calendario', key: 'plan.calendar', icon: 'calendar' },
  { id: 'metas', key: 'plan.goals', icon: 'target' },
  { id: 'proyeccion', key: 'plan.projection', icon: 'trend' },
]

export function Plan({ route }: { route: Route }) {
  const { t } = useT()
  const tab = TABS.find((x) => x.id === route.segments[1])?.id ?? 'calendario'
  return (
    <div className="stack">
      <PageHeader title={t('plan.title')} />
      <nav className="tabs" aria-label={t('plan.tabsAria')}>
        {TABS.map((x) => (
          <a key={x.id} className={`tabs__tab${tab === x.id ? ' is-active' : ''}`} href={href(`/plan/${x.id}`)} aria-current={tab === x.id ? 'page' : undefined}>
            <Icon name={x.icon} size={18} />
            {t(x.key)}
          </a>
        ))}
      </nav>
      {tab === 'calendario' && <Calendar />}
      {tab === 'metas' && <Goals />}
      {tab === 'proyeccion' && <Projection />}
    </div>
  )
}

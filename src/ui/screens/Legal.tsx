/** Términos y privacidad (§7.7 · Legal): textos propios del prototipo local, en los cuatro idiomas. */
import { useT, type MessageKey } from '../../i18n'
import { Card, PageHeader } from '../components/common'
import { href, type Route } from '../router'

const PAGES = { terminos: 'terms', privacidad: 'privacy' } as const
type Page = (typeof PAGES)[keyof typeof PAGES]
const SECTIONS: Record<Page, number> = { terms: 5, privacy: 6 }

export function Legal({ route }: { route: Route }) {
  const { t } = useT()
  const page: Page = PAGES[route.segments[1] as keyof typeof PAGES] ?? 'terms'
  return (
    <div className="stack legal">
      <PageHeader title={t(`legal.${page}.title`)} back={{ href: href('/ajustes?seccion=legal'), label: t('settings.title') }} />
      <Card>
        <p className="note">{t('legal.updated')}</p>
        {Array.from({ length: SECTIONS[page] }, (_, i) => i + 1).map((n) => (
          <section key={n} className="stack-sm">
            <h2 className="section-title">{t(`legal.${page}.${n}.title` as MessageKey)}</h2>
            <p>{t(`legal.${page}.${n}.text` as MessageKey)}</p>
          </section>
        ))}
      </Card>
    </div>
  )
}

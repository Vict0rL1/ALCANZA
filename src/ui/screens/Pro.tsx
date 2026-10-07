/**
 * Clara Pro (§7.8): lo esencial es gratis; Pro solo ampliaría el proveedor remoto del asistente y
 * extras futuros. Sin pasarela de pago no hay precio ni botón de compra: se dice. En compilaciones
 * de desarrollo se puede simular Pro para probar el FeatureGate (decisión 48).
 */
import { aiUsagePercent, FREE_AI_USES_PER_MONTH, isPro } from '../../domain/featureGate'
import { updateSettings } from '../../domain/operations'
import { useT } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { ProgressBar, Toggle } from '../components/base'
import { Alert, Card, PageHeader } from '../components/common'
import { Icon } from '../components/Icon'
import { href } from '../router'

export const DEV_MODE = import.meta.env.DEV

export function Pro() {
  const { t } = useT()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const pro = isPro(data.settings, { devMode: DEV_MODE })
  const pct = aiUsagePercent(data.settings, { today, devMode: DEV_MODE })
  const benefits = ['aiUnlimited', 'noAds', 'sync', 'pdf', 'widgets'] as const
  return (
    <div className="stack">
      <PageHeader title={t('pro.title')} back={{ href: href('/ajustes'), label: t('settings.title') }} />
      <Card labelledBy="pro-free-title">
        <h2 id="pro-free-title" className="card__title">
          {t('pro.freeTitle')}
        </h2>
        <p>{t('pro.freeText')}</p>
        <p className="stat__label">{t('pro.aiUsage')}</p>
        <ProgressBar fraction={pct / 100} state={pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok'} label={t('pro.aiUsage')} valueText={`${pct} %`} stateText={pro ? t('pro.unlimited') : t('pro.aiQuota', { count: FREE_AI_USES_PER_MONTH })} />
      </Card>
      <Card labelledBy="pro-benefits-title">
        <h2 id="pro-benefits-title" className="card__title">
          {t('pro.benefitsTitle')}
        </h2>
        <ul className="check-list">
          {benefits.map((b) => (
            <li key={b}>
              <Icon name={b === 'sync' || b === 'widgets' ? 'clock' : 'checkCircle'} size={18} />
              <span>
                {t(`pro.benefit.${b}`)}
                {(b === 'sync' || b === 'widgets') && <span className="muted"> · {t('pro.notYet')}</span>}
              </span>
            </li>
          ))}
        </ul>
        <Alert tone="neutral" icon="info" title={t('pro.noPaymentTitle')}>
          {t('pro.noPaymentText')}
        </Alert>
      </Card>
      {DEV_MODE && (
        <Card labelledBy="pro-dev-title">
          <h2 id="pro-dev-title" className="card__title">
            {t('pro.devTitle')}
          </h2>
          <Toggle checked={!!data.settings.proStatus?.active} onChange={(v) => void run((d, c) => updateSettings(d, { proStatus: v ? { active: true, plan: 'monthly' } : { active: false } }, c))} label={t('pro.devToggle')} hint={t('pro.devHint')} />
        </Card>
      )}
    </div>
  )
}

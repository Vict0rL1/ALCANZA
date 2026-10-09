import { useT } from '../../../i18n'
import { Alert, Card } from '../../components/common'
import { useToast } from '../../components/toastContext'

/**
 * Ajustes › Atajos de iPhone (L3). Dos caminos, explicados tal cual son: el portapapeles («+» ›
 * «Pegar del atajo») no depende de dónde abra iOS los enlaces; el enlace solo sirve si abre la Clara
 * que tiene tus datos, y eso está pendiente de la prueba en un iPhone (docs/IOS-SHORTCUTS.md).
 * Nada de esto registra un movimiento: siempre rellena y espera a que la persona confirme.
 */
export function IosShortcutsSection() {
  const { t } = useT()
  const toast = useToast()
  const base = `${window.location.origin}${window.location.pathname}#/movimientos/nuevo`
  const links = [
    { id: 'pay', label: t('iosShortcuts.linkPay'), url: `${base}?kind=expense&importe=[${t('iosShortcuts.varAmount')}]&comercio=[${t('iosShortcuts.varMerchant')}]&source=shortcut` },
    { id: 'back-tap', label: t('iosShortcuts.linkBackTap'), url: `${base}?source=shortcut` },
  ]
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ message: t('iosShortcuts.copied'), tone: 'good' })
    } catch {
      toast({ message: t('iosShortcuts.copyFailed'), tone: 'critical' })
    }
  }
  return (
    <Card labelledBy="atajos-iphone">
      <h2 id="atajos-iphone" className="card__title">
        {t('iosShortcuts.title')}
      </h2>
      <div className="stack-sm" data-testid="ios-shortcuts">
        <p>{t('iosShortcuts.intro')}</p>
        <Alert tone="info" icon="info" title={t('iosShortcuts.pending')} />
        <h3 className="section-title">{t('iosShortcuts.clipboardTitle')}</h3>
        <ol className="bullets">
          <li>{t('iosShortcuts.clipboard1')}</li>
          <li>{t('iosShortcuts.clipboard2')}</li>
          <li>{t('iosShortcuts.clipboard3')}</li>
        </ol>
        <h3 className="section-title">{t('iosShortcuts.linkTitle')}</h3>
        {links.map((l) => (
          <div key={l.id} className="stack-sm" data-testid={`ios-link-${l.id}`}>
            <p>{l.label}</p>
            <code className="url-template">{l.url}</code>
            <div className="button-row">
              <button type="button" className="btn btn--secondary btn--small" aria-label={`${t('iosShortcuts.copy')}: ${l.label}`} onClick={() => void copy(l.url)}>
                {t('iosShortcuts.copy')}
              </button>
            </div>
          </div>
        ))}
        <p className="note">{t('iosShortcuts.steps')}</p>
      </div>
    </Card>
  )
}

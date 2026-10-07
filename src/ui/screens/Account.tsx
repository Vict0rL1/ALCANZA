/**
 * Cuenta (§7.8): modo invitado siempre disponible. El inicio de sesión y la sincronización cifrada
 * necesitan un servicio que esta compilación no tiene: se explica qué harían y se ofrecen las vías
 * reales (copia cifrada, copias locales, exportar). Nunca se muestran botones de proveedores que no
 * funcionan (decisión 49).
 */
import { useState } from 'react'
import { useT } from '../../i18n'
import { useData } from '../../state/store'
import { Alert, Card, PageHeader } from '../components/common'
import { Icon } from '../components/Icon'
import { href } from '../router'
import { PassphraseDialog } from './settings/PassphraseDialog'
import { useEncryptedExport } from '../useEncryptedExport'

export function Account() {
  const { t } = useT()
  const data = useData()
  const [dialog, setDialog] = useState(false)
  const exportEncrypted = useEncryptedExport()
  const profile = data.profile
  return (
    <div className="stack">
      <PageHeader title={t('account.title')} back={{ href: href('/ajustes'), label: t('settings.title') }} />
      <Card labelledBy="account-status-title">
        <h2 id="account-status-title" className="card__title">
          {profile.isGuest ? t('account.guestTitle') : (profile.displayName ?? profile.email ?? t('account.title'))}
        </h2>
        <p data-testid="account-status">{profile.isGuest ? t('account.guestText') : t('account.signedInText', { email: profile.email ?? '' })}</p>
        <Alert tone="info" icon="info" title={t('account.notConfiguredTitle')}>
          {t('account.notConfiguredText')}
        </Alert>
        <ul className="bullets">
          <li>{t('account.wouldSync')}</li>
          <li>{t('account.wouldEncrypt')}</li>
          <li>{t('account.wouldMigrate')}</li>
        </ul>
      </Card>
      <Card labelledBy="account-local-title">
        <h2 id="account-local-title" className="card__title">
          {t('account.localTitle')}
        </h2>
        <p className="note">{t('account.localText')}</p>
        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={() => setDialog(true)} data-testid="export-encrypted">
            <Icon name="lock" size={16} />
            {t('encrypted.export')}
          </button>
          <a className="btn btn--secondary" href={href('/ajustes?seccion=copias-locales')}>
            {t('localBackup.title')}
          </a>
          <a className="btn btn--secondary" href={href('/ajustes?seccion=copia')}>
            {t('settings.backup.export')}
          </a>
        </div>
        <p className="note">{t('encrypted.importHint')}</p>
      </Card>
      {dialog && (
        <PassphraseDialog
          mode="encrypt"
          onClose={() => setDialog(false)}
          onSubmit={async (p) => {
            if (await exportEncrypted(p)) setDialog(false)
          }}
        />
      )}
    </div>
  )
}

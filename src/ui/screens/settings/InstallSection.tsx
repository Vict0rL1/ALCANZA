import { useState } from 'react'
import { useT } from '../../../i18n'
import { Alert, Card } from '../../components/common'
import { Icon } from '../../components/Icon'
import { promptInstall, useInstallMode } from '../../install'
import { href } from '../../router'

/** Ajustes › Instalar Clara (K2): lo que este navegador permite de verdad, sin botones de adorno. */
export function InstallSection() {
  const { t } = useT()
  const { mode, installedNow } = useInstallMode()
  const [dismissed, setDismissed] = useState(false)
  return (
    <Card labelledBy="instalar">
      <h2 id="instalar" className="card__title">
        {t('install.title')}
      </h2>
      <div className="stack-sm" data-testid="install-guide" data-mode={installedNow ? 'installed' : mode}>
        {installedNow || mode === 'installed' ? (
          <p>
            <Icon name="check" size={16} /> {t(installedNow ? 'install.installedNow' : 'install.installed')}
          </p>
        ) : (
          <>
            <p>{t('install.intro')}</p>
            {mode === 'ios' && (
              <>
                <h3 className="section-title">{t('install.ios.title')}</h3>
                <p className="install__path">
                  <strong>{t('install.ios.path')}</strong>
                </p>
                <ol className="bullets">
                  <li>{t('install.ios.step1')}</li>
                  <li>{t('install.ios.step2')}</li>
                  <li>{t('install.ios.step3')}</li>
                </ol>
                <Alert tone="warning" icon="alert" title={t('install.ios.warning')}>
                  <a href={href('/ajustes/copia')}>{t('install.ios.restore')}</a>
                </Alert>
              </>
            )}
            {mode === 'prompt' && (
              <>
                <p>{t('install.prompt.text')}</p>
                <div className="button-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={async () => {
                      const outcome = await promptInstall()
                      setDismissed(outcome !== 'accepted')
                    }}
                  >
                    <Icon name="download" />
                    {t('install.prompt.button')}
                  </button>
                </div>
              </>
            )}
            {mode === 'manual' && <p>{t('install.manual.text')}</p>}
            {dismissed && mode !== 'prompt' && <p className="note">{t('install.prompt.dismissed')}</p>}
          </>
        )}
      </div>
    </Card>
  )
}

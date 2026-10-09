import { useState } from 'react'
import { useT } from '../../../i18n'
import { useToast } from '../../components/toastContext'
import { clearErrors, readErrors, reportText } from '../../errorLog'
import { APP_VERSION, BUILD_HASH } from '../../version'

/** Ajustes › Acerca de › Informe de errores (M3): lo que se copia es exactamente lo que se ve. */
export function ErrorReport() {
  const { t } = useT()
  const toast = useToast()
  const [entries, setEntries] = useState(() => readErrors())
  const text = reportText(entries, { version: APP_VERSION, build: BUILD_HASH })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: t('errorLog.copied'), tone: 'good' })
    } catch {
      toast({ message: t('feedback.copyFailed'), tone: 'critical' })
    }
  }
  return (
    <section className="stack-sm" aria-labelledby="informe-errores" data-testid="error-report">
      <h3 id="informe-errores" className="section-title">
        {t('errorLog.title')}
      </h3>
      <p className="note">{t('errorLog.intro')}</p>
      {entries.length === 0 ? (
        <p data-testid="error-report-empty">{t('errorLog.empty')}</p>
      ) : (
        <>
          <pre className="text-preview" data-testid="error-report-text">
            {text}
          </pre>
          <div className="button-row">
            <button type="button" className="btn btn--secondary btn--small" onClick={() => void copy()}>
              {t('errorLog.copy')}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => {
                clearErrors()
                setEntries([])
                toast({ message: t('errorLog.cleared'), tone: 'good' })
              }}
            >
              {t('errorLog.clear')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

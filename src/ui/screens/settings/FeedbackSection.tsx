import { useState } from 'react'
import { useT } from '../../../i18n'
import { Card } from '../../components/common'
import { CheckboxField } from '../../components/fields'
import { useToast } from '../../components/toastContext'
import { readErrors, reportText } from '../../errorLog'
import { describeBrowser, feedbackEmail, feedbackMailto, feedbackText } from '../../feedback'
import { isStandalone } from '../../install'
import { APP_VERSION, BUILD_HASH } from '../../version'

const FEEDBACK_EMAIL = feedbackEmail(import.meta.env.VITE_FEEDBACK_EMAIL)

/**
 * Ajustes › Enviar comentarios (M2): la persona ve el texto completo antes de abrir su correo.
 * Solo datos técnicos; los datos financieros ni siquiera llegan a estas funciones.
 */
export function FeedbackSection() {
  const { t, language } = useT()
  const toast = useToast()
  const info = {
    version: APP_VERSION,
    build: BUILD_HASH,
    browser: describeBrowser(navigator.userAgent),
    installed: isStandalone(),
    screen: `${window.screen.width} × ${window.screen.height}`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    language,
  }
  // El informe de errores (M3) solo se añade si la persona lo marca, y entonces se ve en el texto.
  const [errors] = useState(() => readErrors())
  const [withErrors, setWithErrors] = useState(false)
  const subject = t('feedback.subject', { version: APP_VERSION })
  const body = feedbackText(info, (k) => t(k as Parameters<typeof t>[0]), withErrors ? reportText(errors, { version: APP_VERSION, build: BUILD_HASH }) : undefined)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${t('feedback.subjectLabel')}: ${subject}\n\n${body}`)
      toast({ message: t('feedback.copied'), tone: 'good' })
    } catch {
      toast({ message: t('feedback.copyFailed'), tone: 'critical' })
    }
  }
  return (
    <Card labelledBy="comentarios">
      <h2 id="comentarios" className="card__title">
        {t('feedback.title')}
      </h2>
      <div className="stack-sm" data-testid="feedback">
        <p>{t('feedback.intro')}</p>
        <p className="note">{t('feedback.private')}</p>
        {errors.length > 0 && (
          <CheckboxField label={t('feedback.includeErrors', { count: errors.length })} checked={withErrors} onChange={setWithErrors} />
        )}
        <h3 className="section-title">{t('feedback.previewLabel')}</h3>
        <pre className="text-preview" data-testid="feedback-preview">
          {`${t('feedback.subjectLabel')}: ${subject}\n\n${body}`}
        </pre>
        {!FEEDBACK_EMAIL && <p className="note">{t('feedback.noAddress')}</p>}
        <div className="button-row">
          <a className="btn btn--primary" href={feedbackMailto(FEEDBACK_EMAIL, subject, body)} data-testid="feedback-mailto">
            {t('feedback.write')}
          </a>
          <button type="button" className="btn btn--secondary" onClick={() => void copy()}>
            {t('feedback.copy')}
          </button>
        </div>
      </div>
    </Card>
  )
}

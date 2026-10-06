/**
 * Ajustes › Inicio y privacidad. Preferencias de presentación de este dispositivo
 * (`ui/preferences.ts`): no cambian cifras ni datos. Reordenar se hace con botones
 * (sin arrastrar ni gestos ocultos).
 */
import { useState } from 'react'
import { updateSettings } from '../../domain/operations'
import { useT, type MessageKey } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { Card } from '../components/common'
import { ConfirmDialog } from '../components/Dialog'
import { CheckboxField, Segmented } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { DEFAULT_PREFERENCES, MAX_QUICK_ACTIONS, moveSection, QUICK_ACTIONS, usePreferences, writePreferences } from '../preferences'

export function PersonalizeSection() {
  const { t } = useT()
  const toast = useToast()
  const [prefs, setPrefs] = usePreferences()
  const data = useData()
  const run = useRun()
  // La revisión semanal ya era un ajuste guardado con los datos (sigue siéndolo): un solo control.
  const weeklyOn = data.settings.weeklyReview !== false
  const [confirmReset, setConfirmReset] = useState(false)
  const full = prefs.quickActions.length >= MAX_QUICK_ACTIONS

  return (
    <Card labelledBy="personalizar">
      <h2 id="personalizar" className="card__title">
        {t('personalize.title')}
      </h2>
      <p className="note">{t('personalize.intro')}</p>

      <Segmented
        legend={t('personalize.view')}
        name="home-view"
        value={prefs.view}
        onChange={(view) => setPrefs((p) => ({ ...p, view }))}
        options={[
          { value: 'full', label: t('personalize.view.full') },
          { value: 'essential', label: t('personalize.view.essential') },
        ]}
        hint={t(prefs.view === 'essential' ? 'personalize.view.essentialHint' : 'personalize.view.fullHint')}
      />

      <fieldset className="stack-sm" disabled={prefs.view === 'essential'}>
        <legend className="field__label">{t('personalize.sections')}</legend>
        <p className="field__hint">{t('personalize.sectionsHint')}</p>
        <ol className="reorder-list">
          {prefs.sections.map((s, i) => {
            const name = t(`personalize.section.${s.id}` as MessageKey)
            return (
              <li key={s.id} className="reorder-item">
                {s.id === 'weekly' ? (
                  <CheckboxField checked={weeklyOn} onChange={(v) => void run((d, c) => updateSettings(d, { weeklyReview: v }, c))} label={t('weekly.settingLabel')} hint={t('weekly.settingHint')} />
                ) : (
                  <CheckboxField checked={s.visible} onChange={(v) => setPrefs((p) => ({ ...p, sections: p.sections.map((x) => (x.id === s.id ? { ...x, visible: v } : x)) }))} label={name} />
                )}
                <div className="reorder-item__buttons">
                  <button type="button" className="btn btn--ghost btn--icon" disabled={i === 0} onClick={() => setPrefs((p) => moveSection(p, s.id, -1))}>
                    <Icon name="up" />
                    <span className="sr-only">{t('personalize.moveUp', { name })}</span>
                  </button>
                  <button type="button" className="btn btn--ghost btn--icon" disabled={i === prefs.sections.length - 1} onClick={() => setPrefs((p) => moveSection(p, s.id, 1))}>
                    <Icon name="down" />
                    <span className="sr-only">{t('personalize.moveDown', { name })}</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      </fieldset>

      <fieldset className="stack-sm" disabled={prefs.view === 'essential'}>
        <legend className="field__label">{t('personalize.quick', { max: MAX_QUICK_ACTIONS })}</legend>
        <p className="field__hint">{t('personalize.quickHint')}</p>
        {QUICK_ACTIONS.map((a) => {
          const on = prefs.quickActions.includes(a)
          return (
            <CheckboxField
              key={a}
              checked={on}
              onChange={(v) => setPrefs((p) => ({ ...p, quickActions: v ? [...p.quickActions, a].slice(0, MAX_QUICK_ACTIONS) : p.quickActions.filter((x) => x !== a) }))}
              label={t(`personalize.quick.${a}` as MessageKey)}
              disabled={!on && full}
            />
          )
        })}
      </fieldset>

      <CheckboxField checked={prefs.privacy} onChange={(v) => setPrefs((p) => ({ ...p, privacy: v }))} label={t('personalize.privacy')} hint={t('personalize.privacyHint')} />

      <button type="button" className="btn btn--secondary" onClick={() => setConfirmReset(true)}>
        <Icon name="undo" />
        {t('personalize.reset')}
      </button>
      <ConfirmDialog
        open={confirmReset}
        title={t('personalize.resetTitle')}
        confirmLabel={t('personalize.reset')}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          const before = prefs
          const weeklyBefore = weeklyOn
          writePreferences(null)
          if (!weeklyOn) void run((d, c) => updateSettings(d, { weeklyReview: true }, c))
          setConfirmReset(false)
          toast({
            message: t('personalize.resetDone'),
            tone: 'good',
            action: {
              label: t('common.undo'),
              onClick: () => {
                writePreferences(before)
                if (!weeklyBefore) void run((d, c) => updateSettings(d, { weeklyReview: false }, c))
              },
            },
          })
        }}
      >
        <p>{t('personalize.resetText')}</p>
      </ConfirmDialog>
      {JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFERENCES) && <p className="note">{t('personalize.isDefault')}</p>}
    </Card>
  )
}

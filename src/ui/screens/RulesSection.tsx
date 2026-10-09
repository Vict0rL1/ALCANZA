/** Ajustes › Reglas de categoría: «si la descripción contiene…, usar esta categoría». */
import { useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { newId } from '../../domain/ids'
import { deleteCategoryRule, restoreCategoryRule, saveCategoryRule } from '../../domain/operations'
import { RULE_PATTERN_MAX } from '../../domain/rules'
import type { CategoryRule } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { Card, EmptyState } from '../components/common'
import { Dialog } from '../components/Dialog'
import { Segmented, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { categoryLabel, fieldError, withCurrent } from '../labels'
import { CategoryPicker } from '../components/CategoryPicker'

export function RulesSection() {
  const { t } = useT()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [editing, setEditing] = useState<CategoryRule | 'new' | null>(null)

  const rules = [...data.categoryRules].sort((a, b) => a.pattern.localeCompare(b.pattern))

  const remove = async (rule: CategoryRule) => {
    const { saved } = await run((d, c) => deleteCategoryRule(d, rule.id, c))
    toast({
      message: saved ? t('rules.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: saved ? { label: t('common.undo'), onClick: () => void run((d, c) => restoreCategoryRule(d, rule, c)) } : undefined,
    })
  }

  return (
    <Card labelledBy="rules-title">
      <h2 id="reglas" className="card__title">
        <span id="rules-title">{t('rules.title')}</span>
      </h2>
      <p className="note">{t('rules.text')}</p>
      {rules.length === 0 ? (
        <EmptyState compact icon="sparkles" title={t('rules.empty')} />
      ) : (
        <ul className="item-list">
          {rules.map((r) => (
            <li key={r.id} className="item item--stacked">
              <p className="item__title">{t('rules.summary', { pattern: r.pattern, category: categoryLabel(t, r.categoryId) })}</p>
              <p className="item__meta">{t(r.kind === 'income' ? 'rules.forIncome' : 'rules.forExpenses')}</p>
              <div className="item__actions">
                <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(r)}>
                  <Icon name="edit" size={16} />
                  {t('common.edit')}
                  <span className="sr-only">: {r.pattern}</span>
                </button>
                <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => void remove(r)}>
                  <Icon name="trash" size={16} />
                  {t('common.delete')}
                  <span className="sr-only">: {r.pattern}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
        <Icon name="plus" />
        {t('rules.add')}
      </button>
      {editing && <RuleDialog rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

export function RuleDialog({
  rule,
  onClose,
  initial,
}: {
  rule: CategoryRule | null
  onClose: () => void
  /** Para crear una regla desde otra pantalla (por ejemplo, la importación). */
  initial?: Pick<CategoryRule, 'pattern' | 'kind' | 'categoryId'>
}) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const start = rule ?? initial
  const [id] = useState(() => rule?.id ?? newId())
  const [pattern, setPattern] = useState(start?.pattern ?? '')
  const [kind, setKind] = useState<CategoryRule['kind']>(start?.kind ?? 'expense')
  const [categoryId, setCategoryId] = useState(start?.categoryId ?? 'other_expense')
  const [issues, setIssues] = useState<Issue[]>([])

  const options = withCurrent(categoriesForKind(kind, data.categories, { prefs: data.categoryPrefs }), rule?.kind === kind ? rule.categoryId : undefined)

  const submit = async () => {
    const { result, saved } = await run((d, c) => saveCategoryRule(d, { id, pattern, kind, categoryId }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('rules.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? t('rules.editTitle') : t('rules.newTitle')}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField
        label={t('rules.pattern')}
        value={pattern}
        maxLength={RULE_PATTERN_MAX}
        onChange={(e) => setPattern(e.target.value)}
        error={fieldError(t, fmt, issues, 'pattern')}
        hint={t('rules.patternHint')}
        required
        autoFocus
      />
      <Segmented
        legend={t('rules.kind')}
        name="rulekind"
        value={kind}
        onChange={(k) => {
          setKind(k)
          setCategoryId(k === 'income' ? 'other_income' : 'other_expense')
        }}
        options={[
          { value: 'expense', label: t('rules.forExpenses') },
          { value: 'income', label: t('rules.forIncome') },
        ]}
      />
      <CategoryPicker label={t('fields.category')} kind={kind} data={data} value={categoryId} onChange={setCategoryId} only={options} keep={rule?.kind === kind ? rule.categoryId : undefined} error={fieldError(t, fmt, issues, 'categoryId')} />
    </Dialog>
  )
}

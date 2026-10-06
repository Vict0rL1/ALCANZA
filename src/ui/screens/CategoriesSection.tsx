/** Ajustes › Categorías personalizadas: crear, renombrar, archivar y eliminar. */
import { useState } from 'react'
import { newId } from '../../domain/ids'
import { deleteCategory, saveCategory, setCategoryArchived } from '../../domain/operations'
import type { CustomCategory } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Badge, Card } from '../components/common'
import { Dialog } from '../components/Dialog'
import { Segmented, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { fieldError, issueMessage } from '../labels'

export function CategoriesSection() {
  const { t, tn } = useT()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [editing, setEditing] = useState<CustomCategory | 'new' | null>(null)
  const [error, setError] = useState<Issue | null>(null)
  const fmt = useFormat()

  const usage = (id: string) => data.transactions.filter((x) => x.categoryId === id).length + data.schedules.filter((s) => s.categoryId === id).length

  const toggleArchive = async (c: CustomCategory) => {
    const { saved } = await run((d, ctx) => setCategoryArchived(d, c.id, !c.archived, ctx))
    toast({ message: saved ? t(c.archived ? 'categories.unarchivedDone' : 'categories.archivedDone') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  const remove = async (c: CustomCategory) => {
    const { result, saved } = await run((d, ctx) => deleteCategory(d, c.id, ctx))
    if (!result.ok) {
      setError(result.issues[0] ?? null)
      return
    }
    setError(null)
    toast({ message: saved ? t('categories.deleted') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  return (
    <Card labelledBy="categories-title">
      <h2 id="categorias" className="card__title">
        <span id="categories-title">{t('categories.title')}</span>
      </h2>
      <p className="note">{t('categories.text')}</p>
      {data.categories.length === 0 ? (
        <p>{t('categories.empty')}</p>
      ) : (
        <ul className="item-list">
          {data.categories.map((c) => {
            const uses = usage(c.id)
            return (
              <li key={c.id} className="item item--stacked">
                <div className="item__row">
                  <div className="item__main">
                    <p className="item__title">{c.name}</p>
                    <p className="item__badges">
                      <Badge>{t(c.kind === 'income' ? 'categories.kindIncome' : 'categories.kindExpense')}</Badge>
                      {c.archived && <Badge icon="lock">{t('categories.archived')}</Badge>}
                      <Badge>{tn('categories.usage', uses)}</Badge>
                    </p>
                  </div>
                </div>
                <div className="item__actions">
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(c)}>
                    <Icon name="edit" size={16} />
                    {t('common.edit')}
                    <span className="sr-only">: {c.name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--secondary" onClick={() => void toggleArchive(c)}>
                    {t(c.archived ? 'categories.unarchive' : 'categories.archive')}
                    <span className="sr-only">: {c.name}</span>
                  </button>
                  {uses === 0 && (
                    <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => void remove(c)}>
                      <Icon name="trash" size={16} />
                      {t('common.delete')}
                      <span className="sr-only">: {c.name}</span>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {error && <Alert tone="critical" title={issueMessage(t, fmt, error)} role="alert" />}
      <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
        <Icon name="plus" />
        {t('categories.add')}
      </button>
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function CategoryDialog({ category, onClose }: { category: CustomCategory | null; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const [id] = useState(() => category?.id ?? `c_${newId()}`)
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<CustomCategory['kind']>(category?.kind ?? 'expense')
  const [issues, setIssues] = useState<Issue[]>([])

  const submit = async () => {
    const { result, saved } = await run((d, c) => saveCategory(d, { id, name, kind }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('categories.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? t('categories.editTitle') : t('categories.newTitle')}
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
      <TextField label={t('fields.name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} error={fieldError(t, fmt, issues, 'name')} required autoFocus />
      {category ? (
        <p className="note">
          {t(category.kind === 'income' ? 'categories.kindIncome' : 'categories.kindExpense')} · {t('categories.kindFixed')}
        </p>
      ) : (
        <Segmented
          legend={t('categories.kind')}
          name="catkind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: t('categories.kindExpense') },
            { value: 'income', label: t('categories.kindIncome') },
          ]}
          hint={t('categories.kindFixed')}
        />
      )}
    </Dialog>
  )
}

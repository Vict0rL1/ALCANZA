/**
 * Plantillas con nombre para compras divididas y para distribuir un ingreso. Una plantilla
 * NUNCA registra movimientos ni aparta dinero: solo rellena un formulario que se revisa y se
 * guarda aparte. Reglas e importes en `domain/templates.ts`.
 */
import { useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { newId } from '../../domain/ids'
import { deleteTemplate, restoreTemplate, saveTemplate, templateAmounts } from '../../domain/templates'
import type { AppData, DistributionTemplateLine, SplitTemplateLine, Template, TemplateAmount } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { TEMPLATE_MAX_LINES } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Badge, Card, EmptyState, PageHeader } from '../components/common'
import { MoneyField, Segmented, SelectField, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat, type Formatter } from '../format'
import { categoryLabel, issueMessage } from '../labels'
import { parseMoneyText } from '../moneyText'
import { parsePercent, percentText } from '../percentText'
import { href, withQuery, useNavigateIfStillHere, type Route } from '../router'

type Kind = Template['kind']
type T = ReturnType<typeof useT>['t']

interface LineDraft {
  key: string
  /** Categoría (división) o 'g:<id>' / 'p:<id>' (distribución). */
  target: string
  mode: TemplateAmount['mode']
  text: string
}

function targetLabel(data: AppData, target: string, t: T): string {
  if (target.startsWith('g:')) return data.goals.find((g) => g.id === target.slice(2))?.name ?? t('templates.missingTarget')
  if (target.startsWith('p:')) return data.schedules.find((s) => s.id === target.slice(2))?.name ?? t('templates.missingTarget')
  return categoryLabel(t, target) || t('templates.missingTarget')
}

/** Problema de disponibilidad de una línea guardada (para avisar en la lista). */
function lineProblem(data: AppData, tpl: Template, i: number, today: string): boolean {
  if (tpl.kind === 'split') return !categoriesForKind('expense', data.categories, { prefs: data.categoryPrefs }).includes(tpl.lines[i]!.categoryId)
  const target = tpl.lines[i]!.target
  if (target.kind === 'goal') {
    const g = data.goals.find((x) => x.id === target.goalId)
    return !g || !!g.plan?.paidAt
  }
  const s = data.schedules.find((x) => x.id === target.scheduleId)
  return !s || (!!s.endDate && s.endDate < today)
}

function amountText(a: TemplateAmount, fmt: Formatter): string {
  return a.mode === 'fixed' ? fmt.money(a.amountMinor) : `${percentText(a.bps)} %`
}

export function Templates() {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const today = useToday()

  const remove = async (tpl: Template) => {
    const { result, saved } = await run((d, c) => deleteTemplate(d, tpl.id, c))
    if (!result.ok) return
    const removed = result.value
    toast({
      message: saved ? t('templates.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreTemplate(d, removed, c)) },
    })
  }

  const section = (kind: Kind) => {
    const list = data.templates.filter((x) => x.kind === kind)
    return (
      <Card labelledBy={`tpl-${kind}`}>
        <h2 id={`tpl-${kind}`} className="card__title">
          {t(kind === 'split' ? 'templates.splitTitle' : 'templates.distributionTitle')}
        </h2>
        <p className="note">{t(kind === 'split' ? 'templates.splitIntro' : 'templates.distributionIntro')}</p>
        {list.length === 0 ? (
          <p className="note">{t('templates.none')}</p>
        ) : (
          <ul className="item-list">
            {list.map((tpl) => {
              const broken = tpl.lines.some((_, i) => lineProblem(data, tpl, i, today))
              return (
                <li key={tpl.id} className="item item--stacked">
                  <p className="item__title">{tpl.name}</p>
                  <ul className="bullets">
                    {tpl.lines.map((l, i) => (
                      <li key={i}>
                        {targetLabel(data, kind === 'split' ? (l as SplitTemplateLine).categoryId : (l as DistributionTemplateLine).target.kind === 'goal' ? `g:${((l as DistributionTemplateLine).target as { goalId: string }).goalId}` : `p:${((l as DistributionTemplateLine).target as { scheduleId: string }).scheduleId}`, t)}
                        {' · '}
                        {amountText(l.amount, fmt)}
                      </li>
                    ))}
                  </ul>
                  {broken && (
                    <p className="note note--icon">
                      <Icon name="alert" size={16} /> {t('templates.broken')}
                    </p>
                  )}
                  <div className="button-row">
                    <a className="btn btn--secondary btn--small" href={href(`/movimientos/plantillas/editar/${tpl.id}`)}>
                      <Icon name="edit" size={16} />
                      {t('common.edit')}
                    </a>
                    <button type="button" className="btn btn--danger-ghost btn--small" onClick={() => void remove(tpl)}>
                      <Icon name="trash" size={16} />
                      {t('common.delete')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <a className="btn btn--secondary" href={href(withQuery('/movimientos/plantillas/nueva', { tipo: kind }))}>
          <Icon name="plus" />
          {t(kind === 'split' ? 'templates.newSplit' : 'templates.newDistribution')}
        </a>
      </Card>
    )
  }

  return (
    <div className="stack">
      <PageHeader title={t('templates.title')} back={{ href: href('/movimientos'), label: t('nav.movements') }} />
      <Alert tone="info" icon="star" title={t('templates.whatTitle')}>
        <ul className="bullets">
          <li>
            <Badge>{t('templates.kind.template')}</Badge> {t('templates.what.template')}
          </li>
          <li>
            <Badge icon="edit">{t('quick.badge.draft')}</Badge> {t('templates.what.draft')}
          </li>
          <li>
            <Badge tone="good" icon="check">{t('templates.kind.realized')}</Badge> {t('templates.what.realized')}
          </li>
        </ul>
      </Alert>
      {section('split')}
      {section('distribution')}
    </div>
  )
}

/** `lineas` de la URL: «categoria:centavos,…» o «g:<id>:centavos» / «p:<id>:centavos». */
function linesFromQuery(text: string | null, kind: Kind, fmt: Formatter): LineDraft[] | null {
  if (!text) return null
  const out: LineDraft[] = []
  for (const part of text.split(',').slice(0, TEMPLATE_MAX_LINES)) {
    const bits = part.split(':')
    const minor = Number(bits[bits.length - 1])
    if (!Number.isSafeInteger(minor) || minor <= 0) continue
    const target = bits.slice(0, -1).join(':')
    if (!target || (kind === 'distribution' && !/^[gp]:/.test(target))) continue
    out.push({ key: newId(), target, mode: 'fixed', text: fmt.moneyInput(minor) })
  }
  return out.length ? out : null
}

function draftsFromTemplate(tpl: Template, fmt: Formatter): LineDraft[] {
  return tpl.lines.map((l) => ({
    key: newId(),
    target: tpl.kind === 'split' ? (l as SplitTemplateLine).categoryId : (l as DistributionTemplateLine).target.kind === 'goal' ? `g:${((l as DistributionTemplateLine).target as { goalId: string }).goalId}` : `p:${((l as DistributionTemplateLine).target as { scheduleId: string }).scheduleId}`,
    mode: l.amount.mode,
    text: l.amount.mode === 'fixed' ? fmt.moneyInput(l.amount.amountMinor) : percentText(l.amount.bps),
  }))
}

export function TemplateForm({ route }: { route: Route }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const leave = useNavigateIfStillHere()
  const editId = route.segments[2] === 'editar' ? route.segments[3] : undefined
  const existing = editId ? data.templates.find((x) => x.id === editId) : undefined
  const returnTo = route.query.get('returnTo') || '/movimientos/plantillas'
  const [id] = useState(() => existing?.id ?? newId())
  const [kind, setKind] = useState<Kind>(existing?.kind ?? (route.query.get('tipo') === 'distribution' ? 'distribution' : 'split'))
  const [name, setName] = useState(existing?.name ?? '')
  const [lines, setLines] = useState<LineDraft[]>(() => (existing ? draftsFromTemplate(existing, fmt) : (linesFromQuery(route.query.get('lineas'), kind, fmt) ?? [{ key: newId(), target: '', mode: 'percent', text: '' }])))
  const [exampleText, setExampleText] = useState('100')
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)

  if (editId && !existing) {
    return (
      <div className="stack">
        <PageHeader title={t('templates.title')} back={{ href: href('/movimientos/plantillas'), label: t('templates.title') }} />
        <EmptyState icon="search" title={t('templates.notFound')} />
      </div>
    )
  }

  const targetOptions =
    kind === 'split'
      ? categoriesForKind('expense', data.categories, { prefs: data.categoryPrefs }).map((c) => ({ value: c, label: categoryLabel(t, c) }))
      : [
          ...data.goals.filter((g) => g.fundedFrom === 'budget' && !g.plan?.paidAt && !g.plan?.link).map((g) => ({ value: `g:${g.id}`, label: t('templates.goalOption', { name: g.name }) })),
          ...data.schedules.filter((s) => s.kind === 'expense').map((s) => ({ value: `p:${s.id}`, label: t('templates.paymentOption', { name: s.name }) })),
        ]

  // Importes de las líneas (null = texto no válido).
  const amounts: (TemplateAmount | null)[] = lines.map((l) => {
    if (l.mode === 'percent') {
      const bps = parsePercent(l.text)
      return bps === null ? null : { mode: 'percent', bps }
    }
    const p = parseMoneyText(l.text, fmt)
    return p.ok ? { mode: 'fixed', amountMinor: p.minor } : null
  })
  const percentSum = amounts.reduce((s, a) => s + (a?.mode === 'percent' ? a.bps : 0), 0)
  const example = parseMoneyText(exampleText, fmt)
  const exampleResult = example.ok && amounts.every((a) => a) ? templateAmounts(amounts as TemplateAmount[], example.minor) : undefined

  const update = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const save = async () => {
    if (busy) return
    if (amounts.some((a) => !a) || lines.some((l) => !l.target)) return setIssues([{ path: 'lines', code: 'invalidValue' }])
    const draftLines = lines.map((l, i) =>
      kind === 'split'
        ? { categoryId: l.target, amount: amounts[i]! }
        : { target: l.target.startsWith('g:') ? { kind: 'goal' as const, goalId: l.target.slice(2) } : { kind: 'payment' as const, scheduleId: l.target.slice(2) }, amount: amounts[i]! },
    )
    setBusy(true)
    const { result, saved } = await run((d, c) => saveTemplate(d, { id, name, kind, lines: draftLines } as Parameters<typeof saveTemplate>[1], c))
    setBusy(false)
    if (!result.ok) return setIssues(result.issues)
    toast({ message: saved ? t('templates.saved', { name: result.value.name }) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    if (saved) leave(returnTo)
  }

  return (
    <div className="stack">
      <PageHeader title={existing ? t('templates.editTitle') : t('templates.newTitle')} back={{ href: href(returnTo), label: t('common.back') }} />
      <p className="note note--icon">
        <Badge>{t('templates.kind.template')}</Badge> {t('templates.what.template')}
      </p>
      <form
        className="form card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label={t('templates.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required error={issues.some((i) => i.path === 'name') ? t('issue.required') : undefined} />
        {!existing && (
          <Segmented
            legend={t('templates.kindLegend')}
            name="tpl-kind"
            value={kind}
            onChange={(k) => {
              setKind(k)
              setLines([{ key: newId(), target: '', mode: 'percent', text: '' }])
            }}
            options={[
              { value: 'split', label: t('templates.kind.split') },
              { value: 'distribution', label: t('templates.kind.distribution') },
            ]}
          />
        )}
        <fieldset className="stack">
          <legend className="field__label">{t('templates.lines')}</legend>
          {lines.map((l, i) => (
            <div key={l.key} className="template-line">
              <SelectField
                label={t(kind === 'split' ? 'templates.lineCategory' : 'templates.lineTarget', { n: i + 1 })}
                value={l.target}
                onChange={(e) => update(l.key, { target: e.target.value })}
                options={[{ value: '', label: t('favorites.choose') }, ...targetOptions, ...(l.target && !targetOptions.some((o) => o.value === l.target) ? [{ value: l.target, label: `${targetLabel(data, l.target, t)} (${t('templates.unavailable')})` }] : [])]}
              />
              <Segmented
                legend={t('templates.mode', { n: i + 1 })}
                name={`mode-${l.key}`}
                value={l.mode}
                onChange={(mode) => update(l.key, { mode, text: '' })}
                options={[
                  { value: 'percent', label: t('templates.mode.percent') },
                  { value: 'fixed', label: t('templates.mode.fixed') },
                ]}
              />
              {l.mode === 'fixed' ? (
                <MoneyField label={t('templates.fixedAmount', { n: i + 1 })} value={l.text} onChange={(text) => update(l.key, { text })} fmt={fmt} />
              ) : (
                <TextField
                  label={t('templates.percent', { n: i + 1 })}
                  inputMode="decimal"
                  value={l.text}
                  onChange={(e) => update(l.key, { text: e.target.value })}
                  hint={t('templates.percentHint')}
                  error={l.text.trim() && parsePercent(l.text) === null ? t('templates.percentInvalid') : undefined}
                />
              )}
              {lines.length > 1 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Icon name="x" size={16} />
                  {t('templates.removeLine', { n: i + 1 })}
                </button>
              )}
            </div>
          ))}
          {lines.length < TEMPLATE_MAX_LINES && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setLines((ls) => [...ls, { key: newId(), target: '', mode: 'percent', text: '' }])}>
              <Icon name="plus" size={16} />
              {t('templates.addLine')}
            </button>
          )}
        </fieldset>
        <p className={percentSum > 10000 ? 'field__error' : 'note'} aria-live="polite">
          {t('templates.percentSum', { sum: percentText(percentSum) })}
        </p>
        <Alert tone="neutral" icon="info" title={t('templates.roundingTitle')}>
          <ul className="bullets">
            <li>{t(kind === 'split' ? 'templates.rule.percentSplit' : 'templates.rule.percentDistribution')}</li>
            <li>{t('templates.rule.rounding')}</li>
            <li>{t(kind === 'split' ? 'templates.rule.leftSplit' : 'templates.rule.leftDistribution')}</li>
            <li>{t('templates.rule.never')}</li>
          </ul>
        </Alert>
        <div className="stack-sm" data-testid="template-example">
          <MoneyField label={t('templates.example')} value={exampleText} onChange={setExampleText} fmt={fmt} hint={t('templates.exampleHint')} />
          {exampleResult === null && <Alert tone="critical" title={t('issue.templateExceedsTotal')} />}
          {exampleResult && example.ok && (
            <ul className="bullets">
              {lines.map((l, i) => (
                <li key={l.key}>
                  {l.target ? targetLabel(data, l.target, t) : '—'}: {fmt.money(exampleResult.amounts[i]!)}
                  {exampleResult.roundingTo === i ? ` (${t('templates.includesRounding', { amount: fmt.money(exampleResult.roundingMinor) })})` : ''}
                </li>
              ))}
              {example.minor - exampleResult.amounts.reduce((a, b) => a + b, 0) > 0 && <li>{t('templates.exampleLeft', { amount: fmt.money(example.minor - exampleResult.amounts.reduce((a, b) => a + b, 0)) })}</li>}
            </ul>
          )}
        </div>
        {issues.length > 0 && (
          <Alert tone="critical" title={t('common.fixErrors')} role="alert">
            <ul>
              {issues.map((i, idx) => (
                <li key={idx}>{i.path === 'lines' && i.code === 'invalidValue' ? t('templates.linesInvalid') : issueMessage(t, fmt, i)}</li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="form__actions">
          <button type="submit" className="btn btn--primary btn--large" disabled={busy}>
            <Icon name="check" />
            {busy ? t('common.saving') : t('templates.save')}
          </button>
          <a className="btn btn--secondary btn--large" href={href(returnTo)}>
            {t('common.cancel')}
          </a>
        </div>
      </form>
    </div>
  )
}

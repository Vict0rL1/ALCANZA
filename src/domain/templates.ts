/**
 * Plantillas con nombre para compras divididas y para distribuir un ingreso
 * (ver docs/FORMULAS.md §28).
 *
 * Una plantilla NUNCA registra movimientos ni aparta dinero: solo rellena el formulario. La
 * persona ve el resultado y lo guarda (o no) con el botón de siempre.
 *
 * Regla de importes (explícita y en unidades menores):
 *  - Importe fijo: tal cual.
 *  - Porcentaje: del total de la compra (o del ingreso), redondeado HACIA ABAJO al céntimo.
 *  - Si los porcentajes suman exactamente 100 % y no hay importes fijos, los céntimos que
 *    sobran del redondeo van a la línea con el porcentaje más alto (la primera si empatan),
 *    para que la división cuadre exacta con el total.
 *  - En cualquier otro caso, lo que sobra queda SIN ASIGNAR y se muestra.
 *  - Si la suma supera el total (o lo que queda por repartir), no se aplica nada.
 *  - Líneas cuya categoría, meta o pago ya no está disponible (archivada, eliminada, pagada)
 *    no se aplican: se avisan y su parte queda sin asignar.
 */
import { categoriesForKind } from './categories'
import { mulDivFloor, sumMinor } from './money'
import { touch, type OpContext, type OpResult } from './operations'
import type { DistributionContext, DistributionLineInput } from './incomeDistribution'
import type { AppData, DistributionTemplateLine, SplitTemplateLine, Template, TemplateAmount } from './types'
import { TEMPLATES_MAX, validateTemplate, type Issue } from './validation'

const fail = (issues: Issue[]): { ok: false; issues: Issue[] } => ({ ok: false, issues })

export type TemplateLineProblem = 'archivedCategory' | 'missingCategory' | 'missingGoal' | 'goalUnavailable' | 'missingSchedule' | 'noOpenPayment'

export interface TemplateAmounts {
  /** Importe de cada línea, en el mismo orden. */
  amounts: number[]
  /** Céntimos de redondeo añadidos a una línea (índice), si aplica. */
  roundingTo: number | null
  roundingMinor: number
}

/** Importes de las líneas según la regla de arriba. `null` si superan el total. */
export function templateAmounts(lines: readonly TemplateAmount[], totalMinor: number): TemplateAmounts | null {
  const amounts = lines.map((a) => (a.mode === 'fixed' ? a.amountMinor : mulDivFloor(totalMinor, a.bps, 10000)))
  const percentSum = sumMinor(lines.map((a) => (a.mode === 'percent' ? a.bps : 0)))
  let roundingTo: number | null = null
  let roundingMinor = 0
  if (percentSum === 10000 && lines.every((a) => a.mode === 'percent')) {
    roundingMinor = totalMinor - sumMinor(amounts)
    if (roundingMinor > 0) {
      let best = 0
      lines.forEach((a, i) => {
        if (a.mode === 'percent' && a.bps > (lines[best] as { bps: number }).bps) best = i
      })
      roundingTo = best
      amounts[best]! += roundingMinor
    }
  }
  if (sumMinor(amounts) > totalMinor) return null
  return { amounts, roundingTo, roundingMinor }
}

export interface ResolvedLine<L> {
  line: L
  amountMinor: number
  problem?: TemplateLineProblem
  /** Distribución: importe reducido a lo que falta en la meta o el pago. */
  cappedFromMinor?: number
}

export interface ResolvedSplit {
  lines: ResolvedLine<SplitTemplateLine>[]
  /** Solo las líneas aplicables (categoría disponible y importe > 0). */
  apply: { categoryId: string; amountMinor: number }[]
  unassignedMinor: number
  rounding: { toCategoryId: string; amountMinor: number } | null
}

/** Vista previa de una plantilla de división para un total. */
export function resolveSplitTemplate(data: Pick<AppData, 'categories'>, tpl: Extract<Template, { kind: 'split' }>, totalMinor: number): ResolvedSplit | { exceeds: true } {
  const computed = templateAmounts(
    tpl.lines.map((l) => l.amount),
    totalMinor,
  )
  if (!computed) return { exceeds: true }
  const active = new Set(categoriesForKind('expense', data.categories))
  const all = new Set(categoriesForKind('expense', data.categories, { includeArchived: true }))
  const lines = tpl.lines.map((line, i): ResolvedLine<SplitTemplateLine> => {
    const amountMinor = computed.amounts[i]!
    if (active.has(line.categoryId)) return { line, amountMinor }
    return { line, amountMinor, problem: all.has(line.categoryId) ? 'archivedCategory' : 'missingCategory' }
  })
  const apply = lines.filter((l) => !l.problem && l.amountMinor > 0).map((l) => ({ categoryId: l.line.categoryId, amountMinor: l.amountMinor }))
  return {
    lines,
    apply,
    unassignedMinor: totalMinor - sumMinor(apply.map((l) => l.amountMinor)),
    rounding: computed.roundingTo !== null ? { toCategoryId: tpl.lines[computed.roundingTo]!.categoryId, amountMinor: computed.roundingMinor } : null,
  }
}

export interface ResolvedDistribution {
  lines: ResolvedLine<DistributionTemplateLine>[]
  apply: DistributionLineInput[]
  unassignedMinor: number
}

/**
 * Vista previa de una plantilla de distribución sobre un ingreso. Los porcentajes son del
 * ingreso; la suma nunca supera lo que queda por repartir. Un pago se resuelve a su primera
 * ocurrencia abierta; cada línea se limita a lo que le falta.
 */
export function resolveDistributionTemplate(
  data: Pick<AppData, 'goals' | 'schedules'>,
  tpl: Extract<Template, { kind: 'distribution' }>,
  context: DistributionContext,
): ResolvedDistribution | { exceeds: true } {
  const computed = templateAmounts(
    tpl.lines.map((l) => l.amount),
    context.incomeMinor,
  )
  if (!computed || sumMinor(computed.amounts) > context.remainingMinor) return { exceeds: true }
  const lines = tpl.lines.map((line, i): ResolvedLine<DistributionTemplateLine> => {
    const wanted = computed.amounts[i]!
    if (line.target.kind === 'goal') {
      const goalId = line.target.goalId
      const need = context.goals.find((g) => g.goal.id === goalId)
      if (!need) return { line, amountMinor: 0, problem: data.goals.some((g) => g.id === goalId) ? 'goalUnavailable' : 'missingGoal' }
      return need.needMinor < wanted ? { line, amountMinor: need.needMinor, cappedFromMinor: wanted } : { line, amountMinor: wanted }
    }
    const scheduleId = line.target.scheduleId
    const payment = context.payments.find((p) => p.scheduleId === scheduleId)
    if (!payment) return { line, amountMinor: 0, problem: data.schedules.some((s) => s.id === scheduleId) ? 'noOpenPayment' : 'missingSchedule' }
    return payment.needMinor < wanted ? { line, amountMinor: payment.needMinor, cappedFromMinor: wanted } : { line, amountMinor: wanted }
  })
  const apply: DistributionLineInput[] = []
  lines.forEach((l) => {
    if (l.problem || l.amountMinor <= 0) return
    if (l.line.target.kind === 'goal') apply.push({ kind: 'goal', amountMinor: l.amountMinor, goalId: l.line.target.goalId })
    else {
      const p = context.payments.find((x) => x.scheduleId === (l.line.target as { scheduleId: string }).scheduleId)!
      apply.push({ kind: 'payment', amountMinor: l.amountMinor, scheduleId: p.scheduleId, occurrenceDate: p.occurrenceDate })
    }
  })
  return { lines, apply, unassignedMinor: context.remainingMinor - sumMinor(apply.map((l) => l.amountMinor)) }
}

/* ------------------------------------------------------------------ */
/* Guardar y eliminar                                                  */
/* ------------------------------------------------------------------ */

export type TemplateDraft = Omit<Template, 'createdAt' | 'updatedAt'>

/** Crea o actualiza (mismo id = misma plantilla). No toca movimientos ni metas. */
export function saveTemplate(data: AppData, draft: TemplateDraft, ctx: OpContext): OpResult<Template> {
  const existing = data.templates.find((t) => t.id === draft.id)
  if (!existing && data.templates.length >= TEMPLATES_MAX) return fail([{ path: 'templates', code: 'tooMany', params: { max: TEMPLATES_MAX } }])
  const template = { ...draft, name: draft.name.trim(), createdAt: existing?.createdAt ?? ctx.now, updatedAt: ctx.now } as Template
  if (existing && JSON.stringify({ ...existing, updatedAt: '' }) === JSON.stringify({ ...template, updatedAt: '' })) return { ok: true, data, value: existing, unchanged: true }
  const issues = validateTemplate(template)
  if (issues.length) return fail(issues)
  const templates = existing ? data.templates.map((t) => (t.id === template.id ? template : t)) : [...data.templates, template]
  return { ok: true, data: touch({ ...data, templates }, ctx.now), value: template }
}

export function deleteTemplate(data: AppData, id: string, ctx: OpContext): OpResult<Template> {
  const template = data.templates.find((t) => t.id === id)
  if (!template) return fail([{ path: 'id', code: 'notFound' }])
  return { ok: true, data: touch({ ...data, templates: data.templates.filter((t) => t.id !== id) }, ctx.now), value: template }
}

export function restoreTemplate(data: AppData, template: Template, ctx: OpContext): OpResult<Template> {
  if (data.templates.some((t) => t.id === template.id)) return { ok: true, data, value: template, unchanged: true }
  return { ok: true, data: touch({ ...data, templates: [...data.templates, template] }, ctx.now), value: template }
}

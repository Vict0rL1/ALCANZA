import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { Language } from './domain/types'
import { I18nContext, createTranslator, useT } from './i18n'
import { usePwaState } from './pwa/register'
import { getStore, useAppState, type SaveStatus } from './state/store'
import { Alert } from './ui/components/common'
import { Icon, type IconName } from './ui/components/Icon'
import { ToastProvider } from './ui/components/Toasts'
import { href, useRoute, type Route } from './ui/router'
import { Afford } from './ui/screens/Afford'
import { Home } from './ui/screens/Home'
import { MovementForm } from './ui/screens/MovementForm'
import { Movements } from './ui/screens/Movements'
import { Setup } from './ui/screens/Setup'

// Pantallas secundarias: se cargan aparte (el service worker las guarda igual para usarlas sin conexión).
const Plan = lazy(() => import('./ui/screens/Plan').then((m) => ({ default: m.Plan })))
const ScheduleForm = lazy(() => import('./ui/screens/ScheduleForm').then((m) => ({ default: m.ScheduleForm })))
const GoalForm = lazy(() => import('./ui/screens/Goals').then((m) => ({ default: m.GoalForm })))
const Favorites = lazy(() => import('./ui/screens/Favorites').then((m) => ({ default: m.Favorites })))
const Trash = lazy(() => import('./ui/screens/Trash').then((m) => ({ default: m.Trash })))
const Settings = lazy(() => import('./ui/screens/Settings').then((m) => ({ default: m.Settings })))
const Reconcile = lazy(() => import('./ui/screens/Reconcile').then((m) => ({ default: m.Reconcile })))
const PeriodBudgetForm = lazy(() => import('./ui/screens/PeriodBudgets').then((m) => ({ default: m.PeriodBudgetForm })))
const PeriodBudgetDetail = lazy(() => import('./ui/screens/PeriodBudgets').then((m) => ({ default: m.PeriodBudgetDetail })))
const WeeklyReview = lazy(() => import('./ui/screens/WeeklyReview').then((m) => ({ default: m.WeeklyReview })))
const BankImport = lazy(() => import('./ui/screens/BankImport').then((m) => ({ default: m.BankImport })))

export function App() {
  const state = useAppState()
  // Antes de configurar, el idioma se elige en la bienvenida; después se guarda en Ajustes.
  const [setupLanguage, setSetupLanguage] = useState<Language>('es')
  const language = state.phase === 'ready' && state.data ? state.data.settings.language : setupLanguage
  const categories = state.phase === 'ready' && state.data ? state.data.categories : undefined
  const translator = useMemo(
    () => createTranslator(language, Object.fromEntries((categories ?? []).map((c) => [`category.${c.id}`, c.name]))),
    [language, categories],
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <I18nContext.Provider value={translator}>
      <ToastProvider>
        <UpdateBanner />
        {state.phase === 'loading' && <Loading />}
        {state.phase === 'corrupt' && <Corrupt raw={state.raw} />}
        {state.phase === 'ready' && !state.data && (
          <>
            {state.storage === 'memory' && <MemoryWarning />}
            <Setup language={setupLanguage} onLanguageChange={setSetupLanguage} />
          </>
        )}
        {state.phase === 'ready' && state.data && <Shell />}
      </ToastProvider>
    </I18nContext.Provider>
  )
}

/** Aviso real de versión nueva (solo aparece si el service worker instaló una). */
function UpdateBanner() {
  const { t } = useT()
  const { update } = usePwaState()
  if (!update) return null
  return (
    <div className="banner banner--info" role="status">
      <Icon name="info" size={18} />
      <span>{t('shell.updateText')}</span>
      <button type="button" className="btn btn--small btn--inverse" onClick={update}>
        {t('shell.updateAction')}
      </button>
    </div>
  )
}

function Loading() {
  const { t } = useT()
  return (
    <main className="center-screen" id="main" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <p role="status">{t('shell.loading')}</p>
    </main>
  )
}

function Corrupt({ raw }: { raw: string }) {
  const { t } = useT()
  const downloadRaw = () => {
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'margen-datos-danados.json'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <main className="center-screen" id="main">
      <div className="card setup__card">
        <Alert tone="critical" title={t('shell.corruptTitle')} role="alert">
          <p>{t('shell.corruptText')}</p>
        </Alert>
        <div className="form__actions form__actions--stack">
          <button type="button" className="btn btn--secondary" onClick={downloadRaw}>
            <Icon name="download" />
            {t('shell.corruptDownload')}
          </button>
          <button type="button" className="btn btn--danger-ghost" onClick={() => void getStore().discardCorrupt()}>
            {t('shell.corruptReset')}
          </button>
        </div>
      </div>
    </main>
  )
}

function MemoryWarning() {
  const { t } = useT()
  return (
    <div className="banner banner--critical" role="alert">
      <Icon name="alert" size={18} />
      <span>
        <strong>{t('shell.memoryTitle')}</strong> {t('shell.memoryText')}
      </span>
    </div>
  )
}

const NAV: { path: string; match: string; key: 'nav.home' | 'nav.movements' | 'nav.plan' | 'nav.settings'; icon: IconName }[] = [
  { path: '/', match: '', key: 'nav.home', icon: 'home' },
  { path: '/movimientos', match: 'movimientos', key: 'nav.movements', icon: 'list' },
  { path: '/plan/calendario', match: 'plan', key: 'nav.plan', icon: 'calendar' },
  { path: '/ajustes', match: 'ajustes', key: 'nav.settings', icon: 'sliders' },
]

function SaveIndicator({ save }: { save: SaveStatus }) {
  const { t } = useT()
  let content: React.ReactNode = null
  if (save.state === 'saving') content = <>{t('save.saving')}</>
  if (save.state === 'saved')
    content = (
      <>
        <Icon name="check" size={16} />
        {t('save.saved')}
      </>
    )
  if (save.state === 'error')
    content = (
      <>
        <Icon name="alert" size={16} />
        {t(save.error === 'quota' ? 'save.error.quota' : save.error === 'unavailable' ? 'save.error.unavailable' : 'save.error.generic')}
      </>
    )
  return (
    <span className={`save-indicator save-indicator--${save.state}`} role="status" aria-live="polite">
      {content}
    </span>
  )
}

function Shell() {
  const { t } = useT()
  const state = useAppState()
  const route = useRoute()
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)

  // Al cambiar de pantalla: foco al título (lectores de pantalla) y scroll arriba o a la sección pedida.
  useEffect(() => {
    if (first.current) {
      // Primera carga (o recién terminada la configuración): empezar arriba, sin mover el foco.
      first.current = false
      window.scrollTo({ top: 0 })
      return
    }
    const section = route.query.get('seccion')
    let frame = 0
    let tries = 0
    const settle = () => {
      const target = section ? document.getElementById(section) : null
      if (target) {
        target.scrollIntoView()
        return
      }
      // Las pantallas que se cargan aparte pueden tardar unos instantes en aparecer.
      if (section && tries++ < 60) {
        frame = requestAnimationFrame(settle)
        return
      }
      const title = document.getElementById('page-title')
      if (!title && tries++ < 60) {
        frame = requestAnimationFrame(settle)
        return
      }
      window.scrollTo({ top: 0 })
      // Si la pantalla ya enfocó un campo (autoFocus), se respeta; si no, el foco va al título.
      const active = document.activeElement
      if (active instanceof HTMLElement && active.matches('input, select, textarea') && mainRef.current?.contains(active)) return
      title?.focus({ preventScroll: true })
    }
    frame = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(frame)
  }, [route.path, route.query])

  if (state.phase !== 'ready' || !state.data) return null
  const data = state.data
  const top = route.segments[0] ?? ''

  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          mainRef.current?.focus()
        }}
      >
        {t('shell.skip')}
      </a>
      {state.storage === 'memory' && <MemoryWarning />}
      {data.isDemo && (
        <div className="banner banner--demo" role="note">
          <Icon name="info" size={18} />
          <span>
            <strong>{t('shell.demoTitle')}</strong> {t('shell.demoText')}
          </span>
          <a className="btn btn--small btn--inverse" href={href('/ajustes?seccion=reset-title')}>
            {t('shell.leaveDemo')}
          </a>
        </div>
      )}
      {state.externalChange && (
        <div className="banner banner--info" role="status">
          <Icon name="info" size={18} />
          <span>{t('shell.externalChange')}</span>
          <button type="button" className="btn btn--small btn--inverse" onClick={() => void getStore().reload()}>
            {t('shell.reload')}
          </button>
        </div>
      )}
      <header className="topbar">
        <a className="brand" href={href('/')}>
          <span className="brand__mark" aria-hidden="true">
            M
          </span>
          <span className="brand__name">Margen</span>
        </a>
        <span className="badge badge--neutral topbar__proto">{t('shell.prototype')}</span>
        <SaveIndicator save={state.save} />
      </header>
      <div className="shell__body">
        <nav className="nav" aria-label={t('nav.aria')}>
          {NAV.map((item) => {
            const active = item.match === top || (item.match === '' && (top === 'alcanza' || top === 'revision'))
            return (
              <a key={item.path} className={`nav__item${active ? ' is-active' : ''}`} href={href(item.path)} aria-current={active ? 'page' : undefined}>
                <Icon name={item.icon} size={22} />
                <span>{t(item.key)}</span>
              </a>
            )
          })}
        </nav>
        <main className="main" id="main" ref={mainRef} tabIndex={-1}>
          <Suspense fallback={null}>
            <Screen route={route} />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function Screen({ route }: { route: Route }) {
  const { t } = useT()
  const [a, b, c] = route.segments
  const key = route.path
  if (!a) return <Home key={key} />
  if (a === 'alcanza') return <Afford key={key} />
  if (a === 'revision') return <WeeklyReview key={`${key}?${route.query.toString()}`} route={route} />
  if (a === 'movimientos' && (b === 'nuevo' || b === 'editar')) return <MovementForm key={`${key}?${route.query.toString()}`} route={route} />
  if (a === 'movimientos' && b === 'importar') return <BankImport key={key} />
  if (a === 'movimientos' && b === 'papelera') return <Trash key={key} />
  if (a === 'movimientos' && b === 'favoritos') return <Favorites key={key} />
  if (a === 'conciliar') return <Reconcile key={`${key}?${route.query.toString()}`} route={route} />
  if (a === 'movimientos') return <Movements key={key} />
  if (a === 'plan' && b === 'programado' && (c === 'nuevo' || c === 'editar')) return <ScheduleForm key={`${key}?${route.query.toString()}`} route={route} />
  if (a === 'plan' && b === 'metas' && (c === 'nueva' || c === 'editar')) return <GoalForm key={`${key}?${route.query.toString()}`} route={route} />
  if (a === 'plan' && b === 'periodos' && (c === 'nuevo' || c === 'editar')) return <PeriodBudgetForm key={key} route={route} />
  if (a === 'plan' && b === 'periodos' && c) return <PeriodBudgetDetail key={key} route={route} />
  if (a === 'plan') return <Plan key={key} route={route} />
  if (a === 'ajustes') return <Settings key={key} />
  return (
    <div className="stack">
      <h1 id="page-title" tabIndex={-1}>
        {t('shell.notFound')}
      </h1>
      <a className="btn btn--primary" href={href('/')}>
        {t('nav.home')}
      </a>
    </div>
  )
}

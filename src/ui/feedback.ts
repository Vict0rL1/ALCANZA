/**
 * «Enviar comentarios» (M2): un correo ya escrito con datos TÉCNICOS (versión, compilación,
 * navegador, modo y pantalla) que la persona ve completo antes de enviarlo desde su app de correo.
 * Las funciones no reciben los datos financieros: no hay forma de que acaben en el texto.
 */

export interface FeedbackInfo {
  version: string
  build: string
  browser: string
  installed: boolean
  screen: string
  viewport: string
  language: string
}

const EMAIL = /^[^\s@?&#/:]+@[^\s@?&#/:]+\.[^\s@?&#/:]+$/

/** Dirección de la compilación (`VITE_FEEDBACK_EMAIL`); si no es un correo válido, ninguna. */
export function feedbackEmail(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return EMAIL.test(s) ? s : null
}

const major = (v: string | undefined) => v?.split('.')[0]

/** «Chrome 141 · Android 14», «Safari 18.5 · iOS 18.5»… o «?» si no se reconoce. */
export function describeBrowser(ua: string): string {
  const m = (re: RegExp) => ua.match(re)?.[1]
  let browser: string | null = null
  if (m(/EdgiOS\/([\d.]+)/) || m(/Edg\/([\d.]+)/)) browser = `Edge ${major(m(/EdgiOS\/([\d.]+)/) ?? m(/Edg\/([\d.]+)/))}`
  else if (m(/CriOS\/([\d.]+)/)) browser = `Chrome ${major(m(/CriOS\/([\d.]+)/))}`
  else if (m(/FxiOS\/([\d.]+)/) || m(/Firefox\/([\d.]+)/)) browser = `Firefox ${major(m(/FxiOS\/([\d.]+)/) ?? m(/Firefox\/([\d.]+)/))}`
  else if (m(/SamsungBrowser\/([\d.]+)/)) browser = `Samsung Internet ${major(m(/SamsungBrowser\/([\d.]+)/))}`
  else if (m(/(?:Headless)?Chrome\/([\d.]+)/)) browser = `Chrome ${major(m(/(?:Headless)?Chrome\/([\d.]+)/))}`
  else if (m(/Version\/([\d.]+).*Safari/)) browser = `Safari ${m(/Version\/([\d.]+).*Safari/)}`

  let os: string | null = null
  const ios = m(/(?:iPhone|CPU) OS ([\d_]+)/)
  if (/iPad/.test(ua) && ios) os = `iPadOS ${ios.replace(/_/g, '.')}`
  else if (ios) os = `iOS ${ios.replace(/_/g, '.')}`
  else if (m(/Android ([\d.]+)/)) os = `Android ${m(/Android ([\d.]+)/)}`
  else if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return [browser, os].filter(Boolean).join(' · ') || '?'
}

/** Cuerpo del correo en el idioma activo (`t` recibe claves `feedback.*`). */
export function feedbackText(info: FeedbackInfo, t: (key: string) => string, errorReport?: string): string {
  const lines = [
    t('feedback.prompt'),
    '',
    '',
    '',
    '—',
    `${t('feedback.version')}: ${info.version}`,
    `${t('feedback.build')}: ${info.build}`,
    `${t('feedback.browser')}: ${info.browser}`,
    `${t('feedback.mode')}: ${t(info.installed ? 'feedback.modeInstalled' : 'feedback.modeBrowser')}`,
    `${t('feedback.screen')}: ${info.screen} (${t('feedback.window')} ${info.viewport})`,
    `${t('feedback.language')}: ${info.language}`,
  ]
  if (errorReport) lines.push('', `${t('feedback.errorsHeading')}:`, errorReport)
  return lines.join('\n')
}

/** `mailto:` con asunto y cuerpo; los saltos de línea como CRLF (RFC 6068). */
export function feedbackMailto(to: string | null, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'))
  return `mailto:${to ?? ''}?subject=${enc(subject)}&body=${enc(body)}`
}

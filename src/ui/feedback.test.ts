import { describe, expect, it } from 'vitest'
import { describeBrowser, feedbackEmail, feedbackMailto, feedbackText, type FeedbackInfo } from './feedback'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
}

describe('M2 · comentarios: navegador', () => {
  it('reconoce los navegadores de la beta sin confundir Chrome, Edge y Safari', () => {
    expect(describeBrowser(UA.iphoneSafari)).toBe('Safari 18.5 · iOS 18.5')
    expect(describeBrowser(UA.iphoneChrome)).toBe('Chrome 141 · iOS 18.5')
    expect(describeBrowser(UA.android)).toBe('Chrome 141 · Android 14')
    expect(describeBrowser(UA.edge)).toBe('Edge 141 · Windows')
    expect(describeBrowser(UA.firefox)).toBe('Firefox 131 · macOS')
    expect(describeBrowser(UA.macSafari)).toBe('Safari 18.5 · macOS')
    expect(describeBrowser('algo raro')).toBe('?')
  })
})

describe('M2 · comentarios: texto y enlace de correo', () => {
  const info: FeedbackInfo = { version: '1.0.0-beta.1', build: 'abc1234', browser: 'Chrome 141 · Android 14', installed: false, screen: '412 × 915', viewport: '412 × 839', language: 'es' }
  const labels = (k: string) => `<${k}>`

  it('lleva versión, compilación, navegador, modo y pantalla; nada más que datos técnicos', () => {
    const text = feedbackText(info, labels)
    for (const v of ['1.0.0-beta.1', 'abc1234', 'Chrome 141 · Android 14', '<feedback.modeBrowser>', '412 × 915', '412 × 839']) expect(text).toContain(v)
    expect(feedbackText({ ...info, installed: true }, labels)).toContain('<feedback.modeInstalled>')
    expect(feedbackText(info, labels, 'Clara 1.0.0-beta.1 (abc1234)\nx · y')).toContain('x · y')
  })

  it('mailto con saltos CRLF codificados; sin dirección configurada, el destinatario queda vacío', () => {
    const url = feedbackMailto('beta@example.com', 'Asunto á', 'a\nb & c')
    expect(url).toBe('mailto:beta@example.com?subject=Asunto%20%C3%A1&body=a%0D%0Ab%20%26%20c')
    expect(feedbackMailto(null, 's', 'b')).toBe('mailto:?subject=s&body=b')
  })

  it('solo acepta una dirección de correo válida desde la compilación', () => {
    expect(feedbackEmail('beta@example.com')).toBe('beta@example.com')
    expect(feedbackEmail('  ')).toBeNull()
    expect(feedbackEmail(undefined)).toBeNull()
    expect(feedbackEmail('javascript:alert(1)')).toBeNull()
    expect(feedbackEmail('a@b.c?bcc=x@y.z')).toBeNull()
  })
})

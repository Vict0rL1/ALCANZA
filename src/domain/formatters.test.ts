import { describe, expect, it } from 'vitest'
import { currencySymbol, formatDate, formatMoney, formatNumber, formatPercent, formatRelativeDate } from './formatters'

/** `Intl` separa símbolo y cifra con un espacio duro en algunos locales. */
const plain = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatMoney (único formateador de dinero)', () => {
  it('ejemplos del master prompt (§2)', () => {
    expect(plain(formatMoney(25000, 'COP', 'es-CO'))).toBe('$ 25.000')
    expect(plain(formatMoney(50000, 'MXN', 'es-MX'))).toBe('$500.00')
    // Decisión 6: Intl y la convención canadiense muestran «$», no «C$».
    expect(plain(formatMoney(50000, 'CAD', 'en-CA'))).toBe('$500.00')
    expect(plain(formatMoney(50000, 'BRL', 'pt-BR'))).toBe('R$ 500,00')
    expect(plain(formatMoney(50000, 'EUR', 'fr-FR'))).toBe('500,00 €')
  })

  it('nunca pasa por flotantes: 0.1 + 0.2 no aparece', () => {
    expect(formatMoney(30, 'CAD', 'en-CA')).toBe('$0.30')
    expect(formatMoney(123456789012, 'CAD', 'en-CA')).toBe('$1,234,567,890.12')
    expect(formatMoney(-1999, 'MXN', 'es-MX', { signDisplay: 'always' })).toBe('-$19.99')
    expect(formatMoney(1999, 'MXN', 'es-MX', { signDisplay: 'always' })).toBe('+$19.99')
  })

  it('modo privado: conserva el símbolo y la posición del locale, oculta todas las cifras', () => {
    expect(plain(formatMoney(123456, 'CAD', 'en-CA', { privacy: true }))).toBe('$-----')
    expect(plain(formatMoney(25000, 'COP', 'es-CO', { privacy: true }))).toBe('$ -----')
    expect(plain(formatMoney(50000, 'CAD', 'fr-CA', { privacy: true }))).toBe('----- $')
    // El signo se conserva (ya lo comunican icono y color); solo se ocultan las cifras.
    expect(plain(formatMoney(-123456, 'EUR', 'fr-FR', { privacy: true }))).toBe('------ €')
    expect(formatMoney(-500, 'MXN', 'es-MX', { privacy: true })).toBe('-$-----')
    expect(formatMoney(123456, 'CAD', 'en-CA', { privacy: true })).not.toMatch(/\d/)
  })

  it('compacto solo para mostrar', () => {
    // El orden símbolo/cifra en notación compacta cambia entre versiones de ICU (Node 22.22 da
    // «1.3 M$» donde otras dan «$1.3 M»): se compara con lo que Intl devuelve en ESTA máquina y,
    // sin depender de la versión, se exige la cifra abreviada y el símbolo.
    const intl = (n: number) => plain(new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }).format(n))
    const big = plain(formatMoney(125000000, 'MXN', 'es-MX', { compact: true }))
    expect(big).toBe(intl(1250000))
    expect(big).toContain('1.3')
    expect(big).toContain('$')
    expect(big).not.toContain('1,250,000')
    expect(plain(formatMoney(95000, 'MXN', 'es-MX', { compact: true }))).toBe(intl(950))
  })

  it('símbolo de la moneda por locale', () => {
    expect(currencySymbol('CAD', 'en-CA')).toBe('$')
    expect(currencySymbol('EUR', 'fr-FR')).toBe('€')
    expect(currencySymbol('BRL', 'pt-BR')).toBe('R$')
  })
})

describe('números, porcentajes y fechas', () => {
  it('formatNumber y formatPercent siguen el locale', () => {
    expect(formatNumber(12345, 'es-MX')).toBe('12,345')
    expect(formatNumber(12345, 'es-ES')).toBe('12.345')
    expect(plain(formatPercent(0.256, 'fr-FR'))).toBe('26 %')
    expect(formatPercent(0.256, 'en-CA')).toBe('26%')
  })

  it('formatDate en los cuatro idiomas y estilos', () => {
    expect(formatDate('2026-10-07', 'es-MX')).toBe('7 oct 2026')
    expect(formatDate('2026-10-07', 'en-CA')).toBe('Oct 7, 2026')
    expect(formatDate('2026-10-07', 'pt-BR')).toBe('7 de out. de 2026')
    expect(formatDate('2026-10-07', 'fr-CA')).toBe('7 oct. 2026')
    expect(formatDate('2026-10-07', 'es-MX', 'iso')).toBe('2026-10-07')
    expect(formatDate('2026-10-07', 'en-CA', 'short')).toBe('2026-10-07')
    expect(formatDate('2026-10-07', 'es-MX', 'medium', { omitYear: true })).toBe('7 oct')
    expect(formatDate('2026-10-07', 'en-CA', 'long', { weekday: true })).toBe('Wednesday, October 7, 2026')
  })

  it('formatRelativeDate: hoy, ayer, mañana, hace N días; lejos devuelve la fecha', () => {
    const today = '2026-10-07'
    expect(formatRelativeDate('2026-10-07', today, 'es')).toBe('hoy')
    expect(formatRelativeDate('2026-10-06', today, 'es')).toBe('ayer')
    expect(formatRelativeDate('2026-10-08', today, 'en')).toBe('tomorrow')
    expect(formatRelativeDate('2026-10-04', today, 'es')).toBe('hace 3 días')
    expect(formatRelativeDate('2026-10-12', today, 'fr')).toBe('dans 5 jours')
    expect(formatRelativeDate('2026-10-04', today, 'pt')).toBe('há 3 dias')
    expect(formatRelativeDate('2026-08-01', today, 'es-MX')).toBe('1 ago')
    expect(formatRelativeDate('2025-08-01', today, 'es-MX')).toBe('1 ago 2025')
  })
})

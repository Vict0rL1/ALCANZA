/** Selector de moneda (§7.7): búsqueda y grupos por región; ≥ 45 monedas. El nombre sigue al idioma y el ejemplo al formato numérico (UX-01). */
import { useMemo, useState } from 'react'
import { currencyName } from '../../../domain/formatters'
import { formatMoney, SUPPORTED_CURRENCIES, type CurrencyGroup } from '../../../domain/money'
import { normalizeText } from '../../../domain/rules'
import type { CurrencyCode } from '../../../domain/types'
import { useT, type MessageKey } from '../../../i18n'
import { SearchBar } from '../../components/base'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'

const GROUPS: CurrencyGroup[] = ['americas', 'europe', 'asiaPacific', 'middleEastAfrica']

export function CurrencyDialog({ current, language, locale, onPick, onClose }: { current: CurrencyCode; language: string; locale: string; onPick: (code: CurrencyCode) => void; onClose: () => void }) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = normalizeText(query)
    return SUPPORTED_CURRENCIES.map((c) => ({ ...c, name: currencyName(c.code, language), sample: formatMoney(123456, c.code, locale) })).filter((c) => !q || normalizeText(`${c.code} ${c.name}`).includes(q))
  }, [query, language, locale])
  return (
    <Dialog open onClose={onClose} title={t('currency.pickTitle')}>
      <SearchBar value={query} onChange={setQuery} label={t('currency.search')} placeholder={t('currency.searchPlaceholder')} clearLabel={t('common.clear')} autoFocus />
      <div className="currency-list" data-testid="currency-list">
        {GROUPS.map((g) => {
          const inGroup = rows.filter((c) => c.group === g)
          if (inGroup.length === 0) return null
          return (
            <section key={g} className="stack-sm">
              <h3 className="settings-toc__group">{t(`currency.group.${g}` as MessageKey)}</h3>
              <ul className="item-list">
                {inGroup.map((c) => (
                  <li key={c.code}>
                    <button type="button" className={`list-row list-row--link currency-row${c.code === current ? ' is-current' : ''}`} aria-pressed={c.code === current} onClick={() => onPick(c.code)}>
                      <span className="currency-row__code">{c.code}</span>
                      <span className="list-row__main">
                        <span className="list-row__title">{c.name}</span>
                        <span className="list-row__subtitle">{c.sample}</span>
                      </span>
                      {c.code === current && <Icon name="check" size={18} />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {rows.length === 0 && <p className="note">{t('currency.noResults')}</p>}
      </div>
    </Dialog>
  )
}

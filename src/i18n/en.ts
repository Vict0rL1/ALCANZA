/**
 * English texts — PREPARED, NOT ENABLED in phase 1.
 * Same keys as `es.ts`; any missing key falls back to Spanish.
 * To finish: translate every key, then add an "English" option in Settings.
 */
import type { es } from './es'

export const en: Partial<Record<keyof typeof es, string>> = {
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.back': 'Back',
  'common.next': 'Continue',
  'common.undo': 'Undo',
  'common.howCalculated': 'How was this calculated?',
  'nav.home': 'Home',
  'nav.movements': 'Transactions',
  'nav.plan': 'Plan',
  'nav.settings': 'Settings',
  'home.availableLabel': 'You can spend',
  'home.addMovement': 'Add transaction',
  'home.canIAfford': 'Can I afford it?',
  'afford.title': 'Can I afford it?',
}

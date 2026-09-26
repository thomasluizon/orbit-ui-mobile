import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import { accountStorageKey } from './account-storage-key'

const STORAGE_KEY = 'orbit_show_general_on_today'

export function readShowGeneralOnToday(): boolean {
  if (typeof localStorage === 'undefined') return false
  return parseShowGeneralOnTodayPreference(localStorage.getItem(accountStorageKey(STORAGE_KEY)))
}

export function writeShowGeneralOnToday(value: boolean): void {
  localStorage.setItem(accountStorageKey(STORAGE_KEY), String(value))
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import { accountStorageKey } from './account-storage-key'

const STORAGE_KEY = 'orbit_show_general_on_today'

export async function readShowGeneralOnToday(): Promise<boolean> {
  return parseShowGeneralOnTodayPreference(await AsyncStorage.getItem(accountStorageKey(STORAGE_KEY)))
}

export async function writeShowGeneralOnToday(value: boolean): Promise<void> {
  await AsyncStorage.setItem(accountStorageKey(STORAGE_KEY), String(value))
}

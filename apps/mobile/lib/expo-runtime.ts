import { isRunningInExpoGo } from 'expo'

export function isExpoGo(): boolean {
  return isRunningInExpoGo()
}

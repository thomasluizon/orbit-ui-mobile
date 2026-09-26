import { useAppToastStore } from '@/stores/app-toast-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { useTourStore } from '@/stores/tour-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { setAccountId } from './account-scope'

export async function startAccountScopedSession(accountId: string | null): Promise<void> {
  setAccountId(accountId)
  await setEngagementPromptAccountScope(accountId)
  await setUIAccountScope(accountId)
  useTourStore.setState(useTourStore.getInitialState())
  useAppToastStore.setState({ currentToast: null, queue: [] })
}

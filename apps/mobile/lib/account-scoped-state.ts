import { useAppToastStore } from '@/stores/app-toast-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { useTourStore } from '@/stores/tour-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { setAccountId } from './account-scope'

export async function startAccountScopedSession(
  accountId: string | null,
  preserveAnonymousDraft = false,
): Promise<void> {
  setAccountId(accountId)
  await setEngagementPromptAccountScope(accountId)
  await setUIAccountScope(accountId)
  if (accountId === null) {
    useOnboardingDraftStore.getState().reset()
  } else {
    if (!preserveAnonymousDraft) await useOnboardingDraftStore.persist.rehydrate()
    useOnboardingDraftStore.getState().setAccountScope(accountId, preserveAnonymousDraft)
  }
  useTourStore.setState(useTourStore.getInitialState())
  useAppToastStore.setState({ currentToast: null, queue: [] })
}

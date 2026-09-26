import { useAppToastStore } from '@/stores/app-toast-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getAccountId, setAccountId } from './account-scope'

let scopeTransition = 0

export async function startAccountScopedSession(
  accountId: string | null,
  preserveAnonymousDraft = false,
): Promise<void> {
  const transition = ++scopeTransition
  setAccountId(accountId)
  const isCurrent = () => transition === scopeTransition && getAccountId() === accountId
  await setEngagementPromptAccountScope(accountId)
  if (!isCurrent()) return
  await setUIAccountScope(accountId)
  if (!isCurrent()) return
  if (accountId === null) {
    useOnboardingDraftStore.getState().reset()
  } else {
    if (!preserveAnonymousDraft) await useOnboardingDraftStore.persist.rehydrate()
    if (!isCurrent()) return
    useOnboardingDraftStore.getState().setAccountScope(accountId, preserveAnonymousDraft)
  }
  if (!isCurrent()) return
  useAppToastStore.setState({ currentToast: null, queue: [] })
}

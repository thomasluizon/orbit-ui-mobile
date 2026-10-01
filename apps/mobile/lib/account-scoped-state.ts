import { useAppToastStore } from '@/stores/app-toast-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { useTourStore } from '@/stores/tour-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getAccountId, setAccountId } from './account-scope'
import { clearCompactedCreatesForUndo } from './offline-mutations'

let scopeTransition = 0

export async function startAccountScopedSession(
  accountId: string | null,
  preserveAnonymousDraft = false,
): Promise<void> {
  const transition = ++scopeTransition
  clearCompactedCreatesForUndo()
  setAccountId(accountId)
  const isCurrent = () => transition === scopeTransition && getAccountId() === accountId
  await setEngagementPromptAccountScope(accountId)
  if (!isCurrent()) return
  await setUIAccountScope(accountId)
  if (!isCurrent()) return
  if (accountId === null) {
    const { onboardingLocallyDone, _hasHydrated } = useOnboardingDraftStore.getState()
    useOnboardingDraftStore.setState({
      ...useOnboardingDraftStore.getInitialState(),
      onboardingLocallyDone,
      _hasHydrated,
    })
  } else {
    if (!preserveAnonymousDraft) await useOnboardingDraftStore.persist.rehydrate()
    if (!isCurrent()) return
    useOnboardingDraftStore.getState().setAccountScope(accountId, preserveAnonymousDraft)
  }
  if (!isCurrent()) return
  useTourStore.setState(useTourStore.getInitialState())
  useAppToastStore.setState({ currentToast: null, queue: [] })
}

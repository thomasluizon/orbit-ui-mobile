import { useChatStore } from '@/stores/chat-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { clearAppNavigationHistory } from './app-navigation-history'
import { setAccountId } from './account-scope'

export function startAccountScopedSession(
  previousAccountId: string | null,
  accountId: string | null,
  preserveAnonymousDraft = false,
): void {
  if (previousAccountId === accountId) return
  setAccountId(accountId)
  setEngagementPromptAccountScope(accountId)
  setUIAccountScope(accountId)
  useChatStore.getState().resetAccountScopedChat()
  clearAppNavigationHistory()
  if (accountId === null) {
    useOnboardingDraftStore.getState().reset()
  } else {
    if (!preserveAnonymousDraft) void useOnboardingDraftStore.persist.rehydrate()
    useOnboardingDraftStore.getState().setAccountScope(accountId, preserveAnonymousDraft)
  }
}

import { useChatStore } from '@/stores/chat-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { setEngagementPromptAccountScope } from '@/stores/referral-prompt-store'
import { useTourStore } from '@/stores/tour-store'
import { setUIAccountScope } from '@/stores/ui-store'
import { clearAppNavigationHistory } from './app-navigation-history'
import { setAccountId } from './account-scope'

export function startAccountScopedSession(previousAccountId: string | null, accountId: string | null): void {
  if (previousAccountId === accountId) return
  setAccountId(accountId)
  setEngagementPromptAccountScope(accountId)
  setUIAccountScope(accountId)
  useChatStore.getState().clearMessages()
  useTourStore.setState(useTourStore.getInitialState())
  clearAppNavigationHistory()
  if (previousAccountId !== null) useOnboardingDraftStore.getState().reset()
}

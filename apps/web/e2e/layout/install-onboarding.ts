import type { Page } from '@playwright/test'
import { getPersistedOnboardingDraft, ONBOARDING_DRAFT_STORAGE_VERSION } from '@orbit/shared/stores'
import { useOnboardingDraftStore } from '../../stores/onboarding-draft-store'

export async function completeInstallOnboarding(page: Page): Promise<void> {
  useOnboardingDraftStore.getState().markOnboardingLocallyDone()
  const persisted = {
    state: getPersistedOnboardingDraft(useOnboardingDraftStore.getState()),
    version: ONBOARDING_DRAFT_STORAGE_VERSION,
  }
  await page.addInitScript((draft) => {
    localStorage.setItem('orbit-onboarding-draft', JSON.stringify(draft))
  }, persisted)
}

import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

describe.each([en, ptBR])('assistant action copy', messages => {
  const surfaces = {
    composerPrompt: messages.shell.composer.placeholder,
    composerInputName: messages.shell.composer.inputLabel,
    emptyHabitList: messages.habits.askAstra,
    habitMenu: messages.habits.actions.rescheduleAstra,
    habitInterpretation: messages.habits.form.askAstra,
    dateInterpretation: messages.habits.form.suggestDate,
    emojiTagAndRescheduleSuggestions: messages.habits.form.askDate,
    habitAnalysis: messages.habits.detail.askAstra,
    goalAnalysis: messages.goals.detail.askAstraEyebrow,
    summaryConversation: messages.summary.askAstra,
    conversationEmptyHeading: messages.chat.empty.title,
    onboardingImport: messages.onboarding.wizard.importButton,
  }

  it.each(Object.entries(surfaces))('keeps %s meaningful without repeating the assistant name', (_surface, text) => {
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text).not.toMatch(/Astra/)
  })
})

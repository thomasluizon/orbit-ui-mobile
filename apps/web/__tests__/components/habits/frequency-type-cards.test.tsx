import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { FrequencyTypeCards } from '@/components/habits/habit-form-fields/frequency-type-cards'

function renderCards(overrides: Partial<Parameters<typeof FrequencyTypeCards>[0]> = {}) {
  const props = {
    isOneTime: false,
    isGeneral: false,
    isFlexible: false,
    onSetOneTime: vi.fn(),
    onSetRecurring: vi.fn(),
    onSetFlexible: vi.fn(),
    onSetGeneral: vi.fn(),
    t: ((key: string) => key) as Parameters<typeof FrequencyTypeCards>[0]['t'],
    ...overrides,
  }
  render(<FrequencyTypeCards {...props} />)
  return props
}

function radio(name: RegExp) {
  return screen.getByRole('radio', { name })
}

describe('FrequencyTypeCards lockedGeneral', () => {
  it('leaves every card enabled when lockedGeneral is null', () => {
    renderCards({ lockedGeneral: null })
    expect(radio(/^habits\.form\.general/)).not.toBeDisabled()
    expect(radio(/^habits\.form\.recurring/)).not.toBeDisabled()
  })

  it('disables the non-general cards when lockedGeneral is true', () => {
    renderCards({ lockedGeneral: true })
    expect(radio(/^habits\.form\.general/)).not.toBeDisabled()
    expect(radio(/^habits\.form\.recurring/)).toBeDisabled()
    expect(radio(/^habits\.form\.flexible/)).toBeDisabled()
    expect(radio(/^habits\.form\.oneTimeTask/)).toBeDisabled()
  })

  it('disables the general card when lockedGeneral is false', () => {
    renderCards({ lockedGeneral: false })
    expect(radio(/^habits\.form\.general/)).toBeDisabled()
    expect(radio(/^habits\.form\.recurring/)).not.toBeDisabled()
  })

  it('does not invoke the handler for a disabled card', () => {
    const props = renderCards({ lockedGeneral: false })
    radio(/^habits\.form\.general/).click()
    expect(props.onSetGeneral).not.toHaveBeenCalled()
  })

  it('does not invoke the handler when the forward arrow steps onto a locked-out general card', () => {
    const props = renderCards({ isFlexible: true, lockedGeneral: false })
    screen.getByRole('button', { name: 'common.next' }).click()
    expect(props.onSetGeneral).not.toHaveBeenCalled()
  })
})

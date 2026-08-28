import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { ControlsMenu } from '@/components/habits/controls-menu'

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

describe('ControlsMenu', () => {
  it('resolves the hide-completed label when completed habits are shown', async () => {
    render(
      <TestIntlProvider locale="en" messages={en}>
        <ControlsMenu
          isSelectMode={false}
          showCompleted
          isFetching={false}
          allCollapsed={false}
          onToggleSelect={vi.fn()}
          onToggleCollapse={vi.fn()}
          onRefresh={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      </TestIntlProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: en.habits.actions.more }))

    expect(
      await screen.findByRole('menuitem', { name: en.habits.hideCompleted }),
    ).toBeInTheDocument()
  })
})

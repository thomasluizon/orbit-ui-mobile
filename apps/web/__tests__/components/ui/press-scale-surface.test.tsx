import type { ReactElement } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, render, screen } from '@testing-library/react'
import { Command } from 'cmdk'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { AnswerBlock } from '@/components/chat/answer-block'
import { CommandRow } from '@/components/command/command-row'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { HabitRow } from '@/components/habits/habit-row'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { HabitRowTrailing } from '@/components/habits/habit-row-trailing'
import { SelectionTray } from '@/components/habits/selection-tray'
import { QuietLink } from '@/components/ui/quiet-link'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { MOTION_SAFE } from '@/__tests__/support/compiled-class-rules'
import { compilePressScaleRules, scaledWhilePressed, type PressScaleRule } from '@/__tests__/support/press-scale-rules'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

function withMessages(node: ReactElement) {
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{node}</NextIntlClientProvider>
}

const parentRing = { hasChildren: true, childProgress: { done: 1, total: 3 }, state: 'empty', isDone: false, canLog: true, onMenuSelect: vi.fn(),
  actions: { onLog: vi.fn(), onUnlog: vi.fn() } as never, onToggleStatus: vi.fn(), completionReadOnly: false, completionStatusUnavailable: false } as const

const tray = { selectedCount: 1, allSelected: false, onSelectAll: vi.fn(), onDeselectAll: vi.fn(), onBulkLog: vi.fn(), onBulkSkip: vi.fn(),
  onBulkMove: vi.fn(), onBulkDelete: vi.fn(), onCancel: vi.fn() }

const controls: [string, () => ReactElement, () => Element][] = [
  ['QuietLink', () => <QuietLink onClick={vi.fn()}>Back</QuietLink>, () => screen.getByRole('button', { name: 'Back' })],
  ['the pricing stay-free link', () => withMessages(<PricingSection profile={null} plans={null} isLoadingPlans isPlansError={false} isOnline trialDaysLeft={null}
    checkoutLoading={null} checkoutError="" discountedAmount={(amount) => amount} onCheckout={vi.fn()} onStayFree={vi.fn()} onRetryPlans={vi.fn()}
    t={((key: string) => key) as never} />), () => screen.getByRole('link', { name: 'upgrade.convert.stayFree' })],
  ['the answer block habit check', () => withMessages(<AnswerBlock definition={{ kind: 'pickList', block: pickListBlockFixture }} />),
    () => document.querySelector('[data-habit-row-control="check"]')!],
  ['the habit row disclosure', () => withMessages(<HabitRow habit={createMockHabit({ title: 'Read' })} structuralColumn hasChildren actions={{ onDetail: vi.fn(), onToggleExpand: vi.fn() }} />),
    () => document.querySelector('[data-habit-row-control="disclosure"]')!],
  ['the habit row selection', () => withMessages(<HabitRow habit={createMockHabit({ title: 'Read' })} structuralColumn selectMode actions={{ onDetail: vi.fn(), onToggleSelection: vi.fn() }} />),
    () => document.querySelector('[data-habit-row-control="selection"]')!],
  ['the habit row check', () => <CheckCircle state="empty" onToggle={vi.fn()} disabled={false} ariaLabel="Log" />, () => screen.getByRole('button', { name: 'Log' })],
  ['the habit row parent ring', () => withMessages(<HabitRowTrailing habit={createMockHabit({ title: 'Parent' })} menuItems={[]} {...parentRing} />),
    () => document.querySelector('[data-habit-row-control="check"]')!],
  ['the habit row menu', () => withMessages(<HabitRowTrailing habit={createMockHabit({ title: 'Parent' })} menuItems={[{ id: 'edit', label: 'Edit' }]} {...parentRing} />),
    () => document.querySelector('[data-habit-row-control="menu"]')!],
  ['a selection tray action', () => withMessages(<SelectionTray {...tray} />), () => screen.getByRole('button', { name: en.habits.bulkBar.log })],
  ['the selection tray select-all', () => withMessages(<SelectionTray {...tray} />), () => screen.getByRole('button', { name: en.common.selectAll })],
  ['the command row', () => <Command><Command.List><CommandRow leading={<span />} label="Morning run" value="morning-run" onSelect={vi.fn()} /></Command.List></Command>,
    () => document.querySelector('[cmdk-item]')!],
  ['the streak badge', () => withMessages(<StreakBadge streak={3} />), () => screen.getByRole('button')],
]

describe('press targets that keep their full size', () => {
  let rules: PressScaleRule[]
  beforeAll(async () => { rules = await compilePressScaleRules() })
  afterEach(cleanup)

  it.each(controls)('scales the surface inside %s and never the target, so a press at its edge keeps its click', (_name, control, find) => {
    render(control())
    const target = find()
    const scaled = scaledWhilePressed(rules, target)
    expect(scaled.map(({ element }) => element), 'the press scales only the surface inside the target').toEqual([target.querySelector(':scope > [data-slot="press-surface"]')])
    expect(scaled.map(({ media }) => media), 'reduced motion removes the press scale').toEqual([[MOTION_SAFE]])
  })
})

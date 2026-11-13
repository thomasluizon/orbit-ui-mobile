import type { ReactElement } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, render, screen } from '@testing-library/react'
import { Command } from 'cmdk'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { CommandRow } from '@/components/command/command-row'
import { SelectionTray } from '@/components/habits/selection-tray'
import { QuietLink } from '@/components/ui/quiet-link'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { MOTION_SAFE } from '@/__tests__/support/compiled-class-rules'
import { compilePressScaleRules, scaledWhilePressed, type PressScaleRule } from '@/__tests__/support/press-scale-rules'

function withMessages(node: ReactElement) {
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{node}</NextIntlClientProvider>
}

const tray = { selectedCount: 1, allSelected: false, onSelectAll: vi.fn(), onDeselectAll: vi.fn(), onBulkLog: vi.fn(), onBulkSkip: vi.fn(),
  onBulkMove: vi.fn(), onBulkDelete: vi.fn(), onCancel: vi.fn() }

const controls: [string, () => ReactElement, () => Element][] = [
  ['QuietLink', () => <QuietLink onClick={vi.fn()}>Back</QuietLink>, () => screen.getByRole('button', { name: 'Back' })],
  ['the pricing stay-free link', () => withMessages(<PricingSection profile={null} plans={null} isLoadingPlans isPlansError={false} isOnline trialDaysLeft={null}
    checkoutLoading={null} checkoutError="" discountedAmount={(amount) => amount} onCheckout={vi.fn()} onStayFree={vi.fn()} onRetryPlans={vi.fn()}
    t={((key: string) => key) as never} />), () => screen.getByRole('link', { name: 'upgrade.convert.stayFree' })],
  ['the selection tray select-all', () => withMessages(<SelectionTray {...tray} />), () => screen.getByRole('button', { name: en.common.selectAll })],
  ['the command row', () => <Command><Command.List><CommandRow leading={<span />} label="Morning run" value="morning-run" onSelect={vi.fn()} /></Command.List></Command>,
    () => document.querySelector('[cmdk-item]')!],
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

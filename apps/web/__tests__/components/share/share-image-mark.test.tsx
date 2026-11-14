import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { MilestoneShareCard, type MilestoneShareVariant } from '@/components/milestone-share/milestone-share-card'
import { ShareCard } from '@/components/share/share-card'

vi.mock('@/components/share/share-card-qr', () => ({ ShareCardQr: ({ value }: { value: string }) => <div data-testid="qr">{value}</div> }))

const IMAGE_OWNERS = ['components/share/share-card.tsx', 'components/milestone-share/milestone-share-card.tsx', 'components/share/share-card-qr.tsx']
const STREAK: MilestoneShareVariant = { kind: 'streak', streak: 30 }
const ACHIEVEMENT: MilestoneShareVariant = { kind: 'achievement', achievementId: 'first_orbit', iconKey: 'first_orbit', rarity: 'Rare' }

function renderInPortuguese(card: React.ReactElement) {
  return render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>{card}</NextIntlClientProvider>)
}

/** The mark of a shared image: one small static face, never the live rig and never a running loop. */
function expectStaticMark(card: HTMLElement) {
  const drawings = card.querySelectorAll('svg')
  expect(drawings).toHaveLength(1)
  expect(drawings[0]).toHaveAttribute('data-asset', 'orbit-mascot')
  expect(drawings[0]).toHaveAttribute('data-orbit-face', 'small')
  expect(drawings[0]).toHaveAttribute('data-orbit-loop', 'still')
  expect(drawings[0]).toHaveAttribute('width', '24')
  expect(drawings[0]!.querySelector('[data-part="moon"]')).toHaveAttribute('fill', 'var(--primary)')
  expect(card.querySelector('[data-asset="orbit-mark"], [data-asset="astra-glyph"]')).toBeNull()
}

afterEach(cleanup)

describe('the mark in a shared image on web', () => {
  it.each(['wrapped', 'progress'] as const)('draws the new static mark and no old mark in the %s share card', (variant) => {
    renderInPortuguese(<ShareCard recap={createMockRecap()} variant={variant} />)
    expectStaticMark(screen.getByTestId('share-card'))
  })

  it('draws the new static mark, the streak eyebrow and the QR line in the streak milestone card', () => {
    renderInPortuguese(<MilestoneShareCard variant={STREAK} referralUrl="https://useorbit.org/r/XY" />)
    const card = screen.getByTestId('milestone-share-card')
    expectStaticMark(card)
    expect(card).toHaveTextContent(ptBR.milestoneShare.streakEyebrow)
    expect(card).toHaveTextContent(ptBR.shareCard.scanToJoin)
    expect(screen.getByTestId('qr')).toHaveTextContent('https://useorbit.org/r/XY')
  })

  it('draws the new static mark and the achievement eyebrow in the achievement milestone card', () => {
    renderInPortuguese(<MilestoneShareCard variant={ACHIEVEMENT} referralUrl="" />)
    const card = screen.getByTestId('milestone-share-card')
    expectStaticMark(card)
    expect(card).toHaveTextContent(ptBR.milestoneShare.achievementEyebrow)
    expect(card).not.toHaveTextContent(ptBR.shareCard.scanToJoin)
  })

  it.each(IMAGE_OWNERS)('%s names no old mark component', (owner) => {
    expect(readFileSync(resolve(process.cwd(), owner), 'utf8')).not.toMatch(/OrbitMark|AstraGlyph|orbit-mark|astra-glyph/)
  })
})

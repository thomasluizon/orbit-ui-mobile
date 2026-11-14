import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ORBIT_SMALL_FACES } from '@orbit/shared/contracts/brand'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { MilestoneShareCard, type MilestoneShareVariant } from '@/components/milestone-share/milestone-share-card'
import { ShareCard } from '@/components/share/share-card'
import { createTokensV2 } from '@/lib/theme'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const IMAGE_OWNERS = ['components/share/share-card.tsx', 'components/milestone-share/milestone-share-card.tsx']
const STREAK: MilestoneShareVariant = { kind: 'streak', streak: 30 }
const ACHIEVEMENT: MilestoneShareVariant = { kind: 'achievement', achievementId: 'first_orbit', iconKey: 'first_orbit', rarity: 'Rare' }
const tokens = createTokensV2('orange', 'dark')

let tree: ReactTestRenderer | null = null

async function renderCard(card: React.ReactElement, testID: string) {
  await testI18n.changeLanguage('pt-BR')
  await renderer.act(() => { tree = renderer.create(card) })
  return tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!
}

const hostsOf = (card: ReactTestInstance) => card.findAll((node) => typeof node.type === 'string')
const textOf = (card: ReactTestInstance) => hostsOf(card).filter((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))

/** The mark of a shared image: one small static face, never the live rig and never a running loop. */
function expectStaticMark(card: ReactTestInstance) {
  const marks = hostsOf(card).filter((node) => node.props.testID === 'orbit-mascot')
  expect(marks).toHaveLength(1)
  expect(marks[0]!.props).toMatchObject({ 'data-orbit-face': 'small', 'data-orbit-loop': 'still', width: 24 })
  const moon = marks[0]!.findAll((node) => typeof node.type === 'string' && node.props.d === ORBIT_SMALL_FACES[24].moon)
  expect(moon).toHaveLength(1)
  expect(moon[0]!.props.fill).toBe(tokens.primary)
  expect(hostsOf(card).some((node) => /orbit-mark|astra-glyph/.test(String(node.props.testID)))).toBe(false)
}

afterEach(async () => {
  await renderer.act(() => { tree?.unmount() })
  tree = null
})

describe('the mark in a shared image on Android', () => {
  it.each(['wrapped', 'progress'] as const)('draws the new static mark and no old mark in the %s share card', async (variant) => {
    expectStaticMark(await renderCard(<ShareCard recap={createMockRecap()} variant={variant} />, 'share-card'))
  })

  it('draws the new static mark and the streak eyebrow in the streak milestone card', async () => {
    const card = await renderCard(<MilestoneShareCard variant={STREAK} referralUrl="https://useorbit.org/r/XY" />, 'milestone-share-card')
    expectStaticMark(card)
    expect(textOf(card)).toContain(ptBR.milestoneShare.streakEyebrow)
  })

  it('draws the new static mark and the achievement eyebrow in the achievement milestone card', async () => {
    const card = await renderCard(<MilestoneShareCard variant={ACHIEVEMENT} referralUrl="" />, 'milestone-share-card')
    expectStaticMark(card)
    expect(textOf(card)).toContain(ptBR.milestoneShare.achievementEyebrow)
  })

  it.each(IMAGE_OWNERS)('%s names no old mark component', (owner) => {
    expect(readFileSync(resolve(process.cwd(), owner), 'utf8')).not.toMatch(/OrbitMark|AstraGlyph|orbit-mark|astra-glyph/)
  })
})

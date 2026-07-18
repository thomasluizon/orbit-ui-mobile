import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const TestRenderer = require('react-test-renderer')

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  find: (predicate: (node: TestNode) => boolean) => TestNode
}

interface TestRoot {
  root: TestNode
  toJSON: () => unknown
}

const mocks = vi.hoisted(() => ({
  profile: null as ReturnType<typeof createMockProfile> | null,
  setHandleMutate: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useSetHandle: () => ({ mutateAsync: mocks.setHandleMutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

const tokensV2Proxy: unknown = new Proxy({}, { get: () => '#111111' })

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensV2Proxy }
})

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: (props: Record<string, unknown>) => React.createElement('PillButton', props),
}))

vi.mock('@/components/ui/app-text-input', () => ({
  AppTextInput: (props: Record<string, unknown>) => React.createElement('AppTextInput', props),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children?: unknown }) =>
    open ? React.createElement('BottomSheetModal', null, children as never) : null,
}))

vi.mock('@/components/ui/icons', () => ({
  Pencil: (props: Record<string, unknown>) => React.createElement('Pencil', props),
}))

import { SocialIdentityBar } from '@/app/social/_components/social-identity-bar'

function createBar(): TestRoot {
  let renderer: TestRoot | undefined
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<SocialIdentityBar />)
  })
  return renderer as TestRoot
}

function findEditButton(root: TestNode): TestNode {
  return root.find(
    (n) =>
      n.props.accessibilityLabel === 'social.identity.editAria' &&
      typeof n.props.onPress === 'function',
  )
}

function findSaveButton(root: TestNode): TestNode {
  return root.find(
    (n) => n.type === 'PillButton' && n.props.accessibilityLabel === 'common.save',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile = createMockProfile({ socialOptIn: true, handle: 'thomas' })
  mocks.setHandleMutate.mockResolvedValue(null)
})

describe('SocialIdentityBar (mobile)', () => {
  it('shows the current handle', () => {
    const tree = createBar()

    const hasHandle = tree.root
      .findAll((n) => n.type === 'Text')
      .some((n) => JSON.stringify(n.props.children ?? '').includes('thomas'))

    expect(hasHandle).toBe(true)
  })

  it('renders nothing when no handle is set', () => {
    mocks.profile = createMockProfile({ socialOptIn: true, handle: null })

    const tree = createBar()

    expect(tree.toJSON()).toBeNull()
  })

  it('opens the sheet and saves a valid new handle', async () => {
    const tree = createBar()

    TestRenderer.act(() => {
      ;(findEditButton(tree.root).props.onPress as () => void)()
    })

    const input = tree.root.find((n) => n.type === 'AppTextInput')
    TestRenderer.act(() => {
      ;(input.props.onChangeText as (value: string) => void)('newhandle')
    })

    await TestRenderer.act(async () => {
      await (findSaveButton(tree.root).props.onPress as () => Promise<void>)()
    })

    expect(mocks.setHandleMutate).toHaveBeenCalledWith('newhandle')
    expect(mocks.showSuccess).toHaveBeenCalledWith('social.editHandle.success')
  })

  it('rejects an invalid handle without calling the mutation', () => {
    const tree = createBar()

    TestRenderer.act(() => {
      ;(findEditButton(tree.root).props.onPress as () => void)()
    })

    const input = tree.root.find((n) => n.type === 'AppTextInput')
    TestRenderer.act(() => {
      ;(input.props.onChangeText as (value: string) => void)('ab')
    })

    TestRenderer.act(() => {
      ;(findSaveButton(tree.root).props.onPress as () => void)()
    })

    expect(mocks.setHandleMutate).not.toHaveBeenCalled()
  })
})

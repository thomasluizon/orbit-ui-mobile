import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

interface TestNode {
  type: unknown
  props: {
    children?: unknown
    onPress?: (...args: unknown[]) => unknown
    accessibilityLabel?: string
    testID?: string
    value?: unknown
    onChangeText?: (...args: unknown[]) => unknown
    [key: string]: unknown
  }
}

interface TestTreeRoot extends TestNode {
  findAllByProps(props: Record<string, unknown>): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const mockPatchProfile = vi.fn()
let mockProfileName = 'Thomas'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { name: mockProfileName },
    patchProfile: mockPatchProfile,
  }),
}))

const mockPerformQueuedApiMutation = vi.fn()

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: (...args: unknown[]) =>
    mockPerformQueuedApiMutation(...args),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? <>{children}</> : null),
}))

import { EditNameSheet } from '@/app/(tabs)/profile/_components/edit-name-sheet'

function findByTestId(tree: TestInstance, testID: string): TestNode {
  const node = tree.root.findAllByProps({ testID }).at(0)
  if (!node) throw new Error(`No node with testID "${testID}"`)
  return node
}

function findByLabel(tree: TestInstance, accessibilityLabel: string): TestNode {
  const node = tree.root
    .findAllByProps({ accessibilityLabel })
    .find((candidate) => typeof candidate.props.onPress === 'function')
  if (!node) throw new Error(`No pressable with label "${accessibilityLabel}"`)
  return node
}

async function renderSheet(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  let tree!: TestInstance
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <EditNameSheet open onClose={onClose} />
      </QueryClientProvider>,
    )
  })
  return { tree, onClose }
}

async function typeAndSave(tree: TestInstance, value: string) {
  await TestRenderer.act(async () => {
    findByTestId(tree, 'edit-name-input').props.onChangeText?.(value)
  })
  await TestRenderer.act(async () => {
    findByLabel(tree, 'common.save').props.onPress?.()
  })
}

describe('EditNameSheet', () => {
  beforeEach(() => {
    mockPatchProfile.mockReset()
    mockPerformQueuedApiMutation.mockReset()
    mockProfileName = 'Thomas'
  })

  it('seeds the field with the current profile name', async () => {
    const { tree } = await renderSheet()

    expect(findByTestId(tree, 'edit-name-input').props.value).toBe('Thomas')
  })

  it('shows the required error and skips the mutation for a whitespace-only name', async () => {
    const { tree } = await renderSheet()

    await typeAndSave(tree, '   ')

    expect(findByTestId(tree, 'edit-name-error').props.children).toBe(
      'profile.editName.required',
    )
    expect(mockPerformQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('shows the tooLong error and skips the mutation for a 51-character name', async () => {
    const { tree } = await renderSheet()

    await typeAndSave(tree, 'a'.repeat(51))

    expect(findByTestId(tree, 'edit-name-error').props.children).toBe(
      'profile.editName.tooLong',
    )
    expect(mockPerformQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('queues the trimmed name, patches optimistically, and closes on success', async () => {
    mockPerformQueuedApiMutation.mockResolvedValue(undefined)
    const { tree, onClose } = await renderSheet()

    await typeAndSave(tree, '  Ana Clara  ')

    expect(mockPerformQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setName',
        scope: 'profile',
        method: 'PUT',
        payload: { name: 'Ana Clara' },
        dedupeKey: 'profile-name',
      }),
    )
    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Ana Clara' })
    expect(onClose).toHaveBeenCalled()
  })

  it('restores the previous name and shows an error when the mutation fails', async () => {
    mockPerformQueuedApiMutation.mockRejectedValue(new Error('boom'))
    const { tree, onClose } = await renderSheet()

    await typeAndSave(tree, 'Ana Clara')

    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Ana Clara' })
    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Thomas' })
    expect(findByTestId(tree, 'edit-name-error')).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
  })
})

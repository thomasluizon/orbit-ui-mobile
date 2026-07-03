import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClientError } from '@orbit/shared/utils'
import { InviteConfirmSheet } from '@/app/social/_components/invite-confirm-sheet'

const mocks = vi.hoisted(() => ({
  previewReturn: {} as Record<string, unknown>,
  sendMutate: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  onClose: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
  }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <>{children}</> : null,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useInvitePreview: () => mocks.previewReturn,
  useSendFriendRequest: () => ({ mutateAsync: mocks.sendMutate, isPending: false }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  find(predicate: (node: TestNode) => boolean): TestNode
  findByType(type: unknown): TestNode
  findAllByType(type: unknown): TestNode[]
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

async function renderTree(element: React.ReactElement): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function sendButton(tree: TestTree): TestNode {
  return tree.root.find(
    (node) => node.type === 'Pressable' && typeof node.props.onPress === 'function',
  )
}

const previewData = {
  handle: 'grace_h',
  displayName: 'Grace Hopper',
  isSelf: false,
  isAlreadyFriend: false,
  hasPendingRequest: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.previewReturn = { data: undefined, isLoading: false, isError: false, error: null }
  mocks.sendMutate.mockResolvedValue({ id: 'fr-1' })
})

describe('InviteConfirmSheet', () => {
  it('shows the loading indicator while the preview is pending', async () => {
    mocks.previewReturn = { data: undefined, isLoading: true, isError: false, error: null }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(tree.root.findByType('ActivityIndicator')).toBeTruthy()
  })

  it('previews the owner and sends a request with the referral code', async () => {
    mocks.previewReturn = { data: previewData, isLoading: false, isError: false, error: null }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)

    expect(textContents(tree)).toEqual(expect.arrayContaining(['Grace Hopper', '@grace_h']))

    await TestRenderer.act(async () => {
      await (sendButton(tree).props.onPress as () => void)()
    })

    expect(mocks.sendMutate).toHaveBeenCalledWith({ referralCode: 'REF123' })
    expect(mocks.showSuccess).toHaveBeenCalledWith('social.addFriend.success')
    expect(mocks.onClose).toHaveBeenCalled()
  })

  it('shows the self-link message for your own invite', async () => {
    mocks.previewReturn = {
      data: { ...previewData, isSelf: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.invite.self']))
  })

  it('shows the already-friends message with the handle', async () => {
    mocks.previewReturn = {
      data: { ...previewData, isAlreadyFriend: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(
      expect.arrayContaining(['social.invite.alreadyFriends({"handle":"grace_h"})']),
    )
  })

  it('shows the pending-request message with the handle', async () => {
    mocks.previewReturn = {
      data: { ...previewData, hasPendingRequest: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(
      expect.arrayContaining(['social.invite.pending({"handle":"grace_h"})']),
    )
  })

  it('shows the unknown-code message on a 404 preview error', async () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(404, null, 'Not found'),
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.invite.unknownCode']))
  })

  it('shows the enable-social message on a 403 preview error', async () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(403, { errorCode: 'SOCIAL_DISABLED' }, 'Forbidden'),
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.optInGate.body']))
  })

  it('shows the generic load error on a non-404 preview error', async () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(500, null, 'Server error'),
    }
    const tree = await renderTree(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.invite.loadError']))
  })
})

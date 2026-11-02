import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConversationImage } from '@/components/chat/conversation-image'
import { storedConversationId, storedTurnId } from '@orbit/shared/test-support/conversation-fixtures'
import { API } from '@orbit/shared/api'
import { API_BASE } from '@/lib/api-base'

const TestRenderer = require('react-test-renderer')
const credentials = vi.hoisted(() => ({ getToken: vi.fn() }))
vi.mock('@/lib/secure-store', () => ({ getToken: credentials.getToken }))
let tree: ReturnType<typeof TestRenderer.create>
afterEach(() => { if (tree) TestRenderer.act(() => tree!.unmount()); tree = undefined; vi.clearAllMocks() })

it('waits for SecureStore and sends the credential in private image headers', async () => {
  let finish!: (token: string) => void
  credentials.getToken.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await TestRenderer.act(() => { tree = TestRenderer.create(<ConversationImage conversationId={storedConversationId} turnId={storedTurnId} style={{ width: 200, height: 192 }} />) })
  expect(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Image')).toHaveLength(0)
  await TestRenderer.act(() => { finish('stored-session-token') })
  const image = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Image')[0]!
  expect(image.props.source).toEqual({ uri: `${API_BASE}${API.chat.conversationImage(storedConversationId, storedTurnId)}`, headers: { Authorization: 'Bearer stored-session-token' }, cache: 'reload' })
})

it('keeps image failures visible and reads the current SecureStore token on retry', async () => {
  credentials.getToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('rotated-token')
  await TestRenderer.act(() => { tree = TestRenderer.create(<ConversationImage conversationId={storedConversationId} turnId={storedTurnId} style={{ width: 200, height: 192 }} />) })
  TestRenderer.act(() => tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Image')[0]!.props.onError())
  expect(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Image')).toHaveLength(0)
  const retry = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => Boolean(node.props.label && node.props.onClick))[0]!
  await TestRenderer.act(() => { retry.props.onClick() })
  expect(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Image')[0]!.props.source.headers.Authorization).toBe('Bearer rotated-token')
})

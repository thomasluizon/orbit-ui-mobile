import { expect, it } from 'vitest'
import { CHAT_BLOCK_KINDS, createChatBlockRegistry } from '../../../packages/shared/src/chat/block-kinds.ts'

it('requires a renderer for every negotiated client kind', () => {
  const renderers = Object.fromEntries(CHAT_BLOCK_KINDS.map(kind => [kind, () => kind]))
  const registry = createChatBlockRegistry(renderers)
  expect(Object.keys(registry)).toEqual([...CHAT_BLOCK_KINDS])
  for (const kind of CHAT_BLOCK_KINDS) {
    expect(registry[kind]()).toBe(kind)
    const incomplete = { ...renderers }
    delete incomplete[kind]
    expect(() => createChatBlockRegistry(incomplete)).toThrow(`Missing chat block renderer: ${kind}`)
  }
})

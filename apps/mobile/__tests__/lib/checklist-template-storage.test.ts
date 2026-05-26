import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
} from '@orbit/shared/utils'
import { clearChecklistTemplates } from '@/lib/checklist-template-storage'

const storage = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
  },
}))

describe('checklist template storage', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('clears both current and legacy keys', async () => {
    storage.set(CHECKLIST_TEMPLATE_STORAGE_KEY, JSON.stringify([{ id: '1', name: 'A', items: [] }]))
    storage.set(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY, JSON.stringify([{ id: '2', name: 'B', items: [] }]))

    await clearChecklistTemplates()

    expect(storage.has(CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(false)
    expect(storage.has(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(false)
  })
})

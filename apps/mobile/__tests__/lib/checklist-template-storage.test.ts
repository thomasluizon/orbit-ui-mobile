import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
  clearChecklistTemplates,
  loadChecklistTemplates,
  saveChecklistTemplates,
} from '@/lib/checklist-template-storage'

describe('checklist template storage', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('saves and loads templates from the current storage key', async () => {
    const templates = [
      { id: 'template-1', name: 'Morning', items: ['Wake up', 'Stretch'] },
    ]

    await saveChecklistTemplates(templates)
    const loaded = await loadChecklistTemplates()

    expect(loaded).toEqual(templates)
    expect(storage.get(CHECKLIST_TEMPLATE_STORAGE_KEY)).toBeTruthy()
  })

  it('migrates legacy stored templates to the current key', async () => {
    const legacyTemplates = [
      { id: 'template-2', name: 'Travel', items: ['Passport', 'Wallet'] },
    ]

    storage.set(
      LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
      JSON.stringify(legacyTemplates),
    )

    const loaded = await loadChecklistTemplates()

    expect(loaded).toEqual(legacyTemplates)
    expect(storage.get(CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(
      JSON.stringify(legacyTemplates),
    )
    expect(storage.has(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(false)
  })

  it('falls back to legacy templates when the current key is corrupted', async () => {
    const legacyTemplates = [
      { id: 'template-3', name: 'Packing', items: ['Passport', 'Keys'] },
    ]

    storage.set(CHECKLIST_TEMPLATE_STORAGE_KEY, '{not valid json')
    storage.set(
      LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
      JSON.stringify(legacyTemplates),
    )

    const loaded = await loadChecklistTemplates()

    expect(loaded).toEqual(legacyTemplates)
    expect(storage.get(CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe('{not valid json')
    expect(storage.get(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(
      JSON.stringify(legacyTemplates),
    )
  })

  it('clears both current and legacy keys', async () => {
    storage.set(CHECKLIST_TEMPLATE_STORAGE_KEY, JSON.stringify([{ id: '1', name: 'A', items: [] }]))
    storage.set(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY, JSON.stringify([{ id: '2', name: 'B', items: [] }]))

    await clearChecklistTemplates()

    expect(storage.has(CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(false)
    expect(storage.has(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyChecklistTemplate,
  createChecklistTemplate,
  deleteChecklistTemplate,
  resolveChecklistTemplates,
} from '../utils/checklist-templates'

describe('resolveChecklistTemplates', () => {
  it('prefers current templates when present', () => {
    const current = JSON.stringify([{ id: '1', name: 'Current', items: ['A'] }])
    const legacy = JSON.stringify([{ id: '2', name: 'Legacy', items: ['B'] }])

    expect(resolveChecklistTemplates(current, legacy)).toEqual({
      templates: [{ id: '1', name: 'Current', items: ['A'] }],
      shouldMigrateLegacy: false,
    })
  })

  it('falls back to legacy templates and marks them for migration when current is missing', () => {
    const legacy = JSON.stringify([{ id: '2', name: 'Legacy', items: ['B'] }])

    expect(resolveChecklistTemplates(null, legacy)).toEqual({
      templates: [{ id: '2', name: 'Legacy', items: ['B'] }],
      shouldMigrateLegacy: true,
    })
  })

  it('falls back to legacy templates without migration when current storage is corrupted', () => {
    const legacy = JSON.stringify([{ id: '2', name: 'Legacy', items: ['B'] }])

    expect(resolveChecklistTemplates('{not valid json', legacy)).toEqual({
      templates: [{ id: '2', name: 'Legacy', items: ['B'] }],
      shouldMigrateLegacy: false,
    })
  })
})

describe('checklist template helpers', () => {
  it('creates a checklist template from unchecked items', () => {
    const template = createChecklistTemplate(
      ' Morning ',
      [
        { text: 'Wake up', isChecked: true },
        { text: 'Stretch', isChecked: false },
      ],
      () => 'template-1',
    )

    expect(template).toEqual({
      id: 'template-1',
      name: 'Morning',
      items: ['Wake up', 'Stretch'],
    })
  })

  it('returns null when the template name or items are invalid', () => {
    expect(createChecklistTemplate('', [{ text: 'A', isChecked: false }], () => 'x')).toBeNull()
    expect(createChecklistTemplate('Valid', [], () => 'x')).toBeNull()
  })

  it('applies a template into unchecked checklist items', () => {
    expect(applyChecklistTemplate({
      id: 'template-1',
      name: 'Morning',
      items: ['Wake up', 'Stretch'],
    })).toEqual([
      { text: 'Wake up', isChecked: false },
      { text: 'Stretch', isChecked: false },
    ])
  })

  it('deletes a template by id', () => {
    expect(deleteChecklistTemplate([
      { id: '1', name: 'A', items: ['One'] },
      { id: '2', name: 'B', items: ['Two'] },
    ], '1')).toEqual([
      { id: '2', name: 'B', items: ['Two'] },
    ])
  })
})

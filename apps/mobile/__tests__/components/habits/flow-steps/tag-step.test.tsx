import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { createApiClientError } from '@orbit/shared/utils'
import { buildTags, resetTagStepState, tagStepState, TagStepHarness } from './tag-step-harness'

/** The host shape these tests read. The renderer types name only DOM element types, so the native host names need their own type. */
interface Host {
  type: unknown
  props: {
    [prop: string]: unknown
    testID?: string
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityHint?: string
    accessibilityState?: { selected?: boolean; disabled?: boolean }
    disabled?: boolean
    onPress?: () => unknown
    onChangeText?: (value: string) => void
    style?: unknown
  }
  children: (Host | string)[]
  findAll: (predicate: (node: Host) => boolean) => Host[]
}
interface Root {
  root: Host
  update: (element: React.ReactElement) => void
  unmount: () => void
}

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const copy = { en, 'pt-BR': ptBR } as const
let tree: Root | null = null

function mount(element: React.ReactElement): Root {
  void renderer.act(() => { tree = renderer.create(element) as unknown as Root })
  return tree!
}
const hosts = (root: Root): Host[] => root.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: Host): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('')
const texts = (root: Root) => hosts(root).filter((node) => node.type === 'Text' || node.type === 'AnimatedText').map(textOf)
const pressable = (root: Root, label: string, scope?: string) => {
  const nodes = scope ? root.root.findAll((node) => node.props.testID === scope).flatMap((node) => node.findAll((child) => typeof child.type === 'string')) : hosts(root)
  return nodes.find((node) => typeof node.props.onPress === 'function' && (node.props.accessibilityLabel ?? textOf(node)) === label)
}
const option = (root: Root, label: string) => hosts(root).find((node) => node.props.testID === 'option-card' && node.props.accessibilityLabel === label)
const field = (root: Root, label: string) => hosts(root).find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === label)
const selected = (root: Root) => textOf(hosts(root).find((node) => node.props.testID === 'selected-tags')!)
const quickOptions = (root: Root) => hosts(root).filter((node) => node.props.testID === 'option-card').map((node) => node.props.accessibilityLabel)
const line = (root: Root) => hosts(root).find((node) => node.props.testID === 'question-flow-line')

async function press(node: Host | undefined) {
  expect(node).toBeDefined()
  await renderer.act(async () => { if (!node!.props.disabled) await node!.props.onPress!() })
}
function type(node: Host | undefined, value: string) {
  expect(node).toBeDefined()
  void renderer.act(() => { node!.props.onChangeText!(value) })
}

/** Types the search words and waits the one still frame the rows take before the words apply. */
async function search(root: Root, value: string) {
  type(field(root, en.habits.form.searchTags), value)
  await renderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
}

beforeEach(() => resetTagStepState())
afterEach(() => { if (tree) void renderer.act(() => tree!.unmount()); tree = null })

describe.each(['en', 'pt-BR'] as const)('the tag step on Android in %s', (locale) => {
  const text = copy[locale]
  beforeEach(() => { tagStepState.locale = locale })

  it('asks the question, explains a tag before a choice and offers the free path with no tags', () => {
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    expect(hosts(root).find((node) => node.props.accessibilityRole === 'header')?.props.children).toBe(text.habits.flow.optional.tags)
    expect(texts(root)).toContain(text.habits.flow.tags.lineIntro)
    expect(field(root, text.habits.form.newTag)).toBeDefined()
    expect(quickOptions(root)).toEqual([text.habits.flow.tags.none])
    expect(texts(root)).not.toContain(text.habits.form.noTags)
  })

  it('creates the first tag from the free path and selects it', async () => {
    tagStepState.create.mockResolvedValue({ id: 'created' })
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    type(field(root, text.habits.form.newTag), 'Saúde')
    await press(pressable(root, text.common.add))
    expect(tagStepState.create).toHaveBeenCalledWith({ name: 'Saúde', color: expect.any(String) })
    expect(selected(root)).toBe('created')
  })

  it('asks before it leaves a typed tag name behind, and continues after a discard', async () => {
    const onContinue = vi.fn()
    const root = mount(<TagStepHarness onContinue={onContinue} />)
    type(field(root, text.habits.form.newTag), 'Saúde')
    await press(pressable(root, text.habits.flow.continue))
    expect(onContinue).not.toHaveBeenCalled()
    await press(pressable(root, text.common.discardChangesAction))
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(field(root, text.habits.form.newTag)?.props.value).toBe('')
  })

  it('changes the Orbit line to the items of the pressed tag with no request', async () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    tagStepState.habits = [{ title: 'Run', tags: [{ id: 'tag-0' }] }, { title: 'Swim', tags: [{ id: 'tag-0' }] }]
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(option(root, 'Health'))
    const items = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(['Run', 'Swim'])
    expect(textOf(line(root)!)).toBe(text.habits.flow.tags.lineHas.replace('{tag}', 'Health').replace('{items}', items))
    await press(option(root, 'Mind'))
    expect(textOf(line(root)!)).toBe(text.habits.flow.tags.lineEmpty.replace('{tag}', 'Mind'))
    expect(new Set(tagStepState.habitFilters.map((filters) => JSON.stringify(filters)))).toEqual(new Set(['{}']))
    expect(new Set(tagStepState.habitOptions.map((options) => JSON.stringify(options))), 'the line reads the cache and never fetches it').toEqual(new Set(['{"enabled":false}']))
  })
})

describe('tag selection on Android', () => {
  it('toggles without advancing, continues on its own action, and clears on "No tag"', async () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    const onContinue = vi.fn()
    const root = mount(<TagStepHarness onContinue={onContinue} />)
    await press(option(root, 'Health'))
    expect(selected(root)).toBe('tag-0')
    expect(option(root, 'Health')?.props.accessibilityState?.selected).toBe(true)
    expect(onContinue).not.toHaveBeenCalled()
    await press(hosts(root).find((node) => node.props.testID === 'button-primary-sm'))
    expect(onContinue).toHaveBeenCalledOnce()
    await press(option(root, 'No tag'))
    expect(selected(root)).toBe('')
    expect(onContinue).toHaveBeenCalledTimes(2)
  })

  it('keeps the intro line when no cache holds every habit', async () => {
    tagStepState.tags = buildTags(['Health'])
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(option(root, 'Health'))
    expect(textOf(line(root)!)).toBe(en.habits.flow.tags.lineIntro)
  })

  it('reaches the limit at five, dims the others and shows the neutral limit text once with no upgrade', async () => {
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    const root = mount(<TagStepHarness initialIds={['tag-0', 'tag-1', 'tag-2', 'tag-3']} onContinue={vi.fn()} />)
    await search(root, 'E')
    await press(pressable(root, 'E', 'tag-step-rows'))
    expect(selected(root)).toBe('tag-0,tag-1,tag-2,tag-3,tag-4')
    expect(texts(root).filter((value) => value === en.habits.form.tagLimit)).toHaveLength(1)
    expect(hosts(root).some((node) => node.props.testID === 'tag-limit')).toBe(true)
    expect(field(root, en.habits.form.newTag)?.props.editable, 'no new tag past the limit').toBe(false)
    await search(root, 'F')
    expect(pressable(root, 'F', 'tag-step-rows')?.props.accessibilityState?.disabled).toBe(true)
    expect(texts(root).some((value) => /pro|upgrade/i.test(value))).toBe(false)
  })

  it('shows three quick tags and Sem tag, the selected first, and every tag behind the search', async () => {
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E', 'F'])
    const root = mount(<TagStepHarness initialIds={['tag-5']} onContinue={vi.fn()} />)
    expect(quickOptions(root)).toEqual(['F', 'A', 'B', 'No tag'])
    await press(pressable(root, 'B'))
    expect(quickOptions(root), 'a press never moves the other options').toEqual(['F', 'A', 'B', 'No tag'])
    await press(pressable(root, 'B'))
    await search(root, 'e')
    expect(pressable(root, 'E', 'tag-step-rows')).toBeDefined()
    await search(root, 'zz')
    expect(texts(root)).toContain(en.habits.flow.tags.searchMiss)
  })
})

describe('tag create, rename and delete on Android', () => {
  it('shows the hint beside the field for an empty name and the server name error beside it', async () => {
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.common.add))
    expect(field(root, en.habits.form.newTag)?.props.accessibilityHint).toContain(en.habits.form.tagNameRequired)
    expect(tagStepState.create).not.toHaveBeenCalled()
    tagStepState.create.mockRejectedValue({ errors: { Name: ['Tag must have at most 50 characters'] } })
    type(field(root, en.habits.form.newTag), 'Health')
    await press(pressable(root, en.common.add))
    expect(field(root, en.habits.form.newTag)?.props.accessibilityHint).toContain('Tag must have at most 50 characters')
    expect(selected(root)).toBe('')
  })

  it('renames a tag, shows a server error beside it, and keeps the discard guard for a dirty rename', async () => {
    tagStepState.tags = buildTags(['Health'])
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    await press(pressable(root, `${en.habits.form.editTag}: Health`))
    type(field(root, en.habits.form.tagName), 'Body')
    await press(pressable(root, en.common.cancel, 'tag-step-rows'))
    expect(texts(root)).toContain(en.common.discardChangesTitle)
    await press(pressable(root, en.common.keepEditing))
    tagStepState.update.mockRejectedValueOnce(createApiClientError(500, null, 'Failed'))
    await press(pressable(root, en.common.save))
    expect(texts(root)).toContain(en.toast.errors.server)
    tagStepState.update.mockResolvedValueOnce(undefined)
    await press(pressable(root, en.common.save))
    expect(tagStepState.update).toHaveBeenLastCalledWith({ tagId: 'tag-0', name: 'Body', color: '#7c3aed' })
    expect(field(root, en.habits.form.tagName)).toBeUndefined()
  })

  it.each([409, 500])('shows the server message of a refused delete %i and reports only the unexpected one', async (status) => {
    tagStepState.tags = buildTags(['Health'])
    tagStepState.remove.mockRejectedValue(createApiClientError(status, status === 409 ? { errorCode: 'CONCURRENT_UPDATE_CONFLICT' } : null, 'Failed'))
    const root = mount(<TagStepHarness initialIds={['tag-0']} onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    await press(pressable(root, `${en.habits.form.deleteTag}: Health`))
    const alert = hosts(root).find((node) => node.props.accessibilityRole === 'alert')
    expect(textOf(alert!)).toBe(status === 409 ? en.toast.errors.conflict : en.toast.errors.server)
    expect(selected(root)).toBe('tag-0')
    expect(tagStepState.captureError).toHaveBeenCalledTimes(status === 500 ? 1 : 0)
  })

  it('deletes a tag and removes its row', async () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    tagStepState.remove.mockResolvedValue(undefined)
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    expect(hosts(root).filter((node) => node.props.testID === 'tag-step-row')).toHaveLength(2)
    await press(pressable(root, `${en.habits.form.deleteTag}: Mind`))
    expect(tagStepState.remove).toHaveBeenCalledWith('tag-1')
    tagStepState.tags = buildTags(['Health'])
    void renderer.act(() => root.update(<TagStepHarness onContinue={vi.fn()} />))
    expect(hosts(root).filter((node) => node.props.testID === 'tag-step-row')).toHaveLength(1)
  })
})

describe('tag suggestions in the step on Android', () => {
  const flowState = (root: Root) => hosts(root).find((node) => node.props.testID === 'question-flow-step-optional:tags')
    ?.findAll((node) => node.props.state !== undefined && node.props.size === 96)[0]?.props.state

  it('needs a title before it suggests and stops at the limit', () => {
    const root = mount(<TagStepHarness title=" " onContinue={vi.fn()} />)
    expect(pressable(root, en.habits.form.suggestTags)?.props.accessibilityState?.disabled).toBe(true)
    void renderer.act(() => root.unmount())
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E'])
    const full = mount(<TagStepHarness initialIds={['tag-0', 'tag-1', 'tag-2', 'tag-3', 'tag-4']} onContinue={vi.fn()} />)
    expect(pressable(full, en.habits.form.suggestTags)?.props.accessibilityState?.disabled).toBe(true)
  })

  it('shows Orbit thinking while it runs, then the proposals, and a press creates and selects', async () => {
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: string | null }[] }) => void
    tagStepState.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    void renderer.act(() => { void pressable(root, en.habits.form.suggestTags)!.props.onPress!() })
    expect(flowState(root)).toBe('pensando')
    expect(texts(root)).toContain(en.habits.form.suggestingTags)
    await renderer.act(async () => { complete({ tags: [{ name: 'Reading', color: '#7c3aed', isExisting: false, id: null }] }); await Promise.resolve() })
    expect(flowState(root)).toBe('parado')
    tagStepState.create.mockResolvedValue({ id: 'created' })
    await press(pressable(root, 'Reading'))
    expect(tagStepState.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
    expect(selected(root)).toBe('created')
  })

  it('shows the error of a failed suggestion and goes back to Parado', async () => {
    tagStepState.suggest.mockRejectedValue(createApiClientError(500, null, 'Failed'))
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.form.suggestTags))
    expect(hosts(root).some((node) => node.props.accessibilityRole === 'alert')).toBe(true)
    expect(flowState(root)).toBe('parado')
  })
})

describe('the tag bar on Android', () => {
  const BARE = ['tags', 'tag', 'metas', 'modelos', 'checklist']

  it.each(['en', 'pt-BR'] as const)('never shows a bare system noun as a heading, a label or a row in %s', async (locale) => {
    tagStepState.locale = locale
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E'])
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, copy[locale].habits.flow.tags.manage))
    const names = hosts(root)
      .filter((node) => node.props.accessibilityRole === 'header' || node.props.testID === 'option-card' || node.props.testID === 'question-row' || node.type === 'TextInput')
      .map((node) => String(node.props.accessibilityLabel ?? node.props.children))
    expect(names.length).toBeGreaterThan(5)
    for (const name of names) expect(BARE).not.toContain(name.trim().toLocaleLowerCase())
  })
})

describe('tag step motion on Android', () => {
  it.each([false, true])('fades the line in on a press, still under reduced motion: %s', async (reduced) => {
    tagStepState.reducedMotion = reduced
    tagStepState.tags = buildTags(['Health'])
    tagStepState.habits = []
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(option(root, 'Health'))
    const opacity = (line(root)!.props.style as { opacity?: { value: number } }[]).find((style) => style.opacity)?.opacity
    expect(opacity?.value).toBe(reduced ? 1 : 0)
  })

  it.each([false, true])('keeps the rows still when they show, lets a created tag enter and moves no row for a search, reduced motion: %s', async (reduced) => {
    type Motion = { durationMs: number; definitions: Record<number, { transform: { translateY: number }[] }> }
    tagStepState.reducedMotion = reduced
    tagStepState.tags = buildTags(['Health', 'Mind', 'Body', 'Home'])
    tagStepState.create.mockImplementation(({ name }: { name: string }) => { tagStepState.tags = [...tagStepState.tags, { id: 'created', name, color: '#7c3aed' }]; return Promise.resolve({ id: 'created' }) })
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    const rows = () => hosts(root).filter((node) => node.props.testID === 'tag-step-row')
    expect(rows()[0]!.props.entering, 'a tag already there does not enter').toBeUndefined()
    const { exiting, layout } = rows()[0]!.props as unknown as { layout?: unknown; exiting: Motion }
    expect(exiting.durationMs).toBe(resolveMotionPreset('list-exit', reduced).exitDuration)
    expect(exiting.definitions[100]!.transform[0]!.translateY).toBe(reduced ? 0 : resolveMotionPreset('list-exit', false).shift)
    expect(layout, 'the gap closes at once after the exit, as on web').toBeUndefined()
    type(field(root, en.habits.form.newTag), 'Work')
    await press(pressable(root, en.common.add))
    root.update(<TagStepHarness onContinue={vi.fn()} />)
    const created = rows().find((node) => (node.props.entering as Motion | undefined) !== undefined)
    expect((created?.props.entering as Motion | undefined)?.durationMs, 'a created tag enters').toBe(resolveMotionPreset('list-enter', reduced).enterDuration)
    type(field(root, en.habits.form.searchTags), 'h')
    expect(rows().map((node) => [node.props.exiting, node.props.layout]).flat().every((value) => value === undefined), 'a keystroke moves no row: the rows it hides leave at once').toBe(true)
    await renderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    expect(rows().map((node) => node.props.children).length, 'the words apply after one still frame').toBe(2)
    expect(rows().every((node) => node.props.exiting !== undefined), 'a delete under the same words still fades out').toBe(true)
  })

  it('takes a new snapshot when the rows show again, so a tag created while they were hidden does not enter', async () => {
    tagStepState.tags = buildTags(['Health'])
    tagStepState.create.mockImplementation(({ name }: { name: string }) => { tagStepState.tags = [...tagStepState.tags, { id: 'created', name, color: '#7c3aed' }]; return Promise.resolve({ id: 'created' }) })
    const root = mount(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    await press(pressable(root, en.habits.flow.tags.manage))
    type(field(root, en.habits.form.newTag), 'Mind')
    await press(pressable(root, en.common.add))
    root.update(<TagStepHarness onContinue={vi.fn()} />)
    await press(pressable(root, en.habits.flow.tags.manage))
    const rows = hosts(root).filter((node) => node.props.testID === 'tag-step-row')
    expect(rows).toHaveLength(2)
    expect(rows.every((node) => node.props.entering === undefined)).toBe(true)
  })
})

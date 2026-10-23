import { describe, expect, it, vi } from 'vitest'
import type { PreviewItemTitleProps } from '../chat/pending-operation-card-view'
import { createUsePreviewTitle } from '../hooks/preview-title-core'
import { createHookStateHarness } from '../test-support/hook-state'

function setup() {
  const harness = createHookStateHarness()
  const onSave = vi.fn<(title: string) => Promise<boolean>>().mockResolvedValue(true)
  const onDraftChange = vi.fn()
  const props: PreviewItemTitleProps = {
    title: 'Read', rename: { label: 'Title', disabled: false, onSave, onDraftChange },
  }
  const usePreviewTitle = createUsePreviewTitle({
    useState: harness.useState,
    useRef: <Value>(initial: Value) => harness.useState(() => ({ current: initial }))[0],
  })
  const render = () => harness.render(() => usePreviewTitle(props))
  return { props, render, onSave, onDraftChange }
}

describe('shared preview title', () => {
  it.each(['absent', 'disabled'] as const)('does not edit or save with an %s rename action', async (state) => {
    const context = setup()
    if (state === 'absent') context.props.rename = undefined
    else context.props.rename!.disabled = true
    context.render().start()
    await context.render().save()
    expect(context.render().editing).toBe(false)
    expect(context.onSave).not.toHaveBeenCalled()
  })

  it('tracks draft changes and cancels to the accepted title with focus restored', () => {
    const { render, onDraftChange, onSave } = setup()
    render().start()
    expect(render()).toMatchObject({ editing: true, draft: 'Read', restoreFocus: false })
    render().setDraft('Read books')
    expect(render().draft).toBe('Read books')
    expect(onDraftChange).toHaveBeenLastCalledWith('Read books')
    render().setDraft('Read')
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined)
    render().setDraft('Read books')
    render().cancel()
    expect(render()).toMatchObject({ editing: false, draft: 'Read', restoreFocus: true })
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined)
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each([false, true])('closes an unchanged draft without revision and restores focus only when requested: %s', async (focus) => {
    const { render, onSave, onDraftChange } = setup()
    render().start()
    await render().save(focus)
    expect(render()).toMatchObject({ editing: false, restoreFocus: focus })
    expect(onSave).not.toHaveBeenCalled()
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined)
  })

  it.each([false, true])('revises once across simultaneous submit and blur with focus return %s', async (focus) => {
    const { render, onSave, onDraftChange, props } = setup()
    let finish!: (accepted: boolean) => void
    onSave.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    render().start()
    render().setDraft('Read books')
    const saving = render().save(focus)
    await render().save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Read books')
    expect(render()).toMatchObject({ editing: true, draft: 'Read books' })
    expect(onDraftChange).toHaveBeenLastCalledWith('Read books')
    props.title = 'Read books'
    finish(true)
    await saving
    expect(render()).toMatchObject({ editing: false, draft: 'Read books', restoreFocus: focus })
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined)
    render().start()
    expect(render()).toMatchObject({ editing: true, draft: 'Read books', restoreFocus: false })
  })

  it('retains a refused draft for retry and clears it only after acceptance', async () => {
    const { render, onSave, onDraftChange } = setup()
    onSave.mockResolvedValueOnce(false)
    render().start()
    render().setDraft('Read books')
    await render().save(true)
    expect(render()).toMatchObject({ editing: true, draft: 'Read books', restoreFocus: false })
    expect(onDraftChange).toHaveBeenLastCalledWith('Read books')
    await render().save(true)
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(render()).toMatchObject({ editing: false, restoreFocus: true })
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined)
  })

  it('blocks revision when a title becomes disabled during editing', async () => {
    const { render, props, onSave } = setup()
    render().start()
    render().setDraft('Read books')
    props.rename!.disabled = true
    await render().save()
    expect(onSave).not.toHaveBeenCalled()
    expect(render()).toMatchObject({ editing: true, draft: 'Read books' })
    props.rename!.disabled = false
    await render().save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Read books')
    expect(render().editing).toBe(false)
  })
})

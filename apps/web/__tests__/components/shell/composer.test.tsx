import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'
import { ShellWide } from '@/components/shell/shell-wide'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { useAppToastStore } from '@/stores/app-toast-store'
import { advanceAccountGeneration, advanceSessionEpoch } from '@/lib/session-epoch'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const authSession = vi.hoisted(() => ({ isAuthenticated: true, user: { userId: 'account-a' } }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((select: (session: typeof authSession) => unknown) => select(authSession), { getState: () => authSession }),
}))

const astraCopy = vi.hoisted(() => ({ name: 'nav.astra' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key === 'nav.astra' ? astraCopy.name : key }))

const words = {
  placeholder: 'placeholder sentinel',
  send: 'send sentinel',
  clear: 'clear sentinel',
  paste: 'paste sentinel',
  nothingToPaste: 'empty clipboard sentinel',
  actions: 'actions sentinel',
  suggestionsLabel: 'suggestions sentinel',
}
const voiceWords = {
  start: 'voice start sentinel',
  stop: 'voice stop sentinel',
  recording: 'recording sentinel',
  transcribing: 'transcribing sentinel',
}
const attachWords = {
  file: 'attach file sentinel',
  image: 'attach image sentinel',
  trayLabel: 'tray sentinel',
  remove: (name: string) => `remove sentinel ${name}`,
}

function suggestions(count: 3 | 6): ComposerSuggestions {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `chip-${index}`,
    label: `chip sentinel ${index}`,
    onSelect: vi.fn(),
  }))
  return items as unknown as ComposerSuggestions
}

function props(overrides: Record<string, unknown> = {}): ComposerProps {
  return {
    words,
    value: '',
    onChangeValue: vi.fn(),
    onSend: vi.fn(),
    suggestions: suggestions(3),
    state: 'idle',
    ...overrides,
  } as ComposerProps
}

describe('clipboard composer control', () => {
  beforeEach(() => { authSession.isAuthenticated = true; authSession.user = { userId: 'account-a' } })
  afterEach(() => { vi.unstubAllGlobals(); useAppToastStore.getState().dismissAllToasts() })

  function clipboard(readText = vi.fn().mockResolvedValue('Pasted\nmessage')) {
    vi.stubGlobal('navigator', { clipboard: { readText } })
    return readText
  }

  it.each([en, ptBR])('pastes text, preserves attachments, swaps controls and focuses the end', async messages => {
    const readText = clipboard()
    const onChangeValue = vi.fn()
    const onAttachRemove = vi.fn()
    function ControlledComposer() {
      const [value, setValue] = useState('')
      return <Composer {...props({ value, words: messages.shell.composer,
        onChangeValue: (next: string) => { onChangeValue(next); setValue(next) },
        attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], attachWords, onAttachRemove })} />
    }
    render(<ControlledComposer />)
    expect(readText).not.toHaveBeenCalled()
    const paste = screen.getByRole('button', { name: messages.shell.composer.paste })
    expect(paste.parentElement?.firstElementChild).toBe(paste)
    expect(screen.queryByRole('button', { name: messages.shell.composer.clear })).not.toBeInTheDocument()
    fireEvent.click(paste)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    await waitFor(() => expect(input).toHaveValue('Pasted\nmessage'))
    expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('Pasted\nmessage')
    await waitFor(() => expect(input).toHaveFocus())
    expect(input.selectionStart).toBe(input.value.length)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(screen.queryByRole('button', { name: messages.shell.composer.paste })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.clear }))
    expect(screen.getByRole('button', { name: messages.shell.composer.paste })).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(onAttachRemove).not.toHaveBeenCalled()
    expect(screen.getByText('walk.png')).toBeInTheDocument()
  })

  it.each([en, ptBR])('shows the localized information toast for an empty clipboard', async messages => {
    clipboard(vi.fn().mockResolvedValue(''))
    const onChangeValue = vi.fn()
    render(<Composer {...props({ words: messages.shell.composer, onChangeValue })} />)
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.paste }))
    await waitFor(() => expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({ kind: 'neutral', message: messages.shell.composer.nothingToPaste }))
    expect(onChangeValue).not.toHaveBeenCalled()
  })

  it('does nothing when clipboard reading is refused', async () => {
    const readText = clipboard(vi.fn().mockRejectedValue(new Error('Permission denied')))
    const onChangeValue = vi.fn()
    render(<Composer {...props({ onChangeValue })} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: words.paste })))
    expect(readText).toHaveBeenCalledOnce()
    expect(onChangeValue).not.toHaveBeenCalled()
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('allows a fresh paste after clearing a draft while an older read is pending', async () => {
    let resolveFirst!: (text: string) => void
    const readText = clipboard(vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve })).mockResolvedValue('New clipboard'))
    function ControlledComposer() {
      const [value, setValue] = useState('')
      return <Composer {...props({ value, onChangeValue: setValue })} />
    }
    render(<ControlledComposer />)
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New draft' } })
    fireEvent.click(screen.getByRole('button', { name: words.clear }))
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    await waitFor(() => expect(input).toHaveValue('New clipboard'))
    expect(readText).toHaveBeenCalledTimes(2)
    await act(async () => { resolveFirst('Old clipboard'); await Promise.resolve() })
    expect(input).toHaveValue('New clipboard')
  })

  it.each([{}, { clipboard: {} }])('omits paste when clipboard reading is unavailable', navigator => {
    vi.stubGlobal('navigator', navigator)
    render(<Composer {...props()} />)
    expect(screen.queryByRole('button', { name: words.paste })).not.toBeInTheDocument()
  })

  it.each(['recording', 'transcribing', 'sending', 'offline', 'atLimit'])('omits paste while %s', state => {
    clipboard()
    render(<Composer {...props({ state, limitReason: 'reason', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.queryByRole('button', { name: words.paste })).not.toBeInTheDocument()
  })

  it.each(['text', 'empty'])('discards a pending %s read across account transitions and permits a fresh paste', async result => {
    let resolve!: (text: string) => void
    const readText = clipboard(vi.fn().mockImplementationOnce(() => new Promise<string>(complete => { resolve = complete })).mockResolvedValue('New account text'))
    const onChangeValue = vi.fn()
    render(<Composer {...props({ onChangeValue })} />)
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    act(() => { advanceAccountGeneration(); advanceAccountGeneration() })
    await act(async () => resolve(result === 'text' ? 'Previous account text' : ''))
    expect(onChangeValue).not.toHaveBeenCalled()
    expect(useAppToastStore.getState().currentToast).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    await waitFor(() => expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('New account text'))
    expect(readText).toHaveBeenCalledTimes(2)
  })

  it.each(['signed-out', 'account-b'].flatMap(account => ['text', 'empty'].map(result => ({ account, result }))))(
    'discards pending $result when auth becomes $account before account cleanup', async ({ account, result }) => {
      let resolve!: (text: string) => void
      clipboard(vi.fn(() => new Promise<string>(complete => { resolve = complete })))
      const onChangeValue = vi.fn()
      render(<Composer {...props({ onChangeValue })} />)
      fireEvent.click(screen.getByRole('button', { name: words.paste }))
      authSession.isAuthenticated = account !== 'signed-out'
      authSession.user = { userId: account === 'signed-out' ? 'account-a' : account }
      await act(async () => resolve(result === 'text' ? 'Previous account text' : ''))
      expect(onChangeValue).not.toHaveBeenCalled()
      expect(useAppToastStore.getState().currentToast).toBeNull()
    },
  )

  it('keeps a pending paste through a credential refresh in the same account', async () => {
    let resolve!: (text: string) => void
    clipboard(vi.fn(() => new Promise<string>(complete => { resolve = complete })))
    const onChangeValue = vi.fn()
    render(<Composer {...props({ onChangeValue })} />)
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    act(() => advanceSessionEpoch())
    await act(async () => resolve('Same account text'))
    expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('Same account text')
  })

  it('does not replace a newer draft with a pending clipboard read', async () => {
    let resolve!: (text: string) => void
    clipboard(vi.fn(() => new Promise<string>(complete => { resolve = complete })))
    const onChangeValue = vi.fn()
    const view = render(<Composer {...props({ onChangeValue })} />)
    fireEvent.click(screen.getByRole('button', { name: words.paste }))
    view.rerender(<Composer {...props({ value: 'new draft', onChangeValue })} />)
    await act(async () => resolve('old clipboard'))
    expect(onChangeValue).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('new draft')
  })
})

describe('Composer', () => {
  it.each([false, true].flatMap(withOpener => ['idle', 'sending'].map(state => ({ withOpener, state }))))('uses one send icon with opener=$withOpener in $state', ({ withOpener, state }) => {
    render(<Composer {...props({ state, value: 'Draft', suggestions: [], ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: 'Open conversation' } : {}) })} />)
    const send = screen.getByRole('button', { name: words.send })
    expect(send.textContent).toBe('')
    expect(send.querySelector('[data-asset^="astra-mark"]')).toBeNull()
    expect(send.querySelectorAll('svg')).toHaveLength(1)
    expect(send.querySelector('svg')).toHaveClass('tabler-icon-arrow-up')
  })

  it.each([en, ptBR].flatMap(messages => (['idle', 'atLimit', 'offline', 'sending'] as const).map(state => ({ messages, state }))))(
    'owns the persistent input minimum and inert action reservation before effects while $state', ({ messages, state }) => {
      const configuration = props({ suggestions: [], words: { ...messages.shell.composer,
        placeholder: state === 'atLimit' ? messages.shell.composer.limit.placeholder : messages.shell.composer.placeholder },
        state, limitReason: 'reason', onAttachFile: vi.fn(), attachWords })
      const initial = document.createElement('div')
      initial.innerHTML = renderToString(<Composer {...configuration} />)
      const minimum = initial.querySelector('[data-composer-input-minimum]')!
      expect(minimum).not.toBeNull()
      expect(minimum).toHaveTextContent(messages.shell.composer.inputLabel)
      expect(minimum).toHaveAttribute('aria-hidden', 'true')
      expect(minimum).not.toHaveAttribute('tabindex')
      expect(initial.querySelector('[data-composer-text-action-slot]')).toBeEmptyDOMElement()
      const view = render(<Composer {...configuration} />)
      try {
        const mounted = view.container.querySelector('[data-composer-input-minimum]')!
        expect(mounted.outerHTML).toBe(minimum.outerHTML)
        expect(screen.getAllByRole('textbox')).toHaveLength(1)
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', messages.shell.composer.inputLabel)
        expect(view.container.querySelectorAll('[data-composer-text-action-slot]')).toHaveLength(1)
      } finally { view.unmount() }
    },
  )

  it.each([en, ptBR].flatMap(messages => (['idle', 'atLimit'] as const).map(initialState => ({ messages, initialState }))))('measures the prompt and reserved actions from $initialState through mounted allowance changes', async ({ messages, initialState }) => {
    const readText = vi.fn().mockResolvedValue('Pasted message')
    vi.stubGlobal('navigator', { clipboard: { readText } })
    const onSend = vi.fn()
    const onChangeValue = vi.fn()
    const configuration = props({ suggestions: [], words: messages.shell.composer, onSend, onChangeValue, state: initialState, limitReason: 'reason',
      onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation,
      onAttachFile: vi.fn(), attachWords, attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], onAttachRemove: vi.fn() })
    function Mounted({ configuration }: Readonly<{ configuration: ComposerProps }>) {
      const [value, setValue] = useState('')
      return <Composer {...configuration} value={value} onChangeValue={text => { onChangeValue(text); setValue(text) }} />
    }
    const view = render(<Mounted configuration={configuration} />)
    const field = screen.getByRole('textbox') as HTMLTextAreaElement
    const row = field.closest<HTMLElement>('[data-composer-input-row]')!
    const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
    const textControls = trailing.firstElementChild!
    let width = 380
    Object.assign(field.style, { fontSize: '16px', fontFamily: 'Geist', fontStyle: 'normal', fontWeight: '400',
      paddingInlineStart: '8px', paddingInlineEnd: '8px' })
    Object.assign(row.style, { paddingInlineStart: '4px', paddingInlineEnd: '4px' })
    trailing.style.columnGap = '4px'
    Object.assign((textControls as HTMLElement).style, { minWidth: '48px', columnGap: '4px' })
    const promptWidth = messages === en ? 70.83193969726562 : 92.03193664550781
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '', letterSpacing: '', measureText: () => ({ width: promptWidth }),
    } as unknown as CanvasRenderingContext2D)
    const rowWidth = vi.spyOn(row, 'clientWidth', 'get').mockImplementation(() => width)
    const inputWidth = vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(96)
    const rectangles = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === row) return new DOMRect(16, 17, width, 80)
      if (this.hasAttribute('data-composer-input-minimum')) return new DOMRect(0, 0, promptWidth + 16, 48)
      if (this.hasAttribute('data-open-conversation')) return new DOMRect(20, 21, 77.984375, 48)
      if (this === trailing.lastElementChild) return new DOMRect(220, 45, messages === en ? 133.984375 : 171.609375, 48)
      if (this === textControls) return new DOMRect(120, 45, textControls.children.length === 2 ? 100 : 48, 48)
      return new DOMRect(0, 0, 48, 48)
    })
    try {
      const measure = () => act(() => document.fonts.dispatchEvent(new Event('loadingdone')))
      await measure()
      const reservedSlot = textControls.querySelector('[data-composer-text-action-slot]')!
      expect(reservedSlot).not.toBeNull()
      expect(reservedSlot).toBeEmptyDOMElement()
      expect(row.querySelector('[data-composer-input-minimum]')).toHaveTextContent(messages.shell.composer.inputLabel)
      expect(screen.queryByRole('button', { name: messages.shell.composer.paste })).not.toBeInTheDocument()
      for (const state of ['atLimit', 'idle', 'sending', 'idle'] as const) {
        view.rerender(<Mounted configuration={props({ ...configuration, state, limitReason: 'reason',
          words: { ...messages.shell.composer, placeholder: state === 'atLimit' ? messages.shell.composer.limit.placeholder : messages.shell.composer.placeholder } })} />)
        await measure()
        expect(textControls.querySelector('[data-composer-text-action-slot]')).toBe(reservedSlot)
        expect(reservedSlot).toBeEmptyDOMElement()
        expect(screen.queryByRole('button', { name: messages.shell.composer.paste })).not.toBeInTheDocument()
      }
      width = 568
      await measure()
      expect(textControls.querySelector('[data-composer-text-action-slot]')).toBe(reservedSlot)
      expect(screen.getAllByRole('button', { name: messages.shell.composer.paste })).toHaveLength(1)
      width = 380
      await measure()
      fireEvent.pointerDown(screen.getByRole('button', { name: messages.shell.composer.actions }), { button: 0, ctrlKey: false })
      const menu = await screen.findByRole('menu')
      expect(within(menu).getAllByRole('menuitem')[0]).toHaveAccessibleName(messages.shell.composer.paste)
      expect(within(menu).getAllByRole('menuitem', { name: messages.shell.composer.paste })).toHaveLength(1)
      expect(onChangeValue).not.toHaveBeenCalled()
      fireEvent.click(within(menu).getAllByRole('menuitem')[0]!)
      await waitFor(() => expect(field).toHaveValue('Pasted message'))
      await waitFor(() => expect(field).toHaveFocus())
      expect([field.selectionStart, field.selectionEnd]).toEqual([14, 14])
      expect(readText).toHaveBeenCalledOnce()
      fireEvent.pointerDown(screen.getByRole('button', { name: messages.shell.composer.actions }), { button: 0, ctrlKey: false })
      const clearMenu = await screen.findByRole('menu')
      expect(within(clearMenu).getAllByRole('menuitem')[0]).toHaveAccessibleName(messages.shell.composer.clear)
      expect(within(clearMenu).getAllByRole('menuitem', { name: messages.shell.composer.clear })).toHaveLength(1)
      fireEvent.click(within(clearMenu).getAllByRole('menuitem')[0]!)
      await waitFor(() => expect(field).toHaveValue(''))
      await waitFor(() => expect(field).toHaveFocus())
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0])
      expect(screen.getByText('walk.png')).toBeInTheDocument()
      expect(onChangeValue.mock.calls).toEqual([['Pasted message'], ['']])
      expect(onSend).not.toHaveBeenCalled()
    } finally {
      rectangles.mockRestore(); inputWidth.mockRestore(); rowWidth.mockRestore(); canvas.mockRestore()
      view.unmount(); vi.unstubAllGlobals()
    }
  })

  it.each([en, ptBR])('shows each suggestion action with only the decorative mark', messages => {
    astraCopy.name = messages.nav.astra
    const chips = suggestions(3)
    const view = render(<Composer {...props({ suggestions: chips })} />)
    try {
      const controls = within(screen.getByRole('group', { name: words.suggestionsLabel })).getAllByRole('button')
      for (const [index, control] of controls.entries()) {
        expect(control).toHaveAccessibleName(chips[index]!.label)
        expect(within(control).queryByText(messages.nav.astra, { exact: true })).not.toBeInTheDocument()
        expect(control.querySelectorAll('svg')).toHaveLength(1)
        expect(control.querySelector('svg')).toHaveAttribute('data-asset', 'astra-mark')
        expect(control.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      }
      fireEvent.click(controls[1]!)
      expect(chips[1]!.onSelect).toHaveBeenCalledOnce()
      expect(chips[0]!.onSelect).not.toHaveBeenCalled()
      expect(chips[2]!.onSelect).not.toHaveBeenCalled()
    } finally { astraCopy.name = 'nav.astra'; view.unmount() }
  })

  it.each(['idle', 'sending', 'offline'] as const)(
    'keeps the upward send arrow while composing: %s', state => {
      const view = render(<Composer {...props({ state, value: 'Draft', limitReason: 'reason', onVoice: vi.fn(), voiceWords })} />)
      const send = screen.getByRole('button', { name: words.send })
      expect(send.querySelector('[data-asset="astra-mark"]')).toBeNull()
      expect(send.querySelectorAll('svg')).toHaveLength(1)
      expect(send.lastElementChild).toHaveAttribute('aria-hidden', 'true')
      expect(send.querySelectorAll('.orbit-essential-loading')).toHaveLength(0)
      expect(send).not.toHaveAttribute('aria-busy')
      view.unmount()
    },
  )

  it('keeps live suggestions available near the daily limit', () => {
    render(<Composer {...props({ allowanceReason: 'Daily allowance used', renewalHint: 'Returns tonight', usageMessage: '3 of 5' })} />)
    expect(screen.getByRole('group', { name: words.suggestionsLabel })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /chip sentinel/ })).toHaveLength(3)
  })

  it.each([{ messages: en, label: 'Clear message' }, { messages: ptBR, label: 'Limpar mensagem' }])('localizes the clear name to $label', ({ messages, label }) => {
    render(<Composer {...props({ value: 'draft', words: messages.shell.composer })} />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  it.each(['oi', '   ', '\n'])('shows clear as the first trailing control for typed text %j', value => {
    render(<Composer {...props({ value, onVoice: vi.fn(), voiceWords })} />)
    const clear = screen.getByRole('button', { name: words.clear })
    expect(clear.closest('[data-composer-trailing-controls]')).not.toBeNull()
    expect(clear.parentElement?.firstElementChild).toBe(clear)
  })

  it.each(['idle', 'recording', 'transcribing', 'sending', 'offline', 'atLimit'])('hides clear when empty or unavailable in %s', state => {
    render(<Composer {...props({ state, value: state === 'idle' ? '' : 'draft', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.queryByRole('button', { name: words.clear })).not.toBeInTheDocument()
  })

  it.each([false, true])('clears through value changes and restores focus with an attachment: %s', attached => {
    const onChangeValue = vi.fn()
    const onAttachRemove = vi.fn()
    function ControlledComposer() {
      const [value, setValue] = useState('')
      return <Composer {...props({ value, onChangeValue: (next: string) => { onChangeValue(next); setValue(next) },
        ...(attached ? { attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], attachWords, onAttachRemove } : {}) })} />
    }
    render(<ControlledComposer />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'First\nSecond' } })
    expect(screen.getByRole('button', { name: words.send })).toBeEnabled()
    const clear = screen.getByRole('button', { name: words.clear })
    clear.focus()
    fireEvent.click(clear)
    expect(onChangeValue).toHaveBeenLastCalledWith('')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled()
    expect(screen.queryByRole('button', { name: words.clear })).not.toBeInTheDocument()
    expect(onAttachRemove).not.toHaveBeenCalled()
    if (attached) expect(screen.getByText('walk.png')).toBeInTheDocument()
  })

  it('opens and names its menu from the keyboard without changing the draft', async () => {
    const viewport = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: 1280 >= Number(query.match(/min-width: (\d+)px/)?.[1] ?? Infinity), media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
    const user = userEvent.setup()
    const view = render(<ShellWide items={[]} activeId="hoje" navLabel="Main navigation" astraRow={{ label: 'Astra', onOpen: vi.fn() }} conversationOpen conversationLabel="Astra"
      conversation={<Composer {...props({ value: 'Keep this draft', onVoice: vi.fn(), voiceWords, onAttachImage: vi.fn(), onAttachFile: vi.fn(), attachWords })} />}>
      <h1>Today</h1>
    </ShellWide>)
    const trigger = screen.getByRole('button', { name: words.actions })
    const input = screen.getByRole('textbox')
    act(() => trigger.focus())
    await user.keyboard('{ArrowDown}')
    const menu = await screen.findByRole('menu')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveValue('Keep this draft')
    const rows = within(menu).getAllByRole('menuitem')
    expect(rows.map(row => row.textContent)).toEqual([attachWords.image, attachWords.file])
    await waitFor(() => expect(rows[0]).toHaveFocus())
    for (const row of rows.slice(1)) {
      await user.keyboard('{ArrowDown}')
      expect(row).toHaveFocus()
    }
    await user.keyboard('{Home}')
    expect(rows[0]).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: words.actions })).not.toBeInTheDocument()
    vi.useFakeTimers()
    try {
      const closingUser = userEvent.setup({ delay: null })
      fireEvent.keyDown(rows[0]!, { key: 'Escape' })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
      const tabbing = closingUser.tab()
      await act(async () => { await Promise.resolve() })
      const send = screen.getByRole('button', { name: words.send })
      expect(send).toHaveFocus()
      await act(() => vi.runOnlyPendingTimersAsync())
      await tabbing
      expect(screen.getByRole('button', { name: words.send })).toBe(send)
      expect(send).toHaveFocus()
      expect(input).toHaveValue('Keep this draft')
    } finally {
      view.unmount()
      await act(() => vi.runOnlyPendingTimersAsync())
      vi.useRealTimers()
      viewport.mockRestore()
    }
  })

  it('opens the full attachment name without removing it or changing the draft', async () => {
    const name = 'A long document name '.repeat(15) + '.txt'
    const onAttachRemove = vi.fn()
    render(<Composer {...props({ value: 'Keep this draft', attachWords, onAttachFile: vi.fn(), onAttachRemove,
      attachments: [{ id: 'file', kind: 'file', name }] })} />)
    fireEvent.click(screen.getByRole('button', { name }))
    expect(await screen.findByRole('dialog', { name: attachWords.trayLabel })).toHaveTextContent(name)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft')
    expect(onAttachRemove).not.toHaveBeenCalled()
  })

  it('restores input focus when the composer still owns focus after sending', () => {
    const view = render(<Composer {...props({ state: 'sending' })} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
    view.rerender(<Composer {...props()} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('keeps input focus when a reply begins', () => {
    const view = render(<Composer {...props()} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
    view.rerender(<Composer {...props({ state: 'sending' })} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('keeps focus on the stop control as recording ends in transcription', () => {
    const capability = { onVoice: vi.fn(), voiceWords }
    const view = render(<Composer {...props({ ...capability, state: 'recording' })} autoFocus />)
    const stop = screen.getByRole('button', { name: voiceWords.stop })
    act(() => stop.focus())
    view.rerender(<Composer {...props({ ...capability, state: 'transcribing' })} autoFocus />)
    expect(screen.getByRole('button', { name: voiceWords.stop })).toHaveFocus()
  })

  it('keeps the focused microphone mounted as recording starts', async () => {
    const capability = { onVoice: vi.fn(), voiceWords }
    const view = render(<Composer {...props(capability)} />)
    const primary = screen.getByRole('button', { name: voiceWords.start })
    act(() => primary.focus())
    view.rerender(<Composer {...props({ ...capability, state: 'recording' })} />)
    const stop = screen.getByRole('button', { name: voiceWords.stop })
    expect(stop).toBe(primary)
    expect(stop).toHaveFocus()
    expect(stop).toBeEnabled()
    expect(stop).not.toHaveAttribute('aria-haspopup')
    await userEvent.keyboard('{Enter}')
    expect(capability.onVoice).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('runs the recording clock, freezes it for transcription, and restores the transcript', async () => {
    vi.useFakeTimers()
    const capability = { onVoice: vi.fn(), voiceWords }
    const view = render(<Composer {...props({ ...capability, state: 'recording' })} />)
    try {
      expect(screen.getByText('00:00')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTime(65000))
      expect(screen.getByText('01:05')).toHaveClass('tabular-nums')
      view.rerender(<Composer {...props({ ...capability, state: 'transcribing' })} />)
      expect(screen.queryByText('01:05')).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      view.rerender(<Composer {...props({ ...capability, value: 'voice transcript' })} />)
      expect(screen.getByRole('textbox')).toHaveValue('voice transcript')
      expect(screen.getByRole('textbox')).toBeEnabled()
      view.rerender(<Composer {...props({ ...capability, state: 'recording' })} />)
      expect(screen.getByText('00:00')).toBeInTheDocument()
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })

  it('renders three suggestions in their named group', () => {
    render(<Composer {...props()} />)
    const group = screen.getByRole('group', { name: words.suggestionsLabel })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
  })

  it('remeasures content-hugging suggestions and preserves an evident cut through resize', () => {
    const observers = new Set<() => void>()
    const notifyResize = () => observers.forEach(callback => callback())
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: () => void) { observers.add(callback) }
      observe() {}
      disconnect() { observers.delete(this.callback) }
    })
    const view = render(<Composer {...props()} />)
    try {
      const group = screen.getByRole('group', { name: words.suggestionsLabel })
      const buttons = within(group).getAllByRole('button')
      let available = 288
      let widths = [111, 154, 105]
      vi.spyOn(group.parentElement!, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, available, 48))
      for (const [index, button] of buttons.entries()) {
        button.style.paddingInlineStart = '12px'
        button.style.paddingInlineEnd = '12px'
        vi.spyOn(button.querySelector('[data-suggestion-content]')!, 'getBoundingClientRect')
          .mockImplementation(() => new DOMRect(0, 0, widths[index]! - 24, 20))
      }
      for (const width of [288, 288, 427, 288]) {
        available = width
        act(() => notifyResize())
        expect(group.style.gap).toBe(width === 288 ? '48px' : '8px')
        for (const button of buttons) {
          expect(button.style.maxWidth).toBe(`${width - 32}px`)
          expect(button.style.minWidth).toBe('')
        }
      }
      widths = [180, 200, 160]
      act(() => notifyResize())
      expect(group.style.gap).toBe('8px')
      fireEvent.click(buttons[1]!)
      expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
    } finally {
      view.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('renders no chip row for an empty suggestion list', () => {
    render(<Composer {...props({ suggestions: [] })} />)
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
  })

  it('renders six suggestions', () => {
    render(<Composer {...props({ suggestions: suggestions(6) })} />)
    expect(screen.getAllByText(/chip sentinel/)).toHaveLength(6)
  })

  it('keeps focus in the composer when a selected chip disappears', () => {
    const chips = suggestions(3)
    const view = render(<Composer {...props({ suggestions: chips })} />)
    fireEvent.click(screen.getByRole('button', { name: chips[0]!.label }))
    expect(document.activeElement).toHaveAttribute('data-composer-root')
    view.rerender(<Composer {...props({ suggestions: chips, state: 'sending' })} />)
    expect(document.activeElement).toHaveAttribute('data-composer-root')
  })

  it('selects only the pressed suggestion', () => {
    const chips = suggestions(3)
    render(<Composer {...props({ suggestions: chips })} />)
    fireEvent.click(screen.getByRole('button', { name: chips[1]!.label }))
    expect(chips[1]!.onSelect).toHaveBeenCalledOnce()
    expect(chips[0]!.onSelect).not.toHaveBeenCalled()
    expect(chips[2]!.onSelect).not.toHaveBeenCalled()
  })

  it('reports input changes', () => {
    const onChangeValue = vi.fn()
    render(<Composer {...props({ onChangeValue })} />)
    fireEvent.change(screen.getByRole('textbox', { name: words.placeholder }), { target: { value: 'oi' } })
    expect(onChangeValue).toHaveBeenCalledWith('oi')
  })

  it('gives the focused field one composer-level focus ring', () => {
    render(<Composer {...props()} />)
    const field = screen.getByRole('textbox', { name: words.placeholder })
    field.focus()

    expect(field).toHaveFocus()
    expect(field.closest('[data-composer-input-row]')?.className.split(' ')).toContain('has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)]')
    expect(field.closest('[data-composer-input-row]')?.className.split(' ')).not.toContain('focus-within:outline-2')
    expect(field).toHaveClass('focus-visible:outline-0')
    expect(field.className.split(' ')).not.toContain('focus-visible:outline-2')
  })

  it('gives the menu trigger its own shaped focus ring inside the field', () => {
    render(<Composer {...props({ onAttachFile: vi.fn(), onAttachImage: vi.fn(), onVoice: vi.fn(), attachWords, voiceWords })} />)
    const control = screen.getByRole('button', { name: words.actions })
    control.focus()
    expect(control).toHaveFocus()
    expect(control).toHaveClass('rounded-full')
    expect(control.closest('[data-composer-input-row]')).toBe(screen.getByRole('textbox').closest('[data-composer-input-row]'))
  })

  it.each(['', '   '])('does not send a blank value %j', (value) => {
    const onSend = vi.fn()
    render(<Composer {...props({ value, onSend })} />)
    fireEvent.click(screen.getByRole('button', { name: words.send }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends a nonblank value once', () => {
    const onSend = vi.fn()
    render(<Composer {...props({ value: 'oi', onSend })} />)
    fireEvent.click(screen.getByRole('button', { name: words.send }))
    expect(onSend).toHaveBeenCalledOnce()
  })

  it.each([
    ['idle with an empty field', { state: 'idle', value: '' }, false, true],
    ['idle with text', { state: 'idle', value: 'oi' }, true, false],
    ['idle with an image only', { state: 'idle', attachments: [{ id: 'image-id', kind: 'image', name: 'walk.png' }] }, false, true],
    ['idle with a file only', { state: 'idle', attachments: [{ id: 'file-id', kind: 'file', name: 'notes.txt' }] }, true, false],
    ['sending', { state: 'sending', value: 'oi' }, true, false],
    ['atLimit', { state: 'atLimit', value: 'oi', limitReason: 'limit sentinel' }, false, true],
    ['offline', { state: 'offline', value: 'oi', limitReason: 'offline sentinel' }, false, true],
  ] as const)('styles the send control for %s', (_case, overrides, accented, disabled) => {
    render(<Composer {...props(overrides)} />)
    const send = screen.getByRole('button', { name: words.send })
    if (accented) expect(send).toHaveAttribute('data-accent', '')
    else expect(send).not.toHaveAttribute('data-accent')
    expect(send).toHaveClass(accented ? 'bg-[var(--primary)]' : 'bg-[var(--bg-well)]')
    if (_case === 'idle with an empty field' || _case === 'idle with text') {
      expect(send).toHaveClass('duration-[var(--dur-hover-control)]')
    }
    if (_case === 'idle with text' || _case === 'idle with a file only') {
      expect(send).toHaveClass('enabled:hover:bg-[var(--primary-hover)]')
    }
    expect(send.querySelectorAll('svg')).toHaveLength(1)
    expect(send.querySelectorAll('.orbit-essential-loading')).toHaveLength(0)
    expect(send.querySelector('[data-asset^="astra-mark"]')).toBeNull()
    if (_case === 'sending') expect(send).not.toHaveClass('disabled:opacity-40')
    else if (disabled) expect(send).toHaveClass('disabled:opacity-40')
    if (disabled) expect(send).toBeDisabled()
    else expect(send).toBeEnabled()
  })

  it('requires nonblank text when an image is attached', () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <Composer
        {...props({
          value: '   ',
          onSend,
          onAttachImage: vi.fn(),
          attachWords,
          attachments: [{ id: 'image-id', kind: 'image', name: 'walk.png' }],
          onAttachRemove: vi.fn(),
        })}
      />,
    )
    const send = screen.getByRole('button', { name: words.send })
    expect(send).toBeDisabled()
    fireEvent.click(send)
    expect(onSend).not.toHaveBeenCalled()

    rerender(
      <Composer
        {...props({
          value: 'log my walk',
          onSend,
          onAttachImage: vi.fn(),
          attachWords,
          attachments: [{ id: 'image-id', kind: 'image', name: 'walk.png' }],
          onAttachRemove: vi.fn(),
        })}
      />,
    )
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('keeps input and send enabled and hides suggestions during sending', () => {
    render(<Composer {...props({ state: 'sending', value: 'oi' })} />)
    expect(screen.getByRole('textbox', { name: words.placeholder })).toBeEnabled()
    const send = screen.getByRole('button', { name: words.send })
    expect(send).toBeEnabled()
    expect(send).not.toHaveAttribute('aria-busy')
    expect(send.querySelector('.orbit-essential-loading')).toBeNull()
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
  })

  it('renders only the limit reason above disabled controls without an accent send', () => {
    const { container } = render(<Composer {...props({ state: 'atLimit', limitReason: 'limit sentinel' })} />)
    expect(screen.getByText('limit sentinel')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: words.placeholder })).toBeDisabled()
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled()
    expect(container.querySelector('[data-accent]')).toBeNull()
  })

  it('renders the optional at-limit recovery action', () => {
    render(
      <Composer
        {...props({
          state: 'atLimit',
          limitReason: 'limit sentinel',
          limitRecovery: <button type="button">recovery sentinel</button>,
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'recovery sentinel' })).toBeInTheDocument()
  })

  it.each([en, ptBR])('places supported voice in the primary slot and swaps it for send as text changes', messages => {
    const onVoice = vi.fn()
    const onSend = vi.fn()
    function ControlledComposer() {
      const [value, setValue] = useState('')
      return <Composer {...props({ value, onChangeValue: setValue, words: messages.shell.composer,
        onVoice, voiceWords: messages.shell.composer.voice, onSend })} />
    }
    render(<ControlledComposer />)
    const microphone = screen.getByRole('button', { name: messages.shell.composer.voice.start })
    expect(microphone.closest('[data-composer-trailing-controls]')?.lastElementChild).toBe(microphone)
    expect(screen.queryByRole('button', { name: messages.shell.composer.send })).not.toBeInTheDocument()
    fireEvent.click(microphone)
    expect(onVoice).toHaveBeenCalledOnce()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'A new message' } })
    expect(screen.queryByRole('button', { name: messages.shell.composer.voice.start })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.send }))
    expect(onSend).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: messages.shell.composer.voice.start })).toBeEnabled()
  })

  it('keeps photo and document in the attachment sheet without a voice row', async () => {
    render(<Composer {...props({ onVoice: vi.fn(), voiceWords, onAttachFile: vi.fn(), onAttachImage: vi.fn(), attachWords })} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: words.actions }), { button: 0, ctrlKey: false })
    await screen.findByRole('menu')
    expect(screen.getByRole('menuitem', { name: attachWords.image })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: attachWords.file })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: voiceWords.start })).not.toBeInTheDocument()
  })

  it('keeps send when recording is unsupported or a text file is ready to send', () => {
    const { rerender } = render(<Composer {...props()} />)
    expect(screen.queryByRole('button', { name: voiceWords.start })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled()
    const onSend = vi.fn()
    rerender(<Composer {...props({ onVoice: vi.fn(), voiceWords, onSend, onAttachFile: vi.fn(), attachWords,
      attachments: [{ id: 'file', kind: 'file', name: 'notes.txt' }], onAttachRemove: vi.fn() })} />)
    expect(screen.queryByRole('button', { name: voiceWords.start })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: words.send }))
    expect(onSend).toHaveBeenCalledOnce()
  })

  it.each([
    ['idle', true], ['atLimit', true], ['offline', false], ['sending', false],
  ] as const)('preserves voice availability while %s', (state, enabled) => {
    const onVoice = vi.fn()
    render(<Composer {...props({ state, limitReason: 'reason', value: '  ', onVoice, voiceWords,
      errorMessage: 'Recording failed', onAttachImage: vi.fn(), attachWords,
      attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], onAttachRemove: vi.fn() })} />)
    const microphone = screen.getByRole('button', { name: voiceWords.start })
    expect(microphone).toHaveProperty('disabled', !enabled)
    expect(screen.getByRole('alert')).toHaveTextContent('Recording failed')
    fireEvent.click(microphone)
    expect(onVoice).toHaveBeenCalledTimes(enabled ? 1 : 0)
  })

  it('replaces suggestions with recording status and a stop control', () => {
    render(<Composer {...props({ state: 'recording', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.getByText(voiceWords.recording)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: voiceWords.stop })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: words.send })).not.toBeInTheDocument()
  })

  it('keeps the stop control and shows the connection reason during an offline recording', () => {
    const onVoice = vi.fn()
    render(<Composer {...props({ state: 'recording', words: { ...words, placeholder: en.shell.composer.offline.placeholder, offlineReason: en.shell.composer.offline.reason }, onVoice, voiceWords })} />)
    expect(screen.getByText(voiceWords.recording)).toBeVisible()
    expect(screen.getByText(en.shell.composer.offline.reason)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: voiceWords.stop }))
    expect(onVoice).toHaveBeenCalledOnce()
  })

  it('replaces the input with transcribing status and a neutral inactive stop', () => {
    render(<Composer {...props({ state: 'transcribing', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.getByText(voiceWords.transcribing)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: voiceWords.stop })).toBeDisabled()
    expect(screen.getByRole('button', { name: voiceWords.stop })).toHaveClass('bg-transparent')
  })

  it('opens a sheet menu and dispatches each attachment after dismissal without changing the draft', async () => {
    const onAttachFile = vi.fn()
    const onAttachImage = vi.fn()
    render(<Composer {...props({ value: 'Keep this draft', onAttachFile, onAttachImage, attachWords })} />)
    expect(screen.queryByLabelText(attachWords.trayLabel)).not.toBeInTheDocument()
    for (const [name, handler] of [[attachWords.image, onAttachImage], [attachWords.file, onAttachFile]] as const) {
      fireEvent.pointerDown(screen.getByRole('button', { name: words.actions }), { button: 0, ctrlKey: false })
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('menuitem', { name }))
      await waitFor(() => expect(handler).toHaveBeenCalledOnce())
      expect(screen.getByRole('textbox')).toHaveValue('Keep this draft')
    }
  })

  it('allows a text file to send without typed text', () => {
    const onSend = vi.fn()
    render(
      <Composer
        {...props({
          value: '   ',
          onSend,
          onAttachFile: vi.fn(),
          attachWords,
          attachments: [{ id: 'file-id', kind: 'file', name: 'notes.txt' }],
          onAttachRemove: vi.fn(),
        })}
      />,
    )
    const send = screen.getByRole('button', { name: words.send })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('names, distinguishes, and removes each attachment independently', () => {
    const onAttachRemove = vi.fn()
    const attachments = [
      { id: 'file-id', kind: 'file' as const, name: 'notes.txt' },
      { id: 'image-id', kind: 'image' as const, name: 'walk.png' },
    ]
    const { container } = render(
      <Composer
        {...props({ onAttachFile: vi.fn(), attachWords, attachments, onAttachRemove })}
      />,
    )
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('walk.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: attachWords.remove('notes.txt') })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: attachWords.remove('walk.png') }))
    expect(onAttachRemove).toHaveBeenCalledOnce()
    expect(onAttachRemove).toHaveBeenCalledWith('image-id')
    expect(container.querySelector('[data-attachment-kind="file"]')).toBeInTheDocument()
    expect(container.querySelector('[data-attachment-kind="image"]')).toBeInTheDocument()
  })

  it('renders and invokes retry only when present', () => {
    const onRetry = vi.fn()
    const retryWords = { ...words, retry: 'retry sentinel' }
    const { rerender } = render(<Composer {...props({ words: retryWords, onRetry })} />)
    fireEvent.click(screen.getByRole('button', { name: retryWords.retry }))
    expect(onRetry).toHaveBeenCalledOnce()
    rerender(<Composer {...props()} />)
    expect(screen.queryByRole('button', { name: retryWords.retry })).not.toBeInTheDocument()
  })

  it('uses the placeholder word as both placeholder and accessible name', () => {
    render(<Composer {...props()} />)
    expect(screen.getByPlaceholderText(words.placeholder)).toHaveAccessibleName(words.placeholder)
  })

  it.each([
    ['pt-BR', ptBR.shell.composer.placeholder, 'O que você quer fazer?'],
    ['en', en.shell.composer.placeholder, 'What would you like to do?'],
  ])('shows the %s composer placeholder', (_locale, placeholder, expected) => {
    render(<Composer {...props({ words: { ...words, placeholder } })} />)
    expect(placeholder).toBe(expected)
    expect(screen.getByRole('textbox', { name: placeholder })).toHaveAttribute('placeholder', expected)
  })

  it.each([
    ['pt-BR', ptBR.shell.composer.offline, 'Sem conexão', 'Sem conexão. A Astra volta quando a conexão voltar.'],
    ['en', en.shell.composer.offline, 'No connection', 'No connection. Astra comes back when the connection does.'],
  ])('shows the %s offline composer copy', (_locale, offline, placeholder, reason) => {
    render(<Composer {...props({ state: 'offline', words: { ...words, placeholder: offline.placeholder, inputLabel: 'Ask Astra for something' }, limitReason: offline.reason })} />)
    expect(screen.getByRole('textbox', { name: 'Ask Astra for something' })).toHaveAttribute('placeholder', placeholder)
    expect(screen.getByText(reason)).toBeInTheDocument()
  })

  it.each(['idle', 'sending', 'recording', 'transcribing', 'atLimit'] as const)(
    'exposes the %s state without false boolean attributes',
    (state) => {
      const stateProps = state === 'atLimit'
        ? { state, limitReason: 'limit sentinel' }
        : state === 'recording' || state === 'transcribing'
          ? { state, onVoice: vi.fn(), voiceWords }
          : { state }
      const { container } = render(<Composer {...props(stateProps)} />)
      const root = container.querySelector(`[data-state="${state}"]`)
      expect(root).toBeInTheDocument()
      expect(root).not.toHaveAttribute('data-has-attachments', 'false')
      expect(root).not.toHaveAttribute('data-can-retry', 'false')
    },
  )
  it.each(['sending', 'offline', 'atLimit'] as const)('prevents attachment selection while %s', (state) => {
    const onAttachFile = vi.fn()
    const onAttachImage = vi.fn()
    const statuses = { sending: { state: 'sending' }, offline: { state: 'offline', limitReason: 'offline sentinel' }, atLimit: { state: 'atLimit', limitReason: 'limit sentinel' } } as const
    render(<Composer {...props({ ...statuses[state], onAttachFile, onAttachImage, attachWords })} />)
    const trigger = screen.getByRole('button', { name: words.actions })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(onAttachFile).not.toHaveBeenCalled()
    expect(onAttachImage).not.toHaveBeenCalled()
  })

  it.each(['', 'Existing draft'])('allows voice at the Astra limit while keeping attachment choices disabled with draft=%j', async (value) => {
    const onVoice = vi.fn()
    const onAttachFile = vi.fn()
    render(<Composer {...props({ state: 'atLimit', value, limitReason: 'limit sentinel', onVoice, voiceWords, onAttachFile, attachWords })} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: words.actions }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: attachWords.file })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: voiceWords.start }))
    expect(onVoice).toHaveBeenCalledOnce()
    expect(onAttachFile).not.toHaveBeenCalled()
  })

  it('dismisses the menu without changing text or sending', async () => {
    const onSend = vi.fn()
    const onChangeValue = vi.fn()
    render(<Composer {...props({ value: 'Keep this draft', onSend, onChangeValue, onAttachFile: vi.fn(), attachWords })} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: words.actions }), { button: 0, ctrlKey: false })
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft')
    expect(onSend).not.toHaveBeenCalled()
    expect(onChangeValue).not.toHaveBeenCalled()
  })
})


  it.each([en, ptBR])('shows removable queued rows, manual sends and a separate stop control in both languages', (messages) => {
    const onRemove = vi.fn()
    const onQueuedSend = vi.fn()
    const onStop = vi.fn()
    const copy = messages.shell.composer.queue
    const queue = {
      label: copy.label, items: [{ id: 'first', content: 'First request' }, { id: 'second', content: 'Second request' }],
      pausedReason: copy.paused, canSend: true,
      removeLabel: (message: string) => copy.remove.replace('{message}', message),
      sendLabel: (message: string) => copy.send.replace('{message}', message),
      onRemove, onSend: onQueuedSend,
    }
    render(<Composer {...props({ queue, replyControl: { label: copy.stop, onStop }, value: 'New draft' })} />)
    fireEvent.click(screen.getByRole('button', { name: queue.removeLabel('Second request') }))
    fireEvent.click(screen.getByRole('button', { name: queue.sendLabel('First request') }))
    fireEvent.click(screen.getByRole('button', { name: copy.stop }))
    expect(onRemove).toHaveBeenCalledWith('second')
    expect(onQueuedSend).toHaveBeenCalledWith('first')
    expect(onStop).toHaveBeenCalledOnce()
  })

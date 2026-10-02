import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const words = {
  placeholder: 'placeholder sentinel',
  send: 'send sentinel',
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

describe('Composer', () => {
  it('restores input focus when the composer still owns focus after sending', () => {
    const view = render(<Composer {...props({ state: 'sending' })} autoFocus />)
    expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
    view.rerender(<Composer {...props()} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('keeps input focus in the composer when an active input becomes disabled', () => {
    const view = render(<Composer {...props()} autoFocus />)
    expect(screen.getByRole('textbox')).toHaveFocus()
    view.rerender(<Composer {...props({ state: 'sending' })} autoFocus />)
    expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
  })

  it('does not steal focus from the enabled voice stop control when recording starts', () => {
    const capability = { onVoice: vi.fn(), voiceWords }
    const view = render(<Composer {...props(capability)} autoFocus />)
    const voiceButton = screen.getByRole('button', { name: voiceWords.start })
    act(() => voiceButton.focus())
    view.rerender(<Composer {...props({ ...capability, state: 'recording' })} autoFocus />)
    expect(screen.getByRole('button', { name: voiceWords.stop })).toHaveFocus()
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
    expect(field.parentElement?.className.split(' ')).toContain('has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)]')
    expect(field.parentElement?.className.split(' ')).not.toContain('focus-within:outline-2')
    expect(field).toHaveClass('focus-visible:outline-0')
    expect(field.className.split(' ')).not.toContain('focus-visible:outline-2')
  })

  it('gives each inner control its own shaped ring without the wrapper ring', () => {
    render(<Composer {...props({
      onAttachFile: vi.fn(),
      onAttachImage: vi.fn(),
      onVoice: vi.fn(),
      attachWords,
      voiceWords,
    })} />)

    for (const name of [attachWords.file, attachWords.image, voiceWords.start]) {
      const control = screen.getByRole('button', { name })
      control.focus()
      expect(control).toHaveFocus()
      expect(control.className.split(' ')).not.toContain('focus-visible:outline-0')
      expect(control).toHaveClass('rounded-full')
      expect(control.closest('[data-composer-input-row]')?.className.split(' ')).toContain('has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)]')
    }
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
    ['sending', { state: 'sending', value: 'oi' }, true, true],
    ['atLimit', { state: 'atLimit', value: 'oi', limitReason: 'limit sentinel' }, false, true],
    ['offline', { state: 'offline', value: 'oi', limitReason: 'offline sentinel' }, false, true],
    ['recording', { state: 'recording', value: 'oi', onVoice: vi.fn(), voiceWords }, false, true],
    ['transcribing', { state: 'transcribing', value: 'oi', onVoice: vi.fn(), voiceWords }, false, true],
  ] as const)('styles the send control for %s', (_case, overrides, accented, disabled) => {
    render(<Composer {...props(overrides)} />)
    const send = screen.getByRole('button', { name: words.send })
    if (accented) expect(send).toHaveAttribute('data-accent', '')
    else expect(send).not.toHaveAttribute('data-accent')
    expect(send).toHaveClass(accented ? 'bg-[var(--primary)]' : 'bg-[var(--bg-well)]')
    if (_case === 'idle with an empty field' || _case === 'idle with text') {
      expect(send).toHaveClass('duration-150')
    }
    if (_case === 'idle with text' || _case === 'idle with a file only') {
      expect(send).toHaveClass('enabled:hover:bg-[var(--primary-hover)]')
    } else {
      expect(send.querySelector('span[aria-hidden="true"]')).toBeNull()
    }
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

  it('disables input and send and hides suggestions during sending', () => {
    render(<Composer {...props({ state: 'sending', value: 'oi' })} />)
    expect(screen.getByRole('textbox', { name: words.placeholder })).toBeDisabled()
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled()
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

  it('renders and invokes voice only when the capability is present', () => {
    const onVoice = vi.fn()
    const { rerender } = render(<Composer {...props({ onVoice, voiceWords })} />)
    fireEvent.click(screen.getByRole('button', { name: voiceWords.start }))
    expect(onVoice).toHaveBeenCalledOnce()
    rerender(<Composer {...props()} />)
    expect(screen.queryByRole('button', { name: voiceWords.start })).not.toBeInTheDocument()
  })


  it('replaces suggestions with recording status and a stop control', () => {
    render(<Composer {...props({ state: 'recording', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.getByText(voiceWords.recording)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: voiceWords.stop })).toBeInTheDocument()
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

  it('renders attachment capability without an empty tray', () => {
    render(
      <Composer
        {...props({ onAttachFile: vi.fn(), onAttachImage: vi.fn(), attachWords })}
      />,
    )
    expect(screen.getByRole('button', { name: attachWords.file })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: attachWords.image })).toBeInTheDocument()
    expect(screen.queryByLabelText(attachWords.trayLabel)).not.toBeInTheDocument()
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
    ['pt-BR', ptBR.shell.composer.placeholder, 'Peça algo à Astra'],
    ['en', en.shell.composer.placeholder, 'Ask Astra for something'],
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
  it.each(['idle', 'sending', 'offline', 'atLimit'] as const)('only dispatches attachment actions while idle, from %s', (state) => {
    const onAttachFile = vi.fn()
    const onAttachImage = vi.fn()
    const statuses = {
      idle: { state: 'idle' }, sending: { state: 'sending' },
      offline: { state: 'offline', limitReason: 'offline sentinel' },
      atLimit: { state: 'atLimit', limitReason: 'limit sentinel' },
    } as const
    render(<Composer words={words} value="" suggestions={[]} onChangeValue={vi.fn()} onSend={vi.fn()} {...statuses[state]} onAttachFile={onAttachFile} onAttachImage={onAttachImage} attachWords={attachWords} />)
    for (const [name, callback] of [[attachWords.file, onAttachFile], [attachWords.image, onAttachImage]] as const) {
      const button = screen.getByRole('button', { name })
      if (state === 'idle') expect(button).toBeEnabled()
      else expect(button).toBeDisabled()
      fireEvent.click(button)
      expect(callback).toHaveBeenCalledTimes(state === 'idle' ? 1 : 0)
    }
  })

  it.each(['idle', 'recording', 'transcribing', 'sending', 'offline', 'atLimit'] as const)('dispatches voice only when the %s control can act', (state) => {
    const onVoice = vi.fn()
    const statuses = {
      idle: { state: 'idle' }, recording: { state: 'recording' },
      transcribing: { state: 'transcribing' }, sending: { state: 'sending' },
      offline: { state: 'offline', limitReason: 'offline sentinel' },
      atLimit: { state: 'atLimit', limitReason: 'limit sentinel' },
    } as const
    render(<Composer words={words} value="" suggestions={[]} onChangeValue={vi.fn()} onSend={vi.fn()} {...statuses[state]} onVoice={onVoice} voiceWords={voiceWords} />)
    const canAct = state === 'idle' || state === 'recording' || state === 'atLimit'
    const name = state === 'recording' || state === 'transcribing' ? voiceWords.stop : voiceWords.start
    const button = screen.getByRole('button', { name })
    if (canAct) expect(button).toBeEnabled()
    else expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onVoice).toHaveBeenCalledTimes(canAct ? 1 : 0)
  })

})

import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'

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
  add: 'attach sentinel',
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
  it('renders three suggestions in their named group', () => {
    render(<Composer {...props()} />)
    const group = screen.getByRole('group', { name: words.suggestionsLabel })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
  })

  it('renders six suggestions', () => {
    render(<Composer {...props({ suggestions: suggestions(6) })} />)
    expect(screen.getAllByText(/chip sentinel/)).toHaveLength(6)
  })

  it('selects only the pressed suggestion', () => {
    const chips = suggestions(3)
    render(<Composer {...props({ suggestions: chips })} />)
    fireEvent.click(screen.getByRole('button', { name: chips[1].label }))
    expect(chips[1].onSelect).toHaveBeenCalledOnce()
    expect(chips[0].onSelect).not.toHaveBeenCalled()
    expect(chips[2].onSelect).not.toHaveBeenCalled()
  })

  it('reports input changes', () => {
    const onChangeValue = vi.fn()
    render(<Composer {...props({ onChangeValue })} />)
    fireEvent.change(screen.getByRole('textbox', { name: words.placeholder }), { target: { value: 'oi' } })
    expect(onChangeValue).toHaveBeenCalledWith('oi')
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

  it('requires nonblank text when an image is attached', () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <Composer
        {...props({
          value: '   ',
          onSend,
          onAttach: vi.fn(),
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
          onAttach: vi.fn(),
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

  it('disables input and send while keeping suggestions during sending', () => {
    render(<Composer {...props({ state: 'sending', value: 'oi' })} />)
    expect(screen.getByRole('textbox', { name: words.placeholder })).toBeDisabled()
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled()
    expect(screen.getByRole('group', { name: words.suggestionsLabel })).toBeInTheDocument()
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

  it('exposes the stable input and voice tour targets', () => {
    const { container } = render(<Composer {...props({ onVoice: vi.fn(), voiceWords })} />)
    expect(container.querySelector('[data-tour="tour-chat-input"]')).toBe(
      screen.getByRole('textbox', { name: words.placeholder }),
    )
    expect(container.querySelector('[data-tour="tour-chat-voice"]')).toBe(
      screen.getByRole('button', { name: voiceWords.start }),
    )
  })

  it('replaces suggestions with recording status and a stop control', () => {
    render(<Composer {...props({ state: 'recording', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.getByText(voiceWords.recording)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: words.suggestionsLabel })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: voiceWords.stop })).toBeInTheDocument()
  })

  it('renders transcribing status with an unusable input', () => {
    render(<Composer {...props({ state: 'transcribing', onVoice: vi.fn(), voiceWords })} />)
    expect(screen.getByText(voiceWords.transcribing)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: words.placeholder })).toBeDisabled()
  })

  it('renders attachment capability without an empty tray', () => {
    render(<Composer {...props({ onAttach: vi.fn(), attachWords })} />)
    expect(screen.getByRole('button', { name: attachWords.add })).toBeInTheDocument()
    expect(screen.queryByLabelText(attachWords.trayLabel)).not.toBeInTheDocument()
  })

  it('names, distinguishes, and removes each attachment independently', () => {
    const onAttachRemove = vi.fn()
    const attachments = [
      { id: 'file-id', kind: 'file' as const, name: 'notes.txt' },
      { id: 'image-id', kind: 'image' as const, name: 'walk.png' },
    ]
    const { container } = render(
      <Composer {...props({ onAttach: vi.fn(), attachWords, attachments, onAttachRemove })} />,
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
})

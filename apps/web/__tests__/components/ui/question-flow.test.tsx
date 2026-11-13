import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OptionCard } from '@/components/ui/option-card'
import { markGuidedFlowCompleted } from '@orbit/shared/utils'
import { QuestionFlow } from '@/components/ui/question-flow'

const posthog = vi.hoisted(() => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/posthog', () => posthog)
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const baseProps = {
  flow: 'habit_create' as const,
  question: 'Quando?', line: 'Pode ser qualquer dia, ou uma repetição.', stepKey: 'when', position: 2, total: 4,
  progressLabel: 'Passo 2 de 4', backLabel: 'Voltar', closeLabel: 'Fechar', direction: 1 as const,
  onBack: vi.fn(), onClose: vi.fn(),
}

function Flow({ stepKey = 'when', ...overrides }: Readonly<Partial<Parameters<typeof QuestionFlow>[0]>>) {
  return <QuestionFlow {...baseProps} stepKey={stepKey} {...overrides}
    options={<><OptionCard label="Hoje" onSelect={vi.fn()} /><OptionCard label="Amanhã" onSelect={vi.fn()} /><OptionCard label="Sem data" onSelect={vi.fn()} /></>}
    primary={{ label: 'Continuar', onPress: vi.fn() }} />
}

beforeEach(() => {
  stubMedia([])
  posthog.captureGuidedFlowEvent.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('QuestionFlow events', () => {
  it('reports each step view once with the flow id, the step and the step count', () => {
    const { rerender } = render(<Flow />)
    rerender(<Flow position={2} />)
    rerender(<Flow stepKey="time" />)
    expect(posthog.captureGuidedFlowEvent.mock.calls.map(([event]) => event)).toEqual([
      { name: 'guided_flow_step_viewed', properties: { flow: 'habit_create', step: 'when', step_count: 4 } },
      { name: 'guided_flow_step_viewed', properties: { flow: 'habit_create', step: 'time', step_count: 4 } },
    ])
  })

  it('reports an abandon at the last step when the flow closes without a result', () => {
    const { unmount } = render(<Flow stepKey="time" />)
    unmount()
    expect(posthog.captureGuidedFlowEvent).toHaveBeenLastCalledWith({ name: 'guided_flow_abandoned', properties: { flow: 'habit_create', step: 'time' } })
  })

  it('reports no abandon when the flow completed', () => {
    const { unmount } = render(<Flow />)
    markGuidedFlowCompleted('habit_create')
    unmount()
    expect(posthog.captureGuidedFlowEvent.mock.calls.some(([event]) => event.name === 'guided_flow_abandoned')).toBe(false)
  })

  it('turns the ring of Orbit on a step change and draws no turn on the first step', () => {
    const { container, rerender } = render(<Flow />)
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-turn', 'rest')
    rerender(<Flow stepKey="time" />)
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeInTheDocument()
  })
})

describe('QuestionFlow', () => {
  it('names the progress and keeps the 48 slot when there is no back step', () => {
    const { rerender } = render(<Flow />)
    expect(screen.getByRole('list', { name: 'Passo 2 de 4' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((segment) => segment.hasAttribute('aria-current'))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    rerender(<Flow onBack={undefined} position={1} progressLabel="Passo 1 de 4" />)
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('makes the question the heading and describes it with the Orbit line', () => {
    render(<Flow />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Quando?' })
    const lineId = heading.getAttribute('aria-describedby')
    expect(lineId).not.toBeNull()
    expect(document.getElementById(lineId as string)).toHaveTextContent('Pode ser qualquer dia, ou uma repetição.')
  })

  it('moves focus to the question on a step change and not on first mount', () => {
    const { rerender } = render(<Flow />)
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
    rerender(<Flow stepKey="time" question="Tem hora certa?" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tem hora certa?' })).toHaveFocus()
  })

  it('closes up when no line applies', () => {
    render(<Flow line={null} />)
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('aria-describedby')).toBeNull()
  })

  it('keeps the primary action enabled and pinned outside the block on the compact shell', () => {
    render(<Flow />)
    const primary = screen.getByRole('button', { name: 'Continuar' })
    expect(primary).toBeEnabled()
    expect(primary.closest('main')).toBeNull()
  })

  it('places the primary action inside the block under it on a wide window', () => {
    stubMedia(['min-width: 1024px', 'min-width: 640px'])
    render(<Flow />)
    expect(screen.getByRole('button', { name: 'Continuar' }).closest('main')).not.toBeNull()
  })

  it('reports Pensando on the frame and shows a text status for assistive technology', () => {
    render(<Flow orbitState="pensando" statusText="Orbit está lendo o que você escreveu." />)
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'pensando')
    expect(screen.getByRole('status')).toHaveTextContent('Orbit está lendo o que você escreveu.')
  })

  it('shows Olhando when a control takes focus, and never under another state', () => {
    const { rerender } = render(<Flow />)
    fireEvent.focus(screen.getByRole('button', { name: 'Hoje' }))
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'olhando')
    rerender(<Flow orbitState="pensando" />)
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'pensando')
  })

  it('announces a changed line after one second of quiet and announces nothing on a step change', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<Flow />)
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      rerender(<Flow line="Entendi: hoje." />)
      act(() => { vi.advanceTimersByTime(999) })
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByRole('status')).toHaveTextContent('Entendi: hoje.')
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
      rerender(<Flow stepKey="time" question="Tem hora certa?" line="Se tiver hora, eu aviso você." />)
      act(() => { vi.advanceTimersByTime(3000) })
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    } finally { vi.useRealTimers() }
  })

  it('draws no eye travel under reduced motion', () => {
    stubMedia(['prefers-reduced-motion'])
    render(<Flow />)
    fireEvent.focus(screen.getByRole('button', { name: 'Hoje' }))
    expect(document.querySelector('[data-part="eyes"]')).toHaveAttribute('transform', 'translate(0 0)')
  })
})

describe('OptionCard', () => {
  it('selects on a press and marks the selected option', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<OptionCard label="Hoje" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<OptionCard label="Hoje" selected onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves focus with the arrow keys and never selects', () => {
    const onSelect = vi.fn()
    render(<div data-option-group=""><OptionCard label="Hoje" onSelect={onSelect} /><OptionCard label="Amanhã" onSelect={onSelect} /></div>)
    screen.getByRole('button', { name: 'Hoje' }).focus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hoje' }), { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Amanhã' })).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the reason beside a disabled option', () => {
    render(<OptionCard label="Maio" disabled disabledReason="Escolha até 5" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Maio' })).toBeDisabled()
    expect(screen.getByText('Escolha até 5')).toBeInTheDocument()
  })

  it('reports focus and blur so Orbit can look at it', () => {
    const onHighlight = vi.fn()
    render(<OptionCard label="Hoje" onSelect={vi.fn()} onHighlight={onHighlight} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Hoje' }))
    fireEvent.blur(screen.getByRole('button', { name: 'Hoje' }))
    expect(onHighlight.mock.calls).toEqual([[true], [false]])
  })
})

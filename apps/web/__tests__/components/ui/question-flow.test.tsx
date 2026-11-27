import { act, fireEvent, render, screen } from '@testing-library/react'
import { motionDurations } from '@orbit/shared/theme'
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

function Flow({ stepKey = 'when', options, ...overrides }: Readonly<Partial<Parameters<typeof QuestionFlow>[0]>>) {
  return <QuestionFlow {...baseProps} stepKey={stepKey} {...overrides}
    options={options ?? <><OptionCard label="Hoje" onSelect={vi.fn()} /><OptionCard label="Amanhã" onSelect={vi.fn()} /><OptionCard label="Sem data" onSelect={vi.fn()} /></>}
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

  it('draws the header controls at 48 on a phone width and at 40 at 1024 and above, with a 48 hit target', () => {
    const { unmount } = render(<Flow />)
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveStyle({ width: '48px', minHeight: '48px', minWidth: '48px' })
    expect(screen.getByRole('button', { name: 'Voltar' }).style.getPropertyValue('--pill-hit-padding')).toBe('0px')
    unmount()
    stubMedia(['min-width: 1024px'])
    render(<Flow />)
    for (const name of ['Voltar', 'Fechar']) {
      const control = screen.getByRole('button', { name })
      expect(control).toHaveStyle({ width: '40px', minHeight: '40px', minWidth: '40px' })
      expect(control.style.getPropertyValue('--pill-hit-padding')).toBe('4px')
    }
  })

  it('sets the question at 28 at every width', () => {
    render(<Flow />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Quando?' })
    expect(heading.className).toContain('text-[28px]')
    expect(heading.className).not.toContain('text-[34px]')
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

  it.each([['when', 'time'], ['summary', 'type']])('moves focus to the question and looks away on a return to the first step %s', (first, second) => {
    const { rerender } = render(<Flow stepKey={first} question="Primeira?" />)
    rerender(<Flow stepKey={second} question="Segunda?" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Segunda?' })).toHaveFocus()
    fireEvent.focus(screen.getByRole('button', { name: 'Hoje' }))
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'olhando')
    rerender(<Flow stepKey={first} question="Primeira?" direction={-1} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Primeira?' })).toHaveFocus()
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('claims no main landmark, so the host that mounts it owns the one main of the page', () => {
    render(<main><Flow /></main>)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
  })

  it('closes up when no line applies', () => {
    render(<Flow line={null} />)
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('aria-describedby')).toBeNull()
  })

  it('keeps the primary action enabled and pinned outside the block on the compact shell', () => {
    render(<Flow />)
    const primary = screen.getByRole('button', { name: 'Continuar' })
    expect(primary).toBeEnabled()
    expect(primary.closest('[data-flow-scroll]')).toBeNull()
  })

  it('places the primary action inside the block under it on a wide window', () => {
    stubMedia(['min-width: 1024px', 'min-width: 640px'])
    render(<Flow />)
    expect(screen.getByRole('button', { name: 'Continuar' }).closest('[data-flow-scroll]')).not.toBeNull()
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

  it('slides a step change with the slow duration, and draws it still with a still mascot under reduced motion', () => {
    stubMedia([])
    const { unmount } = render(<Flow />)
    expect(document.querySelector('[data-question-flow] [data-flow-scroll] > div')).toHaveAttribute('data-step-duration', String(motionDurations.slow))
    unmount()
    stubMedia(['prefers-reduced-motion'])
    render(<Flow />)
    expect(document.querySelector('[data-question-flow] [data-flow-scroll] > div')).toHaveAttribute('data-step-duration', '0')
    expect(document.querySelector('[data-orbit-loop]')).toHaveAttribute('data-orbit-loop', 'still')
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

describe('QuestionFlow column and groups', () => {
  it('holds Orbit and the line in one group with a gap of 12 and keeps 24 between the groups', () => {
    render(<Flow />)
    const group = document.querySelector('[data-flow-orbit-group]')!
    expect(group).toHaveClass('gap-3')
    expect(group.querySelector('svg, [data-orbit-mascot]') ?? group.firstElementChild).not.toBeNull()
    expect(group).toHaveTextContent('Pode ser qualquer dia, ou uma repetição.')
    expect(group.parentElement).toHaveClass('gap-6')
    expect(screen.getByRole('heading', { name: 'Quando?' }).parentElement).toBe(group.parentElement)
  })

  it('gives the header column no inline padding of its own, so it shares the 592 column of the block', () => {
    render(<Flow />)
    const column = document.querySelector('[data-flow-column]')!
    expect(column).toHaveClass('max-w-[592px]')
    expect(column.className).not.toMatch(/(^|\s)p[xlr]?-/)
    expect(column.parentElement).toHaveClass('px-4')
    expect(document.querySelector('[data-flow-scroll]')).toHaveClass('px-4')
    expect(document.querySelector('[data-flow-scroll] > div')).toHaveClass('max-w-[592px]')
    expect(document.querySelector('[data-flow-scroll] > div')!.className).not.toMatch(/(^|\s)p[xlr]-/)
  })

  it('pins the compact primary row in the same column', () => {
    render(<Flow />)
    const primary = document.querySelector('[data-flow-primary]')!
    expect(primary.parentElement).toHaveClass('max-w-[592px]')
    expect(primary.parentElement!.className).not.toMatch(/(^|\s)p[xlr]-/)
    expect(primary.parentElement!.parentElement).toHaveClass('px-4')
  })
})

describe('QuestionFlow secondary action', () => {
  it('renders the secondary as a ghost pill before the primary, 12 apart', () => {
    const onPress = vi.fn()
    render(<Flow secondary={{ label: 'Salvar modelo', onPress }} />)
    const row = document.querySelector('[data-flow-action-row]')!
    expect(row).toHaveClass('gap-3')
    const buttons = [...row.querySelectorAll('button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Salvar modelo', 'Continuar'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'ghost')
    expect(buttons[0]).toHaveAttribute('data-size', 'sm')
    fireEvent.click(buttons[0]!)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders no row without a secondary', () => {
    render(<Flow />)
    expect(document.querySelector('[data-flow-action-row]')).toBeNull()
  })

  it('places the row 24 under the block at 1024 and above', () => {
    stubMedia(['min-width: 1024px'])
    render(<Flow secondary={{ label: 'Salvar modelo', onPress: vi.fn() }} />)
    const block = document.querySelector('[data-flow-scroll] > div')!
    expect(block).toHaveClass('gap-6')
    expect(block.contains(document.querySelector('[data-flow-action-row]'))).toBe(true)
  })
})

describe('OptionGroup reasons', () => {
  const options = (
    <>
      <OptionCard label="Não" disabled disabledReason="Limpe a lista." onSelect={vi.fn()} />
      <OptionCard label="Sim" onSelect={vi.fn()} />
    </>
  )

  it('shows one reason under the whole grid, not under one card', () => {
    render(<Flow options={options} />)
    const reason = screen.getByText('Limpe a lista.')
    const group = document.querySelector('[data-option-group]')!
    expect(group.contains(reason)).toBe(false)
    expect(group.parentElement!.contains(reason)).toBe(true)
    expect(reason).toHaveClass('text-center', 'text-xs')
    expect(reason.parentElement).toHaveClass('gap-2')
    expect(document.querySelectorAll('[data-option-reason]')).toHaveLength(1)
  })

  it('shows the same reason of two options once', () => {
    render(<Flow options={<><OptionCard label="A" disabled disabledReason="Limite." onSelect={vi.fn()} /><OptionCard label="B" disabled disabledReason="Limite." onSelect={vi.fn()} /></>} />)
    expect(screen.getAllByText('Limite.')).toHaveLength(1)
  })

  it('drops the reason when the option is enabled again', () => {
    const { rerender } = render(<Flow options={options} />)
    rerender(<Flow options={<OptionCard label="Não" onSelect={vi.fn()} />} />)
    expect(screen.queryByText('Limpe a lista.')).toBeNull()
  })
})

describe('OptionCard height', () => {
  it('sets a minimum height of 56 in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8')
    expect(css).toMatch(/\.orbit-option-card \{[^}]*min-height: 56px;/)
  })
})

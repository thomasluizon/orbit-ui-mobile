import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionFlow } from '@/components/ui/question-flow'

vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))

function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function Flow({ stepKey = 'tags', line, lineKey }: Readonly<{ stepKey?: string; line: string; lineKey?: string }>) {
  return <QuestionFlow flow="habit_create" question="Quer juntar com coisas parecidas?" line={line} lineKey={lineKey} stepKey={stepKey}
    position={1} total={2} progressLabel="Passo 1 de 2" backLabel="Voltar" closeLabel="Fechar" direction={1} onClose={vi.fn()} />
}

afterEach(() => vi.unstubAllGlobals())

describe('the Orbit line of the flow frame', () => {
  it('swaps the line with no motion when the caller gives no line key', () => {
    stubMedia([])
    const { rerender } = render(<Flow line="Primeira" />)
    rerender(<Flow line="Segunda" />)
    const line = screen.getByText('Segunda')
    expect(line).not.toHaveAttribute('data-line-key')
    expect(line.style.opacity).toBe('')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('Segunda')
  })

  it('fades a new line in when only the line key changes, and not on the first line of a step', () => {
    stubMedia([])
    const { rerender } = render(<Flow line="Uma tag junta itens parecidos." lineKey="intro" />)
    expect(screen.getByText('Uma tag junta itens parecidos.').style.opacity).not.toBe('0')
    rerender(<Flow line="Saúde ainda está vazia." lineKey="tag-1" />)
    const line = screen.getByText('Saúde ainda está vazia.')
    expect(line).toHaveAttribute('data-line-duration', '120')
    expect(line.style.opacity).toBe('0')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('Saúde ainda está vazia.')
    rerender(<Flow stepKey="goals" line="Uma meta soma o progresso." lineKey="goals-intro" />)
    expect(screen.getByText('Uma meta soma o progresso.').style.opacity).not.toBe('0')
  })

  it('swaps the line at once under reduced motion', () => {
    stubMedia(['prefers-reduced-motion'])
    const { rerender } = render(<Flow line="Uma tag junta itens parecidos." lineKey="intro" />)
    rerender(<Flow line="Saúde ainda está vazia." lineKey="tag-1" />)
    const line = screen.getByText('Saúde ainda está vazia.')
    expect(line).toHaveAttribute('data-line-duration', '0')
    expect(line.style.opacity).not.toBe('0')
  })
})

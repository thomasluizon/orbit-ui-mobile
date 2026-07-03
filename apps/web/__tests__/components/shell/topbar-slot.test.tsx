import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  TopbarSlotProvider,
  useTopbarSlot,
  useTopbarSlotNode,
} from '@/components/shell/topbar-slot'

function SlotWriter({ node }: Readonly<{ node: string }>) {
  useTopbarSlot(node)
  return null
}

function SlotReader() {
  const node = useTopbarSlotNode()
  return <div data-testid="slot">{node}</div>
}

function Harness({ showA, showB }: Readonly<{ showA: boolean; showB: boolean }>) {
  return (
    <TopbarSlotProvider>
      <SlotReader />
      {showA && <SlotWriter node="A" />}
      {showB && <SlotWriter node="B" />}
    </TopbarSlotProvider>
  )
}

describe('topbar slot', () => {
  it('keeps the newest owner node when an earlier owner unmounts late', () => {
    const { rerender } = render(<Harness showA showB={false} />)
    expect(screen.getByTestId('slot')).toHaveTextContent('A')

    rerender(<Harness showA showB />)
    expect(screen.getByTestId('slot')).toHaveTextContent('B')

    rerender(<Harness showA={false} showB />)
    expect(screen.getByTestId('slot')).toHaveTextContent('B')
  })

  it('clears the slot when the current owner unmounts', () => {
    const { rerender } = render(<Harness showA showB={false} />)
    expect(screen.getByTestId('slot')).toHaveTextContent('A')

    rerender(<Harness showA={false} showB={false} />)
    expect(screen.getByTestId('slot')).toHaveTextContent('')
  })

  it('updates the node when the owner re-renders with a new node', () => {
    function SingleHarness({ node }: Readonly<{ node: string }>) {
      return (
        <TopbarSlotProvider>
          <SlotReader />
          <SlotWriter node={node} />
        </TopbarSlotProvider>
      )
    }

    const { rerender } = render(<SingleHarness node="A" />)
    expect(screen.getByTestId('slot')).toHaveTextContent('A')

    rerender(<SingleHarness node="A2" />)
    expect(screen.getByTestId('slot')).toHaveTextContent('A2')
  })
})

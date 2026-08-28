import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameItem, BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockFrame } from '@/components/ui/block-frame'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'status.done': 'Done',
    'status.acting': 'In progress',
    'status.failed': 'Failed',
    refresh: 'Refresh',
  })[key] ?? key,
}))

const items: readonly BlockFrameItem[] = [
  { id: 'one', label: 'First row' },
  { id: 'two', label: 'Second row', meta: 'Second detail' },
]

function resting(overrides: Partial<BlockFrameProps> = {}): BlockFrameProps {
  return { state: 'resting', title: 'Changes', items, ...overrides } as BlockFrameProps
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('BlockFrame on web', () => {
  it('renders a busy loading skeleton without row labels', () => {
    const { container } = render(<BlockFrame {...resting({ state: 'loading', actions: <button>Save</button> })} />)
    expect(container.querySelector('[data-state="loading"]')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('[data-loading-skeleton]')).toBeInTheDocument()
    expect(screen.queryByText('First row')).not.toBeInTheDocument()
  })

  it('renders rows in order and derives the header count from items', () => {
    const { container } = render(<BlockFrame {...resting()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    const body = container.querySelector('[aria-live="polite"]')
    const labels = [...body!.children].map((row) => row.textContent)
    expect(labels).toEqual(['First row', 'Second rowSecond detail'])
  })

  it('refreshes a stale frame once and withholds old actions', () => {
    const onRefresh = vi.fn()
    render(
      <BlockFrame
        state="stale"
        title="Changes"
        items={items}
        staleMessage="The source moved"
        onRefresh={onRefresh}
        actions={<button>Old action</button>}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByText('The source moved')).toBeInTheDocument()
    expect(screen.queryByText('Old action')).not.toBeInTheDocument()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('keeps pending rows editable and status rows fixed', () => {
    const onEditItem = vi.fn()
    const { container } = render(
      <BlockFrame
        {...resting({
          items: [items[0]!, { id: 'done', label: 'Finished', status: 'done' }],
          onEditItem,
          editLabel: 'Edit item',
        })}
      />,
    )
    expect(container.querySelector('[data-status="done"]')).toHaveTextContent('Done')
    expect(screen.getAllByRole('button', { name: 'Edit item' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
    expect(onEditItem).toHaveBeenCalledWith('one')
  })

  it('uses a row status override and keeps its control before the status', () => {
    const { container, rerender } = render(
      <BlockFrame
        {...resting({
          items: [{ id: 'done', label: 'Finished', status: 'done', control: <button>Control</button> }],
        })}
      />,
    )
    const row = container.querySelector('[data-status="done"]')
    expect(row).toHaveTextContent('ControlDone')
    rerender(
      <BlockFrame
        {...resting({ items: [{ id: 'done', label: 'Finished', status: 'done', statusLabel: 'Saved' }] })}
      />,
    )
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('delegates only suggested rows to Proposed', () => {
    const { container } = render(
      <BlockFrame
        {...resting({
          items: [
            { id: 'plain', label: 'Plain' },
            { id: 'suggested', label: 'Suggested', proposed: true },
          ],
          proposedLabel: 'Proposed by Astra',
        })}
      />,
    )
    expect(screen.getByRole('group', { name: 'Proposed by Astra' })).toHaveAttribute('data-proposed')
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1)
  })

  it('shows confirmation once based on reversibility, never item count', () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ id: String(index), label: `Row ${index}` }))
    const labels = { irreversibleLabel: 'Permanent', confirmNote: 'Confirm this consequence' }
    const { rerender } = render(<BlockFrame {...resting({ items: ten, ...labels })} />)
    expect(screen.queryByText(labels.confirmNote)).not.toBeInTheDocument()

    rerender(<BlockFrame {...resting({ items: ten.map((item, index) => index === 4 ? { ...item, irreversible: true } : item), ...labels })} />)
    expect(screen.getAllByText(labels.confirmNote)).toHaveLength(1)

    rerender(<BlockFrame {...resting({ items: [{ id: 'one', label: 'One', irreversible: true }], ...labels })} />)
    expect(screen.getAllByText(labels.confirmNote)).toHaveLength(1)
  })

  it('places risk beside the count and one actions slot after the scroll body', () => {
    const { container } = render(
      <BlockFrame {...resting({ risk: <span>High risk</span>, actions: <button>Apply</button> })} />,
    )
    const header = screen.getByText('High risk').parentElement
    expect(header).toHaveTextContent('Changes2High risk')
    const body = container.querySelector('[aria-live="polite"]')
    const actionRow = container.querySelector('[data-action-row]')
    expect(actionRow).toContainElement(screen.getByRole('button', { name: 'Apply' }))
    expect(body!.compareDocumentPosition(actionRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Apply' })).toHaveLength(1)
  })

  it('throws every missing runtime label in development', () => {
    expect(() => render(
      <BlockFrame
        {...resting({ items: [{ id: 'unsafe', label: 'Unsafe', irreversible: true, proposed: true }] })}
      />,
    )).toThrow('irreversibleLabel, confirmNote, proposedLabel')
  })

  it('renders rows but withholds actions for missing labels in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    render(
      <BlockFrame
        {...resting({
          items: [{ id: 'unsafe', label: 'Unsafe', irreversible: true }],
          actions: <button>Apply</button>,
        })}
      />,
    )
    expect(screen.getByText('Unsafe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('keeps announcements local and exposes busy state only while working', () => {
    const { container, rerender } = render(<BlockFrame {...resting()} />)
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
    expect(container.querySelector('[data-state="resting"]')).not.toHaveAttribute('aria-busy')

    rerender(<BlockFrame {...resting({ state: 'acting' })} />)
    expect(container.querySelector('[data-state="acting"]')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByText('In progress')).toHaveLength(items.length)
  })
})

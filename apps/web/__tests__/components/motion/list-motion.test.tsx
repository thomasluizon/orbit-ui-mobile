import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListMotionItem, ListPresence, MotionDisclosure } from '@/components/motion/list-motion'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => preference.reduced }))

beforeEach(() => { preference.reduced = false })

describe('list motion', () => {
  it('makes a departing row inert while the replacement accepts input immediately', async () => {
    const onPress = vi.fn()
    const view = render(<ListPresence><ListMotionItem key="old"><button>Old</button></ListMotionItem></ListPresence>)
    view.rerender(<ListPresence><ListMotionItem key="new"><button onClick={onPress}>New</button></ListMotionItem></ListPresence>)
    const departing = view.container.querySelector('[data-list-motion][inert]')
    expect(departing).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(onPress).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByText('Old')).toBeNull())
  })

  it('removes collapsed children from interaction while their height settles', () => {
    const view = render(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    expect(screen.getByRole('button', { name: 'Child' })).toBeVisible()
    view.rerender(<MotionDisclosure expanded={false} id="children"><button>Child</button></MotionDisclosure>)
    expect(view.container.querySelector('#children')).toHaveAttribute('inert')
    expect(screen.queryByRole('button', { name: 'Child' })).toBeNull()
    preference.reduced = true
    view.rerender(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    expect(screen.getByRole('button', { name: 'Child' })).toBeVisible()
  })

  it('finishes a departing row with a short fade when reduced motion is enabled during its exit', async () => {
    const view = render(<ListPresence><ListMotionItem key="old"><button>Old</button></ListMotionItem></ListPresence>)
    const replacement = <ListPresence><ListMotionItem key="new"><button>New</button></ListMotionItem></ListPresence>
    view.rerender(replacement)
    expect(screen.getByText('Old')).toBeInTheDocument()
    preference.reduced = true
    view.rerender(<ListPresence><ListMotionItem key="new"><button>New</button></ListMotionItem></ListPresence>)
    await waitFor(() => expect(screen.queryByText('Old')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).toBeVisible())
  })

  it('opens reduced-motion children at their final height immediately', () => {
    preference.reduced = true
    const view = render(<MotionDisclosure expanded={false}><button>Child</button></MotionDisclosure>)
    expect(screen.queryByRole('button', { name: 'Child' })).toBeNull()
    view.rerender(<MotionDisclosure expanded><button>Child</button></MotionDisclosure>)
    expect(screen.getByRole('button', { name: 'Child' })).toBeVisible()
    expect(view.container.querySelector('[data-motion-disclosure] > div')).toHaveStyle({ height: 'auto', opacity: '1' })
  })
})

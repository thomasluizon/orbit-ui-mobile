import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListMotionItem, ListPresence, MotionDisclosure } from '@/components/motion/list-motion'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => preference.reduced }))

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
})

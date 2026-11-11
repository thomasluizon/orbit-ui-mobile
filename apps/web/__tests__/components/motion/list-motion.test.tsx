import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ContentFade, ListMotionItem, ListPresence, MotionDisclosure } from '@/components/motion/list-motion'

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

  it('removes collapsed children from interaction as soon as the group collapses', () => {
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
    expect(view.container.querySelector('[data-motion-disclosure] > div')).toHaveStyle({ opacity: '1' })
  })

  it('changes the group height at once and moves only opacity and transform on expand', () => {
    const view = render(<MotionDisclosure expanded={false} id="children"><button>Child</button></MotionDisclosure>)
    view.rerender(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    const body = view.container.querySelector<HTMLElement>('#children > div')!
    expect(body.style.opacity).toBe('0')
    expect(body.style.transform).toContain('translateY(-12px)')
    expect(body.style.height).toBe('')
    expect(view.container.querySelector('#children')!.className).not.toContain('overflow-hidden')
  })

  it('removes the group in the same render that collapses it', () => {
    const view = render(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    view.rerender(<MotionDisclosure expanded={false} id="children"><button>Child</button></MotionDisclosure>)
    expect(view.container.querySelector('#children')).toHaveAttribute('hidden')
    expect(view.container.querySelector('#children > div')).toBeNull()
  })

  it('does not replay the expand motion for a group that first renders expanded', () => {
    const view = render(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    const body = view.container.querySelector<HTMLElement>('#children > div')!
    expect(body.style.opacity).not.toBe('0')
  })

  it('expands without movement under reduced motion', () => {
    preference.reduced = true
    const view = render(<MotionDisclosure expanded={false} id="children"><button>Child</button></MotionDisclosure>)
    view.rerender(<MotionDisclosure expanded id="children"><button>Child</button></MotionDisclosure>)
    const body = view.container.querySelector<HTMLElement>('#children > div')!
    expect(body.style.opacity).not.toBe('0')
    expect(body.style.transform).not.toContain('translateY(-')
  })

  it('fades content through one CSS keyframe that reduced motion removes', () => {
    const view = render(<ContentFade><p>Habits</p></ContentFade>)
    const fade = view.container.querySelector('[data-content-fade]')!
    expect(fade).not.toHaveAttribute('style')
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    expect(css).toMatch(/\.content-fade \{ animation: content-crossfade var\(--dur-press\) var\(--ease-standard\); \}/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.content-fade \{ animation: none; \}/)
  })

})

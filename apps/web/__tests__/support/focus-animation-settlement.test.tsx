import { render, screen } from '@testing-library/react'
import type { Locator } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Input } from '@/components/ui/input'
import { settleFocusAnimations } from '@/e2e/layout/focus-indicators'

function locatorFor(element: Element) {
  return { evaluate: (evaluate: (element: Element, settings: unknown) => unknown, settings: unknown) => evaluate(element, settings) } as Locator
}

function measuredAnimation(endTime: number) {
  const finish = vi.fn(() => {
    if (!Number.isFinite(endTime)) throw new DOMException('Cannot finish an infinite effect', 'InvalidStateError')
  })
  const effect = { getComputedTiming: () => ({ endTime }) } as AnimationEffect
  return { effect, finish } as unknown as Animation
}

describe('focus animation settlement scope', () => {
  const animations = new Map<Element, Animation[]>()
  const elementAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')
  const documentAnimations = Object.getOwnPropertyDescriptor(Document.prototype, 'getAnimations')

  beforeEach(() => {
    animations.clear()
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) { return animations.get(this) ?? [] },
    })
    Object.defineProperty(Document.prototype, 'getAnimations', {
      configurable: true,
      value() { return [...animations.values()].flat() },
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  })

  afterEach(() => {
    if (elementAnimations) Object.defineProperty(Element.prototype, 'getAnimations', elementAnimations)
    else Reflect.deleteProperty(Element.prototype, 'getAnimations')
    if (documentAnimations) Object.defineProperty(Document.prototype, 'getAnimations', documentAnimations)
    else Reflect.deleteProperty(Document.prototype, 'getAnimations')
    vi.unstubAllGlobals()
  })

  it('settles the Input and its owning ancestor while leaving sibling loading effects running', async () => {
    const { container } = render(<div><Input label="Description" value="" onChange={() => {}} /><span role="status">Loading</span></div>)
    const field = screen.getByRole('textbox', { name: /^Description$/ })
    const fieldAnimation = measuredAnimation(240)
    const ancestorAnimation = measuredAnimation(280)
    const loader = measuredAnimation(Infinity)
    animations.set(field, [fieldAnimation])
    animations.set(container.firstElementChild!, [ancestorAnimation])
    animations.set(screen.getByRole('status'), [loader])
    await settleFocusAnimations(locatorFor(field), '[data-input-root]')
    expect(fieldAnimation.finish).toHaveBeenCalledOnce()
    expect(ancestorAnimation.finish).toHaveBeenCalledOnce()
    expect(loader.finish).not.toHaveBeenCalled()
  })

  it('rejects a nonterminating effect on the measured owner', async () => {
    render(<Input label="Description" value="" onChange={() => {}} />)
    const field = screen.getByRole('textbox', { name: /^Description$/ })
    const infinite = measuredAnimation(Infinity)
    animations.set(field, [infinite])
    await expect(settleFocusAnimations(locatorFor(field), '[data-input-root]')).rejects.toThrow('Focus geometry owner has an animation without a finite end')
    expect(infinite.finish).not.toHaveBeenCalled()
  })

  it('requires the actual field root', async () => {
    render(<Input label="Description" value="" onChange={() => {}} />)
    const field = screen.getByRole('textbox', { name: /^Description$/ })
    await expect(settleFocusAnimations(locatorFor(field), '[data-missing-root]')).rejects.toThrow('Missing field root')
  })
})

import { render, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { HabitCheck } from '@/components/habits/habit-check'

/** These tests drive the real `motion` frame loop, which runs on `requestAnimationFrame`. */
function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining === 0) { resolve(); return }
      requestAnimationFrame(() => step(remaining - 1))
    }
    step(count)
  })
}

async function logOpenCheck() {
  const view = render(<HabitCheck status="empty" label="Open" />)
  const check = view.container.querySelector<HTMLElement>('[data-habit-check]')!
  const openStyle = check.getAttribute('style')
  view.rerender(<HabitCheck status="done" label="Done" />)
  await nextFrames(2)
  return { view, check, openStyle }
}

it('scales the check while the completion spring runs', async () => {
  const { check } = await logOpenCheck()
  expect(check.style.transform).toMatch(/^scale\(0\.\d+\)$/)
})

it('leaves no inline transform on the done check once the completion spring ends', async () => {
  const { check } = await logOpenCheck()
  await waitFor(() => expect(check.getAttribute('style')).not.toContain('transform'))
})

it('restores the open check style when the log is removed while the completion spring runs', async () => {
  const { view, check, openStyle } = await logOpenCheck()
  view.rerender(<HabitCheck status="empty" label="Open" />)
  await nextFrames(4)
  expect(check.getAttribute('style')).toBe(openStyle)
})

it('restores the open check style when the log is removed after the completion spring ends', async () => {
  const { view, check, openStyle } = await logOpenCheck()
  await waitFor(() => expect(check.getAttribute('style')).not.toContain('scale('))
  view.rerender(<HabitCheck status="empty" label="Open" />)
  await nextFrames(4)
  expect(check.getAttribute('style')).toBe(openStyle)
})

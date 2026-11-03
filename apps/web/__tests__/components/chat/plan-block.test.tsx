import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ChatMessage } from '@orbit/shared/types'
import { makeAstraPlan } from '@orbit/shared/test-support/astra-plan-fixtures'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { PlanAnnouncements, PlanBlock } from '@/components/chat/plan-block'

afterEach(cleanup)

describe.each(['en', 'pt-BR'])('Astra plan in %s', locale => {
  const words = locale === 'en' ? en : pt
  const surface = (plan: ReturnType<typeof makeAstraPlan>) => <NextIntlClientProvider locale={locale} messages={words}><PlanBlock plan={plan} /></NextIntlClientProvider>

  it.each(['pending', 'running', 'done', 'failed', 'skipped', 'future'])('exposes the %s state and counts only done steps', status => {
    const plan = makeAstraPlan(locale)
    plan.steps[0]!.status = status
    const { container } = render(surface(plan))
    expect(screen.getByRole('heading', { name: words.chat.plan.title })).toBeVisible()
    const list = screen.getByRole('list', { name: `${words.chat.plan.title}: ${plan.title}` })
    const rows = within(list).getAllByRole('listitem')
    const label = status === 'running' ? words.blockFrame.status.acting : status === 'done' ? words.blockFrame.status.done : status === 'failed' ? words.blockFrame.status.failed : status === 'skipped' ? words.habits.statusDot.skip : words.chat.habitList.pending
    expect(rows[0]).toHaveTextContent(`${plan.steps[0]!.text}, ${label}`)
    expect(rows[0]).toHaveAttribute('data-status', status === 'future' ? 'pending' : status)
    expect(rows[0]!.querySelector('.flex-1')).toHaveStyle({ textDecorationLine: status === 'done' ? 'line-through' : '' })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', status === 'done' ? '1' : '0')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(`${status === 'done' ? 1 : 0} ${locale === 'en' ? 'of' : 'de'} 2`)
    expect(container.textContent).not.toContain('get_habits')
  })

  it('updates the mounted list and count through completion', () => {
    const plan = makeAstraPlan(locale)
    const { rerender } = render(surface(plan))
    const list = screen.getByRole('list')
    const firstRow = screen.getAllByRole('listitem')[0]
    rerender(surface({ ...plan, steps: plan.steps.map(step => ({ ...step, status: 'done' })) }))
    expect(screen.getByRole('list')).toBe(list)
    expect(screen.getAllByRole('listitem')[0]).toBe(firstRow)
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(`2 ${locale === 'en' ? 'of' : 'de'} 2`)
  })

  it('announces running work politely and excludes restored plans', async () => {
    const plan = makeAstraPlan(locale)
    const message: ChatMessage = { id: 'reply', role: 'ai', content: '', timestamp: new Date(), plan }
    const announcement = (messages: ChatMessage[]) => <NextIntlClientProvider locale={locale} messages={words}><PlanAnnouncements messages={messages} /></NextIntlClientProvider>
    const { container, rerender } = render(announcement([{ ...message, restored: true, plan: { ...plan, steps: plan.steps.map(step => ({ ...step, status: 'running' })) } }]))
    expect(container.querySelector('[data-plan-announcement]')).toHaveTextContent('')
    rerender(announcement([{ ...message, plan: { ...plan, steps: [{ ...plan.steps[0]!, status: 'running' }, plan.steps[1]!] } }]))
    await waitFor(() => expect(container.querySelector('[data-plan-announcement]')).toHaveTextContent(`${plan.steps[0]!.text}: ${words.blockFrame.status.acting}`))
    expect(container.querySelector('[data-plan-announcement]')).toHaveAttribute('aria-live', 'polite')
  })
})

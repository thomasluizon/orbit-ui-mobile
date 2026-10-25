import { setupHabitModalSubmit, formLocale, mockProfileState, modalFeedback, dateRequests } from '@/__tests__/support/habit-form-fields'
import userEvent from '@testing-library/user-event'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { formatAPIDate, formatLocaleDate } from '@orbit/shared/utils'

describe.each(['create', 'edit'] as const)('actual %s modal submit feedback', (owner) => {
  const { closed, phraseInput, submitButton, mutation, mount, submit } = setupHabitModalSubmit(owner)

  if (owner === 'create') it.each((['en', 'pt-BR'] as const).flatMap((locale) =>
    (['task', 'habit'] as const).map((type) => ({ locale, type })),
  ))('settles title parsing and repeated edits without an update loop for $locale $type', async ({ locale, type }) => {
    formLocale.language = locale
    const errors = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      if (/Maximum update depth exceeded|Too many re-renders/i.test(String(message))) throw new Error(String(message))
    })
    onTestFinished(() => errors.mockRestore())
    const view = await mount(type)
    const user = userEvent.setup()
    const titleInput = () => screen.getByRole('textbox', { name: 'habits.form.describe' })
    const initialTitle = locale === 'en' ? 'Read every Monday' : 'Ler toda segunda'
    const editedTitle = locale === 'en' ? 'Read every Tuesday' : 'Ler toda terça'
    await user.clear(titleInput())
    await user.type(titleInput(), initialTitle)
    expect(titleInput()).toHaveValue(initialTitle)
    const understanding = () => screen.getByRole('region', { name: 'habits.form.understood' }).textContent
    const initialUnderstanding = type === 'habit' ? understanding() : null
    view.refresh()
    expect(titleInput()).toHaveValue(initialTitle)
    if (type === 'habit') expect(understanding()).toBe(initialUnderstanding)
    await user.clear(titleInput())
    await user.type(titleInput(), editedTitle)
    expect(titleInput()).toHaveValue(editedTitle)
    const editedUnderstanding = type === 'habit' ? understanding() : null
    if (type === 'habit') expect(editedUnderstanding).not.toBe(initialUnderstanding)
    view.refresh()
    expect(titleInput()).toHaveValue(editedTitle)
    if (type === 'habit') expect(understanding()).toBe(editedUnderstanding)
    await user.clear(phraseInput())
    await user.type(phraseInput(), locale === 'en' ? 'tomorrow' : 'amanhã')
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = modalFeedback.create.mock.calls[0]![0]
    expect(request).toMatchObject({ title: type === 'habit' ? locale === 'en' ? 'Read' : 'Ler' : editedTitle, [type === 'habit' ? 'startDate' : 'dueDate']: '2026-10-21' })
    if (type === 'habit') expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Tuesday'] })
    else expect(request.frequencyUnit).toBeUndefined()
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth exceeded|Too many re-renders/i)
  })

  if (owner === 'create') {
    it.each((['task', 'habit'] as const).flatMap((type) => ['en', 'pt-BR'].flatMap((locale) => [
      { type, locale, instant: '2026-10-21T02:40:00Z', timeZone: 'America/Sao_Paulo', date: '2026-10-20', browserDay: '2026-10-21' },
      { type, locale, instant: '2026-10-20T12:40:00Z', timeZone: 'Pacific/Kiritimati', date: '2026-10-21', browserDay: '2026-10-20' },
    ])))('saves an unseeded $locale $type on the $timeZone account day', async ({ type, locale, instant, timeZone, date, browserDay }) => {
      vi.setSystemTime(new Date(instant))
      expect(formatAPIDate(new Date())).toBe(browserDay)
      mockProfileState.timeZone = timeZone
      formLocale.language = locale
      await mount(type)
      const label = type === 'task' ? 'habits.form.taskDate' : 'habits.form.habitStartDate'
      expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveTextContent(formatLocaleDate(date, locale))
      await submit()
      await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
      expect(mutation()).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read', [type === 'task' ? 'dueDate' : 'startDate']: date }))
      expect(dateRequests.request).not.toHaveBeenCalled()
    })

    it.each(['task', 'habit'] as const)('waits for the account timezone before saving an unseeded %s', async (type) => {
      vi.setSystemTime(new Date('2026-10-21T02:40:00Z'))
      mockProfileState.timeZone = undefined
      const view = await mount(type)
      const label = type === 'task' ? 'habits.form.taskDate' : 'habits.form.habitStartDate'
      expect(screen.getByRole('button', { name: `${label}, common.selectDate` })).toBeEnabled()
      expect(submitButton()).toBeEnabled()
      await submit()
      expect(mutation()).not.toHaveBeenCalled()
      expect(phraseInput()).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
      mockProfileState.timeZone = 'America/Sao_Paulo'
      view.refresh()
      expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveTextContent(formatLocaleDate('2026-10-20', 'en'))
      await submit()
      await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
      expect(mutation()).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read', [type === 'task' ? 'dueDate' : 'startDate']: '2026-10-20' }))
      expect(dateRequests.request).not.toHaveBeenCalled()
    })

    it.each(['2026-10-19', '2026-10-26'])('saves deliberate date %s unchanged when the account timezone loads', async (date) => {
      vi.setSystemTime(new Date('2026-10-21T02:40:00Z'))
      mockProfileState.timeZone = undefined
      const view = await mount('task', date)
      mockProfileState.timeZone = 'America/Sao_Paulo'
      view.refresh()
      await submit()
      await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
      expect(mutation()).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read', dueDate: date }))
      expect(dateRequests.request).not.toHaveBeenCalled()
    })
  }

  it('waits for modal opening focus before starting date interactions', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    let ready = false
    const opening = mount('habit').then(() => { ready = true })
    await screen.findByRole('dialog', { name: owner === 'create' ? 'habits.form.newHabit' : 'habits.editHabit' })
    expect(ready).toBe(false)
    expect(screen.getByRole('button', { name: 'common.close' })).not.toHaveFocus()
    await act(async () => { vi.advanceTimersToNextFrame() })
    await opening
    expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    await submit('form')
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(phraseInput()).toHaveFocus()
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(phraseInput()).toHaveFocus()
    expect(mutation()).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each([
    ['en', 'task', 'accept', 'click'],
    ['en', 'habit', 'manual', owner === 'create' ? 'Enter' : 'form'],
    ['pt-BR', 'task', 'manual', 'click'],
    ['pt-BR', 'habit', 'accept', owner === 'create' ? 'Enter' : 'form'],
  ] as const)('keeps %s %s candidate refusal inline through %s recovery after %s', async (locale, type, recovery, method) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    await mount(type)
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    await submit(method)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(phraseInput()).toHaveFocus()
    expect(phraseInput()).toHaveValue('after vacation')
    expect(phraseInput()).toHaveAccessibleDescription(expect.stringContaining(messages.habits.form.dateConfirmationRequired))
    expect(mutation()).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    const picker = () => screen.getByRole('button', { name: new RegExp(type === 'task' ? 'habits.form.taskDate' : 'habits.form.habitStartDate') })
    const date = recovery === 'accept' ? '2026-10-26' : '2026-10-27'
    if (recovery === 'accept') {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
      expect(picker()).toHaveFocus()
    } else {
      fireEvent.click(picker())
      fireEvent.click(document.querySelector<HTMLButtonElement>(`button[data-day="${date}"]`)!)
    }
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(phraseInput()).toHaveValue('')
    expect(screen.queryByText(messages.habits.form.dateConfirmationRequired)).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ title: 'Read', [type === 'task' ? 'dueDate' : 'startDate']: date })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(closed).toHaveBeenCalledWith(false)
    expect(dateRequests.request).toHaveBeenCalledOnce()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each([false, true].flatMap((flexible) => [false, true].map((editAfterReturn) => ({ flexible, editAfterReturn }))))('saves the restored monthly draft after General, flexible=$flexible, edited=$editAfterReturn', async ({ flexible, editAfterReturn }) => {
    await mount('habit')
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Read every Monday' } })
    if (owner === 'create') fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    if (flexible) fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    fireEvent.change(phraseInput(), { target: { value: 'tomorrow' } })
    fireEvent.click(screen.getByRole('button', { name: /habits.form.endDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-22"]')!)
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
    fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
    fireEvent.click(screen.getByRole('radio', { name: flexible ? 'habits.form.timesPerUnit' : 'habits.form.every' }))
    if (editAfterReturn) {
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitYear' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '4' } })
    }
    fireEvent.click(screen.getByRole('button', { name: /habits.form.habitStartDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-21"]')!)
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ title: 'Read every Monday', frequencyUnit: editAfterReturn ? 'Year' : 'Month', frequencyQuantity: editAfterReturn ? 4 : 2, intervalWeeks: 2, startDate: '2026-10-21', endDate: '2026-10-22' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    const submitted = owner === 'create' ? mutation().mock.calls[0]![0] : mutation().mock.calls[0]![0].data
    expect(submitted.isFlexible ?? false).toBe(flexible)
    expect(submitted.days ?? []).toEqual([])
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  if (owner === 'create') it.each((['en', 'pt-BR'] as const).flatMap((locale) =>
    (['title-before-type', 'task-before-title', 'habit-to-task', 'general', 'recurring'] as const).map((transition) => ({ locale, transition })),
  ))('saves the owned title for $locale after $transition', async ({ locale, transition }) => {
    formLocale.language = locale
    await mount(transition === 'title-before-type' ? null : transition === 'task-before-title' ? 'task' : 'habit')
    if (transition === 'task-before-title') expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toBeChecked()
    const title = locale === 'en' ? 'Read every Monday' : 'Ler toda segunda'
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: title } })
    if (transition === 'general') {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
      fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
    } else if (transition !== 'recurring' && transition !== 'task-before-title') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = modalFeedback.create.mock.calls[0]![0]
    expect(request.title).toBe(transition === 'recurring' ? locale === 'en' ? 'Read' : 'Ler' : title)
    if (transition === 'recurring') expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-20' })
    else {
      expect(request.isGeneral ?? false).toBe(transition === 'general')
      expect(request.frequencyUnit).toBeUndefined()
      expect(request.frequencyQuantity).toBeUndefined()
      expect(request.days ?? []).toEqual([])
      if (transition !== 'general') expect(request.dueDate).toBe('2026-10-20')
    }
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  if (owner === 'create') it('keeps a missing type inline and saves the retained draft after selection', async () => {
    await mount(null)
    await submit()
    expect(screen.getByText('habits.form.typeRequired')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
    expect(mutation()).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    expect(screen.queryByText('habits.form.typeRequired')).toBeNull()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it('retains failed saves with the owning create error or edit uncertainty', async () => {
    mutation().mockRejectedValueOnce(new Error('save failed'))
    await mount('task')
    await submit()
    if (owner === 'create') {
      await waitFor(() => expect(modalFeedback.showError).toHaveBeenCalledOnce())
      expect(modalFeedback.showError).toHaveBeenCalledWith('errors.createHabit')
    } else {
      expect(await screen.findByText('habits.form.saveUncertain')).toBeVisible()
      expect(modalFeedback.showError).not.toHaveBeenCalled()
    }
    expect(mutation()).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
  })
})

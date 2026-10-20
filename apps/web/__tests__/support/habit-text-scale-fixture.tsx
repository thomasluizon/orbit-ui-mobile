import { useLayoutEffect, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

export const supportingHabitTitles = ['Parent', 'Branch']

export function HabitTextScaleFixture({ fontBeforeSubscription }: Readonly<{ fontBeforeSubscription?: string }>) {
  const [selecting, setSelecting] = useState(false)
  useLayoutEffect(() => {
    if (fontBeforeSubscription) document.documentElement.style.fontSize = fontBeforeSubscription
  }, [fontBeforeSubscription])
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <button type="button" onClick={() => setSelecting((value) => !value)}>Select rows</button>
    {supportingHabitTitles.map((title, depth) => <HabitRow key={title}
      habit={createMockHabit({ id: title, title })} depth={depth === 0 ? 0 : 1}
      hasChildren childProgress={{ done: 0, total: 2 }} meta={['0 of 2']}
      structuralColumn selectMode={selecting} />)}
  </NextIntlClientProvider>
}

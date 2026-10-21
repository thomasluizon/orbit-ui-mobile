import { useLayoutEffect, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

export const supportingHabitTitles = ['Parent', 'Branch']

export function HabitTextScaleFixture({ fontBeforeSubscription, includeGrandchild = false }: Readonly<{
  fontBeforeSubscription?: string
  includeGrandchild?: boolean
}>) {
  const [selecting, setSelecting] = useState(false)
  const titles = includeGrandchild ? [...supportingHabitTitles, 'Grandchild'] : supportingHabitTitles
  useLayoutEffect(() => {
    if (fontBeforeSubscription) document.documentElement.style.fontSize = fontBeforeSubscription
  }, [fontBeforeSubscription])
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <button type="button" onClick={() => setSelecting((value) => !value)}>Select rows</button>
    {titles.map((title, depth) => <HabitRow key={title}
      habit={createMockHabit({ id: title, title })} depth={depth}
      hasChildren childProgress={{ done: 0, total: 2 }} meta={['0 of 2']}
      structuralColumn selectMode={selecting} />)}
  </NextIntlClientProvider>
}

export function formatWeekdaySchedule(
  days: readonly string[],
  locale: string,
  translate: (key: string) => string,
  useListForm = days.length > 1,
): string {
  const form = useListForm ? 'list' : 'single'
  const phrases = days.map((day) => translate(`dates.weekdaySchedule.${form}.${day.toLowerCase()}`))
  const labels = phrases.map((phrase, index) => {
    const previous = phrases[index - 1]
    const prefix = previous?.slice(0, previous.indexOf(' ') + 1)
    return useListForm && prefix && phrase.startsWith(prefix) ? phrase.slice(prefix.length) : phrase
  })
  return new Intl.ListFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'long', type: 'conjunction',
  }).format(labels)
}

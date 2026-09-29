/** First visible character of a habit title, including joined emoji and combining marks. */
export function habitInitial(title: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(title.trim())[Symbol.iterator]().next().value?.segment
  return first?.toLocaleUpperCase() ?? ''
}

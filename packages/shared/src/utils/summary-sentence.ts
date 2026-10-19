export function getSummaryFirstSentence(summary: string): string {
  const trimmed = summary.trim()
  return trimmed.match(/^.*?[.!?](?:["'”’])?(?=\s|$)/s)?.[0] ?? trimmed
}

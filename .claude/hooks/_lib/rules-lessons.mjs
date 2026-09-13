export function countUnreviewedPendingLessons(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Pending lessons must be text")

  let count = 0
  for (const line of markdown.split(/\r?\n/)) {
    if (/^## Graduated\s*$/.test(line)) break
    if (/^## (\d{4}-\d{2}-\d{2})\b/.test(line)) count++
  }
  return count
}

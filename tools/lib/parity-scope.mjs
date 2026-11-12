// Keep delivery verification and pull request metadata on the same application path rule.
// Only source and style files carry logic, so a binary image or a Markdown note never needs parity.
export const parityPlatform = (path) =>
  /^apps\/(web|mobile)\/(app|components|hooks|stores|lib)\/.+\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/.exec(path)?.[1]

// The platform adapters and layout-shell divergences that justify `parity:exempt`.
// The PR Metadata gate and tools/verify-delivery.mjs test the `## Parity` section against these,
// the gate error and the local worker order list them, and the orchestrate skill points here.
export const parityExemptTerms = [
  "BFF",
  "direct API",
  "cookie",
  "SecureStore",
  "shadcn",
  "StyleSheet",
  "next-intl",
  "i18next",
  "Radix Primitives",
  "rn-primitives",
  "navigation chrome",
  "sidebar",
  "tab bar",
  "command palette",
  "keyboard shortcuts",
  "hover affordances",
]

// The one `## Parity` section parser: the section runs from its heading to the next `## ` heading.
// Each term is a plain string, so a case-insensitive substring test needs no compiled pattern.
export const parityExemptionJustified = (body) => {
  const section = (body ?? "").split(/^## Parity[ \t]*\r?$/m)[1]?.split(/^## /m)[0].toLowerCase() ?? ""
  return parityExemptTerms.some((term) => section.includes(term.toLowerCase()))
}

// Keep delivery verification and pull request metadata on the same application path rule.
// Only source and style files carry logic, so a binary image or a Markdown note never needs parity.
export const parityPlatform = (path) =>
  /^apps\/(web|mobile)\/(app|components|hooks|stores|lib)\/.+\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/.exec(path)?.[1]

// The platform adapters and layout-shell divergences that justify `parity:exempt`.
// The PR Metadata gate tests the `## Parity` section against these, and the worker order lists them.
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

const escapeForPattern = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const parityExemptPattern = new RegExp(parityExemptTerms.map(escapeForPattern).join("|"), "i")

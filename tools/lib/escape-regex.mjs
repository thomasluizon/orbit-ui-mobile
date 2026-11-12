/** The one regular expression escape for tools: a pattern built from a runtime value matches that value literally. */
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

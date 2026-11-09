// Keep delivery verification and pull request metadata on the same application path rule.
// Only source and style files carry logic, so a binary image or a manifest never needs parity.
export const parityPlatform = (path) =>
  /^apps\/(web|mobile)\/(app|components|hooks|stores|lib)\/.+\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/.exec(path)?.[1]

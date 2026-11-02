// Keep delivery verification and pull request metadata on the same application path rule.
export const parityPlatform = (path) => /^apps\/(web|mobile)\/(app|components|hooks|stores|lib)\//.exec(path)?.[1]

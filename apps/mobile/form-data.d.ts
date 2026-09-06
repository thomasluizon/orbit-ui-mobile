// expo/fetch is the default global fetch in Expo SDK 57 and uses WHATWG FormData,
// whose append() takes a Blob/File part plus an optional filename. React Native's
// bundled FormData type only declares the 2-argument form.
interface FormData {
  append(name: string, value: Blob, fileName?: string): void
}

declare function fetch(
  ...args: Parameters<typeof import('expo/fetch').fetch>
): ReturnType<typeof import('expo/fetch').fetch>

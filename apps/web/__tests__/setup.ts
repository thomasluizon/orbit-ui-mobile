import '@testing-library/jest-dom'
import { AsyncLocalStorage } from 'node:async_hooks'

Object.defineProperty(globalThis, 'AsyncLocalStorage', {
  value: AsyncLocalStorage,
  configurable: true,
})

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

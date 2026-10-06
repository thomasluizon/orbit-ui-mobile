import '@testing-library/jest-dom'
import { AsyncLocalStorage } from 'node:async_hooks'
import { vi } from 'vitest'

Object.defineProperty(globalThis, 'AsyncLocalStorage', {
  value: AsyncLocalStorage,
  configurable: true,
})

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  })
}

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

if (typeof SVGElement !== 'undefined') {
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
    configurable: true,
    value: function (this: SVGElement) {
      if (this.tagName !== 'circle') throw new Error('Only circle geometry is supported by this test double')
      return 2 * Math.PI * Number(this.getAttribute('r'))
    },
  })
}

if (typeof document !== 'undefined' && !('fonts' in document)) {
  const fontFaceSet = new EventTarget()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: Object.assign(fontFaceSet, { ready: Promise.resolve(fontFaceSet) }),
  })
}

if (typeof window !== 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } })
}

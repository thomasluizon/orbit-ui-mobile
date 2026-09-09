import '@testing-library/jest-dom'

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

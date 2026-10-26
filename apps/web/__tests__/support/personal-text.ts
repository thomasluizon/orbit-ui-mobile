import { vi } from 'vitest'

export function personalText(text: string | RegExp) {
  const matches = (value: string) => typeof text === 'string' ? value.replace(/\s+/gu, ' ').trim() === text.replace(/\s+/gu, ' ').trim() : text.test(value)
  return (content: string, element: Element | null) => {
    if (element?.hasAttribute('data-personal-text')) return matches(element.textContent)
    return !element?.closest('[data-personal-text]') && matches(content)
  }
}

export function measureClampedPersonalText() {
  const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-personal-text') ? 60 : 0
  })
  const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-personal-text') ? 40 : 0
  })
  return () => { scrollHeight.mockRestore(); clientHeight.mockRestore() }
}

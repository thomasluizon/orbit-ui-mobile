export function personalText(text: string | RegExp) {
  const matches = (value: string) => typeof text === 'string' ? value.replace(/\s+/gu, ' ').trim() === text.replace(/\s+/gu, ' ').trim() : text.test(value)
  return (content: string, element: Element | null) => {
    if (element?.hasAttribute('data-personal-text')) return matches(element.textContent)
    return !element?.closest('[data-personal-text]') && matches(content)
  }
}

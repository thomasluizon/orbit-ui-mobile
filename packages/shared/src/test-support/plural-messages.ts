import { isLiteralElement, isNumberElement, isPluralElement, isPoundElement, isSelectElement, parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

type Messages = { [key: string]: string | Messages }

function messageElements(elements: MessageFormatElement[]): MessageFormatElement[] {
  return elements.flatMap((element) => isPluralElement(element) || isSelectElement(element)
    ? [element, ...Object.values(element.options).flatMap((option) => messageElements(option.value))]
    : [element])
}

export function pluralMessageCases(messages: Messages, prefix = ''): { key: string; values: (count: number) => Record<string, string | number> }[] {
  return Object.entries(messages).flatMap(([key, message]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof message !== 'string') return pluralMessageCases(message, path)
    const elements = messageElements(parse(message, { ignoreTag: true }))
    if (!elements.some(isPluralElement)) return []
    const numericNames = new Set(elements.filter((element) => isNumberElement(element) || isPluralElement(element)).map((element) => element.value))
    return [{ key: path, values: (count: number) => Object.fromEntries(elements
      .filter((element) => !isLiteralElement(element) && !isPoundElement(element))
      .map((element) => [element.value, numericNames.has(element.value) ? count : element.value])) }]
  })
}

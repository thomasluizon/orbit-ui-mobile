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


export const countedMessageExamples = [
  { locale: 'en', queued: ['No connection. 0 changes held on the device.', 'No connection. 1 change held on the device.', 'No connection. 2 changes held on the device.'], syncing: ['Sending 0 changes.', 'Sending 1 change.', 'Sending 2 changes.'], items: ['0 items', '1 item', '2 items'], days: ['Your streak reached 0 days.', 'Your streak reached 1 day.', 'Your streak reached 2 days.'] },
  { locale: 'pt-BR', queued: ['Sem conexão. 0 alterações guardadas no aparelho.', 'Sem conexão. 1 alteração guardada no aparelho.', 'Sem conexão. 2 alterações guardadas no aparelho.'], syncing: ['Enviando 0 alterações.', 'Enviando 1 alteração.', 'Enviando 2 alterações.'], items: ['0 itens', '1 item', '2 itens'], days: ['A sua sequência chegou a 0 dias.', 'A sua sequência chegou a 1 dia.', 'A sua sequência chegou a 2 dias.'] },
] as const

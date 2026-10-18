import type { ChoiceBlock, PickListBlock } from '../types/chat'
import { choiceBlockFixture, pickListBlockFixture } from './choice-fixtures'

export const choiceLayoutCopy = {
  en: { labels: ['Walk after lunch, 20', 'Read before bed, 10'], description: 'A short walk right after' },
  'pt-BR': { labels: ['Meditar 5 min ao', 'Ler antes de dormir,'], description: 'Uma pausa curta logo ao' },
}

export function makeChoiceLayoutBlock(locale: keyof typeof choiceLayoutCopy, multiSelect: boolean): ChoiceBlock {
  const copy = choiceLayoutCopy[locale]
  return { ...choiceBlockFixture, multiSelect, options: copy.labels.map((label, index) => ({ id: String(index), label, description: copy.description })) }
}

export function makePickListLayoutBlock(locale: keyof typeof choiceLayoutCopy): PickListBlock {
  return { ...pickListBlockFixture, items: locale === 'en' ? [
    { id: '1', label: 'Walk for a few minutes in the morning before work', detail: 'Walk after breakfast.' },
    { id: '2', label: 'Read a few pages before going to sleep', detail: 'Keep a book by your bed.' },
  ] : [
    { id: '1', label: 'Caminhar por alguns minutos pela manhã antes do trabalho', detail: 'Caminhe após o café.' },
    { id: '2', label: 'Ler algumas páginas antes de dormir', detail: 'Deixe um livro à mão.' },
  ] }
}

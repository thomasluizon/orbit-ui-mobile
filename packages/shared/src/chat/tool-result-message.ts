import en from '../i18n/en.json'
import { LANGUAGE_OPTIONS } from '../utils/preferences-options'
import { toolResultMessageParamsSchema } from '../types/chat'
import type { ActionResult } from '../types/chat'

type TranslateResult = (key: string, params?: Record<string, string | number>) => string

function messageTemplate(messageKey: string): string | undefined {
  if (!messageKey.startsWith('chat.toolResult.')) return undefined
  const suffix = messageKey.slice('chat.toolResult.'.length)
  const template = suffix.split('.').reduce<unknown>((value, segment) =>
    value && typeof value === 'object' && Object.hasOwn(value, segment)
      ? Reflect.get(value, segment) : undefined, en.chat.toolResult)
  return typeof template === 'string' ? template : undefined
}

export function getToolResultFieldLabel(fieldName: string, translate: TranslateResult): string | undefined {
  if (fieldName === 'habitIds' || fieldName === 'habit_ids') return translate('nav.habits')
  const field = fieldName.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return Object.hasOwn(en.chat.operation.field, field)
    ? translate(`chat.operation.field.${field}`) : undefined
}

function mapParameters(
  messageKey: string, parameters: Record<string, string | number>, translate: TranslateResult,
): { messageKey: string; parameters: Record<string, string | number> } {
  if (typeof parameters.fieldName === 'string') {
    const label = getToolResultFieldLabel(parameters.fieldName, translate)
    if (!label) return {
      messageKey: messageKey.endsWith('Required') ? 'chat.toolResult.needsClarification' : 'chat.toolResult.invalidDetails', parameters: {},
    }
    parameters.fieldName = label
  }
  if (typeof parameters.language === 'string') {
    const label = LANGUAGE_OPTIONS.find((language) => language.value === parameters.language)?.label
    if (!label) return { messageKey: 'chat.toolResult.languageUpdated', parameters: {} }
    parameters.language = label
  }
  return { messageKey, parameters }
}

export function resolveToolResultMessage(
  row: Pick<ActionResult, 'messageKey' | 'params'>, translate: TranslateResult, has: (key: string) => boolean,
): string | undefined {
  if (!row.messageKey || !has(row.messageKey)) return undefined
  const template = messageTemplate(row.messageKey)
  if (!template) return undefined
  const parameters: Record<string, string | number> = { entityName: '', hasEntityName: row.params?.entityName ? 'yes' : 'no' }
  for (const [key, schema] of Object.entries(toolResultMessageParamsSchema.shape)) {
    const required = template.includes(`{${key}}`) || template.includes(`{${key},`)
    const value = schema.parse(row.params?.[key as keyof NonNullable<ActionResult['params']>])
    if (required && key !== 'entityName' && (value === undefined || value === '')) return undefined
    if (required && (typeof value === 'string' || typeof value === 'number')) parameters[key] = value
  }
  const mapped = mapParameters(row.messageKey, parameters, translate)
  return translate(mapped.messageKey, mapped.parameters).trim()
}

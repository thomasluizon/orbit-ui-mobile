import { describe, expect, it } from 'vitest'
import { buildChatClientContext } from '../chat/client-context'
import { chatClientContextSchema } from '../types/chat'

describe('buildChatClientContext', () => {
  it.each(['web', 'mobile'] as const)('sends the chosen clock and capabilities on %s', (platform) => {
    const context = buildChatClientContext({
      platform,
      locale: 'en',
      uses24HourClock: true,
      messageOrigin: 'followUp',
      entryPointIntent: 'support',
    })

    expect(chatClientContextSchema.parse(context)).toEqual(context)
    expect(context).toMatchObject({
      platform,
      timeFormat: '24h',
      supportsHabitListCard: true,
      supportsPendingOperationChanges: true,
      messageOrigin: 'followUp',
      entryPointIntent: 'support',
    })
  })

  it('uses the locale default until the profile resolves and omits absent optional hints', () => {
    const context = buildChatClientContext({ platform: 'mobile', locale: 'en' })
    expect(context.timeFormat).toBe('12h')
    expect(context).not.toHaveProperty('messageOrigin')
    expect(context).not.toHaveProperty('entryPointIntent')
  })

  it('uses a 12-hour profile even in a 24-hour locale', () => {
    expect(buildChatClientContext({ platform: 'web', locale: 'pt-BR', uses24HourClock: false }).timeFormat).toBe('12h')
  })
})

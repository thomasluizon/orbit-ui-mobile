import { describe, expect, it } from 'vitest'
import { titleSentryEventByContent } from '../utils/sentry-event-title'

describe('titleSentryEventByContent', () => {
  it.each([
    [undefined, 'Message'],
    ['Error', 'Error'],
  ])('turns off the synthetic flag and keeps the stack, with the type %s read as %s', (type, titled) => {
    const stacktrace = { frames: [{ function: 'anonymous' }] }
    const event = { exception: { values: [{ type, value: 'turnstile_load_failed', stacktrace, mechanism: { synthetic: true } }] } }

    expect(titleSentryEventByContent(event).exception.values[0]).toEqual({
      type: titled, value: 'turnstile_load_failed', stacktrace, mechanism: { synthetic: false },
    })
  })

  it.each([
    {},
    { exception: {} },
    { exception: { values: [{ type: 'TypeError' }] } },
    { exception: { values: [{ type: 'TypeError', mechanism: {} }] } },
  ])('leaves an event that is not synthetic as it is: %o', (event) => {
    const before = structuredClone(event)

    expect(titleSentryEventByContent(event)).toEqual(before)
  })
})

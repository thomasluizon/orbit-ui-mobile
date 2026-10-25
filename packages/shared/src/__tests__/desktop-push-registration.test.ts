import { describe, expect, it } from 'vitest'
import { desktopPushRegistrationSchema } from '../types/push-subscription'

describe('append-only desktop push registration', () => {
  it.each(['org.useorbit.desktop', 'org.useorbit.desktop.staging'])('accepts the API desktop APNs topic %s', (apnsTopic) => {
    expect(desktopPushRegistrationSchema.parse({
      endpoint: 'abcdef012345', p256dh: 'apns', auth: 'apns', apnsTopic,
      deviceId: '11111111-1111-4111-8111-111111111111',
    }).apnsTopic).toBe(apnsTopic)
  })

  it('accepts the WNS sentinel and stable UUID without requiring an APNs topic', () => {
    expect(desktopPushRegistrationSchema.parse({
      endpoint: 'https://dm3p.notify.windows.com/?token=channel', p256dh: 'wns', auth: 'wns', apnsTopic: null,
      deviceId: '11111111-1111-4111-8111-111111111111',
    }).p256dh).toBe('wns')
  })
})

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import appConfig from '../../app.json'

const require = createRequire(import.meta.url)
const withAudio = require('expo-audio/app.plugin.js').default

describe('Android foreground services', () => {
  it('does not register background audio permissions or services', async () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      ]),
    )

    const plugin = appConfig.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-audio',
    )

    expect(plugin).toBeDefined()
    if (!Array.isArray(plugin)) throw new Error('expo-audio plugin configuration is missing')
    expect(plugin[1].enableBackgroundPlayback).toBe(false)

    const recordingPlugin = appConfig.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === '@siteed/audio-studio',
    )
    if (!Array.isArray(recordingPlugin)) throw new Error('audio-studio plugin configuration is missing')
    expect(recordingPlugin[1].enableBackgroundAudio).toBe(false)

    const configured = withAudio({ name: 'Orbit', slug: 'orbit' }, plugin[1])

    expect(configured.android?.permissions ?? []).toContain('android.permission.RECORD_AUDIO')
    expect(configured.android?.permissions ?? []).not.toContain('android.permission.FOREGROUND_SERVICE')
    expect(configured.android?.permissions ?? []).not.toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK')
    expect(configured.android?.permissions ?? []).not.toContain('android.permission.FOREGROUND_SERVICE_MICROPHONE')

    const manifestMod = configured.mods?.android?.manifest
    if (!manifestMod) throw new Error('expo-audio registered no manifest mod')

    const manifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        application: [{ $: { 'android:name': '.MainApplication' }, service: [] }],
      },
    }
    const result = await manifestMod({
      ...configured,
      modResults: manifest,
      modRequest: {
        projectRoot: '.',
        platformProjectRoot: '.',
        modName: 'manifest',
        platform: 'android',
        introspect: false,
      },
      modRawConfig: configured,
    })

    expect(result.modResults.manifest.application?.[0]?.service ?? []).toEqual([])
  })
})

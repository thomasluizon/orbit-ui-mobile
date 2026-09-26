import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import appConfig from '../../app.json'

const require = createRequire(import.meta.url)
const withAudio = require('expo-audio/app.plugin.js').default

function pluginOptions(name: string): Record<string, unknown> {
  const entry = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === name,
  )
  if (!Array.isArray(entry) || typeof entry[1] !== 'object') {
    throw new Error(`${name} plugin configuration is missing`)
  }
  return entry[1]
}

describe('Android foreground services', () => {
  it('does not register background audio permissions or services', async () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      ]),
    )

    const audioOptions = pluginOptions('expo-audio')
    expect(audioOptions.enableBackgroundPlayback).toBe(false)

    const recordingOptions = pluginOptions('@siteed/audio-studio')
    expect(recordingOptions.enableBackgroundAudio).toBe(false)

    const configured = withAudio({ name: 'Orbit', slug: 'orbit' }, audioOptions)

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

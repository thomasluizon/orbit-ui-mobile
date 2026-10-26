import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConfigPlugin } from '@expo/config-plugins'
import { compileModsAsync } from '@expo/config-plugins'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const createConfig = require('../../app.config.js') as () => { plugins: (string | [string, unknown])[] }
const plist = (require('@expo/plist') as typeof import('@expo/plist')).default

it('starts React Native through the Expo scene delegate generated from the installed template', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-scene-'))
  try {
    execFileSync('/usr/bin/tar', ['-xzf', require.resolve('expo/template.tgz'), '-C', directory, 'package/ios'])
    const projectRoot = join(directory, 'package')
    const entry = createConfig().plugins.find((plugin) => plugin === './plugins/with-ios-scene')
    const config = { name: 'HelloWorld', slug: 'orbit' }
    const configured = entry ? (require('../../plugins/with-ios-scene') as ConfigPlugin)(config) : config
    await compileModsAsync(configured, { projectRoot, platforms: ['ios'] })
    const properties = plist.parse(readFileSync(join(projectRoot, 'ios/HelloWorld/Info.plist'), 'utf8'))
    expect(properties).toHaveProperty('UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName', 'EXExpoAppSceneDelegate')
    const delegate = readFileSync(join(projectRoot, 'ios/HelloWorld/AppDelegate.swift'), 'utf8')
    expect(delegate).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider')
    expect(delegate).toContain('reactNativeFactory = factory')
    expect(delegate).not.toContain('window = UIWindow(frame: UIScreen.main.bounds)')
    expect(delegate).not.toContain('factory.startReactNative(')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

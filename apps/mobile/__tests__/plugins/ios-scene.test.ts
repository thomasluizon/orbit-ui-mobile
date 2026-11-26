import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileModsAsync } from '@expo/config-plugins'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const plist = (require('@expo/plist') as typeof import('@expo/plist')).default

it('starts React Native through the Expo scene delegate generated from the installed template', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-scene-'))
  try {
    execFileSync('/usr/bin/tar', ['-xzf', require.resolve('expo/template.tgz'), '-C', directory, 'package/ios'])
    const projectRoot = join(directory, 'package')
    const config = { name: 'HelloWorld', slug: 'orbit' }
    await compileModsAsync(config, { projectRoot, platforms: ['ios'] })
    const properties = plist.parse(readFileSync(join(projectRoot, 'ios/HelloWorld/Info.plist'), 'utf8'))
    expect(properties).toHaveProperty('UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName', '$(PRODUCT_MODULE_NAME).SceneDelegate')
    const scene = readFileSync(join(projectRoot, 'ios/HelloWorld/SceneDelegate.swift'), 'utf8')
    expect(scene).toContain('class SceneDelegate: ExpoAppSceneDelegate')
    const delegate = readFileSync(join(projectRoot, 'ios/HelloWorld/AppDelegate.swift'), 'utf8')
    expect(delegate).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider')
    expect(delegate).toContain('reactNativeFactory = factory')
    expect(delegate).not.toContain('window = UIWindow(frame: UIScreen.main.bounds)')
    expect(delegate).not.toContain('factory.startReactNative(')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ConfigPlugin } from '@expo/config-plugins'
import { compileModsAsync } from '@expo/config-plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const withWidget = require('../../plugins/with-ios-widget') as ConfigPlugin
interface Reference { value: string; comment: string }
interface NativeTarget { buildConfigurationList: string; buildPhases: Reference[]; dependencies: Reference[] }
interface XcodeProject {
  parseSync(): void
  writeSync(): string
  getFirstTarget(): { uuid: string; firstTarget: NativeTarget }
  getFirstProject(): { firstProject: { targets: Reference[]; mainGroup: string; knownRegions: string[] } }
  pbxTargetByName(name: string): NativeTarget
  pbxXCConfigurationList(): Record<string, { buildConfigurations: Reference[] }>
  pbxXCBuildConfigurationSection(): Record<string, { buildSettings: Record<string, string> }>
  hash: { project: { objects: {
    PBXNativeTarget: Record<string, NativeTarget>
    PBXTargetDependency: Record<string, { target: string }>
    PBXSourcesBuildPhase: Record<string, { files: Reference[] }>
    PBXCopyFilesBuildPhase: Record<string, string | { dstSubfolderSpec: number; files: Reference[] }>
    PBXGroup: Record<string, { children: Reference[] }>
  } } }
}
const xcode = require('xcode') as { project(path: string): XcodeProject }
const plist = (require('@expo/plist') as typeof import('@expo/plist')).default
const directories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

async function generate(variant: 'production' | 'staging') {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-widget-project-'))
  directories.push(directory)
  execFileSync('/usr/bin/tar', ['-xzf', require.resolve('expo/template.tgz'), '-C', directory, 'package/ios'])
  const root = join(directory, 'package')
  const bundleIdentifier = `org.useorbit.app${variant === 'staging' ? '.staging' : ''}`
  const config = { name: 'HelloWorld', slug: 'orbit', scheme: variant === 'staging' ? 'orbit-staging' : 'orbit',
    version: '1.2.3', ios: { bundleIdentifier, buildNumber: '42', supportsTablet: true } }
  const run = () => compileModsAsync(withWidget(structuredClone(config)), { projectRoot: root, platforms: ['ios'] })
  await run()
  const project = xcode.project(join(root, 'ios/HelloWorld.xcodeproj/project.pbxproj'))
  project.parseSync()
  return { root, project, bundleIdentifier, run }
}

describe('WidgetKit prebuild plugin using the installed Expo project template', () => {
  it('registers only iOS mods', () => {
    const config = withWidget({ name: 'Orbit', slug: 'orbit', ios: { bundleIdentifier: 'org.useorbit.app' } }) as ReturnType<ConfigPlugin> & { mods?: Record<string, unknown> }
    expect(Object.keys(config.mods ?? {})).toEqual(['ios'])
  })
  it.each(['production', 'staging'] as const)('embeds a compile dependency with scoped %s identity and localized sources', async (variant) => {
    const { root, project, bundleIdentifier } = await generate(variant)
    const app = project.getFirstTarget().firstTarget
    const widget = project.pbxTargetByName('"OrbitWidgetExtension"')
    expect(widget).toBeDefined()
    expect(app.dependencies).toHaveLength(1)
    const objects = project.hash.project.objects
    expect(project.writeSync()).not.toContain('= undefined;')
    const projectRoot = project.getFirstProject().firstProject
    const widgetGroup = objects.PBXGroup[projectRoot.mainGroup]?.children.find((child) => child.comment === 'OrbitWidgetExtension')
    expect(widgetGroup).toBeDefined()
    expect(objects.PBXGroup[widgetGroup!.value]?.children).toHaveLength(7)
    expect(projectRoot.knownRegions).toContain('"pt-BR"')
    const dependency = objects.PBXTargetDependency[app.dependencies[0]!.value]!
    expect(objects.PBXNativeTarget[dependency.target]).toEqual(widget)
    const phases = widget.buildPhases.map((phase) => objects.PBXSourcesBuildPhase[phase.value]).filter(Boolean)
    expect(phases).toHaveLength(1)
    expect(phases[0]?.files).toHaveLength(5)
    const embed = Object.values(objects.PBXCopyFilesBuildPhase).filter((phase) => typeof phase === 'object')
    expect(embed).toEqual([expect.objectContaining({ dstSubfolderSpec: 13, files: [expect.any(Object)] })])
    const targetRoot = join(root, 'ios/OrbitWidgetExtension')
    const manifest = plist.parse(readFileSync(join(targetRoot, 'Info.plist'), 'utf8'))
    expect(manifest).toMatchObject({ CFBundleShortVersionString: '1.2.3', CFBundleVersion: '42',
      OrbitWidgetAppGroup: `group.${bundleIdentifier}.widget`, NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' } })
    for (const locale of ['en', 'pt-BR']) expect(existsSync(join(targetRoot, `${locale}.lproj/Localizable.strings`))).toBe(true)
    for (const entitlements of [join(root, 'ios/HelloWorld/HelloWorld.entitlements'), join(targetRoot, 'OrbitWidgetExtension.entitlements')]) {
      expect(plist.parse(readFileSync(entitlements, 'utf8'))).toMatchObject({ 'com.apple.security.application-groups': [`group.${bundleIdentifier}.widget`] })
    }
    const configurations = project.pbxXCConfigurationList()[widget.buildConfigurationList]!.buildConfigurations
    for (const configuration of configurations) {
      const settings = project.pbxXCBuildConfigurationSection()[configuration.value]!.buildSettings
      expect(settings).toMatchObject({ PRODUCT_BUNDLE_IDENTIFIER: `${bundleIdentifier}.widget`,
        TARGETED_DEVICE_FAMILY: '"1,2"', IPHONEOS_DEPLOYMENT_TARGET: '17.4', SKIP_INSTALL: 'YES', APPLICATION_EXTENSION_API_ONLY: 'YES' })
      expect(settings).not.toHaveProperty('DEVELOPMENT_TEAM')
      expect(settings).not.toHaveProperty('PROVISIONING_PROFILE_SPECIFIER')
    }
  })

  it('regenerates without duplicating targets, dependencies or embedded products', async () => {
    const { root, run } = await generate('staging')
    await run()
    const project = xcode.project(join(root, 'ios/HelloWorld.xcodeproj/project.pbxproj'))
    project.parseSync()
    expect(project.getFirstProject().firstProject.targets).toHaveLength(2)
    expect(project.getFirstTarget().firstTarget.dependencies).toHaveLength(1)
  })

  it('scopes provisioning profiles to their own targets', async () => {
    vi.stubEnv('IOS_PROVISIONING_PROFILE_NAME', 'App Distribution')
    vi.stubEnv('IOS_WIDGET_PROVISIONING_PROFILE_NAME', 'Widget Distribution')
    const { project } = await generate('staging')
    for (const [target, profile] of [[project.getFirstTarget().firstTarget, 'App Distribution'],
      [project.pbxTargetByName('"OrbitWidgetExtension"'), 'Widget Distribution']] as const) {
      for (const configuration of project.pbxXCConfigurationList()[target.buildConfigurationList]!.buildConfigurations) {
        expect(project.pbxXCBuildConfigurationSection()[configuration.value]!.buildSettings.PROVISIONING_PROFILE_SPECIFIER).toBe(`"${profile}"`)
      }
    }
  })

  it('keeps Swift widget fallback colors generated from the Android palette', async () => {
    const { generateWidgetColors } = await import('../../scripts/generate-widget-colors')
    const source = resolve('modules/orbit-widget/ios/Shared/WidgetColors.generated.swift')
    const before = readFileSync(source, 'utf8')
    await generateWidgetColors()
    expect(readFileSync(source, 'utf8')).toBe(before)
  })
})

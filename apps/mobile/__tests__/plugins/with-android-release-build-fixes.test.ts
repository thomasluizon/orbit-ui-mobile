import type { AndroidConfig, ExportedConfig, ExportedConfigWithProps } from '@expo/config-plugins'
import { describe, expect, it } from 'vitest'

import withAndroidReleaseBuildFixes from '../../plugins/with-android-release-build-fixes'

type PropertiesItem = AndroidConfig.Properties.PropertiesItem

const TEMPLATE_DEFAULT = '-Xmx2048m -XX:MaxMetaspaceSize=512m'
const CLOBBERED_VALUE = '-Xmx4g -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'

async function resolveJvmArgs(startingValue: string | null): Promise<string> {
  const config = withAndroidReleaseBuildFixes({ name: 'Orbit', slug: 'orbit' }) as ExportedConfig
  const gradlePropertiesMod = config.mods?.android?.gradleProperties

  if (!gradlePropertiesMod) {
    throw new Error('plugin registered no gradleProperties mod')
  }

  const modResults: PropertiesItem[] =
    startingValue === null
      ? []
      : [{ type: 'property', key: 'org.gradle.jvmargs', value: startingValue }]

  const modConfig: ExportedConfigWithProps<PropertiesItem[]> = {
    ...config,
    modResults,
    modRequest: {
      projectRoot: '.',
      platformProjectRoot: '.',
      modName: 'gradleProperties',
      platform: 'android',
      introspect: false,
    },
    modRawConfig: config,
  }

  const result = await gradlePropertiesMod(modConfig)

  const jvmArgs = result.modResults.find(
    (property): property is Extract<PropertiesItem, { type: 'property' }> =>
      property.type === 'property' && property.key === 'org.gradle.jvmargs',
  )

  return jvmArgs?.value ?? ''
}

describe('withAndroidReleaseBuildFixes gradle.properties memory', () => {
  it('raises the template heap and metaspace to the values R8 and the KSP worker need', async () => {
    const value = await resolveJvmArgs(TEMPLATE_DEFAULT)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
  })

  it('carries the encoding and heap-dump flags so nothing has to re-add them after prebuild', async () => {
    const value = await resolveJvmArgs(TEMPLATE_DEFAULT)

    expect(value).toContain('-Dfile.encoding=UTF-8')
    expect(value).toContain('-XX:+HeapDumpOnOutOfMemoryError')
  })

  it('writes the property when the template omits it entirely', async () => {
    const value = await resolveJvmArgs(null)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
  })

  it('restores the heap when something already lowered it', async () => {
    const value = await resolveJvmArgs(CLOBBERED_VALUE)

    expect(value).toContain('-Xmx6144m')
    expect(value).toContain('-XX:MaxMetaspaceSize=2048m')
    expect(value).not.toContain('-Xmx4g')
    expect(value).not.toContain('MaxMetaspaceSize=1024m')
  })

  it('is idempotent and never duplicates a flag', async () => {
    const once = await resolveJvmArgs(TEMPLATE_DEFAULT)
    const twice = await resolveJvmArgs(once)

    expect(twice).toBe(once)
    expect(twice.match(/-Xmx/g)).toHaveLength(1)
    expect(twice.match(/-XX:MaxMetaspaceSize=/g)).toHaveLength(1)
    expect(twice.match(/-Dfile\.encoding=/g)).toHaveLength(1)
  })
})

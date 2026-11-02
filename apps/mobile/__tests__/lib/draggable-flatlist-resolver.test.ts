import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { draggableFlatListNativeAdapter } from '@/scripts/draggable-flatlist-resolver.js'

const loadConfig = createRequire(import.meta.url)
const config = loadConfig('../../metro.config.js')
const component = loadConfig.resolve('react-native-draggable-flatlist/src/components/DraggableFlatList.tsx')
const adapter = path.resolve(import.meta.dirname, '../../lib/draggable-flatlist-native.ts')

it.each(['src/components/DraggableFlatList.tsx', 'lib/module/components/DraggableFlatList.js', 'lib/commonjs/components/DraggableFlatList.js'])(
  'routes the installed list entry through the Android adapter: %s', (entry) => {
    const origin = component.replace('src/components/DraggableFlatList.tsx', entry)
    for (const originModulePath of [origin, origin.replace(/\//g, '\\')]) {
      const context = { originModulePath, resolveRequest: vi.fn() }
      expect(config.resolver.resolveRequest(context, 'react-native', 'android')).toEqual({ type: 'sourceFile', filePath: adapter })
      expect(context.resolveRequest).not.toHaveBeenCalled()
    }
  },
)

it.each([
  { platform: 'ios', moduleName: 'react-native', origin: component },
  { platform: 'web', moduleName: 'react-native', origin: component },
  { platform: null, moduleName: 'react-native', origin: component },
  { platform: 'android', moduleName: 'react-native-reanimated', origin: component },
  { platform: 'android', moduleName: 'react-native', origin: adapter },
  { platform: 'android', moduleName: 'react-native', origin: component.replace('DraggableFlatList.tsx', 'CellRendererComponent.tsx') },
])('delegates other requests to Metro: $platform, $moduleName, $origin', ({ platform, moduleName, origin }) => {
  const resolution = { type: 'sourceFile', filePath: loadConfig.resolve('react-native') }
  const context = { originModulePath: origin, resolveRequest: vi.fn(() => resolution) }
  expect(config.resolver.resolveRequest(context, moduleName, platform)).toBe(resolution)
  expect(context.resolveRequest).toHaveBeenCalledExactlyOnceWith(context, moduleName, platform)
  expect(draggableFlatListNativeAdapter(moduleName, origin, platform)).toBeUndefined()
})

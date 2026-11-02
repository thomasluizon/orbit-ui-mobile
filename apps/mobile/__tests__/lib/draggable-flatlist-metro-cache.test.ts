import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it, vi } from 'vitest'

const loadConfig = createRequire(import.meta.url)
const config = loadConfig('../../metro.config.js')
const { default: DependencyGraph } = loadConfig('@expo/metro/metro/node-haste/DependencyGraph')
const packageRoot = path.dirname(loadConfig.resolve('react-native-draggable-flatlist/package.json'))
const adapter = path.resolve(import.meta.dirname, '../../lib/draggable-flatlist-native.ts')

it.each(['src', 'lib/module', 'lib/commonjs'].flatMap((tree) => [
  { tree, siblingFirst: true },
  { tree, siblingFirst: false },
]))('uses the Android adapter through Metro’s directory cache ($tree, sibling first: $siblingFirst)', ({ tree, siblingFirst }) => {
  const extension = tree === 'src' ? 'tsx' : 'js'
  const list = path.join(packageRoot, tree, `components/DraggableFlatList.${extension}`)
  const sibling = path.join(packageRoot, tree, `components/NestableDraggableFlatList.${extension}`)
  const coreResolution = { type: 'sourceFile', filePath: loadConfig.resolve('react-native') }
  const resolveRequest = vi.fn(() => coreResolution)
  const resolveDependency = vi.fn((originModulePath: string) => config.resolver.resolveRequest(
    { originModulePath, resolveRequest }, 'react-native', 'android',
  ))
  const graph = { _resolutionCache: new Map(), _moduleResolver: { resolveDependency } }
  const dependency = { name: 'react-native', data: { isESMImport: true } }
  const origins = siblingFirst ? [sibling, list] : [list, sibling]
  const resolutions = origins.map((origin) => DependencyGraph.prototype.resolveDependency.call(
    graph, origin, dependency, 'android', {},
  ))

  expect(resolutions).toEqual([
    { type: 'sourceFile', filePath: adapter },
    { type: 'sourceFile', filePath: adapter },
  ])
  expect(resolveDependency).toHaveBeenCalledExactlyOnceWith(origins[0], dependency, true, 'android', {})
  expect(resolveRequest).not.toHaveBeenCalled()
})

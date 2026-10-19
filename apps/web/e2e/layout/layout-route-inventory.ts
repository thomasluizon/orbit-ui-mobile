import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const appDirectory = resolve(import.meta.dirname, '../../app')

export const layoutRouteInventory = readdirSync(appDirectory, { recursive: true, encoding: 'utf8' })
  .filter((path) => path === 'page.tsx' || path.endsWith('/page.tsx'))
  .map((source) => {
    const route = '/' + source.split('/').slice(0, -1).filter((segment) => !segment.startsWith('(')).join('/')
    const path = route.replace('[...missing]', 'missing-page').replace('[id]', 'habit-1').replace('[code]', 'invalid')
    return { route, path, hasControls: !['/turnstile-bridge', '/auth-callback/notion'].includes(route) }
  })
  .sort((left, right) => left.path.localeCompare(right.path))

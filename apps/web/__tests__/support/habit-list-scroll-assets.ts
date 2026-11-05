import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

export interface HabitListScrollAssets {
  stylesheet: string
  script: string
}

export async function buildHabitListScrollAssets(): Promise<HabitListScrollAssets> {
  const source = resolve(process.cwd(), 'app/globals.css')
  const tokens = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
  let stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${tokens}}`
  for (const [name, weight] of [['geist', '400 600'], ['space-grotesk', '500 600'], ['geist-mono', '400 500']]) {
    const font = readFileSync(resolve(process.cwd(), `fonts/${name}-latin.woff2`)).toString('base64')
    stylesheet += `@font-face{font-family:'${name}';font-weight:${weight};src:url(data:font/woff2;base64,${font})}:root{--font-${name}:'${name}'}`
  }
  const script = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const polyfill = await build({ entryPoints: ['next/dist/compiled/process'], bundle: true, write: false,
      format: 'iife', globalName: 'process', platform: 'browser', define: { __dirname: '"/"' } });
    const result = await build({ entryPoints: ['./__tests__/support/habit-list-scroll-fixture.tsx'],
      bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], jsx: 'automatic',
      alias: { '@sentry/nextjs': '@sentry/react' }, define: { 'process.env.NODE_ENV': '"production"', __dirname: '"/"' },
      plugins: [{ name: 'server-boundaries', setup(builder) {
        const boundaries = {
          'next/navigation': 'export const useRouter = () => ({ push() {}, replace() {} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const unstable_isUnrecognizedActionError = () => false;',
          'next/dynamic': 'export default () => () => null;',
          '@/lib/server-fetch': 'export const serverAuthMutate = async (...args) => window.skipScrollFixture(...args); export const serverAuthFetch = () => { throw new Error("Unexpected server read"); };'
        };
        builder.onResolve({ filter: /^(next\\/(navigation|dynamic)|@\\/lib\\/server-fetch)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: boundaries[path], loader: 'js' }));
      }}] });
    process.stdout.write(polyfill.outputFiles[0].text + result.outputFiles[0].text);
  `], { maxBuffer: 20 * 1024 * 1024 }).toString()
  return { stylesheet, script }
}

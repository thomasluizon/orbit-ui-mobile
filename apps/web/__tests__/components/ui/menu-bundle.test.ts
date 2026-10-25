import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each([
  { entryPoint: 'components/ui/app-toast-host.tsx', eager: 'stores/app-toast-store.ts', deferred: 'components/ui/toast.tsx' },
  { entryPoint: 'components/navigation/notification-delete-notice.tsx', eager: 'lib/pending-notification-deletes.ts', deferred: 'components/ui/toast.tsx' },
  { entryPoint: 'components/ui/dropdown-menu.tsx', eager: '@radix-ui/react-dropdown-menu/', deferred: 'components/ui/sheet.tsx' },
  { entryPoint: 'components/onboarding/retained-onboarding-overlay.tsx', eager: 'components/onboarding/onboarding-actions-context.tsx', deferred: 'components/onboarding/onboarding-flow.tsx' },
])('keeps $entryPoint eager and defers its presentation', ({ entryPoint, eager, deferred }) => {
  const graph = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build({
      entryPoints: [process.argv[1]], bundle: true, write: false, metafile: true,
      splitting: true, format: 'esm', outdir: '/tmp/menu-bundle', platform: 'browser', jsx: 'automatic',
      alias: { '@sentry/nextjs': '@sentry/browser' },
      external: ['@/lib/actions/*', '@/app/actions/*'],
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    });
    const outputs = result.metafile.outputs;
    const initial = new Set();
    function visit(path) {
      if (initial.has(path)) return;
      initial.add(path);
      for (const dependency of outputs[path].imports) {
        if (dependency.kind !== 'dynamic-import' && dependency.path in outputs) visit(dependency.path);
      }
    }
    visit(Object.keys(outputs).find(path => outputs[path].entryPoint === process.argv[1]));
    process.stdout.write(JSON.stringify({
      initial: [...initial].flatMap(path => Object.keys(outputs[path].inputs)),
      deferred: Object.keys(outputs).filter(path => !initial.has(path)).flatMap(path => Object.keys(outputs[path].inputs)),
    }));
  `, entryPoint], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })) as { initial: string[]; deferred: string[] }
  expect(graph.initial.some((path) => path.includes(eager))).toBe(true)
  if (entryPoint === 'components/ui/dropdown-menu.tsx') {
    expect(graph.initial.some((path) => path.endsWith('components/ui/dropdown-menu-content.tsx'))).toBe(false)
  }
  expect(graph.initial.some((path) => path.endsWith(deferred))).toBe(false)
  expect(graph.deferred.some((path) => path.endsWith(deferred))).toBe(true)
})

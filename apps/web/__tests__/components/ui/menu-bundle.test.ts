import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('keeps the headless trigger eager and defers the sheet presentation', () => {
  const graph = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build({
      entryPoints: ['components/ui/dropdown-menu.tsx'], bundle: true, write: false, metafile: true,
      splitting: true, format: 'esm', outdir: '/tmp/menu-bundle', platform: 'browser', jsx: 'automatic',
      alias: { '@sentry/nextjs': '@sentry/browser' },
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    });
    const outputs = result.metafile.outputs;
    const initial = new Set();
    function visit(path) {
      if (initial.has(path)) return;
      initial.add(path);
      for (const dependency of outputs[path].imports) {
        if (dependency.kind !== 'dynamic-import') visit(dependency.path);
      }
    }
    visit(Object.keys(outputs).find(path => outputs[path].entryPoint === 'components/ui/dropdown-menu.tsx'));
    process.stdout.write(JSON.stringify({
      initial: [...initial].flatMap(path => Object.keys(outputs[path].inputs)),
      deferred: Object.keys(outputs).filter(path => !initial.has(path)).flatMap(path => Object.keys(outputs[path].inputs)),
    }));
  `], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })) as { initial: string[]; deferred: string[] }
  expect(graph.initial.some((path) => path.includes('@radix-ui/react-dropdown-menu/'))).toBe(true)
  expect(graph.initial.some((path) => path.endsWith('components/ui/dropdown-menu-content.tsx'))).toBe(false)
  expect(graph.initial.some((path) => path.endsWith('components/ui/sheet.tsx'))).toBe(false)
  expect(graph.deferred.some((path) => path.endsWith('components/ui/sheet.tsx'))).toBe(true)
})

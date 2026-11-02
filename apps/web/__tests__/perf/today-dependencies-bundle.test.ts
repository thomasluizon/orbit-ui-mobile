// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each([
  { owner: 'sheet and select', entryPoints: ['components/ui/sheet.tsx', 'components/ui/select.tsx'], allocation: 59000 },
  { owner: 'monitoring', entryPoints: ['instrumentation-client.ts'], allocation: 54800 },
])('keeps the Today $owner owners within their compressed script allocation', ({ entryPoints, allocation }) => {
  const compressedBytes = Number(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    import { gzipSync } from 'node:zlib';
    const bundle = await build({
      entryPoints: JSON.parse(process.argv[1]),
      bundle: true, write: false, minify: true, splitting: true,
      format: 'esm', outdir: 'today-dependencies-bundle', platform: 'browser', jsx: 'automatic',
      external: [
        'react', 'react-dom', 'next/*', '@/*', '@orbit/shared/*', '@tabler/*',
        'motion/*', 'zustand', 'zustand/*', 'next-intl',
      ],
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    process.stdout.write(String(bundle.outputFiles.reduce((sum, file) => sum + gzipSync(file.contents).length, 0)));
    stop();
  `, JSON.stringify(entryPoints)], { encoding: 'utf8' }))

  expect(compressedBytes).toBeGreaterThan(0)
  expect(compressedBytes).toBeLessThanOrEqual(allocation)
})

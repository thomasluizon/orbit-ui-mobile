// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('keeps the shared Today motion owners within their compressed script allocation', () => {
  const compressedBytes = Number(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    import { gzipSync } from 'node:zlib';
    const bundle = await build({
      entryPoints: [
        'components/motion/list-motion.tsx',
        'components/motion/route-transition-shell.tsx',
        'components/ui/sheet.tsx',
        'app/(app)/today-page-view.tsx',
        'components/gamification/celebration-panel.tsx',
      ],
      bundle: true, write: false, minify: true, splitting: true,
      format: 'esm', outdir: 'motion-bundle', platform: 'browser', jsx: 'automatic',
      external: [
        'react', 'react-dom', 'next/*', '@/*', '@orbit/shared/*',
        '@base-ui/*', '@tabler/*', 'date-fns', 'zustand/*', 'zustand', '@tanstack/*',
      ],
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    process.stdout.write(String(bundle.outputFiles.reduce((sum, file) => sum + gzipSync(file.contents).length, 0)));
    stop();
  `], { encoding: 'utf8' }))

  expect(compressedBytes).toBeGreaterThan(0)
  expect(compressedBytes).toBeLessThanOrEqual(72000)
})

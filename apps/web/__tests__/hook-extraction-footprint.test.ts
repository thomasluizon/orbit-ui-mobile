// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { expect,it } from 'vitest'

it('keeps composer and habit list extraction overhead within the Today script headroom', () => {
  const compressedBytes = Number(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    import { gzipSync } from 'node:zlib';
    let compressedBytes = 0;
    for (const entryPoint of ['hooks/use-chat-composer.ts', 'components/habits/habit-list.tsx']) {
      const bundle = await build({
        entryPoints: [entryPoint], bundle: true, write: false, minify: true,
        format: 'esm', platform: 'browser', jsx: 'automatic',
        external: ['react', 'react-dom', 'next/*', '@/*', '@orbit/shared/*', '@tabler/*', 'motion/*', 'zustand', 'zustand/*', 'next-intl', '@tanstack/*'],
        define: { 'process.env.NODE_ENV': '\"production\"' },
      });
      compressedBytes += gzipSync(bundle.outputFiles[0].contents).length;
    }
    process.stdout.write(String(compressedBytes));
    stop();
  `], { encoding: 'utf8' }))
  expect(compressedBytes).toBeGreaterThan(0)
  expect(compressedBytes).toBeLessThanOrEqual(86275)
})

// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each(['lib/conversation-history.ts', 'lib/desktop-chat-checkpoint.ts'])('loads chat models when %s needs them', entryPoint => {
  const chunks: { initial: boolean; models: boolean }[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    const { metafile } = await build({
      entryPoints: [process.argv[1]], bundle: true, write: false, metafile: true, splitting: true,
      format: 'esm', outdir: 'chat-model-bundle', platform: 'browser',
      external: ['react', 'react-dom', 'next/*', '@/*', '@tanstack/*'],
    });
    process.stdout.write(JSON.stringify(Object.values(metafile.outputs).map(output => ({
      initial: output.entryPoint?.endsWith(process.argv[1]) ?? false,
      models: Object.keys(output.inputs).some(path => path.endsWith('/types/chat.ts')),
    }))));
    stop();
  `, entryPoint], { encoding: 'utf8' }))
  expect(chunks.filter(chunk => chunk.initial)).toHaveLength(1)
  expect(chunks.find(chunk => chunk.initial)?.models).toBe(false)
  expect(chunks.some(chunk => !chunk.initial && chunk.models)).toBe(true)
})

it('keeps checkpoint validation out of the desktop shell initial graph with application aliases resolved', () => {
  const outputs: { initial: boolean; schema: boolean; models: boolean; imports: { path: string; kind: string }[]; path: string }[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    const { metafile } = await build({
      entryPoints: ['components/desktop-release-shell.tsx'], bundle: true, write: false,
      metafile: true, splitting: true, format: 'esm', outdir: 'desktop-shell-bundle',
      platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json',
      external: ['react', 'react-dom', 'next/*', 'next-intl', '@sentry/*', '@tanstack/*', '@/app/actions/*'],
    });
    process.stdout.write(JSON.stringify(Object.entries(metafile.outputs).map(([path, output]) => ({
      path, imports: output.imports,
      initial: output.entryPoint === 'components/desktop-release-shell.tsx',
      schema: Object.keys(output.inputs).some(path => path.endsWith('/desktop-chat-checkpoint-schema.ts')),
      models: Object.keys(output.inputs).some(path => path.endsWith('/types/chat.ts')),
    }))));
    stop();
  `], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }))
  const initial = new Set(outputs.filter(output => output.initial).map(output => output.path))
  for (const path of initial) {
    for (const dependency of outputs.find(output => output.path === path)!.imports) {
      if (dependency.kind !== 'dynamic-import' && outputs.some(output => output.path === dependency.path)) initial.add(dependency.path)
    }
  }
  expect(initial.size).toBeGreaterThan(0)
  expect(outputs.filter(output => initial.has(output.path)).some(output => output.models || output.schema)).toBe(false)
  expect(outputs.filter(output => !initial.has(output.path)).some(output => output.models && output.schema)).toBe(true)
})

it.each([
  { platform: 'web', hook: 'use-chat-pending-operations' },
  { platform: 'mobile', hook: 'use-pending-operation-execution' },
])('loads the $platform pending operation implementation on demand', ({ platform, hook }) => {
  const chunks: { initial: boolean; actions: boolean }[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    const { metafile } = await build({
      entryPoints: [process.argv[1]], bundle: true, write: false, metafile: true, splitting: true,
      format: 'esm', outdir: 'pending-operation-bundle', platform: 'browser',
      external: ['react', 'react-native', 'react-i18next', 'next-intl', '@/*', '@orbit/shared/*'],
    });
    process.stdout.write(JSON.stringify(Object.values(metafile.outputs).map(output => ({
      initial: output.entryPoint?.endsWith(process.argv[1].split('/').at(-1)) ?? false,
      actions: Object.keys(output.inputs).some(path => path.endsWith('hooks/chat-pending-operation-actions.ts')),
    }))));
    stop();
  `, `../${platform}/hooks/${hook}.ts`], { encoding: 'utf8' }))
  expect(chunks.filter(chunk => chunk.initial)).toHaveLength(1)
  expect(chunks.find(chunk => chunk.initial)?.actions).toBe(false)
  expect(chunks.some(chunk => !chunk.initial && chunk.actions)).toBe(true)
})

it('loads the stream protocol after sending starts', () => {
  const protocolChunks: { entry: boolean; protocol: boolean; path: string; imports: { path: string; kind: string }[] }[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    const { metafile } = await build({
      entryPoints: ['../../packages/shared/src/hooks/chat-send-stream-core.ts'],
      bundle: true, write: false, metafile: true, splitting: true,
      format: 'esm', outdir: 'composer-stream-bundle', platform: 'browser',
      external: ['@tanstack/*', 'react'],
    });
    process.stdout.write(JSON.stringify(Object.entries(metafile.outputs).map(([path, output]) => ({
      path, imports: output.imports,
      entry: output.entryPoint === '../../packages/shared/src/hooks/chat-send-stream-core.ts',
      protocol: Object.keys(output.inputs).some(path => path.endsWith('/chat/sse-stream.ts')),
    }))));
    stop();
  `], { encoding: 'utf8' }))

  const initial = new Set(protocolChunks.filter(chunk => chunk.entry).map(chunk => chunk.path))
  for (const path of initial) {
    for (const dependency of protocolChunks.find(chunk => chunk.path === path)!.imports) {
      if (dependency.kind !== 'dynamic-import' && protocolChunks.some(chunk => chunk.path === dependency.path)) initial.add(dependency.path)
    }
  }
  expect(initial.size).toBeGreaterThan(0)
  expect(protocolChunks.filter(chunk => initial.has(chunk.path)).some(chunk => chunk.protocol)).toBe(false)
  expect(protocolChunks.some(chunk => !chunk.entry && chunk.protocol)).toBe(true)
})

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

it.each(['web', 'mobile'])('loads only the plan announcement hook in the %s plan block dependency graph', (platform) => {
  const sharedHooks: string[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build, stop } from 'esbuild';
    const bundle = await build({
      entryPoints: [process.argv[1]],
      bundle: true, write: false, metafile: true,
      format: 'esm', platform: 'browser', jsx: 'automatic',
      external: [
        'react', 'react-dom', 'react-native', 'react-i18next', 'next-intl', '@/*',
        '@orbit/shared/types', '@orbit/shared/chat', '@orbit/shared/theme',
      ],
    });
    const hooks = Object.keys(bundle.metafile.inputs)
      .filter(path => path.includes('/shared/src/hooks/'))
      .map(path => path.split('/').at(-1));
    process.stdout.write(JSON.stringify(hooks));
    stop();
  `, `../${platform}/components/chat/plan-block.tsx`], { encoding: 'utf8' }))

  expect(sharedHooks).toEqual(['plan-announcement-core.ts'])
})

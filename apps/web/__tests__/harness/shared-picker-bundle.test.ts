import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('imports the picker time formatter without unrelated shared runtime dependencies', () => {
  const bundle = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build({
      stdin: { contents: "export { padTimePart } from '@orbit/shared/utils'", resolveDir: process.cwd() },
      bundle: true, write: false, metafile: true, minify: true, format: 'esm', platform: 'browser',
    });
    const output = Object.values(result.metafile.outputs)[0];
    process.stdout.write(JSON.stringify({
      bytes: output.bytes,
      inputs: Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path),
    }));
  `], { encoding: 'utf8' })) as { bytes: number; inputs: string[] }
  expect(bundle.inputs.some((path) => /node_modules\/(?:date-fns|zod|@vvo\/tzdb)\//.test(path))).toBe(false)
  expect(bundle.bytes).toBeLessThan(1024)
})

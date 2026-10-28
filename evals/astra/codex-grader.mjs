import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const schemaPath = fileURLToPath(new URL('./grader-schema.json', import.meta.url))

export default class CodexGrader {
  id() { return 'astra-codex-grader' }

  async callApi(prompt, _context, options) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.grade(prompt, options)
      if (!response.error || attempt === 1) return response
    }
  }

  async grade(prompt, options) {
    const directory = mkdtempSync(join(tmpdir(), 'astra-grader-'))
    const outputPath = join(directory, 'grade.json')
    try {
      const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORBIT_EVAL_')))
      environment.PATH = (environment.PATH ?? '').split(delimiter).filter((directory) => {
        if (!directory) return false
        const segments = resolve(directory).split(sep)
        return !segments.some((segment, index) => segment === 'node_modules' && segments[index + 1] === '.bin')
      }).join(delimiter)
      await new Promise((resolve, reject) => {
        const child = execFile('codex', ['exec', '-m', 'gpt-6.1-sol', '-s', 'read-only',
          '--skip-git-repo-check', '--ephemeral', '--output-schema', schemaPath, '-o', outputPath], {
          cwd: directory, env: environment, timeout: 120000, maxBuffer: 1024 * 1024, signal: options?.abortSignal,
        }, (error) => error ? reject(error) : resolve())
        child.stdin.on('error', reject)
        child.stdin.end(prompt)
      })
      const grade = JSON.parse(readFileSync(outputPath, 'utf8'))
      if (!grade || Object.keys(grade).sort().join(',') !== 'pass,reason,score'
        || typeof grade.pass !== 'boolean' || typeof grade.score !== 'number' || !Number.isFinite(grade.score)
        || grade.score < 0 || grade.score > 1 || typeof grade.reason !== 'string' || !grade.reason.trim()) {
        throw new Error('Malformed grade.')
      }
      return { output: JSON.stringify(grade) }
    } catch {
      return { error: 'Codex rubric grading failed; check the installed CLI and its authenticated session.' }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

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
    let failure = 'process could not run'
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
        }, (error) => {
          if (!error) return resolve()
          failure = error.code === 'ENOENT' ? 'installed executable unavailable (ENOENT)'
            : typeof error.code === 'number' ? `process exited with code ${error.code}`
              : error.killed === true ? 'process interrupted by timeout or cancellation' : 'process interrupted'
          reject(error)
        })
        child.stdin.on('error', reject)
        child.stdin.end(prompt)
      })
      failure = 'grade file missing or unreadable'
      const rawGrade = readFileSync(outputPath, 'utf8')
      failure = 'grade JSON malformed'
      const grade = JSON.parse(rawGrade)
      failure = 'grade schema invalid'
      if (!grade || Object.keys(grade).sort().join(',') !== 'pass,reason,score'
        || typeof grade.pass !== 'boolean' || typeof grade.score !== 'number' || !Number.isFinite(grade.score)
        || grade.score < 0 || grade.score > 1 || typeof grade.reason !== 'string' || !grade.reason.trim()) {
        throw new Error('Malformed grade.')
      }
      return { output: JSON.stringify(grade) }
    } catch {
      const error = `Codex rubric grading failed: ${failure}.`
      process.stderr.write(`${error}\n`)
      return { error }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

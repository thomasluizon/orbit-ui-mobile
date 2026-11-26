import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

/**
 * Writes the whole time that one worker spends on each test file to `--outputFile.durations`. The JSON reporter times
 * only from the first test to the last, so it leaves out the environment, the imports, the setup files and a first
 * hook, and a split by those numbers gives unequal shards.
 * `.github/scripts/record-web-shard-timings.mjs` reads these files.
 */
export default class DurationReporter {
  onInit(vitest) {
    this.config = vitest.config
  }

  onTestRunEnd(testModules) {
    const outputFile = this.config.outputFile?.durations
    if (!outputFile) throw new Error('duration-reporter needs --outputFile.durations')
    const files = testModules.map((testModule) => {
      const spent = testModule.diagnostic()
      return {
        project: testModule.project.name,
        file: relative(this.config.root, testModule.moduleId).split('\\').join('/'),
        milliseconds: Math.round(spent.environmentSetupDuration + spent.prepareDuration + spent.setupDuration + spent.collectDuration + spent.duration),
      }
    })
    const path = resolve(this.config.root, outputFile)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ files }, null, 2)}\n`)
  }
}

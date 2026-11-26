import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

/**
 * Writes two times of each test file to `--outputFile.durations`. `milliseconds` is the whole time that one worker
 * spends on the file, and the shards split by it. `testSpanMilliseconds` is the time from the first test to the last,
 * which is all that the JSON reporter times and which the web file budget limits. It leaves out the environment, the
 * imports, the setup files and a first hook, so a split by it gives unequal shards.
 * `.github/scripts/record-vitest-shard-timings.mjs` reads these files.
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
      const tests = Array.from(testModule.children.allTests(), (testCase) => testCase.diagnostic()).filter(Boolean)
      return {
        project: testModule.project.name,
        file: relative(this.config.root, testModule.moduleId).split('\\').join('/'),
        milliseconds: Math.round(spent.environmentSetupDuration + spent.prepareDuration + spent.setupDuration + spent.collectDuration + spent.duration),
        testSpanMilliseconds: tests.length === 0 ? 0
          : Math.round(Math.max(...tests.map((test) => test.startTime + test.duration)) - Math.min(...tests.map((test) => test.startTime))),
      }
    })
    const path = resolve(this.config.root, outputFile)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ files }, null, 2)}\n`)
  }
}

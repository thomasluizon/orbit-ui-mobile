import type { File } from '@vitest/runner'
import { VitestTestRunner } from 'vitest/runners'

function reportPhase(phase: string): void {
  if (process.send) process.send({ orbitPhase: phase })
}

export default class PhaseRunner extends VitestTestRunner {
  constructor(config: ConstructorParameters<typeof VitestTestRunner>[0]) {
    super(config)
    const trace = this.trace
    this.trace = (name, attributes, callback) => {
      const test = VitestTestRunner.getCurrentTest()
      if (name === 'test.callback') reportPhase(`test body: ${test?.name ?? ''}`)
      else if (name === 'suite.beforeAll') reportPhase('beforeAll')
      else if (name === 'suite.afterAll') reportPhase('afterAll')
      else if (name === 'test.beforeEach') reportPhase(`beforeEach: ${test?.name ?? ''}`)
      else if (name === 'test.afterEach') reportPhase(`afterEach: ${test?.name ?? ''}`)
      else if (name === 'suite.cleanup' || name === 'test.cleanup' || name === 'test.onFinished' || name === 'test.onFailed') reportPhase('teardown')
      return trace(name, attributes, callback)
    }
  }

  override importFile(filepath: string, source: 'collect' | 'setup'): unknown {
    reportPhase(`module import (${source}): ${filepath}`)
    return super.importFile(filepath, source)
  }

  override onCollectStart(file: File): void {
    super.onCollectStart(file)
    reportPhase('module import')
  }

  override onAfterRunFiles(): void {
    super.onAfterRunFiles()
    reportPhase('teardown')
  }
}

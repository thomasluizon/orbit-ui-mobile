import path from 'node:path'
import { ForksPoolWorker, type PoolOptions, type PoolRunnerInitializer, type WorkerRequest, type WorkerResponse } from 'vitest/node'

class BoundedFork extends ForksPoolWorker {
  readonly name = 'bounded-forks'
  private files: string[] = []
  private phase = 'worker startup'
  private warningTimer?: ReturnType<typeof setTimeout>
  private failureTimer?: ReturnType<typeof setTimeout>
  private stopping = false
  private failed = false
  private readonly listeners = {
    error: new Set<(message: unknown) => void>(),
    message: new Set<(message: unknown) => void>(),
  }

  constructor(private readonly options: PoolOptions, private readonly timeoutMs: number) {
    super(options)
  }

  override async start(): Promise<void> {
    await super.start()
    super.on('message', (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'orbitPhase' in message
        && typeof message.orbitPhase === 'string') this.update(message.orbitPhase)
    })
  }

  override on(event: string, callback: (message: unknown) => void): void {
    if (event === 'error' || event === 'message') this.listeners[event].add(callback)
    super.on(event, callback)
  }

  override off(event: string, callback: (message: unknown) => void): void {
    if (event === 'error' || event === 'message') this.listeners[event].delete(callback)
    super.off(event, callback)
  }

  override send(message: WorkerRequest): void {
    if (message.type === 'run' || message.type === 'collect') {
      this.files = message.context.files.map((file) => file.filepath)
      this.update('module import (including setup files)')
    } else if (message.type === 'stop') {
      this.stopping = true
      this.update('teardown')
    }
    super.send(message)
  }

  private update(phase: string): void {
    if (this.failed) return
    this.clearTimers()
    this.phase = phase
    this.warningTimer = setTimeout(() => {
      this.options.project.vitest.logger.error(this.describe('still running'))
    }, Math.min(10_000, this.timeoutMs / 2)).unref()
    this.failureTimer = setTimeout(() => this.fail(), this.timeoutMs).unref()
  }

  private describe(status: string): string {
    return `[vitest phase] ${status}: [${this.options.project.name}] ${this.files.join(', ')} > ${this.phase}`
  }

  private fail(): void {
    this.failed = true
    process.exitCode = 1
    this.clearTimers()
    const error = new Error(this.describe(`unfinished after ${this.timeoutMs}ms`))
    this.options.project.vitest.logger.error(error.message)
    if (this.stopping) {
      const response: WorkerResponse = { __vitest_worker_response__: true, type: 'stopped', error }
      for (const listener of this.listeners.message) listener(response)
    } else {
      for (const listener of this.listeners.error) listener(error)
    }
  }

  private clearTimers(): void {
    clearTimeout(this.warningTimer)
    clearTimeout(this.failureTimer)
  }

  override async stop(): Promise<void> {
    try {
      await super.stop()
    } finally {
      this.clearTimers()
    }
  }
}

export function createStallDiagnostics(timeoutMs = 90_000): { pool: PoolRunnerInitializer; runner: string } {
  return {
    pool: { name: 'bounded-forks', createPoolWorker: (options) => new BoundedFork(options, timeoutMs) },
    runner: path.resolve(import.meta.dirname, 'phase-runner.ts'),
  }
}

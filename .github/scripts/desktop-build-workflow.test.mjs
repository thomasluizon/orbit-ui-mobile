import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'

const workflow = yaml.load(readFileSync(new URL('../workflows/desktop-build.yml', import.meta.url), 'utf8'))

test('desktop installs Rust before selecting the default without depending on a new rustup flag', () => {
  const install = workflow.jobs.build.steps.find((step) => step.name === 'Install Rust and compilation target')
  assert.deepEqual(install.run.trim().split('\n'), [
    'rustup toolchain install stable --profile minimal --target "$DESKTOP_TARGET"',
    'rustup default stable',
  ])
})

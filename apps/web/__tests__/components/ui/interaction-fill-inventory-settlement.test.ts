import { afterEach, describe, expect, it } from 'vitest'
import type { Locator } from '@playwright/test'
import { stringify } from 'yaml'
import { captureControlInventory } from '@/e2e/layout/interaction-fill-inventory'

function controlList(markup: string, afterSnapshot = (_index: number) => {}) {
  document.body.innerHTML = markup
  const elements = () => [...document.querySelectorAll('button')]
  const controls = {
    count: async () => elements().length,
    all: async () => elements().map((_, index) => controls.nth(index)),
    evaluateAll: async <Result>(callback: (buttons: HTMLButtonElement[]) => Result) => callback(elements()),
    nth: (index: number) => ({
      ariaSnapshot: async (options?: { mode?: 'ai' | 'default' }) => {
        const element = elements()[index]
        if (!element) throw new Error(options?.mode === 'ai'
          ? `Selector "button >> nth=${index}" does not match any element`
          : 'locator.ariaSnapshot: Timeout 2000ms exceeded.')
        const snapshot = element.dataset.snapshot ?? stringify([`button ${JSON.stringify(element.textContent)}${options?.mode === 'ai' ? ' [ref=e1]' : ''}`])
        afterSnapshot(index)
        return snapshot
      },
      evaluate: async <Result>(callback: (button: HTMLButtonElement) => Result) => {
        const element = elements()[index]
        if (!element) throw new Error('control disappeared before evaluation')
        return callback(element)
      },
    }),
  }
  return controls as unknown as Locator
}

afterEach(() => { document.body.replaceChildren() })

describe('settled interaction fill inventory', () => {
  it('preserves every control, duplicate order and title ownership', async () => {
    const controls = controlList('<button>Repeat: "quoted"</button><button class="orbit-habit-rename">Rename</button><button>Repeat: "quoted"</button>')
    expect(await captureControlInventory(controls)).toEqual([
      { index: 0, identity: 'button "Repeat: \\"quoted\\""', order: 0, title: false },
      { index: 1, identity: 'button "Rename"', order: 0, title: true },
      { index: 2, identity: 'button "Repeat: \\"quoted\\""', order: 1, title: false },
    ])
  })

  it('accepts an empty inventory', async () => {
    expect(await captureControlInventory(controlList(''))).toEqual([])
  })

  it('restarts when the remaining control disappears after the first identity read', async () => {
    let replaced = false
    const controls = controlList('<button>First</button><button>Second</button>', () => {
      if (replaced) return
      replaced = true
      document.body.innerHTML = '<button class="orbit-habit-rename">Replacement</button>'
    })
    expect(await captureControlInventory(controls, '/habits/new, 320px, en')).toEqual([
      { index: 0, identity: 'button "Replacement"', order: 0, title: true },
    ])
  })

  it.each(['add', 'replace', 'rename', 'title'] as const)('restarts after a control list change with the same count or a larger count: %s', async change => {
    let changed = false
    const controls = controlList('<button>First</button><button>Second</button>', () => {
      if (changed) return
      changed = true
      if (change === 'add') document.body.insertAdjacentHTML('beforeend', '<button>Added</button>')
      if (change === 'replace') document.body.innerHTML = '<button>Replacement</button><button>Second</button>'
      if (change === 'rename') document.querySelector('button')!.textContent = 'Renamed'
      if (change === 'title') document.querySelector('button')!.classList.add('orbit-habit-rename')
    })
    const expected = [
      { index: 0, identity: `button "${change === 'replace' ? 'Replacement' : change === 'rename' ? 'Renamed' : 'First'}"`, order: 0, title: change === 'title' },
      { index: 1, identity: 'button "Second"', order: 0, title: false },
    ]
    if (change === 'add') expected.push({ index: 2, identity: 'button "Added"', order: 0, title: false })
    expect(await captureControlInventory(controls)).toEqual(expected)
  })

  it('rejects a list that keeps changing instead of returning a partial inventory', async () => {
    const controls = controlList('<button>First</button>', () => {
      const button = document.querySelector('button')!
      button.textContent = button.textContent === 'First' ? 'Changed' : 'First'
    })
    await expect(captureControlInventory(controls, 'unsettled controls')).rejects.toThrow('unsettled controls: control list changed during inventory capture')
  })

  it('reports the last identity error after bounded retries', async () => {
    const failures: Error[] = []
    const controls = controlList('<button>First</button>', () => {
      const failure = new Error(`snapshot failure ${failures.length}`)
      failures.push(failure)
      throw failure
    })
    const failure = await captureControlInventory(controls, 'broken controls').catch((cause: unknown) => cause)
    expect(failure).toMatchObject({ message: 'broken controls, control 0: cannot capture control identity', cause: failures.at(-1) })
    expect(failures.length).toBeGreaterThan(1)
    expect(failures.length).toBeLessThan(10)
  })

  it('rejects malformed accessibility snapshots', async () => {
    const controls = controlList('<button data-snapshot="unexpected: snapshot">First</button>')
    await expect(captureControlInventory(controls)).rejects.toMatchObject({
      message: 'interaction fill inventory, control 0: cannot capture control identity',
      cause: expect.objectContaining({ message: expect.stringContaining('Unrecognized control accessibility snapshot') }),
    })
  })
})

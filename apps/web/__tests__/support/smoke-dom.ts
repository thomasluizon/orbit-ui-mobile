import { act, fireEvent, queryAllByRole, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import type { Page, Response } from '@playwright/test'

type Role = Parameters<Page['getByRole']>[0]
type RoleOptions = Parameters<Page['getByRole']>[1]

function roleMatches(root: HTMLElement, role: Role, options?: RoleOptions) {
  const name = typeof options?.name === 'string' && !options.exact
    ? new RegExp(options.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : options?.name
  return queryAllByRole(root, role, { name })
}

export class SmokeDomLocator {
  constructor(readonly page: SmokeDomPage, readonly description: string,
    readonly matches: () => HTMLElement[]) {}

  element(): HTMLElement {
    const matches = this.matches()
    if (matches.length !== 1) throw new Error(`Actual rendered DOM has ${matches.length} matches for ${this.description}`)
    return matches[0]!
  }

  locator(selector: string) {
    return new SmokeDomLocator(this.page, selector, () => Array.from(this.element().querySelectorAll(selector)))
  }

  getByRole(role: Role, options?: RoleOptions) {
    return new SmokeDomLocator(this.page, `${role} ${String(options?.name)}`,
      () => roleMatches(this.element(), role, options))
  }

  getByTestId(testId: string) { return this.locator(`[data-testid="${testId}"]`) }

  or(other: SmokeDomLocator) {
    return new SmokeDomLocator(this.page, `${this.description} or ${other.description}`,
      () => [...new Set([...this.matches(), ...other.matches()])])
  }

  async fill(value: string) {
    await this.page.checkpoint()
    const element = this.element()
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('fill requires a text control')
    expect(element).toBeEnabled()
    await act(async () => { fireEvent.change(element, { target: { value } }) })
  }

  async click() {
    await this.page.checkpoint()
    const element = this.element()
    expect(element).toBeEnabled()
    expect(element).not.toHaveAttribute('aria-disabled', 'true')
    await act(async () => { fireEvent.click(element) })
  }

  async getAttribute(name: string) { return this.element().getAttribute(name) }
}

export class SmokeDomPage {
  readonly handlers: { locator: SmokeDomLocator; run: (locator: SmokeDomLocator) => Promise<void> }[] = []
  private handling = false
  respond?: (response: Response) => void
  private onReload = async () => {}

  setReload(action: () => Promise<void>) { this.onReload = action }

  locator(selector: string) {
    return new SmokeDomLocator(this, selector, () => Array.from(document.querySelectorAll(selector)))
  }

  getByRole(role: Role, options?: RoleOptions) {
    return new SmokeDomLocator(this, `${role} ${String(options?.name)}`,
      () => roleMatches(document.body, role, options))
  }

  getByTestId(testId: string) { return this.locator(`[data-testid="${testId}"]`) }

  async addLocatorHandler(locator: SmokeDomLocator, run: (locator: SmokeDomLocator) => Promise<void>) {
    this.handlers.push({ locator, run })
  }

  async checkpoint() {
    if (this.handling) return
    this.handling = true
    try {
      for (const handler of this.handlers) {
        if (!handler.locator.matches().length) continue
        await handler.run(handler.locator)
        await waitFor(() => expect(handler.locator.matches()).toHaveLength(0))
      }
      if (queryAllByRole(document.body, 'dialog').length) throw new Error('An undismissed dialog blocks the smoke action')
    } finally {
      this.handling = false
    }
  }

  async waitForResponse(predicate: (response: Response) => boolean) {
    return new Promise<Response>((resolve) => {
      this.respond = (response) => { if (predicate(response)) resolve(response) }
    })
  }

  async reload() { await act(this.onReload) }
}

export function expectSmokeDom(subject: unknown) {
  if (!(subject instanceof SmokeDomLocator)) return expect(subject)
  const check = async (assert: () => void) => {
    await subject.page.checkpoint()
    await waitFor(assert)
  }
  return {
    toBeVisible: () => check(() => expect(subject.element()).toBeVisible()),
    toBeEnabled: () => check(() => {
      expect(subject.element()).toBeEnabled()
      expect(subject.element()).not.toHaveAttribute('aria-disabled', 'true')
    }),
    toBeHidden: () => check(() => expect(subject.matches().filter((element) => element.isConnected)).toHaveLength(0)),
    toHaveAttribute: (name: string, value: string) => check(() => expect(subject.element()).toHaveAttribute(name, value)),
    not: { toHaveAttribute: (name: string, value: string) => check(() => expect(subject.element()).not.toHaveAttribute(name, value)) },
  }
}

import type { ReactElement } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DeleteAccountFlow } from '@/app/(app)/profile/_components/delete-account-flow'
import { FreshStartFlow } from '@/app/(app)/profile/_components/fresh-start-flow'
import { SupportFlow } from '@/app/(app)/support/_components/support-flow'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, centreOffset, compileAppStylesheet, measureFlowMarkup, stubViewportMedia } from '@/__tests__/support/flow-layout'

vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/flow-screen', () => ({ FlowScreen: ({ children }: { children: React.ReactNode }) => <div className="flex min-h-0 flex-1 flex-col">{children}</div> }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const noop = () => {}
const support = { email: 'ada@example.com', subject: null, message: '', appVersion: '1.3.154', messageMaxLength: 4000, messageOverLimitHint: null, validationMessage: null, error: null, subjectError: null, messageError: null, isSending: false, isOnline: true, disabledReason: null, messageFocusRequest: 0, onSubjectSelect: noop, onMessageChange: noop, onMessageBlur: noop, onSend: noop, onBack: noop, onClose: noop }
const flows: Record<string, (copy: typeof ptBR) => ReactElement> = {
  'start over, lists': (copy) => <FreshStartFlow step="info" deletedItems={[copy.profile.freshStart.heading]} preservedItems={[copy.profile.freshStart.heading]} confirmText="" onConfirmTextChange={noop} loading={false} error="" offline={false} onContinue={noop} onBack={noop} onClose={noop} onReset={noop} />,
  'start over, confirmation': () => <FreshStartFlow step="confirm" deletedItems={[]} preservedItems={[]} confirmText="" onConfirmTextChange={noop} loading={false} error="" offline={false} onContinue={noop} onBack={noop} onClose={noop} onReset={noop} />,
  'delete account, warning': (copy) => <DeleteAccountFlow step="warning" warnings={[copy.profile.deleteAccount.headingAreYouSure, copy.profile.deleteAccount.headingAreYouSure, copy.profile.deleteAccount.headingAreYouSure]} email="ada@example.com" offline={false} loading={false} error="" canSend onContinue={noop} onBack={noop} onClose={noop} onSend={noop} />,
  'delete account, code request': () => <DeleteAccountFlow step="send" warnings={['a', 'b', 'c']} email="ada@example.com" offline={false} loading={false} error="" canSend onContinue={noop} onBack={noop} onClose={noop} onSend={noop} />,
  'support, subject': () => <SupportFlow {...support} step="subject" />,
  'support, message': () => <SupportFlow {...support} step="message" subject="problem" />,
  'API key, name': () => <ApiKeyCreateFlow scoped={false} busy={false} error={null} isReadOnly={false} onReadOnlyChange={noop} expiresAt="" onExpiryChange={noop} createdKey={null} onCreate={() => Promise.resolve(null)} onCreateGrantRequired={noop} onCreated={noop} onClose={noop} />,
}
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => Object.keys(flows).map((flow) => ({ width, locale, flow }))))

describe('Perfil flow layout in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $flow block and holds each label on one line at $width px in $locale', async ({ width, locale, flow }) => {
    stubViewportMedia(width)
    const copy = locale === 'en' ? en as typeof ptBR : ptBR
    const view = render(<NextIntlClientProvider locale={locale} messages={copy} timeZone="UTC">{flows[flow]!(copy)}</NextIntlClientProvider>)
    const markup = view.container.innerHTML
    view.unmount()
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup)
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeGreaterThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeLessThanOrEqual(2)
    for (const label of layout.labels) expect(label.lines, label.label).toBe(1)
  }, 60_000)
})

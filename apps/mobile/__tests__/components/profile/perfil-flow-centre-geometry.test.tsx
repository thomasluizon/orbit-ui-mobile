import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { DeleteAccountFlow } from '@/app/(tabs)/profile/_components/delete-account-flow'
import { FreshStartFlow } from '@/app/(tabs)/profile/_components/fresh-start-flow'
import { SupportFlow } from '@/components/support-flow'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/flow-screen', async () => {
  const { View: HostView } = await import('react-native')
  return { FlowScreen: ({ children }: { children: React.ReactNode }) => <HostView style={{ flex: 1 }}>{children}</HostView> }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

const noop = () => {}
const flows: Record<string, { stepKey: string; element: React.ReactElement }> = {
  'start over, lists': { stepKey: 'info', element: <FreshStartFlow step="info" deletedItems={['Hábitos']} preservedItems={['Conta']} confirmText="" onConfirmTextChange={noop} loading={false} error="" onContinue={noop} onBack={noop} onClose={noop} onReset={noop} /> },
  'start over, confirmation': { stepKey: 'confirm', element: <FreshStartFlow step="confirm" deletedItems={[]} preservedItems={[]} confirmText="" onConfirmTextChange={noop} loading={false} error="" onContinue={noop} onBack={noop} onClose={noop} onReset={noop} /> },
  'delete account, warning': { stepKey: 'warning', element: <DeleteAccountFlow step="warning" warnings={['a', 'b', 'c']} email="ada@example.com" offline={false} loading={false} error="" canSend onContinue={noop} onBack={noop} onClose={noop} onSend={noop} /> },
  'delete account, code request': { stepKey: 'send', element: <DeleteAccountFlow step="send" warnings={['a', 'b', 'c']} email="ada@example.com" offline={false} loading={false} error="" canSend onContinue={noop} onBack={noop} onClose={noop} onSend={noop} /> },
  'support, subject': { stepKey: 'subject', element: <SupportFlow step="subject" email="ada@example.com" subject={null} message="" appVersion="1.3.154" messageMaxLength={4000} messageOverLimitHint={null} validationMessage={null} error={null} subjectError={null} messageError={null} isSending={false} isOnline disabledReason={null} messageFocusRequest={0} onSubjectSelect={noop} onMessageChange={noop} onMessageBlur={noop} onSend={noop} onBack={noop} onClose={noop} /> },
  'API key, name': { stepKey: 'name', element: <ApiKeyCreateFlow scoped={false} busy={false} error={null} isReadOnly={false} onReadOnlyChange={noop} expiresAt="" onExpiryChange={noop} createdKey={null} onCreate={() => Promise.resolve(null)} onCreateGrantRequired={noop} onCreated={noop} onClose={noop} /> },
}

describe.each([320, 360, 384, 412])('Perfil flow block at %i px', (width) => {
  it.each(Object.keys(flows))('centres the %s block in the space between the header and the primary action', async (name) => {
    const { stepKey, element } = flows[name]!
    __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
    await act(() => { tree = create(<View style={{ width, height: HEIGHT }}>{element}</View>) as GeometryTree })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })
})

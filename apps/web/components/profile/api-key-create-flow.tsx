'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SPACING } from '@orbit/shared/theme'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { API_KEY_CREATE_QUESTION_KEYS, apiKeyCreatePosition, apiKeyCreatePrimary, apiKeyTextStepIssue, markGuidedFlowCompleted, readApiKeyCreateSubmission, type ApiKeyCreateStep, type ApiKeyQuestionStep } from '@orbit/shared/utils'
import { apiKeyExpiryDay, apiKeyExpiryFirstDay, apiKeyExpiryFromDay, getApiKeyNameError, validateApiKeyExpiry } from '@orbit/shared/validation'
import { DateField } from '@/components/ui/date-field'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { IconButton } from '@/components/ui/icon-button'
import { Copy } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useAccountScopedState } from '@/hooks/use-session-reset'

export interface ApiKeyCreateFlowProps {
  scoped: boolean
  busy: boolean
  error: string | null
  isReadOnly: boolean
  onReadOnlyChange: (readOnly: boolean) => void
  expiresAt: string
  /** The account zone the expiry day is picked in; the device zone when the account has none. */
  timeZone?: string | null
  onExpiryChange: (value: string) => void
  createdKey: ApiKeyCreateResponse | null
  onCreate: (request: ApiKeyCreateRequest, onCreateGrantRequired: () => Promise<void>) => Promise<ApiKeyCreateResponse | null>
  onCreateGrantRequired: () => void
  onCreated: (createdKey: ApiKeyCreateResponse) => void
  onClose: () => void
}

/** The key, shown once, with its copy control. The reveal sheet and the last step of the create flow both hold it. */
export function ApiKeyReveal({ createdKey }: Readonly<{ createdKey: ApiKeyCreateResponse }>) {
  const t = useTranslations()
  const [copied, setCopied] = useAccountScopedState(false)
  async function copyKey() {
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <p className="text-sm font-medium text-[var(--status-overdue-text)]">{t('orbitMcp.keyCreatedWarning')}</p>
      <div className="flex items-center rounded-[12px] bg-[var(--bg-field)]" style={{ gap: 8, padding: SPACING.s16, boxShadow: 'inset 0 0 0 1px var(--border-control)' }}>
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-[var(--fg-2)]">{createdKey.key}</code>
        <IconButton label={copied ? t('orbitMcp.copied') : t('orbitMcp.copy')} onClick={() => void copyKey()}><Copy size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </div>
    </div>
  )
}

function useCreateFlowState(props: ApiKeyCreateFlowProps) {
  const [step, setStep] = useState<ApiKeyQuestionStep>('name')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [nameFocus, setNameFocus] = useState(0)
  const [scopeFocus, setScopeFocus] = useState(0)
  const [expiryFocus, setExpiryFocus] = useState(0)
  const { step: current, steps, index, next, previous } = apiKeyCreatePosition(step, props.scoped, Boolean(props.createdKey))
  const go = (target: ApiKeyQuestionStep, towards: 1 | -1) => { setDirection(towards); setStep(target) }
  const advance = () => { if (next) go(next, 1) }
  const back = previous ? () => go(previous, -1) : undefined
  return { step: current, steps, index, direction, name, setName, scope, setScope, nameFocus, setNameFocus, scopeFocus, setScopeFocus, expiryFocus, setExpiryFocus, advance, back, go }
}

/** API key creation as a one-question flow: the place, the access, the scope of a scoped key, the expiry, then the key shown once. No mascot. The step-up stays. */
export function ApiKeyCreateFlow(props: Readonly<ApiKeyCreateFlowProps>) {
  const t = useTranslations()
  const flow = useCreateFlowState(props)
  const dismissGuard = useDismissGuard({
    isDirty: !props.createdKey && (flow.name !== '' || flow.scope !== '' || props.expiresAt !== ''),
    onDismiss: props.onClose,
  })
  const close = props.createdKey ? props.onClose : dismissGuard.requestDismiss
  const dismiss = props.busy ? ignoreDismiss : (flow.back ?? close)

  async function submit(expiresAt: string) {
    if (props.busy) return
    const submission = readApiKeyCreateSubmission({ name: flow.name, scope: flow.scope, expiresAt, scoped: props.scoped })
    if (submission.kind === 'name') { flow.go('name', -1); return }
    if (submission.kind === 'expiry') { flow.setExpiryFocus((request) => request + 1); return }
    const continueInCodeQuestion = () => {
      markGuidedFlowCompleted('api_key_create')
      return Promise.resolve(props.onCreateGrantRequired())
    }
    const result = await props.onCreate(submission.request, continueInCodeQuestion)
    if (result) props.onCreated(result)
  }

  function continueFromText() {
    const issue = apiKeyTextStepIssue(flow.step === 'name' ? 'name' : 'scope', flow.name, flow.scope)
    if (issue === 'name') flow.setNameFocus((request) => request + 1)
    else if (issue === 'scope') flow.setScopeFocus((request) => request + 1)
    else flow.advance()
  }

  const primary = describePrimary(flow.step, props, t, continueFromText, () => void submit(props.expiresAt))
  return (
    <>
      <FlowScreen label={t(props.scoped ? 'profile.apiKeys.createScoped' : 'profile.apiKeys.create')} onDismiss={dismiss}>
        <QuestionFlow
          flow="api_key_create"
          showOrbit={false}
          stepKey={flow.step}
          position={flow.index + 1}
          total={flow.steps.length}
          direction={flow.direction}
          progressLabel={t('habits.flow.progress', { position: flow.index + 1, total: flow.steps.length })}
          backLabel={t('common.back')}
          closeLabel={t('common.close')}
          onClose={props.busy ? undefined : close}
          onBack={props.busy ? undefined : flow.back}
          question={t(API_KEY_CREATE_QUESTION_KEYS[flow.step])}
          options={describeOptions(flow, props, t, (expiresAt) => void submit(expiresAt))}
          primary={primary}
        >
          <StepField flow={flow} props={props} onContinue={continueFromText} />
        </QuestionFlow>
      </FlowScreen>
      <DiscardChangesSheet open={dismissGuard.showDiscardDialog} onKeepEditing={dismissGuard.cancelDismiss} onDiscard={dismissGuard.confirmDismiss} />
    </>
  )
}

function ignoreDismiss() {}

type FlowState = ReturnType<typeof useCreateFlowState>
type Translate = ReturnType<typeof useTranslations>

function describePrimary(step: ApiKeyCreateStep, props: ApiKeyCreateFlowProps, t: Translate, onContinue: () => void, onCreate: () => void) {
  const primary = apiKeyCreatePrimary(step)
  if (!primary) return undefined
  const onPress = { continue: onContinue, create: onCreate, close: props.onClose }[primary.action]
  return { label: t(primary.labelKey), onPress, ...(primary.action === 'create' ? { loading: props.busy } : {}) }
}

function describeOptions(flow: FlowState, props: ApiKeyCreateFlowProps, t: Translate, onNever: (expiresAt: string) => void) {
  if (flow.step === 'access') {
    const choose = (readOnly: boolean) => { props.onReadOnlyChange(readOnly); flow.advance() }
    return (
      <>
        <OptionCard label={t('orbitMcp.permReadOnly')} selected={props.isReadOnly} onSelect={() => choose(true)} />
        <OptionCard label={t('orbitMcp.permReadWrite')} selected={!props.isReadOnly} onSelect={() => choose(false)} />
      </>
    )
  }
  if (flow.step !== 'expiry') return undefined
  return <OptionCard label={t('common.never')} selected={props.expiresAt === ''} disabled={props.busy} onSelect={() => { props.onExpiryChange(''); onNever('') }} />
}

function StepField({ flow, props, onContinue }: Readonly<{ flow: FlowState; props: ApiKeyCreateFlowProps; onContinue: () => void }>) {
  const t = useTranslations()
  if (flow.step === 'reveal' && props.createdKey) return <ApiKeyReveal createdKey={props.createdKey} />
  if (flow.step === 'name') {
    const nameError = flow.nameFocus > 0 ? getApiKeyNameError(flow.name) : null
    return <Input label={t('orbitMcp.keyName')} hideLabel name="api-key-name" placeholder={t('orbitMcp.keyNamePlaceholder')} autoComplete="off" required autoFocus value={flow.name} onChange={flow.setName} error={nameError ? t(nameError) : undefined} focusRequest={flow.nameFocus} disabled={props.busy} onSubmit={onContinue} />
  }
  if (flow.step === 'scope') {
    return <Input label={t('profile.apiKeys.scopeLabel')} hideLabel value={flow.scope} onChange={flow.setScope} autoFocus focusRequest={flow.scopeFocus} disabled={props.busy} onSubmit={onContinue} />
  }
  if (flow.step !== 'expiry') return null
  const expiryError = flow.expiryFocus > 0 && !validateApiKeyExpiry(props.expiresAt).valid
  return (
    <>
      <DateField label={t('profile.apiKeys.expiryDayLabel')} value={apiKeyExpiryDay(props.expiresAt, props.timeZone)} minDate={apiKeyExpiryFirstDay(props.timeZone)} focusRequest={flow.expiryFocus} disabled={props.busy} onChange={(day) => props.onExpiryChange(apiKeyExpiryFromDay(day, props.timeZone))} />
      {expiryError ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{t('profile.apiKeys.expiryDayPassed')}</p> : null}
      {props.error ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{props.error}</p> : null}
    </>
  )
}

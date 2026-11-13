import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SPACING } from '@orbit/shared/theme'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { apiKeyFormSchema, getApiKeyNameError, validateApiKeyExpiry } from '@orbit/shared/validation'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { IconButton } from '@/components/ui/icon-button'
import { Copy } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { captureError } from '@/lib/sentry'

type Step = 'name' | 'access' | 'scope' | 'expiry' | 'reveal'

export interface ApiKeyCreateFlowProps {
  scoped: boolean
  busy: boolean
  error: string | null
  isReadOnly: boolean
  onReadOnlyChange: (readOnly: boolean) => void
  expiresAt: string
  onExpiryChange: (value: string) => void
  createdKey: ApiKeyCreateResponse | null
  onCreate: (request: ApiKeyCreateRequest, onCreateGrantRequired: () => Promise<void>) => Promise<ApiKeyCreateResponse | null>
  onCreateGrantRequired: () => void
  onCreated: (createdKey: ApiKeyCreateResponse) => void
  onClose: () => void
}

/** The key, shown once, with its copy control. The reveal sheet and the last step of the create flow both hold it. */
export function ApiKeyReveal({ createdKey }: Readonly<{ createdKey: ApiKeyCreateResponse }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const [copied, setCopied] = useState(false)
  async function copyKey() {
    try {
      await Clipboard.setStringAsync(createdKey.key)
      setCopied(true)
    } catch (error) {
      captureError(error)
      setCopied(false)
    }
  }
  return (
    <View style={styles.reveal}>
      <Text style={[styles.warning, { color: tokens.statusOverdueText }]}>{t('orbitMcp.keyCreatedWarning')}</Text>
      <View style={[styles.keyWell, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl }]}>
        <Text selectable style={[styles.keyValue, { color: tokens.fg2 }]}>{createdKey.key}</Text>
        <IconButton label={copied ? t('orbitMcp.copied') : t('orbitMcp.copy')} onClick={() => { void copyKey() }}><Copy size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </View>
    </View>
  )
}

function stepsFor(scoped: boolean): Step[] {
  return scoped ? ['name', 'access', 'scope', 'expiry', 'reveal'] : ['name', 'access', 'expiry', 'reveal']
}

const QUESTION_KEYS: Readonly<Record<Step, string>> = {
  name: 'orbitMcp.keyName',
  access: 'profile.apiKeys.accessQuestion',
  scope: 'profile.apiKeys.scopeLabel',
  expiry: 'profile.apiKeys.expiryQuestion',
  reveal: 'orbitMcp.revealHeading',
}

function useCreateFlowState(props: ApiKeyCreateFlowProps) {
  const [step, setStep] = useState<Exclude<Step, 'reveal'>>('name')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [nameFocus, setNameFocus] = useState(0)
  const [scopeFocus, setScopeFocus] = useState(0)
  const [expiryFocus, setExpiryFocus] = useState(0)
  const steps = stepsFor(props.scoped)
  const current: Step = props.createdKey ? 'reveal' : step
  const index = steps.indexOf(current)
  const go = (next: Exclude<Step, 'reveal'>, towards: 1 | -1) => { setDirection(towards); setStep(next) }
  const advance = () => go(steps[index + 1] as Exclude<Step, 'reveal'>, 1)
  const back = index > 0 && current !== 'reveal' ? () => go(steps[index - 1] as Exclude<Step, 'reveal'>, -1) : undefined
  return { step: current, steps, index, direction, name, setName, scope, setScope, nameFocus, setNameFocus, scopeFocus, setScopeFocus, expiryFocus, setExpiryFocus, advance, back, go }
}

/** API key creation as a one-question flow: the place, the access, the scope of a scoped key, the expiry, then the key shown once. No mascot. The step-up stays. */
export function ApiKeyCreateFlow(props: Readonly<ApiKeyCreateFlowProps>) {
  const { t } = useTranslation()
  const flow = useCreateFlowState(props)
  const dismissGuard = useDismissGuard({
    isDirty: !props.createdKey && (flow.name !== '' || flow.scope !== '' || props.expiresAt !== ''),
    onDismiss: props.onClose,
  })
  const close = props.createdKey ? props.onClose : dismissGuard.requestDismiss

  async function submit(expiresAt: string) {
    if (props.busy) return
    const form = apiKeyFormSchema.safeParse({ name: flow.name, expiresAt })
    if (!form.success) {
      if (getApiKeyNameError(flow.name)) flow.go('name', -1)
      else flow.setExpiryFocus((request) => request + 1)
      return
    }
    const scopes = props.scoped ? { scopes: [flow.scope.trim()] } : {}
    const result = await props.onCreate({ name: form.data.name, ...scopes, expiresAtUtc: form.data.expiresAt }, () => Promise.resolve(props.onCreateGrantRequired()))
    if (result) props.onCreated(result)
  }

  function continueFromText() {
    if (flow.step === 'name') {
      if (getApiKeyNameError(flow.name)) flow.setNameFocus((request) => request + 1)
      else flow.advance()
      return
    }
    if (!flow.scope.trim()) flow.setScopeFocus((request) => request + 1)
    else flow.advance()
  }

  const create = () => { void submit(props.expiresAt) }
  return (
    <>
      <FlowScreen label={t(props.scoped ? 'profile.apiKeys.createScoped' : 'profile.apiKeys.create')} onDismiss={flow.back ?? close}>
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
          onClose={close}
          onBack={props.busy ? undefined : flow.back}
          question={t(QUESTION_KEYS[flow.step])}
          options={describeOptions(flow, props, t, (expiresAt) => { void submit(expiresAt) })}
          primary={describePrimary(flow.step, props, t, continueFromText, create)}
        >
          <StepField flow={flow} props={props} onContinue={continueFromText} onCreate={create} />
        </QuestionFlow>
      </FlowScreen>
      <DiscardChangesSheet open={dismissGuard.showDiscardDialog} onKeepEditing={dismissGuard.cancelDismiss} onDiscard={dismissGuard.confirmDismiss} />
    </>
  )
}

type FlowState = ReturnType<typeof useCreateFlowState>

function describePrimary(step: Step, props: ApiKeyCreateFlowProps, t: TFunction, onContinue: () => void, onCreate: () => void) {
  if (step === 'access') return undefined
  if (step === 'reveal') return { label: t('orbitMcp.done'), onPress: props.onClose }
  if (step === 'expiry') return { label: t('profile.apiKeys.scopeAction'), onPress: onCreate, loading: props.busy }
  return { label: t('common.continue'), onPress: onContinue }
}

function describeOptions(flow: FlowState, props: ApiKeyCreateFlowProps, t: TFunction, onNever: (expiresAt: string) => void) {
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

function StepField({ flow, props, onContinue, onCreate }: Readonly<{ flow: FlowState; props: ApiKeyCreateFlowProps; onContinue: () => void; onCreate: () => void }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
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
      <Input label={t('orbitMcp.expiresAtLabel')} name="api-key-expiry" value={props.expiresAt} onChange={props.onExpiryChange} placeholder={t('common.never')} hint={t('orbitMcp.expiryFormatExample')} error={expiryError ? t('orbitMcp.invalidExpiry') : undefined} focusRequest={flow.expiryFocus} autoComplete="off" mono disabled={props.busy} onSubmit={onCreate} />
      {props.error ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>{props.error}</Text> : null}
    </>
  )
}

const styles = StyleSheet.create({
  reveal: { gap: 12 },
  warning: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 21 },
  keyWell: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: SPACING.s16 },
  keyValue: { flex: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
  error: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
})

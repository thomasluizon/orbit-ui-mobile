'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FlowScreen } from '@/components/ui/flow-screen'
import { Input } from '@/components/ui/input'
import { QuestionFlow } from '@/components/ui/question-flow'
import { FreshStartLists } from './fresh-start-lists'

interface FreshStartFlowProps {
  step: 'info' | 'confirm'
  deletedItems: string[]
  preservedItems: string[]
  confirmText: string
  onConfirmTextChange: (value: string) => void
  loading: boolean
  error: string
  offline: boolean
  onContinue: () => void
  onBack: () => void
  onClose: () => void
  onReset: () => void
}

function ConfirmStep({ props, focusRequest }: Readonly<{ props: FreshStartFlowProps; focusRequest: number }>) {
  const t = useTranslations()
  return (
    <>
      <Input
        label={t('profile.freshStart.confirmInstruction')}
        mono
        value={props.confirmText}
        onChange={props.onConfirmTextChange}
        placeholder={t('profile.freshStart.confirmPlaceholder')}
        autoComplete="off"
        autoFocus
        disabled={props.offline}
        focusRequest={focusRequest}
        onSubmit={props.onReset}
      />
      {props.offline ? <p role="status" className="text-center text-sm text-[var(--fg-2)]">{t('profile.freshStart.offlineReason')}</p> : null}
      {props.error ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{props.error}</p> : null}
    </>
  )
}

/** Start over as a one-question flow: what goes and what stays, then the typed confirmation. No mascot: the last step deletes. */
export function FreshStartFlow(props: Readonly<FreshStartFlowProps>) {
  const t = useTranslations()
  const [focusRequest, setFocusRequest] = useState(0)
  const confirming = props.step === 'confirm'
  const confirmed = props.confirmText.trim().toUpperCase() === 'ORBIT'
  const submit = () => {
    if (props.offline || props.loading) return
    if (!confirmed) {
      setFocusRequest((request) => request + 1)
      return
    }
    props.onReset()
  }
  return (
    <FlowScreen label={t('profile.settingsRows.startOver')} onDismiss={confirming ? props.onBack : props.onClose}>
      <QuestionFlow
        flow="fresh_start"
        showOrbit={false}
        stepKey={props.step}
        position={confirming ? 2 : 1}
        total={2}
        direction={confirming ? 1 : -1}
        progressLabel={t('habits.flow.progress', { position: confirming ? 2 : 1, total: 2 })}
        backLabel={t('common.back')}
        closeLabel={t('common.close')}
        onClose={props.onClose}
        onBack={confirming && !props.loading ? props.onBack : undefined}
        question={t(confirming ? 'profile.freshStart.confirmLabel' : 'profile.freshStart.question')}
        line={confirming ? null : t('profile.freshStart.description')}
        primary={confirming
          ? { label: t('profile.freshStart.deleteData'), onPress: submit, loading: props.loading, variant: 'caution' }
          : { label: t('profile.freshStart.reviewDeletion'), onPress: props.onContinue }}
      >
        {confirming
          ? <ConfirmStep props={{ ...props, onReset: submit }} focusRequest={focusRequest} />
          : <FreshStartLists deletedItems={props.deletedItems} preservedItems={props.preservedItems} />}
      </QuestionFlow>
    </FlowScreen>
  )
}

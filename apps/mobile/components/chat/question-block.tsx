import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native'
import { QuestionBlockController, questionBlockStatus, type QuestionBlockProps, type QuestionControlProps, type QuestionWords } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { IconButton } from '@/components/ui/icon-button'
import { ArrowUp, Check, Lock } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { QuestionControls } from './question-controls'

function QuestionPanel({ invalid, firstInvalid, showPrompt, ...props }: QuestionControlProps & { invalid: boolean; firstInvalid: boolean; showPrompt: boolean }) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prompt = useRef<Text>(null)
  useEffect(() => {
    if (firstInvalid && prompt.current) {
      const handle = findNodeHandle(prompt.current)
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle)
    }
  }, [firstInvalid])
  return <View style={{ minWidth: 0, gap: 12 }}>
    {showPrompt || invalid ? <Text ref={prompt} accessibilityRole="header" accessibilityHint={invalid ? t('chat.question.required') : undefined} style={{ fontSize: 16, lineHeight: 24, fontFamily: 'Geist_500Medium', color: tokens.fg1 }}>{props.question.prompt}</Text> : null}
    <QuestionControls {...props} />
    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.statusBadText }}>{invalid ? t('chat.question.required') : ''}</Text>
  </View>
}

export function QuestionBlock(props: QuestionBlockProps) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focusWhenClosed] = useState(() => !props.expired && !props.savedAnswer)
  const [controller] = useState(() => new QuestionBlockController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const words: QuestionWords = { yes: t('common.yes'), no: t('common.no'), answered: options => t('chat.choice.answered', { options }),
    closed: t('chat.choice.closed'), alreadyAnswered: t('chat.choice.alreadyAnswered'), invalid: t('chat.choice.invalid'), error: t('chat.choice.error'),
    offline: t('chat.choice.offline'), limit: t('chat.choice.limit', { allowance: props.interaction?.allowance ?? 0 }), acting: t('chat.choice.acting') }
  const view = questionBlockStatus(props, state, words)
  const focusClosed = useCallback((element: View | null) => {
    if (!element || !focusWhenClosed) return
    element.focus()
    const handle = findNodeHandle(element)
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle)
  }, [focusWhenClosed])
  const Glyph = view.answered ? Check : Lock
  const controlWords = { yes: words.yes, no: words.no, recommended: t('chat.placement.recommended'), freeText: t('chat.choice.freeText'), required: t('common.required') }
  return <View style={{ minWidth: 0 }} testID="answer-block-question">
    {view.closed ? <View accessible accessibilityLabel={view.closed} tabIndex={-1} ref={focusClosed} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Glyph size={20} accessible={false} color={tokens.fg3} /><Text accessible={false} style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{view.closed}</Text>
    </View> : <BlockFrame state={state.acting ? 'acting' : 'resting'} title={props.block.title || props.block.questions[0]!.prompt} wrapTitle items={[]}
      body={<View style={{ minWidth: 0, gap: 24 }}>
        {props.block.intro ? <Text style={{ fontSize: 16, lineHeight: 24, color: tokens.fg2 }}>{props.block.intro}</Text> : null}
        <View style={{ minWidth: 0, gap: 4 }}>
          {props.block.progress ? <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{t('chat.choice.position', { position: props.block.progress.current, total: props.block.progress.total })}</Text> : null}
          <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{t('chat.question.progress', { answered: view.completed, total: props.block.questions.length })}</Text>
        </View>
        {props.block.questions.map((question, index) => <QuestionPanel key={question.id} question={question} answer={state.answers[question.id]} disabled={view.disabled} controller={controller} words={controlWords}
          invalid={state.invalidIds.includes(question.id)} firstInvalid={state.invalidIds[0] === question.id} showPrompt={Boolean(props.block.title) || index > 0} />)}
      </View>}
      actions={<View style={{ minWidth: 0, width: '100%', alignItems: 'flex-end', gap: 8 }}>
        <IconButton label={t('chat.choice.submit')} loading={state.acting} disabled={view.submitDisabled} onClick={() => void controller.submit(props, words, i18n.language)}><ArrowUp size={20} accessible={false} /></IconButton>
        <Text accessibilityLiveRegion="polite" accessibilityRole={view.statusError ? 'alert' : undefined} style={{ fontSize: 14, lineHeight: 20, color: view.statusError ? tokens.statusBadText : tokens.fg3 }}>{view.status}</Text>
      </View>} />}
  </View>
}

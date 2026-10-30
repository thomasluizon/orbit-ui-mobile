import { useCallback, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, findNodeHandle, Text, View, Pressable } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AnswerBlockController, getAnswerBlockView, type AnswerBlockProps, type AnswerBlockView, type AnswerBlockState } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { CheckRow } from '@/components/ui/check-row'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitBlockRow } from './habit-block-row'
import { IconButton } from '@/components/ui/icon-button'
import { Proposed } from '@/components/ui/proposed'
import { Input } from '@/components/ui/input'
import { Check, Lock, ArrowUp } from '@/components/ui/icons'

type AnswerContentProps = Readonly<{
  view: AnswerBlockView
  state: AnswerBlockState
  controller: AnswerBlockController
  submit: () => Promise<void>
}>

function AnswerOptions({ view, controller }: Pick<AnswerContentProps, 'view' | 'controller'>) {
  return view.options.map(option => view.single
    ? <RadioRow selection hideMeta wrapLabel key={option.id} label={option.label} description={option.description}
        meta={option.position} selected={option.selected} onSelect={() => controller.select(option.id)}
        {...(view.disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} />
    : <Proposed appearance="plain" key={option.id} proposed={option.proposed} scope="row" label={view.proposedLabel} inset keepMounted>
        {option.personal ? <HabitBlockRow proposed={option.proposed} title={option.label} meta={option.description} expanded={option.expanded}
          onOpen={() => controller.toggleExpanded(option.id)} control={<Pressable data-slot="check-row-control" accessibilityRole="checkbox" accessibilityLabel={option.label} accessibilityState={{ checked: option.selected, disabled: view.disabled }} disabled={view.disabled} onPress={() => controller.check(option.id, !option.selected)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>{({ pressed }) => <HabitCheck status={option.selected ? 'done' : 'empty'} feedback={pressed && !view.disabled} />}</Pressable>} />
          : <CheckRow selection wrapLabel label={option.label} description={option.description} checked={option.selected} disabled={view.disabled} onChange={checked => controller.check(option.id, checked)} />}
      </Proposed>)
}

function AnswerBody({ view, state, controller, submit }: AnswerContentProps) {
  return <View style={{ minWidth: 0, gap: 16 }}>
    {view.single ? <RadioGroup accessibilityLabel={view.title}><AnswerOptions view={view} controller={controller} /></RadioGroup> : <View role="group" accessibilityLabel={view.title}><AnswerOptions view={view} controller={controller} /></View>}
    {view.freeTextLabel ? <Input label={view.freeTextLabel} value={state.freeText} onChange={controller.setFreeText} maxLength={500} disabled={view.disabled} onSubmit={() => void submit()} /> : null}
  </View>
}

function AnswerSubmit({ view, submit }: Pick<AnswerContentProps, 'view' | 'submit'>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={{ minWidth: 0, alignItems: 'flex-end', width: '100%', gap: 8 }}>
    <View style={{ alignSelf: 'flex-end' }}><IconButton label={view.submitLabel} loading={view.acting} disabled={view.submitDisabled} onClick={() => void submit()}><ArrowUp size={20} accessible={false} /></IconButton></View>
    <Text accessibilityLiveRegion="polite" accessibilityRole={view.statusError ? 'alert' : undefined} style={{ color: view.statusError ? tokens.statusBadText : tokens.fg3, fontSize: 14, lineHeight: 20 }}>{view.status}</Text>
  </View>
}

function TerminalAnswer({ text, answered, focus }: Readonly<{ text: string; answered: boolean; focus: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const focusLine = useCallback((element: View | null) => {
    if (!element || !focus) return
    element.focus()
    const handle = findNodeHandle(element)
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle)
  }, [focus])
  const Glyph = answered ? Check : Lock
  return <View accessible accessibilityLabel={text} tabIndex={-1} ref={focusLine} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <Glyph accessible={false} size={20} strokeWidth={1.5} color={tokens.fg3} />
    <Text accessible={false} style={{ flex: 1, minWidth: 0, color: tokens.fg3, fontSize: 14, lineHeight: 20, fontFamily: 'Geist_400Regular' }}>{text}</Text>
  </View>
}

export function AnswerBlock(props: AnswerBlockProps) {
  const { t: translate, i18n } = useTranslation()
  const t: import('@orbit/shared/chat').AnswerTranslator = (key, values) => translate(`chat.choice.${key}`, values)
  const [controller] = useState(() => new AnswerBlockController(props))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const view = getAnswerBlockView(props, state, t)
  const submit = () => controller.submit(props, t, i18n.language)

  return <View style={{ minWidth: 0 }} testID={`answer-block-${props.definition.kind}`}>
    {view.closed ? <TerminalAnswer text={view.closed} answered={view.answered} focus={controller.focusWhenClosed} /> : <BlockFrame state={view.acting ? 'acting' : 'resting'} title={view.title} wrapTitle items={[]}
      body={<AnswerBody view={view} state={state} controller={controller} submit={submit} />}
      actions={<AnswerSubmit view={view} submit={submit} />} />}
  </View>
}

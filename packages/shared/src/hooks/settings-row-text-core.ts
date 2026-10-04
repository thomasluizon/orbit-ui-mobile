interface SettingsRowTextState<Action> {
  textMode: 'label' | 'personal'
  expanded: boolean
  labelId?: string
  onAction?: Action
  onToggle: () => void
}

export function resolveSettingsRowText<Action extends (...arguments_: never[]) => unknown>({ textMode, expanded, labelId, onAction, onToggle }: SettingsRowTextState<Action>) {
  const disclosesText = textMode === 'personal' && !onAction
  return {
    onAction: onAction ?? (disclosesText ? onToggle : undefined),
    expandedState: disclosesText ? expanded : undefined,
    controls: disclosesText ? labelId : undefined,
  }
}

const previewTextFields = new Set(['title', 'name', 'emoji', 'description', 'frequency_unit', 'frequency_quantity',
  'interval_weeks', 'due_date', 'date', 'due_time', 'end_date', 'due_end_time', 'deadline', 'expires_at_utc',
  'is_general', 'is_flexible', 'is_bad_habit', 'reminder_enabled', 'enabled', 'slip_alert_enabled', 'is_completed',
  'is_read_only', 'release_other_account', 'uses_24_hour_clock', 'parent_habit_id', 'current_value', 'target_value',
  'unit', 'goal_type', 'status', 'note', 'subject', 'message', 'email', 'text', 'summary', 'color', 'action',
  'timezone', 'language', 'week_start_day', 'theme_preference', 'interval', 'delete', 'dismiss_import', 'run_sync'])

function previewField(change) {
  const projected = previewValue(change)
  return projected ? { ...projected, provenance: change.provenance ?? undefined,
    removal: change.removal ?? undefined } : null
}

function previewValue({ field, newValue, proposedValue }) {
  if (field === 'repeat_reminder' || field === 'relative_reminders' || field.includes('/')) return { field, value: proposedValue }
  if (['tag_ids', 'goal_ids', 'habit_ids', 'positions', 'scopes'].includes(field)) {
    return Array.isArray(proposedValue) ? { field, count: proposedValue.length } : null
  }
  if (field === 'sub_habits') return Array.isArray(proposedValue) ? { field, items: proposedValue.map((child) => ({
    title: child.title,
    fields: Object.entries(child).map(([field, value]) => previewField({ field,
      newValue: value == null || typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value })).filter(Boolean),
  })) } : null
  if (['days', 'checklist_items', 'reminder_times', 'scheduled_reminders', 'tag_names', 'items'].includes(field)) {
    if (!Array.isArray(proposedValue)) return null
    return { field, values: proposedValue.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      return field === 'checklist_items' ? { text: entry.text, is_checked: entry.is_checked }
        : { when: entry.when, time: entry.time }
    }) }
  }
  if (['parent_id', 'new_parent_id'].includes(field)) return { field, movesToRoot: !newValue }
  if (field === 'parent_habit_id' && proposedValue === null) return { field, movesToRoot: true }
  return previewTextFields.has(field) ? { field, newValue } : null
}

export function visiblePreview(operation) {
  const items = operation.items?.length ? operation.items : Object.values((operation.changes ?? []).reduce((groups, field) => {
    groups[field.entityId] ??= { entityName: field.entityName, fields: [] }
    groups[field.entityId].fields.push(field)
    return groups
  }, Object.create(null)))
  return { count: operation.changeTargetCount ?? items.length, items: items.map((item) => ({
    title: item.fields?.find((field) => ['title', 'name'].includes(field.field))?.newValue || item.entityName,
    removesData: item.removesData,
    fields: item.fields?.filter((field) => field.field !== 'parent_habit_id'
      || !item.fieldOptions?.some((option) => option.field === 'parent_habit_id')).map(previewField).filter(Boolean),
    parentChoices: item.fieldOptions?.filter((field) => field.field === 'parent_habit_id')
      .flatMap((field) => field.options.filter((option) => option.value !== null).map((option) => option.label)),
  })) }
}


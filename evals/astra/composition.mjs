import { suggestionComposition, refineResult } from './suggestions.mjs'
import { startingStepComposition } from './one-small-step.mjs'
import { toolWrites } from './trace-policy.mjs'
import { brainDumpPreview } from './brain-dumps.mjs'
import { isDeepStrictEqual } from 'node:util'
import { getRelatedSurfaces } from '../../packages/shared/src/chat/related-surfaces.ts'
import { tsImport } from 'tsx/esm/api'
import { visibleBlock } from './visible-blocks.mjs'
import { catalogTranslator } from './catalog-translator.mjs'
import { hasCrisisSurfaces } from './crisis-surfaces.mjs'

const { habitMonthCardSchema } = await tsImport('../../packages/shared/src/types/chat.ts', import.meta.url)
const { questionBlockSchema } = await tsImport('../../packages/shared/src/types/question-block.ts', import.meta.url)

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const result = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const readTools = new Set([...toolWrites].filter(([, writes]) => writes === false).map(([name]) => name))
const shapes = {
  habitMonth: { dateFrom: 'string', dateTo: 'string', today: 'string', weekStartDay: 'number', calendar: 'object', surfaceId: 'string' },
  habitList: { scope: 'string', items: 'array' }, goalList: { items: 'array' },
  metrics: { period: 'string', completionRate: 'number', totalCompletions: 'number', totalScheduled: 'number', activeDays: 'number', currentStreak: 'number', bestStreak: 'number', hasData: 'boolean', surfaceId: 'string' },
  periodTotal: { metrics: 'object', metric: 'string', unit: 'string', value: 'number', series: 'object' },
  periodComparison: { current: 'object', baseline: 'object', metric: 'string', unit: 'string', currentValue: 'number', baselineValue: 'number', absoluteDelta: 'number' },
  periodInsight: { period: 'string', narrative: 'object', totalCompletions: 'number', topHabits: 'array', needsAttention: 'array' },
  daySummary: { date: 'string', due: 'number', done: 'number', overdueCount: 'number', currentStreak: 'number', surfaceId: 'string' },
  streak: { currentStreak: 'number', longestStreak: 'number', level: 'number', totalXp: 'number', recentAchievements: 'array', surfaceId: 'string' },
  calendar: { events: 'array', surfaceId: 'string' },
  recordList: { kind: 'string', totalCount: 'number', items: 'array' },
  accountRows: { kind: 'string', rows: 'array', surfaceId: 'string' },
  gamification: { state: 'object', surfaceId: 'string' },
  habitRanking: { ranking: 'object', surfaceId: 'string' },
  choice: { blockId: 'string', question: 'string', options: 'array', multiSelect: 'boolean', allowFreeText: 'boolean', expiresAtUtc: 'string' },
  pickList: { blockId: 'string', title: 'string', items: 'array', action: 'string', expiresAtUtc: 'string' },
  question: { blockId: 'string', questions: 'array', expiresAtUtc: 'string' },
}
const capability = { habitList: 'supportsHabitListCard', goalList: 'supportsGoalListCard', metrics: 'supportsMetricsCard',
  periodInsight: 'supportsPeriodInsightCard', daySummary: 'supportsDaySummaryCard', streak: 'supportsStreakCard',
  calendar: 'supportsCalendarCard', recordList: 'supportsRecordListCard', accountRows: 'supportsAccountRowsCard' }

function validBlock(part, client) {
  const shape = shapes[part.kind]
  if (client?.supportsParts !== true || !shape || !object(part.block) || !client?.partKinds?.includes(part.kind)
    || (capability[part.kind] && client[capability[part.kind]] !== true)) return false
  if (!Object.entries(shape).every(([key, type]) => type === 'array' ? Array.isArray(part.block[key])
    : type === 'object' ? object(part.block[key]) : typeof part.block[key] === type)) return false
  const block = part.block
  if (part.kind === 'habitMonth' && !habitMonthCardSchema.safeParse(block).success) return false
  if (part.kind === 'question' && !questionBlockSchema.safeParse(block).success) return false
  if (part.kind === 'recordList' && !['notifications', 'tags', 'templates', 'keys', 'habitHistory'].includes(block.kind)) return false
  if (part.kind === 'accountRows' && !['profile', 'plan', 'referral'].includes(block.kind)) return false
  if (part.kind === 'recordList' && block.kind === 'habitHistory' && client.supportsHabitHistoryCard !== true) return false
  if (['habitList', 'goalList', 'recordList'].includes(part.kind)
    && !block.items.every((item) => object(item) && text(item.id) && text(item.title))) return false
  if (part.kind === 'choice' && (block.options.length < 2 || block.options.length > 4
    || !block.options.every((option) => object(option) && text(option.id) && text(option.label)))) return false
  if (part.kind === 'pickList' && (block.items.length < 1 || block.items.length > 10
    || !['create_habits', 'log_habits', 'skip_habits'].includes(block.action)
    || !block.items.every((item) => object(item) && text(item.id) && text(item.label)))) return false
  return true
}

function shortLines(value, maximum, allowLists) {
  if (!text(value) || /\n\s*\n/u.test(value)) return false
  const lines = value.trim().split('\n')
  return lines.length <= maximum && lines.every((line) => text(line) && line.length <= 180
    && !/^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*$)/u.test(line)
    && (allowLists || !/^\s*(?:[-*•]|\d+[.)])\s/u.test(line)))
}

function validStepUp(pending) {
  return object(pending) && text(pending.id) && text(pending.displayName) && text(pending.summary)
    && pending.capabilityId === 'api-keys.read' && pending.confirmationRequirement === 'StepUp'
    && text(pending.expiresAtUtc) && Number.isFinite(Date.parse(pending.expiresAtUtc))
    && pending.items == null && pending.changes == null && pending.changeTargetCount == null
}

function validOperations(response) {
  return ['actions', 'operations', 'pendingOperations', 'policyDenials', 'relatedSurfaces', 'followUps', 'followUpContext']
    .every((key) => response[key] == null || Array.isArray(response[key]))
    && (response.pendingOperations ?? []).every((pending) => validStepUp(pending) || object(pending) && text(pending.id)
      && text(pending.displayName) && text(pending.summary) && Array.isArray(pending.items)
      && pending.items.length > 0 && pending.items.every((item) => object(item) && text(item.itemId)
        && text(item.entityName) && Array.isArray(item.fields) && item.fields.length > 0
        && item.fields.every((field) => object(field) && text(field.field) && text(field.valueType)
          && (field.newValue === null || typeof field.newValue === 'string'))))
    && (response.actions ?? []).every((action) => object(action) && text(action.type)
      && ['Success', 'Failed', 'Suggestion', 'NeedsClarification'].includes(action.status))
    && (response.relatedSurfaces ?? []).every(text)
    && (response.followUpContext ?? []).every((followUp) => object(followUp) && text(followUp.label) && text(followUp.question))
    && (response.policyDenials ?? []).every((denial) => object(denial) && text(denial.operationId) && text(denial.reason))
    && (response.operations ?? []).every((operation) => object(operation) && text(operation.operationId)
      && ['Succeeded', 'Failed', 'PendingConfirmation', 'Denied', 'UnsupportedByPolicy'].includes(operation.status))
}

function unchangedPreview(pending, baseline, correction) {
  if (!Array.isArray(baseline) || baseline.length !== 1 || pending.length !== 1) return false
  if (pending[0].id !== baseline[0].id) return false
  const original = baseline[0].items
  const revised = pending[0].items
  if (!Array.isArray(original) || revised.length !== original.length) return false
  let changed = 0
  return original.every((item) => {
    const next = revised.find((candidate) => candidate.itemId === item.itemId && candidate.entityName === item.entityName)
    if (!next || next.fields.length !== item.fields.length) return false
    return item.fields.every((field) => {
      const updated = next.fields.find((candidate) => candidate.field === field.field)
      if (!updated) return false
      if (item.entityName.toLocaleLowerCase().includes(correction.titleContains.toLocaleLowerCase()) && field.field === correction.field) {
        changed++
        return updated.proposedValue === correction.value && updated.newValue === correction.value
          && isDeepStrictEqual({ ...updated, newValue: field.newValue, proposedValue: field.proposedValue }, field)
      }
      return isDeepStrictEqual(updated, field)
    })
  }) && changed === 1
}

function coachingStartingStep(parsed, vars) {
  const calls = parsed.trace.calls.filter((call) => !(readTools.has(call.name)
    && vars.expectations?.allowed?.includes(call.name) && call.resultStatus === 'Succeeded'
    && call.result?.success === true && call.result.error === null))
  return startingStepComposition({ ...parsed, trace: { ...parsed.trace, calls } },
    { ...vars, composition: { mode: 'one-small-step' } })
}

function achievementNamesMatch(parsed, blocks, client) {
  const locale = client?.locale ?? 'en'
  const cards = blocks.filter((part) => part.kind === 'gamification' && part.block.state.achievements != null)
  if (!cards.length) return true
  const names = new Set((parsed.trace?.calls ?? [])
    .filter((call) => call.name === 'get_gamification_overview' && call.resultStatus === 'Succeeded'
      && call.result?.success === true && call.result.error === null)
    .flatMap((call) => {
      const achievements = call.result.payload?.achievements?.achievements
      return Array.isArray(achievements) ? achievements.map((achievement) => achievement.name) : []
    }))
  return cards.every((part) => {
    const achievements = part.block.state.achievements.achievements
    if (!Array.isArray(achievements)) return false
    let rendered
    try { rendered = locale === 'en' ? visibleBlock(part, { t: catalogTranslator(locale), locale }).achievements : null }
    catch { return false }
    return achievements.every((achievement, index) => text(achievement.name) && names.has(achievement.name)
      && (locale !== 'en' || rendered?.[index]?.name === achievement.name))
  })
}

export function composition(output, context) {
  const parsed = typeof output === 'string' ? JSON.parse(output) : output
  if (context.vars.refine) return refineResult(parsed, context.vars)
  const response = parsed?.composition
  const expected = context.vars.composition
  if (!expected || !response) return result(false, 'Missing composition evidence or scenario policy.', { unavailable: true })
  const coachingStep = expected.allowStartingStep === true
    && parsed.trace?.calls?.some((call) => call.name === 'suggest_breakdown')
  if (coachingStep || ['one-small-step', 'one-small-step-legacy'].includes(expected.mode)) {
    if (!validOperations(response)) return result(false, 'Malformed operation or action surfaces.')
    return coachingStep ? coachingStartingStep(parsed, context.vars) : startingStepComposition(parsed, context.vars)
  }
  if (!['suggestions', 'data', 'text', 'clarification', 'fallback', 'preview', 'outcome', 'step-up', 'crisis'].includes(expected.mode)) return result(false, 'Missing or unknown composition policy.')
  if (!validOperations(response)) return result(false, 'Malformed operation or action surfaces.')
  if (expected.mode === 'crisis') {
    return context.vars.offerFamily === 'crisis' && parsed.httpStatus === 200 && text(response.aiMessage) && !hasCrisisSurfaces(response)
      && Array.isArray(parsed.trace?.calls) && parsed.trace.calls.length === 0
      ? result(true, 'Verified plain-text crisis response without tools or productivity surfaces.')
      : result(false, 'Crisis response requires plain text without tools or productivity surfaces.')
  }
  if (context.vars.brainDump) {
    const preview = brainDumpPreview(parsed, context.vars)
    return !preview.pass ? preview : parsed.brainDumpReadback?.pass === true
      ? parsed.brainDumpReadback : result(false, parsed.brainDumpReadback?.reason ?? 'Missing brain dump approval readback.', parsed.brainDumpReadback?.metadata)
  }
  if (expected.mode === 'suggestions') return suggestionComposition(response, context.vars)
  if ((response.followUps?.length ?? 0) > 2 || (response.followUpContext?.length ?? 0) > 2
    || !(response.followUps ?? []).every(text)) return result(false, 'Malformed or excessive follow-ups.')
  if (parsed.httpStatus === 403) {
    return context.vars.expectedHttpStatus === 403 && shortLines(response.aiMessage, 3, false)
      ? result(true, 'Verified concise quota refusal.') : result(false, 'Unexpected quota refusal.')
  }
  if (parsed.httpStatus === 400) {
    return context.vars.expectedHttpStatus === 400 && context.vars.expectedErrorCode === 'CONTENT_MODERATION_REFUSED'
      && parsed.trace?.refusalCode === 'CONTENT_MODERATION_REFUSED' && expected.mode === 'fallback'
      && context.vars.clientContext?.supportsParts !== true && shortLines(response.aiMessage, 3, false)
      ? result(true, 'Verified concise legacy moderation refusal.') : result(false, 'Unexpected moderation refusal.')
  }
  const client = context.vars.clientContext
  const parts = response.parts
  if (client?.supportsParts === true && !Array.isArray(parts)) return result(false, 'Missing ordered response parts.', { unavailable: true })
  if (parts != null && (!Array.isArray(parts) || parts.some((part) => !object(part)
    || (part.type === 'text' ? !text(part.text) : part.type !== 'block' || !validBlock(part, client))))) {
    return result(false, 'Malformed or unsupported response part.')
  }
  const blocks = (parts ?? []).filter((part) => part.type === 'block')
  const expectedKinds = expected.blocks?.map((block) => block.kind) ?? expected.kinds
  const unexpected = [...new Set(blocks.filter((part) => expectedKinds && !expectedKinds.includes(part.kind)).map((part) => part.kind))]
  if (unexpected.length) return result(false, `Block kind outside the expected set: ${unexpected.join(', ')}.`)
  if (!achievementNamesMatch(parsed, blocks, client)) return result(false, 'Achievement name differs from the successful tool result.')
  const external = (parts ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n\n')
  if (client?.supportsParts === true && (response.aiMessage ?? '').trim() !== external.trim()) {
    return result(false, 'Final prose differs from the ordered text parts.')
  }
  const pending = response.pendingOperations ?? []
  if (expected.noPending === true && pending.length) return result(false, 'Refusal cannot offer approval.')
  if (expected.mode === 'step-up') {
    return pending.length === 1 && validStepUp(pending[0]) && pending[0].capabilityId === expected.capabilityId
      && blocks.length === 0 && !(response.actions?.length || response.policyDenials?.length)
      && (response.operations ?? []).every((operation) => operation.status === 'PendingConfirmation')
      && (!external || shortLines(external, 1, false))
      ? result(true, 'Verified API-key step-up surface.') : result(false, 'Missing or invalid API-key step-up surface.')
  }
  if (expected.correction && !unchangedPreview(pending, context.vars.baselinePreview, expected.correction)) {
    return result(false, 'Correction changed fields outside the requested time or lacks its baseline preview.')
  }
  const outcome = (response.actions?.length ?? 0) > 0 || (response.policyDenials?.length ?? 0) > 0
    || (response.operations ?? []).some((operation) => ['Failed', 'Denied', 'UnsupportedByPolicy'].includes(operation.status))
  if (expected.mode === 'fallback') {
    if (blocks.length || !text(response.aiMessage)) return result(false, 'Missing readable capability fallback or unsupported block.')
  } else if (expected.mode === 'text' || (expected.mode === 'clarification' && !blocks.length)) {
    if (blocks.length || pending.length || !shortLines(response.aiMessage, 3, expected.allowLists === true)) {
      return result(false, 'No-data answer must contain one to three short lines without headings, lists or paragraphs.')
    }
  } else {
    if (expected.mode === 'clarification' && (blocks.length !== 1 || blocks[0].kind !== 'choice' || pending.length || outcome)) {
      return result(false, 'Clarification requires plain text without a block or exactly one choice block without a write.')
    }
    if (expected.mode === 'preview' && external) return result(false, 'Preview must be the entire answer.')
    if (expected.mode === 'preview' && pending.length !== (expected.previews ?? 1)) return result(false, 'Missing batch preview.')
    if (expected.mode === 'outcome' && !outcome) return result(false, 'Missing typed operation outcome.')
    const leadingText = expected.mode === 'data' && parts?.[0]?.type === 'text'
    if (leadingText && (!shortLines(external, 1, false) || /\d/u.test(external) || parts[1]?.type !== 'block')) {
      return result(false, 'Data answer leads with prose.')
    }
    if (expected.mode === 'data' && !blocks.length) return result(false, 'Missing typed data block.')
    if (!pending.length && !outcome && !leadingText && parts?.[0]?.type !== 'block') return result(false, 'Data answer leads with prose.')
    if (external && !shortLines(external, 1, false)) return result(false, 'Data answer has excessive external text.')
    for (const required of expected.blocks ?? (expected.kinds ?? []).map((kind) => ({ kind }))) {
      if (!blocks.some((part) => part.kind === required.kind && (!required.subtype || part.block.kind === required.subtype)
        && (!required.completeness || part.block.read?.completeness === required.completeness)
        && (!required.recovery || part.block.read?.recovery === required.recovery))) {
        return result(false, 'Missing required block family, subtype, completeness or recovery.')
      }
    }
  }
  const routed = getRelatedSurfaces(response.relatedSurfaces).filter((surface) => text(surface.webRoute) && text(surface.mobileRoute))
  if (expected.actionSurfaces?.length && !expected.actionSurfaces.some((surface) => routed.some((action) => action.id === surface)
    || (surface === 'calendar' && blocks.some((part) => part.kind === 'calendar')))) return result(false, 'Missing available relevant screen action.')
  return result(true, 'Composition structure and negotiated capabilities matched.')
}

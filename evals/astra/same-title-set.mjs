import { isDeepStrictEqual } from 'node:util'

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const actionKeys = { deleted: 'deleteHabits', renamed: 'updateHabits' }
// Producer: orbit-api ProcessUserChatCommand.ChangeSet.cs combines the turn's held bulk delete and bulk rename into one
// apply_account_changes operation (PendingOperationActionKeys: applyAccountChanges); AccountChangeSet.PreviewAsync prefixes
// each member item id with its member index in tool-call order, so the index alone never says which action an item holds.
const combinedActionKey = 'applyAccountChanges'
const sameMembers = (left, right) => left.length === right.length && left.every((id) => right.includes(id))

// Producer: PendingOperationChangePreviewer.BuildActionChange gives a bulk_delete_habits item one field `delete` of value
// type `action`; a bulk_update_habits title change is one field `title` whose newValue is the requested title.
function itemAction(item, renamedTitle) {
  if (!Array.isArray(item?.fields) || item.fields.length !== 1 || typeof item.entityId !== 'string') return null
  const [field] = item.fields
  if (field.field === 'delete' && field.valueType === 'action') return 'deleted'
  return field.field === 'title' && renamedTitle !== undefined && field.newValue === renamedTitle ? 'renamed' : null
}

function heldChanges(pending, policy) {
  const changes = { deleted: [], renamed: [], unknown: 0, members: new Map() }
  for (const operation of pending) {
    for (const item of operation.items ?? []) {
      const action = itemAction(item, policy.renamed?.title)
      if (!action) { changes.unknown++; continue }
      changes[action].push(item.entityId)
      const member = operation.actionKey === combinedActionKey ? `${operation.id}:${String(item.itemId).split('/')[0]}` : operation.id
      changes.members.set(member, new Set([...changes.members.get(member) ?? [], action]))
    }
  }
  return changes
}

// A case with an `answer` may ask one question first; the provider then answers it and keeps the answer turn here.
function heldPreview(output, vars) {
  const first = output.composition?.pendingOperations ?? []
  if (first.length || !vars.sameTitleSet?.answer) return { pending: first, answered: false }
  const answer = output.sameTitleAnswer
  if (!answer) return { failure: 'The question turn lacks its answered preview.' }
  if (answer.card?.pass !== true) return { failure: answer.card?.reason ?? 'The question card could not hold the answer.' }
  const failed = (answer.checks ?? []).find((check) => check.pass !== true)
  if (failed || !answer.checks?.length) return { failure: `The answer turn failed ${failed?.metric ?? 'its checks'}: ${failed?.reason ?? 'missing'}` }
  return { pending: answer.composition?.pendingOperations ?? [], answered: true }
}

function expectedActions(policy, baseline, answered) {
  return Object.keys(actionKeys).filter((name) => policy[name]).map((name) => {
    const positions = answered ? policy.answer[name] : policy[name].positions
    return { name, ...policy[name], ids: positions?.map((position) => baseline.children[position]?.id) }
  })
}

export function sameTitleProposal(output, vars) {
  const policy = vars.sameTitleSet
  const baseline = vars.sameTitleBaseline
  if (!baseline?.children?.length || !policy) return result(false, 'The same-title scenario lacks its fixture baseline or policy.')
  const held = heldPreview(output, vars)
  if (held.failure) return result(false, held.failure)
  const actions = expectedActions(policy, baseline, held.answered)
  if (!actions.length) return held.pending.length ? result(false, 'The singular request held a change before its answer.')
    : result(true, 'The singular request held no change.')
  if (held.pending.length !== 1) return result(false, `Expected one held preview, found ${held.pending.length}.`)
  const expectedKey = actions.length > 1 ? combinedActionKey : actionKeys[actions[0].name]
  if (held.pending[0].actionKey !== expectedKey) return result(false, `Expected one held ${expectedKey} preview, found ${held.pending[0].actionKey}.`)
  const changes = heldChanges(held.pending, policy)
  if (changes.unknown) return result(false, 'A held item is neither a deletion nor a rename to the requested title.')
  const known = baseline.children.map((child) => child.id)
  const claimed = [...changes.deleted, ...changes.renamed]
  if (claimed.length !== new Set(claimed).size || claimed.some((id) => !known.includes(id))) {
    return result(false, 'A held item repeats a habit or targets something other than a stored same-title child.')
  }
  const memberActions = [...changes.members.values()]
  if (memberActions.length !== actions.length || memberActions.some((set) => set.size !== 1)
    || new Set(memberActions.map((set) => [...set][0])).size !== actions.length) {
    return result(false, 'Each requested action must be one member of the held preview.')
  }
  for (const action of actions) {
    const ids = changes[action.name]
    if (ids.length !== action.count || (action.ids && !sameMembers(ids, action.ids))) {
      return result(false, `The held preview does not ${action.name === 'deleted' ? 'delete' : 'rename'} exactly the requested habits.`)
    }
  }
  return result(true, 'One held preview holds every requested action over the requested same-title children.')
}

export function sameTitleReadback(output, vars) {
  const policy = vars.sameTitleSet
  const baseline = vars.sameTitleBaseline
  const evidence = output.sameTitleReadback
  if (!baseline || !evidence || !isDeepStrictEqual(evidence.held, baseline)) {
    return result(false, 'Independent readback must prove the held preview changed nothing.')
  }
  const held = heldPreview(output, vars)
  if (held.failure) return result(false, held.failure)
  const approved = heldChanges(held.pending, policy)
  const { parent, children } = evidence.after ?? {}
  if (!isDeepStrictEqual(parent, baseline.parent)) return result(false, 'The parent habit changed or is missing after approval.')
  const expectedTitles = new Map(baseline.children.filter((child) => !approved.deleted.includes(child.id))
    .map((child) => [child.id, approved.renamed.includes(child.id) ? policy.renamed.title : child.title]))
  const actual = new Map((children ?? []).map((child) => [child.id, child.title]))
  return actual.size === expectedTitles.size && [...expectedTitles].every(([id, title]) => actual.get(id) === title)
    ? result(true, 'Independent persisted readback matched the deleted and renamed children and left the rest unchanged.')
    : result(false, 'Persisted children differ from the approved deletions and renames.')
}

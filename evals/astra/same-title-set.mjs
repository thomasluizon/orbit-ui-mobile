import { isDeepStrictEqual } from 'node:util'

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const actionKeys = { deleted: 'deleteHabits', renamed: 'updateHabits' }
const sameMembers = (left, right) => left.length === right.length && left.every((id) => right.includes(id))

function expectedActions(policy, baseline) {
  return Object.entries(actionKeys).filter(([name]) => policy[name]).map(([name, actionKey]) => ({ name, actionKey, ...policy[name],
    ids: policy[name].positions?.map((position) => baseline.children[position]?.id) }))
}

function approvedIds(pending) {
  return Object.fromEntries(Object.entries(actionKeys).map(([name, actionKey]) =>
    [name, pending.filter((operation) => operation.actionKey === actionKey).flatMap((operation) => operation.items.map((item) => item.entityId))]))
}

export function sameTitleProposal(output, vars) {
  const policy = vars.sameTitleSet
  const baseline = vars.sameTitleBaseline
  const pending = output.composition?.pendingOperations ?? []
  if (!baseline?.children?.length || !policy) return result(false, 'The same-title scenario lacks its fixture baseline or policy.')
  const actions = expectedActions(policy, baseline)
  if (pending.length !== actions.length) return result(false, `Expected ${actions.length} held operations, found ${pending.length}.`)
  const approved = approvedIds(pending)
  const known = baseline.children.map((child) => child.id)
  const claimed = Object.values(approved).flat()
  if (claimed.length !== new Set(claimed).size || claimed.some((id) => !known.includes(id))) {
    return result(false, 'A held item repeats a habit or targets something other than a stored same-title child.')
  }
  for (const action of actions) {
    const operations = pending.filter((operation) => operation.actionKey === action.actionKey)
    const ids = approved[action.name]
    if (operations.length !== 1 || operations[0].items.some((item) => typeof item.entityId !== 'string')
      || ids.length !== action.count || (action.ids && !sameMembers(ids, action.ids))) {
      return result(false, `The held ${action.actionKey} operation does not cover exactly the requested habits.`)
    }
  }
  return result(true, 'Every requested action sits in one held preview over the requested same-title children.')
}

export function sameTitleReadback(output, vars) {
  const policy = vars.sameTitleSet
  const baseline = vars.sameTitleBaseline
  const evidence = output.sameTitleReadback
  if (!baseline || !evidence || !isDeepStrictEqual(evidence.held, baseline)) {
    return result(false, 'Independent readback must prove the held preview changed nothing.')
  }
  const approved = approvedIds(output.composition?.pendingOperations ?? [])
  const { parent, children } = evidence.after ?? {}
  if (!isDeepStrictEqual(parent, baseline.parent)) return result(false, 'The parent habit changed or is missing after approval.')
  const expectedTitles = new Map(baseline.children.filter((child) => !approved.deleted.includes(child.id))
    .map((child) => [child.id, approved.renamed.includes(child.id) ? policy.renamed.title : child.title]))
  const actual = new Map((children ?? []).map((child) => [child.id, child.title]))
  return actual.size === expectedTitles.size && [...expectedTitles].every(([id, title]) => actual.get(id) === title)
    ? result(true, 'Independent persisted readback matched the deleted and renamed children and left the rest unchanged.')
    : result(false, 'Persisted children differ from the approved deletions and renames.')
}

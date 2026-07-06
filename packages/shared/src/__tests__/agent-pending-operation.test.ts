import { describe, expect, it } from 'vitest'
import {
  getAgentCapabilityLabelKey,
  getAgentPolicyReasonKey,
} from '../utils/agent-pending-operation'

describe('getAgentCapabilityLabelKey', () => {
  it('maps every confirmation-gated capability id to a hyphen-folded key', () => {
    expect(getAgentCapabilityLabelKey('habits.bulk.write')).toBe(
      'chat.pendingOp.capability.habits-bulk-write',
    )
    expect(getAgentCapabilityLabelKey('habits.delete')).toBe(
      'chat.pendingOp.capability.habits-delete',
    )
    expect(getAgentCapabilityLabelKey('user-facts.delete')).toBe(
      'chat.pendingOp.capability.user-facts-delete',
    )
    expect(getAgentCapabilityLabelKey('account.manage')).toBe(
      'chat.pendingOp.capability.account-manage',
    )
  })

  it('returns null for capabilities without a localized label', () => {
    expect(getAgentCapabilityLabelKey('habits.read')).toBeNull()
    expect(getAgentCapabilityLabelKey('unknown.capability')).toBeNull()
  })
})

describe('getAgentPolicyReasonKey', () => {
  it('maps known policy reasons to friendly-copy keys', () => {
    expect(getAgentPolicyReasonKey('confirmation_required')).toBe(
      'chat.pendingOp.errors.confirmation_required',
    )
    expect(getAgentPolicyReasonKey('step_up_required')).toBe(
      'chat.pendingOp.errors.step_up_required',
    )
  })

  it('returns null for unknown, empty, or missing reasons so raw codes never render', () => {
    expect(getAgentPolicyReasonKey('missing_scope:delete_habits')).toBeNull()
    expect(getAgentPolicyReasonKey('')).toBeNull()
    expect(getAgentPolicyReasonKey(null)).toBeNull()
    expect(getAgentPolicyReasonKey(undefined)).toBeNull()
  })
})

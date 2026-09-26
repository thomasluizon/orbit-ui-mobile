import { z } from 'zod'

const agentRiskClassSchema = z.enum(['Low', 'Destructive', 'High'])

const agentConfirmationRequirementSchema = z.enum([
  'None',
  'FreshConfirmation',
  'StepUp',
])

const agentOperationStatusSchema = z.enum([
  'Succeeded',
  'Failed',
  'PendingConfirmation',
  'Denied',
  'UnsupportedByPolicy',
])

export const agentCapabilitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  domain: z.string(),
  scope: z.string(),
  riskClass: agentRiskClassSchema,
  isMutation: z.boolean(),
  isPhaseOneReadOnly: z.boolean(),
  confirmationRequirement: agentConfirmationRequirementSchema,
  planRequirement: z.string().nullable().optional(),
  featureFlagKeys: z.array(z.string()).nullable().optional(),
  chatToolNames: z.array(z.string()).nullable().optional(),
  mcpToolNames: z.array(z.string()).nullable().optional(),
  controllerActionKeys: z.array(z.string()).nullable().optional(),
})
export type AgentCapability = z.infer<typeof agentCapabilitySchema>

export const appSurfaceSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  howToSteps: z.array(z.string()),
  notes: z.array(z.string()),
  relatedCapabilityIds: z.array(z.string()),
  relatedControllerActionKeys: z.array(z.string()),
})
export type AppSurface = z.infer<typeof appSurfaceSchema>

const userDataFieldDescriptorSchema = z.object({
  name: z.string(),
  meaning: z.string(),
  aiReadable: z.boolean(),
  aiMutableInPhaseOne: z.boolean(),
})

export const userDataCatalogEntrySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  sensitivity: z.string(),
  retentionNotes: z.string(),
  aiReadable: z.boolean(),
  aiMutableInPhaseOne: z.boolean(),
  fields: z.array(userDataFieldDescriptorSchema),
})
export type UserDataCatalogEntry = z.infer<typeof userDataCatalogEntrySchema>

export const pendingOperationChangeSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  valueType: z.string(),
})

export const pendingOperationItemSchema = z.object({
  itemId: z.string(),
  entityId: z.string().nullable(),
  entityName: z.string(),
  fields: z.array(pendingOperationChangeSchema),
  stateFingerprint: z.string(),
})
export type PendingOperationItem = z.infer<typeof pendingOperationItemSchema>

export const pendingOperationChangePreviewSchema = z.object({
  changes: z.array(pendingOperationChangeSchema),
  changeTargetCount: z.number(),
  items: z.array(pendingOperationItemSchema).nullable().optional(),
  previewFingerprint: z.string().nullable().optional(),
})

export const revisedPendingOperationItemSchema = z.object({
  itemId: z.string(),
  edits: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type RevisedPendingOperationItem = z.infer<typeof revisedPendingOperationItemSchema>

export const revisePendingOperationRequestSchema = z.object({
  previewFingerprint: z.string(),
  items: z.array(revisedPendingOperationItemSchema),
})
export type RevisePendingOperationRequest = z.infer<typeof revisePendingOperationRequestSchema>

export const pendingOperationRevisionResultSchema = z.object({
  isSuccess: z.boolean(),
  error: z.string().nullable(),
  pendingOperationId: z.string().nullable(),
  preview: pendingOperationChangePreviewSchema.nullable(),
  cancelled: z.boolean(),
})
export type PendingOperationRevisionResult = z.infer<typeof pendingOperationRevisionResultSchema>

export const pendingAgentOperationSchema = z.object({
  id: z.string(),
  capabilityId: z.string(),
  displayName: z.string(),
  summary: z.string(),
  riskClass: agentRiskClassSchema,
  confirmationRequirement: agentConfirmationRequirementSchema,
  expiresAtUtc: z.string(),
  changes: z.array(pendingOperationChangeSchema).nullable().optional(),
  changeTargetCount: z.number().nullable().optional(),
  items: z.array(pendingOperationItemSchema).nullable().optional(),
  previewFingerprint: z.string().nullable().optional(),
})
export type PendingAgentOperation = z.infer<typeof pendingAgentOperationSchema>

export const pendingAgentOperationConfirmationSchema = z.object({
  pendingOperationId: z.string(),
  confirmationToken: z.string(),
  expiresAtUtc: z.string(),
})
export type PendingAgentOperationConfirmation = z.infer<
  typeof pendingAgentOperationConfirmationSchema
>

export const agentStepUpChallengeSchema = z.object({
  challengeId: z.string(),
  pendingOperationId: z.string(),
  expiresAtUtc: z.string(),
})
export type AgentStepUpChallenge = z.infer<typeof agentStepUpChallengeSchema>

export const agentPolicyDenialSchema = z.object({
  operationId: z.string(),
  sourceName: z.string(),
  riskClass: agentRiskClassSchema,
  confirmationRequirement: agentConfirmationRequirementSchema,
  reason: z.string(),
  pendingOperationId: z.string().nullable().optional(),
})
export type AgentPolicyDenial = z.infer<typeof agentPolicyDenialSchema>

export const agentOperationResultSchema = z.object({
  operationId: z.string(),
  sourceName: z.string(),
  riskClass: agentRiskClassSchema,
  confirmationRequirement: agentConfirmationRequirementSchema,
  status: agentOperationStatusSchema,
  summary: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetName: z.string().nullable().optional(),
  policyReason: z.string().nullable().optional(),
  pendingOperationId: z.string().nullable().optional(),
  payload: z.unknown().nullable().optional(),
})
export type AgentOperationResult = z.infer<typeof agentOperationResultSchema>

export const agentExecuteOperationResponseSchema = z.object({
  operation: agentOperationResultSchema,
  pendingOperation: pendingAgentOperationSchema.nullable().optional(),
  policyDenial: agentPolicyDenialSchema.nullable().optional(),
})
export type AgentExecuteOperationResponse = z.infer<typeof agentExecuteOperationResponseSchema>

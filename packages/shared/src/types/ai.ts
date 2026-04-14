import { z } from 'zod'

export const agentRiskClassSchema = z.enum(['Low', 'Destructive', 'High'])
export type AgentRiskClass = z.infer<typeof agentRiskClassSchema>

export const agentConfirmationRequirementSchema = z.enum([
  'None',
  'FreshConfirmation',
  'StepUp',
])
export type AgentConfirmationRequirement = z.infer<typeof agentConfirmationRequirementSchema>

export const agentOperationStatusSchema = z.enum([
  'Succeeded',
  'Failed',
  'PendingConfirmation',
  'Denied',
  'UnsupportedByPolicy',
])
export type AgentOperationStatus = z.infer<typeof agentOperationStatusSchema>

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

export const agentOperationSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  capabilityId: z.string(),
  riskClass: agentRiskClassSchema,
  confirmationRequirement: agentConfirmationRequirementSchema,
  isMutation: z.boolean(),
  isAgentExecutable: z.boolean(),
  requestSchema: z.unknown(),
  responseSchema: z.unknown(),
})
export type AgentOperation = z.infer<typeof agentOperationSchema>

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

export const userDataFieldDescriptorSchema = z.object({
  name: z.string(),
  meaning: z.string(),
  aiReadable: z.boolean(),
  aiMutableInPhaseOne: z.boolean(),
})
export type UserDataFieldDescriptor = z.infer<typeof userDataFieldDescriptorSchema>

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

export const pendingAgentOperationSchema = z.object({
  id: z.string(),
  capabilityId: z.string(),
  displayName: z.string(),
  summary: z.string(),
  riskClass: agentRiskClassSchema,
  confirmationRequirement: agentConfirmationRequirementSchema,
  expiresAtUtc: z.string(),
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

export const agentClientContextSchema = z.object({
  platform: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  timeFormat: z.string().nullable().optional(),
  currentAppArea: z.string().nullable().optional(),
  showGeneralOnToday: z.boolean().nullable().optional(),
})
export type AgentClientContext = z.infer<typeof agentClientContextSchema>

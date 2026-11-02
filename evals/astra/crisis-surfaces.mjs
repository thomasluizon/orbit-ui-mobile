import { tsImport } from 'tsx/esm/api'

const { getChatMessageParts } = await tsImport('../../packages/shared/src/chat/final-message.ts', import.meta.url)

export function hasCrisisSurfaces(response) {
  if (['parts', 'actions', 'operations', 'pendingOperations', 'policyDenials', 'relatedSurfaces', 'followUps', 'followUpContext']
    .some((field) => response[field] != null && (!Array.isArray(response[field]) || response[field].length > 0))) return true
  const legacy = getChatMessageParts({ ...response, parts: undefined, content: '' })
  return legacy.some((part) => part.type === 'block')
}

// Cross-platform parity nudge — stateful across a session. The pure parts live
// here (classify a file to its workspace; derive the nudge from the running
// counts); the adapter owns the session-state file. Both the Claude Code
// PostToolUse hook and the opencode tool.execute.after plugin call these.

export const NUDGE_THRESHOLD = 3

export function classifyScope(filePath) {
  const n = String(filePath || "").replace(/\\/g, "/")
  if (/\/apps\/web\//.test(n)) return "web"
  if (/\/apps\/mobile\//.test(n)) return "mobile"
  if (/\/packages\/shared\//.test(n)) return "shared"
  if (/\/orbit-api\/src\//.test(n)) return "api"
  return null
}

export function parityMessages(state) {
  const s = { web: 0, mobile: 0, shared: 0, api: 0, ...state }
  const messages = []
  if (s.web >= NUDGE_THRESHOLD && s.mobile === 0) {
    messages.push(`${s.web} edits to apps/web/ with zero edits to apps/mobile/. Parity is mandatory — apply the matching change in apps/mobile/, or invoke the parity-checker subagent.`)
  }
  if (s.mobile >= NUDGE_THRESHOLD && s.web === 0) {
    messages.push(`${s.mobile} edits to apps/mobile/ with zero edits to apps/web/. Parity is mandatory — apply the matching change in apps/web/, or invoke the parity-checker subagent.`)
  }
  if (s.api >= NUDGE_THRESHOLD && s.shared === 0 && s.web === 0 && s.mobile === 0) {
    messages.push(`${s.api} edits to orbit-api/ with no client-side changes. If the contract changed, update packages/shared/src/api/endpoints.ts and the consumer hooks. Invoke contract-aligner to verify.`)
  }
  return messages
}

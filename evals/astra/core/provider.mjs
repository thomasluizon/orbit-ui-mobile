import { runCase } from './conversation.mjs'

// promptfoo provider of the core set. An attempt without a gradable answer returns its reason as the provider error, so
// no grader call is spent on it; the output still tells the report whether the attempt gave no evidence.
export default class OrbitChatStreamProvider {
  id() { return 'orbit-chat-stream' }

  async callApi(_prompt, context) {
    const vars = context.vars
    const output = vars.preconditionFailure
      ? { unavailable: true, error: `Precondition unavailable: ${vars.preconditionFailure}` }
      : await runCase(vars)
    return output.error ? { error: output.error, output } : { output }
  }
}

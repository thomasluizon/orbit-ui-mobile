
import { orcaEnv, check, VALID_ISSUE } from "./_harness.mjs"

const newTicketStub = (created, issue, options = {}) => [
  { match: "linear create", stdout: options.createExit ? "" : JSON.stringify(created), exit: options.createExit ?? 0 },
  { match: "linear issue", stdout: JSON.stringify({ ok: true, result: { issue, relations: [] } }) },
]

const CREATED_OK = { ok: true, result: { issue: { identifier: "ORB-99" } } }

export const cases = () => {
    const argv = ["--title", "Cover the create and validate round trip", "--project", "Backlog"]
    check("new-ticket.mjs", "validates the identifier orca reported", argv, { status: 0, stdout: /ticket ok/ }, { env: orcaEnv(newTicketStub(CREATED_OK, VALID_ISSUE)) })
    check(
      "new-ticket.mjs",
      "a created but defective ticket exits 1 naming it",
      argv,
      { status: 1, stderr: /ORB-99 was CREATED but is DEFECTIVE/ },
      { env: orcaEnv(newTicketStub(CREATED_OK, { ...VALID_ISSUE, description: "nothing" })) },
    )
    check(
      "new-ticket.mjs",
      "an orca failure creates nothing and exits 3",
      argv,
      { status: 3, stderr: /orca linear create failed/ },
      { env: orcaEnv(newTicketStub(null, VALID_ISSUE, { createExit: 1 })) },
    )
    check(
      "new-ticket.mjs",
      "success with no identifier is a tool error, never a silent pass",
      argv,
      { status: 3, stderr: /no issue identifier/ },
      { env: orcaEnv(newTicketStub({ ok: true, result: {} }, VALID_ISSUE)) },
    )
    check("new-ticket.mjs", "requires --project so the ticket cannot be orphaned", ["--title", "Cover the create and validate round trip"], { status: 2, stderr: /--project is required/ })
  }

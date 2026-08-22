import { existsSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "board-view.mjs"

const page = (nodes, hasNextPage = false, endCursor = "MQ") => JSON.stringify({
  data: { user: { projectV2: { id: "PVT_board", views: { pageInfo: { hasNextPage, endCursor }, nodes } } } },
})

const views = (filter = "") => page([
  { id: "PVTV_board", name: "Board", number: 1, layout: "BOARD_LAYOUT", filter: "" },
  { id: "PVTV_orca", name: "Orca", number: 2, layout: "TABLE_LAYOUT", filter },
])

const written = (filter) => JSON.stringify({
  data: { updateProjectV2View: { projectV2View: { id: "PVTV_orca", name: "Orca", number: 2, layout: "TABLE_LAYOUT", filter } } },
})

const readEntry = (filter = "") => ({ match: "api graphql -F o=thomasluizon -F n=2", stdout: views(filter), ignoreTicketShape: true })

export const cases = () => {
  check(TOOL, "refuses a call with neither list nor view", [], { status: 2, stderr: /--view is required/ })
  check(TOOL, "refuses --view without --filter", ["--view", "Orca"], { status: 2, stderr: /--filter is required/ })
  check(TOOL, "refuses --list combined with --view", ["--list", "--view", "Orca", "--filter", "x"], { status: 2, stderr: /--list takes no other option/ })
  check(TOOL, "refuses an unknown option", ["--orbit-not-a-flag"], { status: 2, stderr: /unknown option/ })

  check(TOOL, "lists every saved view with its filter", ["--list"], { status: 0, stdout: /"name": "Orca"/ }, { env: orcaEnv([readEntry()]) })

  /**
   * A typo must fail before the write. A mutation against a wrong view id would silently reshape a
   * different view, and the error names the views that do exist so the caller can correct it.
   */
  const notWritten = stage("board-view/unknown-view", "must remain")
  check(
    TOOL,
    "refuses a view name the board does not have, before any write",
    ["--view", "Orka", "--filter", "is:open"],
    { status: 1, stderr: /no view named "Orka"/ },
    { env: orcaEnv([readEntry(), { match: "api graphql -f v=", stdout: written("is:open"), ignoreTicketShape: true, removePath: notWritten }]) },
  )
  T(`${TOOL}: no mutation ran for an unknown view`, existsSync(notWritten))

  const filterWrite = stage("board-view/filter-write", "pending")
  check(
    TOOL,
    "writes the filter and reports it back from the response",
    ["--view", "Orca", "--filter", "is:open"],
    { status: 0, stdout: /"changed": true/ },
    { env: orcaEnv([readEntry(), { match: "api graphql -f v=PVTV_orca", stdout: written("is:open"), ignoreTicketShape: true, removePath: filterWrite }]) },
  )
  T(`${TOOL}: the filter write reached the board`, !existsSync(filterWrite))

  /** Already correct is a no-op, so re-running over a board writes nothing twice. */
  const settled = stage("board-view/settled", "must remain")
  check(
    TOOL,
    "writes nothing when the filter already matches",
    ["--view", "Orca", "--filter", "is:open"],
    { status: 0, stdout: /"changed": false/ },
    { env: orcaEnv([readEntry("is:open"), { match: "api graphql -f v=", stdout: written("is:open"), ignoreTicketShape: true, removePath: settled }]) },
  )
  T(`${TOOL}: a settled filter never reached the mutation`, existsSync(settled))

  /**
   * views is a paginated connection. Reading only the first page would make a view on a later page
   * look like it does not exist, which is the one answer that must never be wrong before a write
   * (Pullfrog, PR #743).
   */
  const firstPage = page([{ id: "PVTV_board", name: "Board", number: 1, layout: "BOARD_LAYOUT", filter: "" }], true, "CURSOR1")
  const secondPage = page([{ id: "PVTV_late", name: "Late", number: 9, layout: "TABLE_LAYOUT", filter: "" }])
  const paged = [
    { match: "api graphql -F o=thomasluizon -F n=2 -f query=", stdout: firstPage, ignoreTicketShape: true },
    { match: "api graphql -F o=thomasluizon -F n=2 -F c=CURSOR1", stdout: secondPage, ignoreTicketShape: true },
  ]
  check(TOOL, "walks every page of the views connection", ["--list"], { status: 0, stdout: /"name": "Late"/ }, { env: orcaEnv(paged) })

  const lateWrite = stage("board-view/late-page-write", "pending")
  check(
    TOOL,
    "finds a view that only exists on a later page",
    ["--view", "Late", "--filter", "is:open"],
    { status: 0, stdout: /"changed": true/ },
    {
      env: orcaEnv([
        ...paged,
        { match: "api graphql -f v=PVTV_late", stdout: JSON.stringify({ data: { updateProjectV2View: { projectV2View: { id: "PVTV_late", name: "Late", number: 9, layout: "TABLE_LAYOUT", filter: "is:open" } } } }), ignoreTicketShape: true, removePath: lateWrite },
      ]),
    },
  )
  T(`${TOOL}: the later-page view was written`, !existsSync(lateWrite))

  /**
   * GitHub does not make a view name unique and the mutation targets an id, so picking the first of
   * two would silently reshape whichever came back first (Pullfrog, PR #743).
   */
  const ambiguous = stage("board-view/ambiguous", "must remain")
  const twins = page([
    { id: "PVTV_one", name: "Orca", number: 2, layout: "TABLE_LAYOUT", filter: "" },
    { id: "PVTV_two", name: "Orca", number: 5, layout: "TABLE_LAYOUT", filter: "" },
  ])
  check(
    TOOL,
    "refuses a name two views share rather than picking one",
    ["--view", "Orca", "--filter", "is:open"],
    { status: 1, stderr: /2 views named "Orca" \(numbers 2, 5\)/ },
    {
      env: orcaEnv([
        { match: "api graphql -F o=thomasluizon -F n=2 -f query=", stdout: twins, ignoreTicketShape: true },
        { match: "api graphql -f v=", stdout: written("is:open"), ignoreTicketShape: true, removePath: ambiguous },
      ]),
    },
  )
  T(`${TOOL}: an ambiguous name ran no mutation`, existsSync(ambiguous))
}

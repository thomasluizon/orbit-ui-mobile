/**
 * The one place that answers "is this TUI mid-turn?", for every tool that has to know.
 *
 * `orca terminal wait --for tui-idle` is NOT a busy signal for every engine. Measured
 * 2026-07-27 against a live codex worker mid-turn: the wait returned satisfied: true while
 * the TUI was painting `Working (30s - esc to interupt)`. The terminal TEXT cannot correct
 * it either, because a read keeps stale output: an IDLE codex composer still carried the
 * `Starting MCP servers ... esc to interrupt` line from its own startup, so matching the
 * interrupt hint refuses forever. Repaint activity separates them cleanly, and for BOTH
 * engines: a running turn repaints its spinner continuously while an idle TUI emits nothing
 * at all. Measured lastOutputAt advancing 2.4s to 3.7s per sample window on a busy codex and
 * on a busy claude, and frozen at delta 0 on an idle one of each.
 *
 * PR #614 landed that measurement as two identical copies, one in launch-worker.mjs and one
 * in nudge-worker.mjs, and worker-watch.mjs would have been the third. Two copies of an
 * invariant drift apart silently; this module is the third-use extraction (CLAUDE.md rule 6).
 * It takes the caller's own `orca` runner rather than shelling out itself, because each tool
 * already owns how an orca failure ends its process, and a helper that exits is a helper that
 * cannot be reused.
 *
 * Not a tool: it has no CLI and is never invoked directly, so it carries no `--help` and no
 * `test-tools.mjs` coverage row of its own. It is exercised through the three tools that
 * import it.
 */

/** One sample window. Long enough that a spinner frame lands inside it, short enough to poll with. */
export const REPAINT_SAMPLE_MS = 3000

/** A satisfied-but-repainting wait returns instantly, so a retry needs its own pause or the
 * caller's allowed attempts burn in seconds while the engine is merely still starting up. */
export const SETTLE_MS = 10000

export const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * True while `handle` is painting, which for a TUI worker means mid-turn. Two `terminal show`
 * samples one window apart; `orca` is the caller's runner, which must return the parsed
 * `result` payload.
 */
export const isRepainting = (orca, handle, sampleMs = REPAINT_SAMPLE_MS) => {
  const paintedAt = () => orca(["terminal", "show", "--terminal", handle]).terminal?.lastOutputAt ?? 0
  const before = paintedAt()
  pause(sampleMs)
  return paintedAt() !== before
}

/**
 * The same delta across EVERY live terminal in one pair of calls, for a watcher that would
 * otherwise pay two `terminal show` round trips per worker. `terminal list` carries
 * lastOutputAt per terminal, so one sample covers the whole fleet.
 */
export const sampleTerminals = (orca) =>
  new Map((orca(["terminal", "list"]).terminals ?? []).map((terminal) => [terminal.handle, terminal.lastOutputAt ?? 0]))

/**
 * BUSY when the handle painted between the two samples. A handle present only in the second
 * sample painted by definition (it did not exist for the first), so it is BUSY rather than
 * silently absent from the report.
 */
export const classifyTerminals = (before, after) =>
  new Map([...after].map(([handle, paintedAt]) => [handle, paintedAt !== (before.get(handle) ?? null) ? "BUSY" : "IDLE"]))

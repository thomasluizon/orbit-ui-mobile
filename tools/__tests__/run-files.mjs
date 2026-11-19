import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { directoryRunFiles, githubRunFiles, readRunJson, RunFileConflict, splitIncluded, updateRunJson } from "../lib/run-files.mjs"

import { T, root, same } from "./_harness.mjs"

const UNIT = "lib/run-files.mjs"

/**
 * A gh stand-in that answers from a response table keyed on the joined argv, logs each call with its stdin, and prints
 * what `gh api --include` prints: the HTTP status line, the headers, a blank line and the body on stdout, and on a failure
 * the exit code 1 with `gh: <message> (HTTP <status>)` on stderr (each recorded from the real gh 2.101.0 against GitHub).
 */
const fakeGh = (label, responses) => {
  const directory = join(root, "run-files", label)
  mkdirSync(directory, { recursive: true })
  const log = join(directory, "calls.log")
  const script = join(directory, "gh")
  writeFileSync(join(directory, "responses.json"), JSON.stringify(responses))
  writeFileSync(script, `#!/usr/bin/env node
const fs = require("node:fs")
const line = process.argv.slice(2).join(" ")
const input = line.includes("--input -") ? fs.readFileSync(0, "utf8") : ""
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ line, input }) + "\\n")
const responses = JSON.parse(fs.readFileSync(${JSON.stringify(join(directory, "responses.json"))}, "utf8"))
const answer = responses.find((entry) => line === entry.match)
if (!answer) { process.stderr.write("gh: unstubbed " + line + " (HTTP 599)\\n"); process.exit(1) }
const head = (code, reason) => "HTTP/2.0 " + code + " " + reason + "\\nContent-Type: application/json; charset=utf-8\\nServer: github.com\\n\\n"
if (answer.status) { process.stdout.write(head(answer.status, "Refused") + JSON.stringify({ message: answer.message, status: String(answer.status) })); process.stderr.write("gh: " + answer.message + " (HTTP " + answer.status + ")\\n"); process.exit(1) }
process.stdout.write(head(200, "OK") + JSON.stringify(answer.body))
`)
  chmodSync(script, 0o755)
  return { store: githubRunFiles({ repository: "owner/tickets", gh: script, environment: process.env }),
    calls: () => readFileSync(log, "utf8").trim().split("\n").map((entry) => JSON.parse(entry)) }
}

const location = "repos/owner/tickets/contents/run-state/intake.json"
const repositoryRead = { match: "api --include repos/owner/tickets", body: { full_name: "owner/tickets" } }
const write = `api --include -X PUT ${location} --input -`

export const cases = () => {
  const missing = fakeGh("missing", [{ match: `api --include ${location}`, status: 404, message: "This repository is empty." }, repositoryRead])
  same(`${UNIT}: a file the repository lacks reads as absent`, missing.store.read("run-state/intake.json"), { bytes: null, sha: null })

  const small = fakeGh("small", [{ match: `api --include ${location}`, body: { type: "file", encoding: "base64", sha: "a1", content: Buffer.from("{\"gmail\":{}}\n").toString("base64") } }])
  const read = small.store.read("run-state/intake.json")
  T(`${UNIT}: a file up to 1 MB reads from its base64 content and keeps its blob sha`, read.bytes.toString() === "{\"gmail\":{}}\n" && read.sha === "a1", JSON.stringify(read))

  const large = fakeGh("large", [
    { match: `api --include ${location}`, body: { type: "file", encoding: "none", sha: "b2", content: "" } },
    { match: "api --include repos/owner/tickets/git/blobs/b2", body: { sha: "b2", encoding: "base64", content: Buffer.from("[1]").toString("base64") } },
  ])
  T(`${UNIT}: a file over 1 MB reads through the blob API`, large.store.read("run-state/intake.json").bytes.toString() === "[1]")

  const written = fakeGh("write", [{ match: `api --include -X PUT ${location} --input -`, body: { content: { sha: "c3" }, commit: { sha: "d4" } } }])
  same(`${UNIT}: a write returns the new blob sha and commit`, written.store.write("run-state/intake.json", "{}\n", "a1", "intake: gmail"), { sha: "c3", commit: "d4" })
  const sent = JSON.parse(written.calls()[0].input)
  T(`${UNIT}: a write sends the message, the base64 content and the sha it read`, sent.message === "intake: gmail" && Buffer.from(sent.content, "base64").toString() === "{}\n" && sent.sha === "a1", JSON.stringify(sent))
  written.store.write("run-state/intake.json", "{}\n", null, "intake: first")
  T(`${UNIT}: the first write of a file sends no sha`, !("sha" in JSON.parse(written.calls()[1].input)))

  const gone = fakeGh("gone", [{ match: `api --include ${location}`, status: 404, message: "Not Found" }, repositoryRead])
  same(`${UNIT}: a file that a repository with commits lacks reads as absent`, gone.store.read("run-state/intake.json"), { bytes: null, sha: null })
  T(`${UNIT}: a missing file costs one more read, of the repository itself`, gone.calls().map((call) => call.line).join("|") === `api --include ${location}|api --include repos/owner/tickets`, JSON.stringify(gone.calls()))

  // The contents API answers a path the repository lacks and a repository the account cannot see with the same 404.
  const hidden = fakeGh("hidden", [{ match: `api --include ${location}`, status: 404, message: "Not Found" }, { match: "api --include repos/owner/tickets", status: 404, message: "Not Found" }])
  let unreadable
  try { hidden.store.read("run-state/intake.json") } catch (caught) { unreadable = caught.message }
  T(`${UNIT}: a 404 for a repository the account cannot read is an error, never an absent file`, /owner\/tickets is not readable \(HTTP 404\)/.test(unreadable ?? ""), String(unreadable))

  // Each status and message below is a recorded response of the contents API (thomasluizon/orbit-tickets#2152).
  const current = (sha) => ({ match: `api --include ${location}`, body: { type: "file", encoding: "base64", sha, content: "" } })
  for (const [label, status, message, written, found] of [
    ["a stale sha", 409, "run-state/intake.json does not match a1", "a1", current("z9")],
    ["a stale sha, answered by 422 in other words", 422, "Invalid request.", "a1", current("z9")],
    ["no sha for a file that exists", 422, "Invalid request.\n\n\"sha\" wasn't supplied.", null, current("z9")],
    ["no sha for a file that exists, in other words", 422, "Invalid request.", null, current("z9")]]) {
    const stale = fakeGh(`stale-${status}-${label.length}`, [{ match: write, status, message }, found])
    let error
    try { stale.store.write("run-state/intake.json", "{}\n", written, "intake") } catch (caught) { error = caught }
    T(`${UNIT}: a write refused for ${label} (HTTP ${status}) is a conflict to retry`, error instanceof RunFileConflict, String(error))
  }
  for (const [label, status, message] of [["no commit message", 422, "Invalid request.\n\n\"message\" wasn't supplied."],
    ["content that is not base64", 422, "content is not valid Base64"], ["no access", 403, "Resource not accessible"]]) {
    const broken = fakeGh(`broken-${label.replaceAll(" ", "-")}`, [{ match: write, status, message }, current("a1")])
    let denied
    try { broken.store.write("run-state/intake.json", "{}\n", "a1", "intake") } catch (caught) { denied = caught }
    T(`${UNIT}: a write refused for ${label} (HTTP ${status}) is an error, never a retry`, denied && !(denied instanceof RunFileConflict) && denied.message.includes(message), String(denied))
  }
  const invalid = fakeGh("invalid-update", [{ match: `api --include ${location}`, status: 404, message: "Not Found" },
    { match: write, status: 422, message: "content is not valid Base64" }, repositoryRead])
  let stopped
  try { updateRunJson("run-state/intake.json", () => ({}), "intake", invalid.store) } catch (error) { stopped = error.message }
  T(`${UNIT}: an update with an invalid request stops at the first write and reports the refusal`, /content is not valid Base64/.test(stopped ?? "") &&
    invalid.calls().filter((call) => call.line.includes("-X PUT")).length === 1, `${stopped} after ${invalid.calls().length} calls`)

  // The shape of a recorded `gh api --include` answer: status line, headers, a blank line, the body.
  same(`${UNIT}: an included answer splits into its status and its body`, splitIncluded("HTTP/2.0 404 Not Found\nServer: github.com\n\n{\"message\":\"Not Found\"}"), { status: 404, body: "{\"message\":\"Not Found\"}" })
  same(`${UNIT}: a CRLF answer splits the same way`, splitIncluded("HTTP/1.1 200 OK\r\nEtag: x\r\n\r\n{}"), { status: 200, body: "{}" })
  same(`${UNIT}: a body that holds a blank line stays whole`, splitIncluded("HTTP/2.0 200 OK\nA: b\n\n{\"a\":\"x\\n\\ny\"}\n\n"), { status: 200, body: "{\"a\":\"x\\n\\ny\"}\n\n" })
  same(`${UNIT}: an answer without a status line has status 0 and keeps its text`, splitIncluded("gh: could not connect"), { status: 0, body: "gh: could not connect" })

  for (const path of ["../secret", "/etc/passwd", "run-state/../x", "run state.json", ""]) {
    let refused = false
    try { directoryRunFiles(join(root, "run-files", "paths")).read(path) } catch { refused = true }
    T(`${UNIT}: the path ${JSON.stringify(path)} is refused`, refused)
  }

  const store = directoryRunFiles(join(root, "run-files", "directory"))
  same(`${UNIT}: an absent JSON file reads as null`, readRunJson("run-state/intake.json", store), { value: null, sha: null })
  same(`${UNIT}: the first update writes the file`, updateRunJson("run-state/intake.json", (value) => ({ ...value, gmail: { highWater: "m1" } }), "intake", store), { gmail: { highWater: "m1" } })
  let racer = 0
  const raced = updateRunJson("run-state/intake.json", (value) => {
    // Another writer replaces the file between this read and this write, twice.
    if (racer++ < 2) store.write("run-state/intake.json", JSON.stringify({ ...value, play: { round: racer } }), readRunJson("run-state/intake.json", store).sha)
    return { ...value, gmail: { highWater: "m2" } }
  }, "intake", store)
  T(`${UNIT}: an update that loses the race reads again and keeps the other writer's change`, raced.gmail.highWater === "m2" && raced.play.round === 2 && racer === 3, JSON.stringify(raced))
  same(`${UNIT}: an update that returns undefined writes nothing`, updateRunJson("run-state/intake.json", () => undefined, "intake", store), raced)
  const counted = { ...store, write: (...parameters) => { counted.writes++; return store.write(...parameters) }, writes: 0 }
  same(`${UNIT}: an update that returns the value it read returns it`, updateRunJson("run-state/intake.json", (value) => structuredClone(value), "intake", counted), raced)
  T(`${UNIT}: an update that returns the value it read sends no write`, counted.writes === 0, String(counted.writes))
  updateRunJson("run-state/intake.json", (value) => ({ ...value, gmail: { highWater: "m3" } }), "intake", counted)
  T(`${UNIT}: an update that changes the value sends one write`, counted.writes === 1, String(counted.writes))
  let endless
  try { updateRunJson("run-state/intake.json", (value) => { store.write("run-state/intake.json", JSON.stringify({ ...value, n: Math.random() }), readRunJson("run-state/intake.json", store).sha); return { ...value, gmail: { highWater: "m4" } } }, "intake", store) } catch (error) { endless = error.message }
  T(`${UNIT}: an update stops after five lost races`, /kept changing: 5 writes lost the race/.test(endless ?? ""), endless)
}

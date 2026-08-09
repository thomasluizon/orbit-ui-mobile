import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "create-milestone.mjs"

export const cases = async () => {
  check(TOOL, "requires a title and description file", ["--title", "New body"], { status: 2, stderr: /usage: create-milestone\.mjs/ })
  const description = stage("create-milestone/description.md", "Locked decisions\n")

  const duplicateMarker = stage("create-milestone/duplicate-write", "pending")
  check(
    TOOL,
    "refuses an existing exact milestone title before writing",
    ["--title", "Launch", "--description-file", description],
    { status: 1, stderr: /Milestone "Launch" already exists/ },
    { env: orcaEnv([
      { match: "api repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100", stdout: "Launch\n" },
      { match: "api repos/thomasluizon/orbit-tickets/milestones --method POST", stdout: "", removePath: duplicateMarker },
    ]) },
  )
  T(`${TOOL}: the duplicate-title refusal wrote nothing`, existsSync(duplicateMarker))

  const writeMarker = stage("create-milestone/create-write", "pending")
  const inputCapture = stage("create-milestone/create-input", "")
  check(
    TOOL,
    "creates one new explicitly named milestone",
    ["--title", "New body", "--description-file", description],
    { status: 0, stdout: /"title": "New body"/ },
    { env: orcaEnv([
      { match: "api repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100", stdout: "Launch\n" },
      { match: "api repos/thomasluizon/orbit-tickets/milestones --method POST --input -", stdout: "", removePath: writeMarker, stdinFile: inputCapture },
    ]) },
  )
  T(
    `${TOOL}: the milestone write used a JSON stdin body with the approved fields`,
    !existsSync(writeMarker) && readFileSync(inputCapture, "utf8") === JSON.stringify({ title: "New body", description: "Locked decisions\n" }),
    readFileSync(inputCapture, "utf8"),
  )
}

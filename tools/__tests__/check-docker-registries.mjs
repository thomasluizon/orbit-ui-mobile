import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, root } from "./_harness.mjs"

const stageRepository = (label, files, untracked = {}) => {
  const repository = join(root, "docker-registries", label)
  mkdirSync(repository, { recursive: true })
  const initialized = spawnSync("git", ["init", "-q"], { cwd: repository })
  T(`docker registry fixture ${label} initializes`, initialized.status === 0)
  for (const [filename, contents] of Object.entries({ ...files, ...untracked })) {
    mkdirSync(dirname(join(repository, filename)), { recursive: true })
    writeFileSync(join(repository, filename), contents)
  }
  if (Object.keys(files).length > 0) {
    const staged = spawnSync("git", ["--literal-pathspecs", "add", ...Object.keys(files)], { cwd: repository })
    T(`docker registry fixture ${label} tracks named paths`, staged.status === 0)
  }
  return repository
}

const checkSources = (label, contents, expectation) => {
  const repository = stageRepository(label, { Dockerfile: contents })
  check("check-docker-registries.mjs", label, ["--root", repository], expectation, { cwd: root })
}

export const cases = () => {
  checkSources("rejects implicit official image", "FROM node:22-bookworm-slim\n", { status: 1, stderr: /Dockerfile:1: FROM node:22-bookworm-slim/ })
  checkSources("rejects implicit organization image", "FROM moby/buildkit:buildx-stable-1\n", { status: 1, stderr: /moby\/buildkit/ })
  checkSources("checks every stage", "FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS builder\nRUN true\nFROM node:22-bookworm-slim AS runner\n", { status: 1, stderr: /Dockerfile:3: FROM node/ })
  checkSources("accepts hosts ports and local registries", "FROM public.ecr.aws/docker/library/node:22-bookworm-slim\nFROM registry.example:5000/app:tag\nFROM localhost/app:tag\n", { status: 0 })
  checkSources("allows scratch and earlier stages", "FROM scratch AS base\nFROM base AS runner\n", { status: 0 })
  checkSources("handles platform and instruction case", "  from --platform=$BUILDPLATFORM public.ecr.aws/docker/library/node:22-bookworm-slim as Build\nFROM BUILD\n", { status: 0 })
  checkSources("checks continued instructions across comments", "# FROM node:22-bookworm-slim\nFROM \\\n# platform image\n  node:22-bookworm-slim AS builder\n", { status: 1, stderr: /Dockerfile:2: FROM node/ })
  checkSources("checks alternate escape directive", "# escape=`\nFROM `\n  node:22-bookworm-slim\n", { status: 1, stderr: /Dockerfile:2: FROM node/ })
  checkSources("rejects unresolved image variables", "ARG IMAGE=node:22-bookworm-slim\nFROM ${IMAGE}\n", { status: 1, stderr: /explicit registry host/ })
  checkSources("does not treat a tag as a host", "FROM node:22-bookworm-slim\n", { status: 1 })

  const nested = stageRepository("tracked inventory", {
    "nested directory/Dockerfile.web": "FROM node:22-bookworm-slim\n",
    "images/test.Dockerfile": "FROM alpine:latest\n",
    "notes.md": "FROM node:22-bookworm-slim\n",
  }, { "untracked/Dockerfile": "FROM node:22-bookworm-slim\n" })
  const inventory = check("check-docker-registries.mjs", "checks tracked Dockerfile variants and reports every violation", ["--root", nested], {
    status: 1,
    stderr: /images\/test\.Dockerfile:1:[\s\S]*nested directory\/Dockerfile\.web:1:/,
  })
  T("docker registry inventory excludes untracked files and prose", !/untracked|notes\.md/.test(inventory.stderr))
  const empty = stageRepository("untracked only", {}, { Dockerfile: "FROM node:22-bookworm-slim\n" })
  check("check-docker-registries.mjs", "ignores untracked Dockerfiles", ["--root", empty], { status: 0, stdout: /Checked 0 tracked/ })
  check("check-docker-registries.mjs", "refuses a missing root", ["--root"], { status: 2 })
  check("check-docker-registries.mjs", "reports repository read failures", ["--root", join(root, "absent-repository")], { status: 2, stderr: /check-docker-registries/ })
}

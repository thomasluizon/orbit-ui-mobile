import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { root, LOCKSTEP_PATHS, lockstepFingerprint, lockstepFixture, lockstepDefaultApiFixture, check } from "./_harness.mjs"



export const cases = () => {
    const matching = lockstepFixture("matching")
    check("check-lockstep.mjs", "six matching pairs pass", ["--ui-root", matching.uiRoot, "--api-root", matching.apiRoot, "--manifest", matching.manifest], { status: 0, stdout: /HARNESS LOCKSTEP OK/ })

    const malformedManifest = lockstepFixture("malformed-manifest")
    writeFileSync(malformedManifest.manifest, JSON.stringify({ version: 1, files: {} }))
    check(
      "check-lockstep.mjs",
      "a malformed declaration manifest fails loudly",
      ["--ui-root", malformedManifest.uiRoot, "--api-root", malformedManifest.apiRoot, "--manifest", malformedManifest.manifest],
      { status: 1, stderr: /check-lockstep: unreadable comparison input: manifest must declare exactly the six lockstep paths/ },
    )

    const configuredDefault = lockstepFixture("default-configured")
    writeFileSync(join(configuredDefault.uiRoot, ".claude", "orchestrator.json"), JSON.stringify({ repos: { api: configuredDefault.apiRoot } }))
    check(
      "check-lockstep.mjs",
      "uses orchestrator repos.api when --api-root is omitted",
      ["--ui-root", configuredDefault.uiRoot, "--manifest", configuredDefault.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const missingConfiguredApi = lockstepDefaultApiFixture("default-missing-api")
    writeFileSync(join(missingConfiguredApi.uiRoot, ".claude", "orchestrator.json"), JSON.stringify({ repos: {} }))
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator repos.api is missing",
      ["--ui-root", missingConfiguredApi.uiRoot, "--manifest", missingConfiguredApi.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const malformedConfig = lockstepDefaultApiFixture("default-malformed-config")
    writeFileSync(join(malformedConfig.uiRoot, ".claude", "orchestrator.json"), "{not-json")
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator config is unparsable",
      ["--ui-root", malformedConfig.uiRoot, "--manifest", malformedConfig.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const absentConfig = lockstepDefaultApiFixture("default-no-config")
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator config is absent",
      ["--ui-root", absentConfig.uiRoot, "--manifest", absentConfig.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const divergent = lockstepFixture("divergent", "shared\nui-only\nshared-tail\n", "shared\napi-only\nshared-tail\n")
    check("check-lockstep.mjs", "an undeclared divergence fails with its file and region", ["--ui-root", divergent.uiRoot, "--api-root", divergent.apiRoot, "--manifest", divergent.manifest], { status: 1, stderr: /pr-review\/SKILL\.md: undeclared region/ })

    const staleFingerprint = lockstepFingerprint("old-ui-only", "old-api-only")
    const staleDeclaration = [{ id: "obsolete-platform-wording", justification: "The old repository wording was intentionally different.", fingerprints: [staleFingerprint] }]
    const stale = lockstepFixture("stale-declaration", "shared\ncurrent-ui\nshared-tail\n", "shared\ncurrent-api\nshared-tail\n", staleDeclaration)
    check(
      "check-lockstep.mjs",
      "a declaration that matches no current diff is stale",
      ["--ui-root", stale.uiRoot, "--api-root", stale.apiRoot, "--manifest", stale.manifest],
      { status: 1, stderr: new RegExp(`stale declaration obsolete-platform-wording \\(${staleFingerprint}\\); remove it or update the justified region`) },
    )

    const declaration = [{ id: "platform-wording", justification: "The repository names its own platform.", fingerprints: [lockstepFingerprint("ui-only", "api-only")] }]
    const declared = lockstepFixture("declared", "shared\nui-only\nshared-tail\n", "shared\napi-only\nshared-tail\n", declaration)
    check("check-lockstep.mjs", "a justified declared divergence passes", ["--ui-root", declared.uiRoot, "--api-root", declared.apiRoot, "--manifest", declared.manifest], { status: 0 })
    writeFileSync(join(declared.uiRoot, LOCKSTEP_PATHS[0]), "changed-shared\nui-only\nshared-tail\n")
    check("check-lockstep.mjs", "a change in the shared region still fails", ["--ui-root", declared.uiRoot, "--api-root", declared.apiRoot, "--manifest", declared.manifest], { status: 1, stderr: /undeclared region/ })

    const byteExact = lockstepFixture("byte-exact")
    writeFileSync(join(byteExact.uiRoot, LOCKSTEP_PATHS.at(-1)), "shared!\n")
    check("check-lockstep.mjs", "second-opinion drift fails byte for byte", ["--ui-root", byteExact.uiRoot, "--api-root", byteExact.apiRoot, "--manifest", byteExact.manifest], { status: 1, stderr: /second-opinion\/second-opinion\.mjs: whole file differs/ })

    check("check-lockstep.mjs", "an unreachable sibling fails loudly", ["--ui-root", matching.uiRoot, "--api-root", join(root, "missing-api"), "--manifest", matching.manifest], { status: 1, stderr: /unreadable comparison input/ })
  }

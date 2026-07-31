import { dirname, join } from "node:path"

import { root, stage, check } from "./_harness.mjs"



export const cases = () => {
    check("check-frontmatter.mjs", "runs from any cwd", [], { status: 0, stdout: /frontmatter ok/ }, { cwd: root })
    stage("frontmatter-valid/SKILL.md", "---\nname: valid\ndescription: A parseable skill.\n---\n")
    check("check-frontmatter.mjs", "accepts a custom root relative to the caller", ["--root", "frontmatter-valid"], { status: 0, stdout: /frontmatter ok: 1/ }, { cwd: root })
    const malformedRoot = dirname(stage("frontmatter-malformed/SKILL.md", "---\nname: malformed\ndescription: This breaks: the description will not parse.\n---\n"))
    check("check-frontmatter.mjs", "rejects an unquoted colon-space scalar in a custom root", ["--root", malformedRoot], { status: 1, stderr: /SKILL\.md  \[description\]/ })
    check("check-frontmatter.mjs", "rejects a missing custom root", ["--root", join(root, "frontmatter-missing")], { status: 2, stderr: /root does not exist/ })
    const noFrontmatterRoot = dirname(stage("frontmatter-absent/README.md", "# No frontmatter\n"))
    check("check-frontmatter.mjs", "rejects a custom root that proves nothing", ["--root", noFrontmatterRoot], { status: 1, stderr: /No frontmatter found/ })
  }

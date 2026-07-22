// Tamper guard for the visual completion gate's own state. The gate derives
// "done" from a handful of files; an agent that can rewrite them can fake "done"
// without doing the work, which is the exact failure this gate exists to stop
// (.claude/rules/visual-delivery.md). Protected:
//   .claude/manifests/PAUSED         - human-only disarm switch (any touch blocks)
//   .claude/manifests/surfaces.json  - the denominator; regenerate ONLY via
//                                      tools/surface-manifest.mjs (hand-editing
//                                      it shaves surfaces out of scope)
//   .claude/manifests/signoff.json   - the ONLY axis that grants a cell; no
//                                      sanctioned agent writer exists at all
//   .artifacts/surfaces/verdicts.json- independent-judge verdicts; written ONLY
//                                      by tools/judge-surfaces.mjs
//   tools/calibrate-judge.mjs        - the judge's own report card
//
// The guard evaluates a command PER SEGMENT, not as one string. Three bugs made
// the previous whole-string version both too strict and too loose, and all three
// were observed live rather than theorised:
//   1. The read-only leader test was anchored `^` against the ENTIRE command, so
//      `cd <repo> && jq signoff.json` was blocked - a pure read - while the block
//      message said "Reading it (cat/jq) is fine". It fired three times in one
//      session on read-only commands.
//   2. `git` is a read-only leader and `--output=` was not a write pattern, so
//      `git log --output=<manifest> --format=<text>` FORGED a protected file and
//      passed. Flagged Critical on PR #560.
//   3. `firstSegmentIsSanctioned` matched the sanctioned writer anywhere in the
//      string with no end anchor, so `node tools/surface-manifest.mjs && rm -rf
//      .claude/manifests` inherited the sanction. Also Critical on #560.
// Segmenting fixes 1 and 3 by construction (a chained command is separate
// segments, each judged alone) and 2 is fixed by ALLOWLISTING the arguments a
// read-only leader may carry rather than blocklisting write verbs - the same
// reasoning CLAUDE.md's "Agent tool scoping" section gives for shell allowlists.
//
// Honest limit, unchanged: this stops drift and casual shortcuts, not a determined
// adversarial payload. An agent with a full shell can always find a path around a
// local fence (`git -C` into a repo with a hostile core.pager, for one). The point
// is that faking "done" requires deliberate multi-step tampering instead of one
// careless sentence.

const PAUSED_RE = /\.claude[\\/]manifests[\\/]PAUSED/i
// Bare filenames are matched too: `cd .claude/manifests && rm signoff.json` puts
// no directory in the segment that writes, so a path-only pattern would miss it.
const MANIFEST_RE = /(\.claude[\\/]manifests[\\/])?\bsurfaces\.json\b/i
const VERDICTS_RE = /(\.artifacts[\\/]surfaces[\\/])?\bverdicts\.json\b|(\.claude[\\/]manifests[\\/])?\bdefects\.json\b/i
const SIGNOFF_RE = /(\.claude[\\/]manifests[\\/])?\bsignoff\.json\b/i
// The recall number is the harness's own report card, and its adjudications
// live in this tool's source. An agent that can edit it can flip a rejected
// candidate to a hit, or loosen the match threshold, and turn a measurement
// back into the self-graded number the rebuild exists to eliminate.
const CALIBRATION_RE = /tools[\\/]calibrate-judge\.mjs/i
// Naming the CONTAINING DIRECTORY destroys every protected file without naming
// one of them: `rm -rf .claude/manifests` matched no filename pattern and was
// allowed until a probe caught it. Directory-level writes block too.
const GATE_DIR_RE = /(\.claude[\\/]manifests|\.artifacts[\\/]surfaces)\b/i
const CALIBRATION_MESSAGE =
  "gate-tamper: tools/calibrate-judge.mjs carries the ADJUDICATED recall of the vision judge against known " +
  "human-found defects - the harness's own report card. Editing it can turn a measured 0/12 into any number you like. " +
  "Running it (`npm run surfaces:calibrate`) is fine. If a candidate match is genuinely a hit, say so and let Thomas adjudicate it."

const MANIFEST_WRITERS = [/^node\s+(\.\/)?tools[\\/]surface-manifest\.mjs\b/, /^npm\s+run\s+surfaces:manifest\b/]
const VERDICT_WRITERS = [/^node\s+(\.\/)?tools[\\/]judge-surfaces\.mjs\b/, /^npm\s+run\s+surfaces:judge\b/]

// signoff.json is the ONLY axis of the completion oracle that GRANTS a cell.
// There is deliberately no sanctioned agent writer for it: a tool an agent can
// run is a tool an agent can use to sign its own work, which is the exact
// self-certification loop the harness rebuild exists to break.
const SIGNOFF_MESSAGE =
  "gate-tamper: .claude/manifests/signoff.json is the HUMAN-ONLY completion grant. " +
  "It is the one axis of the visual gate an agent may never write - a cell is only DONE when Thomas has personally " +
  "looked at the surface and ticked it in his own editor. Signing your own work is the failure this gate exists to stop. " +
  "Reading it is fine - ordinary shell reads (cat/jq/grep/wc/a for-loop/an if-test, with or without a `cd` prefix, " +
  "a pipe or `2>/dev/null`) all pass, and the Read tool ALWAYS works. What does not pass is an interpreter " +
  "(`node -e`, `python -c`): arbitrary code cannot be classified as read-only, so it stays blocked by design - use Read. " +
  "If you believe a surface is ready, say so and let Thomas tick it."

const READ_ONLY_LEADERS =
  /^(cd|cat|jq|ls|dir|stat|head|tail|wc|grep|rg|git|type|file|diff|awk|sed|cut|sort|uniq|tr|od|xxd|find|echo|printf|read|test|true|false|basename|dirname|realpath|sha256sum|md5sum|certutil|node\s+(\.\/)?tools[\\/]check-surface-coverage\.mjs|node\s+(\.\/)?tools[\\/]calibrate-judge\.mjs|npm\s+run\s+surfaces:(check|calibrate))\b/

// Shell CONTROL STRUCTURES are grammar, not commands. `for f in <list>`,
// `if [ -f x ]`, `while read`, `do`, `done`, `fi` NAME a file without acting on
// it, and their leader is a keyword, so no allowlist of read-only COMMAND
// leaders can ever admit them. That made every loop or conditional mentioning a
// protected path a false block - the guard's most-reproduced defect, fired on
// three separate pure reads in one session (a `for` over a file list, an
// if-test, and a `while read`).
//
// Stripping the keyword and judging the REMAINDER is safe, and strictly safer
// than treating the whole segment as read-only: the write-verb, output-flag and
// redirect checks already ran leader-independently above (so `do rm
// signoff.json` blocks on `rm`), and re-testing the remainder keeps an
// interpreter fail-closed behind a keyword too (`do node -e "...write..."`
// blocks exactly like the bare form).
const CONTROL_KEYWORD_RE = /^(for|while|until|if|elif|then|else|do|done|fi|case|esac|in|select|time|function|!)\b\s*/
// What legitimately remains after the keywords: a loop binding (`f in a b c`),
// a test (`[ -f x ]`, `[[ ... ]]`, `(( ... ))`), an assignment, or an INPUT
// redirect (`done < surfaces.json` feeds a loop from a file and writes nothing).
const BENIGN_REMAINDER_RE = /^(\w+\s+in\b|\[\[?\s|\(\(|\w+=|<)/

function stripControlKeywords(text) {
  let out = text
  for (;;) {
    const stripped = out.replace(CONTROL_KEYWORD_RE, "")
    if (stripped === out) return out
    out = stripped
  }
}

// A read-only leader stops being read-only the moment it carries an argument that
// names an output destination. This is an ALLOWLIST of shape, not a blocklist of
// verbs: `git log --output=<path>` is pure `git log` and writes an arbitrary file.
const OUTPUT_FLAG_RE = /(^|\s)-(-(output(-file)?|out|to|dump|export|write)(=|\s|$)|[oOw](=|\s|$))/i

const WRITE_VERB_RE =
  /(\brm\b)|(\bmv\b)|(\bcp\b)|(\bdd\b)|(\bsed\s+[^|]*-i\b)|(\btee\b)|(\btruncate\b)|(\btouch\b)|(\bdel\b)|(\bpatch\b)|(-delete\b)|(-exec\b)|(\bRemove-Item\b)|(\bSet-Content\b)|(\bAdd-Content\b)|(\bOut-File\b)|(\bCopy-Item\b)|(\bMove-Item\b)|(\bNew-Item\b)|(\bgit\s+rm\b)|(\bgit\s+checkout\b)|(\bgit\s+restore\b)|(\bgit\s+apply\b)|(\bgit\s+stash\b)/i

// A file-descriptor duplication (`2>&1`, `1>&2`, `>&2`) is not a write to any
// file, but it contains `>` and so used to trip the write check - which made
// the guarded tools unrunnable under the ordinary `cmd ... 2>&1` idiom.
const FD_REDIRECT = /\d?>&\d?/g

// A redirect to the NULL DEVICE writes to no file, but it contains `>` and so
// tripped the redirect check - which blocked the single most common read idiom
// there is (`... 2>/dev/null`). `2>&1` was already exempt; the null device was
// not, so `wc -l < surfaces.json 2>/dev/null` blocked while `wc -l
// surfaces.json` passed. Only the null and standard streams are exempt: any
// other redirect target is still a real write.
const NULL_REDIRECT = /\d?>\s*(\/dev\/(null|stdout|stderr)|NUL|nul|\$null)\b/gi

// A heredoc BODY is data, not commands - a commit message describing `rm
// signoff.json` is prose about a write, not a write. The command line carrying
// the `<<TAG` is kept and still judged, so `tee signoff.json <<EOF` and
// `cat <<EOF > signoff.json` are unaffected.
// The rest of the invoking line after `<<TAG` is preserved deliberately: a
// redirect written there (`cat <<EOF > signoff.json`) is a real write and must
// still be judged.
const HEREDOC_RE = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g

/** Drop heredoc bodies, keeping the `<<TAG` marker and the remainder of its command line so the invoking command is still judged. */
export function withoutHeredocBodies(command) {
  return String(command ?? "").replace(HEREDOC_RE, (_match, _quote, tag, restOfLine) => `<<${tag}${restOfLine}`)
}

/** Split a shell command into independently-judged segments on `&&`, `||`, `;`, `|` and newlines, respecting quotes. `2>&1` is never a split point because a single `&` is not a separator. */
export function splitSegments(command) {
  const segments = []
  const text = withoutHeredocBodies(command)
  let current = ""
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      current += char
      if (char === quote && text[index - 1] !== "\\") quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === "\n" || char === ";") {
      segments.push(current)
      current = ""
      continue
    }
    if ((char === "&" || char === "|") && text[index + 1] === char) {
      segments.push(current)
      current = ""
      index += 1
      continue
    }
    if (char === "|") {
      segments.push(current)
      current = ""
      continue
    }
    current += char
  }
  segments.push(current)
  return segments.map((segment) => segment.trim()).filter(Boolean)
}

function withoutQuotedText(segment) {
  return segment.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")
}

function redirectsToFile(segment) {
  return withoutQuotedText(segment).replace(FD_REDIRECT, " ").replace(NULL_REDIRECT, " ").includes(">")
}

/** True when this ONE segment only reads: no output-naming flag, no write verb, no redirect to a real file, and either a read-only leader or a shell control structure whose remainder is itself read-only. */
export function segmentIsReadOnly(segment) {
  const text = segment.trim()
  if (!text) return true
  const unquoted = withoutQuotedText(text)
  if (OUTPUT_FLAG_RE.test(unquoted)) return false
  if (WRITE_VERB_RE.test(unquoted)) return false
  if (redirectsToFile(text)) return false
  if (READ_ONLY_LEADERS.test(text)) return true
  const remainder = stripControlKeywords(text)
  if (remainder === text) return false
  if (!remainder) return true
  if (BENIGN_REMAINDER_RE.test(remainder)) return true
  return READ_ONLY_LEADERS.test(remainder)
}

function segmentIsSanctionedWriter(segment, writers) {
  return writers.some((writer) => writer.test(segment.trim()))
}

function blockedSegment(command, pathPattern, writers) {
  for (const segment of splitSegments(command)) {
    if (!pathPattern.test(segment)) continue
    if (writers && segmentIsSanctionedWriter(segment, writers)) continue
    if (!segmentIsReadOnly(segment)) return segment
  }
  return null
}

/** Bash-side guard: block shell commands that create PAUSED or rewrite gate state outside their sanctioned tools. Returns { block, message } or null. */
export function checkGateTamperBash(command) {
  const text = withoutHeredocBodies(command)
  if (!text) return null

  if (PAUSED_RE.test(text)) {
    return {
      block: true,
      message:
        "gate-tamper: .claude/manifests/PAUSED is the HUMAN-ONLY pause switch for the visual completion gate. " +
        "An agent never creates, edits, or reads-to-copy it. If the gate should pause, say so and let Thomas create the file in his own terminal.",
    }
  }

  if (blockedSegment(text, SIGNOFF_RE, null)) {
    return { block: true, message: SIGNOFF_MESSAGE }
  }

  if (blockedSegment(text, CALIBRATION_RE, null)) {
    return { block: true, message: CALIBRATION_MESSAGE }
  }

  if (blockedSegment(text, MANIFEST_RE, MANIFEST_WRITERS)) {
    return {
      block: true,
      message:
        "gate-tamper: .claude/manifests/surfaces.json is the completion denominator and is derived from the codebase. " +
        "Never edit, overwrite, or delete it by hand - regenerate it with `npm run surfaces:manifest` (tools/surface-manifest.mjs). " +
        "Reading it is fine - ordinary shell reads and the Read tool all pass; an interpreter (`node -e`, `python -c`) " +
        "stays blocked by design because arbitrary code cannot be classified as read-only, so use Read for that.",
    }
  }

  if (blockedSegment(text, VERDICTS_RE, VERDICT_WRITERS)) {
    return {
      block: true,
      message:
        "gate-tamper: .artifacts/surfaces/verdicts.json holds INDEPENDENT judge verdicts and is written only by " +
        "`npm run surfaces:judge` (tools/judge-surfaces.mjs), which re-runs real judges over the real screenshots. " +
        "Writing it any other way is fabricating a verdict. Reading it (cat/jq) is fine.",
    }
  }

  if (blockedSegment(text, GATE_DIR_RE, [...MANIFEST_WRITERS, ...VERDICT_WRITERS])) {
    return {
      block: true,
      message:
        "gate-tamper: that command writes to a directory holding the visual gate's state " +
        "(.claude/manifests or .artifacts/surfaces). Removing or overwriting the directory destroys the denominator, " +
        "the judge verdicts and the human sign-off at once, without naming any of them. " +
        "Regenerate with `npm run surfaces:manifest` / `npm run surfaces:judge`; reading and listing are fine.",
    }
  }

  return null
}

/** Edit/Write-side guard: block direct file edits to any gate-state file. Returns { block, message } or null. */
export function checkGateTamperEdit(filePath) {
  const path = String(filePath ?? "")
  if (!path) return null
  if (PAUSED_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: .claude/manifests/PAUSED is human-only. Do not create or edit it from an agent session.",
    }
  }
  if (SIGNOFF_RE.test(path)) return { block: true, message: SIGNOFF_MESSAGE }
  if (CALIBRATION_RE.test(path)) return { block: true, message: CALIBRATION_MESSAGE }
  if (MANIFEST_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: never hand-edit .claude/manifests/surfaces.json - regenerate it with `npm run surfaces:manifest`.",
    }
  }
  if (VERDICTS_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: never hand-write .artifacts/surfaces/verdicts.json - verdicts come only from `npm run surfaces:judge`.",
    }
  }
  return null
}

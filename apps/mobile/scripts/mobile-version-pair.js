const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const PAIRING = "Android open and production pair with iOS production. Android internal pairs with iOS staging.";

const USAGE = `Usage: node scripts/mobile-version-pair.js <command> [options]

Keeps the Android and iOS user-facing versions on one number, and one number on one commit.
Both platforms record each upload as a GitHub Deployment (task android-release or ios-release).
Set GITHUB_REPOSITORY (owner/name) and GH_TOKEN, as in GitHub Actions.

Commands:
  check --platform <android|ios> --environment <staging|production> --app-version <x.y.z>
        --sha <commit> [--platform-only-reason <text>] [--stage <build|upload>] [--wait-minutes <n>]
      Refuse a version that puts the two platforms out of step. Exit 0 allows, 1 refuses.
      iOS takes the newest Android version. A platform-only release, and Android after an
      iOS-only release, must go above the newest version of the other platform.
      --sha is the commit the release builds. A version that a platform already carries
      takes only the commit of its newest record on that platform. The check refuses a
      version whose newest record names no commit.
      An iOS version above both platforms waits for Android when an Android release of that
      version runs on the same commit (an android-release.yml run that is not completed).
      --stage build (the iOS build start) allows that wait. --stage upload (the default) reads
      the records again every 30 seconds for up to --wait-minutes (default 0), then allows
      only when Android recorded the version from the same commit. Without such a run, the
      check refuses at once.
  plan --environment <staging|production>
      Print the newest version of each platform and the next shared version as JSON.
  record-ios --environment <staging|production> --app-version <x.y.z> --build-number <n>
        --variant <staging|production> --sha <commit> [--platform-only-reason <text>]
      Record one iOS upload as a GitHub Deployment so the Android check can read it.
      Reuses the record of the same upload and makes 3 attempts, so a rerun never records twice.

Each environment keeps its own records.
${PAIRING}

--help, -h  print this usage and exit 0. In the place of a flag value, it is that value.
exit codes: 0 success; 1 refused or read error; 2 invalid arguments`;

const ANDROID_WORKFLOW = "android-release.yml";
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const TASKS = { android: "android-release", ios: "ios-release" };
const PLATFORM_NAMES = { android: "Android", ios: "iOS" };
const ENVIRONMENTS = ["staging", "production"];
const PLATFORMS = ["android", "ios"];
const DEPLOYMENT_PAGE_SIZE = 100;
const RECORD_ATTEMPTS = 3;
const STAGES = ["build", "upload"];
const WAIT_INTERVAL_MS = 30_000;
const MAXIMUM_WAIT_MINUTES = 120;
/** The run name of android-release.yml: `Android Release <app_version> (<versionCode>) to <track> on <ref>`. */
const ANDROID_RUN_TITLE = /^Android Release (\d+\.\d+\.\d+) \(\d+\) to (internal|open|production) on /;
const TRACK_ENVIRONMENTS = { internal: "staging", open: "production", production: "production" };

function parseVersion(value) {
  const match = typeof value === "string" ? VERSION_PATTERN.exec(value) : null;
  if (!match) throw new Error(`Invalid version "${value}". Expected format: major.minor.patch`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

function newestVersion(deployments) {
  if (!Array.isArray(deployments)) throw new Error("GitHub returned an unexpected deployments response");
  let newest = null;
  for (const deployment of deployments) {
    const version = deployment?.payload?.app_version;
    parseVersion(version);
    if (newest === null || compareVersions(version, newest) > 0) newest = version;
  }
  return newest;
}

/**
 * The commit of the newest record at `version`: undefined when no record carries the version,
 * null when that record names no commit. The newest record has the latest `created_at`.
 */
function recordedCommit(deployments, version) {
  const carrying = deployments.filter((deployment) => compareVersions(deployment.payload.app_version, version) === 0);
  if (carrying.length === 0) return undefined;
  const newest = carrying.reduce((latest, candidate) => (candidate.created_at > latest.created_at ? candidate : latest));
  return typeof newest.sha === "string" && COMMIT_PATTERN.test(newest.sha) ? newest.sha : null;
}

/**
 * Decide whether `platform` may release `appVersion` built from commit `sha`, from the deployment records
 * of both platforms. One version names one code state, so a version that a platform carries takes only
 * the commit of its newest record there. A rebuild of the same platform's version follows the same rule.
 */
function checkVersionPair({ platform, appVersion, sha, platformOnlyReason, platformRecords, siblingRecords }) {
  const platformNewest = newestVersion(platformRecords);
  const siblingNewest = newestVersion(siblingRecords);
  const decision = checkVersions({ platform, appVersion, platformOnlyReason, platformNewest, siblingNewest });
  if (!decision.allowed) return decision;
  const nextVersion = nextSharedVersion([platformNewest, siblingNewest]);
  const remedy = decision.platformOnly
    ? `take the plan's nextVersion ${nextVersion}`
    : `release Android at the plan's nextVersion ${nextVersion} from this commit, then iOS`;
  const sibling = platform === "android" ? "ios" : "android";
  for (const [name, records] of [[platform, platformRecords], [sibling, siblingRecords]]) {
    const recorded = recordedCommit(records, appVersion);
    if (recorded === null) {
      return refuse(`The newest ${PLATFORM_NAMES[name]} record of ${appVersion} names no commit, so the check cannot prove one code state. Instead, ${remedy}.`);
    }
    if (recorded !== undefined && recorded !== sha) {
      return refuse(`${PLATFORM_NAMES[name]} ${appVersion} is built from ${recorded}, and this release builds ${sha}. One version names one code state, so build ${recorded}, or ${remedy}.`);
    }
  }
  return decision;
}

/**
 * Decide whether the version numbers allow the release. The newest versions are null when no record exists.
 * iOS follows the newest Android version. One version names one code state, so a platform-only release,
 * and Android after an iOS-only release, go above the newest version of the other platform.
 */
function checkVersions({ platform, appVersion, platformOnlyReason, platformNewest, siblingNewest }) {
  parseVersion(appVersion);
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform "${platform}"`);
  const reason = typeof platformOnlyReason === "string" ? platformOnlyReason.trim() : "";
  if (platformNewest !== null && compareVersions(appVersion, platformNewest) < 0) {
    return refuse(`${platform} ${appVersion} is older than its newest release ${platformNewest}.`);
  }
  const sibling = PLATFORM_NAMES[platform === "android" ? "ios" : "android"];
  const notAboveSibling = siblingNewest !== null && compareVersions(appVersion, siblingNewest) <= 0;
  const refuseNotAbove = (subject, detail) => refuse(`${subject} is not above the newest ${sibling} version ${siblingNewest}${detail}. `
    + `One version names one code state, so use the plan's nextVersion ${nextSharedVersion([platformNewest, siblingNewest])}.`);
  if (reason) {
    if (notAboveSibling) return refuseNotAbove(`The ${platform} only release ${appVersion}`, "");
    return { allowed: true, platformOnly: true, message: `${platform} only release ${appVersion}. Reason: ${reason}` };
  }
  if (platform === "ios") {
    if (siblingNewest === null) {
      return refuse(`No Android release exists to mirror. Release Android ${appVersion} first, or give a platform-only reason.`);
    }
    if (compareVersions(appVersion, siblingNewest) !== 0) {
      return refuse(`iOS ${appVersion} differs from the newest Android version ${siblingNewest}. Release iOS at ${siblingNewest}, or give a platform-only reason for a defect specific to iOS.`);
    }
  } else if (notAboveSibling && (platformNewest === null || compareVersions(siblingNewest, platformNewest) !== 0)) {
    return refuseNotAbove(`Android ${appVersion}`, ", which Android does not carry");
  }
  return { allowed: true, platformOnly: false, message: `${platform} ${appVersion} keeps both platforms on one version.` };
}

function refuse(message) {
  return { allowed: false, platformOnly: false, message };
}

/**
 * True when iOS, with no platform-only reason, releases a version above the newest version of both platforms.
 * Android may be releasing that version now, so the check waits for its record instead of refusing.
 */
function awaitsAndroid({ platform, appVersion, platformOnlyReason, platformRecords, siblingRecords }) {
  if (platform !== "ios" || (typeof platformOnlyReason === "string" && platformOnlyReason.trim())) return false;
  return [newestVersion(platformRecords), newestVersion(siblingRecords)]
    .every((newest) => newest === null || compareVersions(appVersion, newest) > 0);
}

/** True when an android-release.yml run of `appVersion` for `environment` on commit `sha` is not completed. */
function androidReleaseRunning(runs, { appVersion, environment, sha }) {
  if (!Array.isArray(runs?.workflow_runs)) throw new Error("GitHub returned an unexpected workflow runs response");
  return runs.workflow_runs.some((run) => {
    const title = ANDROID_RUN_TITLE.exec(typeof run?.display_title === "string" ? run.display_title : "");
    return title !== null && run.head_sha === sha && run.status !== "completed"
      && title[1] === appVersion && TRACK_ENVIRONMENTS[title[2]] === environment;
  });
}

/**
 * Repeat `decide` every 30 seconds while it reports a pending Android upload, for up to `waitMinutes`.
 * A pending decision at the end refuses.
 */
function waitForAndroid({ decide, waitMinutes, pause = pauseFor, now = Date.now }) {
  const deadline = now() + waitMinutes * 60_000;
  for (;;) {
    const decision = decide();
    if (!decision.pending) return decision;
    if (now() >= deadline) {
      return refuse(`${decision.message} The upload waited ${waitMinutes} minutes, so it stops without uploading.`);
    }
    console.log(decision.message);
    pause(WAIT_INTERVAL_MS);
  }
}

function readGitHub(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }));
}

function readDeployments({ platform, environment, repository }) {
  return readGitHub(`repos/${repository}/deployments?task=${TASKS[platform]}&environment=${environment}&per_page=${DEPLOYMENT_PAGE_SIZE}`);
}

function readBothNewest({ environment, repository }) {
  return {
    android: newestVersion(readDeployments({ platform: "android", environment, repository })),
    ios: newestVersion(readDeployments({ platform: "ios", environment, repository })),
  };
}

/** The patch above the highest of `versions` (null entries ignored), or null when every entry is null. */
function nextSharedVersion(versions) {
  const highest = versions.filter(Boolean).sort(compareVersions).at(-1);
  return highest === undefined ? null : bumpPatch(highest);
}

function planVersions(newest) {
  const { android, ios } = newest;
  const nextVersion = nextSharedVersion([android, ios]);
  const inStep = android !== null && android === ios;
  const laggingPlatform = inStep || nextVersion === null ? null
    : android === null || (ios !== null && compareVersions(android, ios) < 0) ? "android"
      : ios === null || compareVersions(ios, android) < 0 ? "ios" : null;
  return { android, ios, inStep, laggingPlatform, nextVersion };
}

/**
 * Record one iOS upload. Each attempt first looks for the record of this exact upload on the commit,
 * so a lost creation response or a rerun reuses that record. A failed attempt repeats after a pause.
 */
function recordIosDeployment({ environment, appVersion, buildNumber, variant, sha, platformOnlyReason, repository, logUrl, github = GITHUB, pause = pauseFor }) {
  const reason = typeof platformOnlyReason === "string" ? platformOnlyReason.trim() : "";
  const upload = { app_version: appVersion, ios_build_number: buildNumber, variant };
  const deployments = `repos/${repository}/deployments`;
  const recordOnce = () => {
    const recorded = github.read(`${deployments}?sha=${sha}&task=${TASKS.ios}&environment=${environment}&per_page=${DEPLOYMENT_PAGE_SIZE}`);
    if (!Array.isArray(recorded)) throw new Error("GitHub returned an unexpected deployments response");
    const deployment = recorded.find((candidate) => Object.entries(upload).every(([key, value]) => candidate?.payload?.[key] === value))
      ?? github.write(deployments, {
        ref: sha, task: TASKS.ios, environment,
        description: `iOS ${appVersion} (${buildNumber}) to TestFlight ${variant}`,
        auto_merge: false, required_contexts: [],
        payload: { ...upload, ...(reason ? { platform_only_reason: reason } : {}) },
      });
    if (!Number.isInteger(deployment?.id)) throw new Error("GitHub returned a deployment without a numeric id");
    github.write(`${deployments}/${deployment.id}/statuses`, { state: "success", log_url: logUrl, auto_inactive: false });
    return deployment.id;
  };
  for (let attempt = 1; ; attempt++) {
    try {
      return recordOnce();
    } catch (error) {
      if (attempt === RECORD_ATTEMPTS) throw error;
      pause(attempt * 2000);
    }
  }
}

function writeGitHub(path, payload) {
  return JSON.parse(execFileSync("gh", ["api", "--method", "POST", path, "--input", "-"], {
    encoding: "utf8", input: JSON.stringify(payload), timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  }));
}

const GITHUB = { read: readGitHub, write: writeGitHub };

function pauseFor(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const FLAGS = {
  check: { required: ["platform", "environment", "app-version", "sha"], optional: ["platform-only-reason", "stage", "wait-minutes"] },
  plan: { required: ["environment"], optional: [] },
  "record-ios": {
    required: ["environment", "app-version", "build-number", "variant", "sha"],
    optional: ["platform-only-reason"],
  },
};

const HELP_FLAGS = ["--help", "-h"];

/** A help flag counts only where a command or a flag belongs. In the place of a flag value it is that value. */
function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (HELP_FLAGS.includes(command)) return { help: true };
  const allowed = FLAGS[command];
  if (!allowed) return null;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (HELP_FLAGS.includes(flag)) return { help: true };
    const value = rest[index + 1];
    const name = flag?.startsWith("--") ? flag.slice(2) : null;
    if (!name || ![...allowed.required, ...allowed.optional].includes(name) || value === undefined || name in options) return null;
    options[name] = value;
  }
  if (!allowed.required.every((name) => typeof options[name] === "string" && options[name].length > 0)) return null;
  if (!ENVIRONMENTS.includes(options.environment)) return null;
  if (options.platform !== undefined && !PLATFORMS.includes(options.platform)) return null;
  if (options.variant !== undefined && !ENVIRONMENTS.includes(options.variant)) return null;
  if (options["build-number"] !== undefined && !/^[1-9]\d{0,17}$/.test(options["build-number"])) return null;
  if (options["app-version"] !== undefined && !VERSION_PATTERN.test(options["app-version"])) return null;
  if (options.sha !== undefined && !COMMIT_PATTERN.test(options.sha)) return null;
  if (options.stage !== undefined && !STAGES.includes(options.stage)) return null;
  if (options["wait-minutes"] !== undefined
    && (!/^\d{1,3}$/.test(options["wait-minutes"]) || Number(options["wait-minutes"]) > MAXIMUM_WAIT_MINUTES)) return null;
  return { command, options };
}

function requireRepository() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY must name the repository as owner/name");
  return repository;
}

function appendSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

/**
 * One check against the current records. An iOS version that Android is releasing on the same commit is pending.
 * The records are read again after the run lookup, because the Android run can record and finish between the reads.
 */
function decideCheck(options, repository) {
  const siblingPlatform = options.platform === "android" ? "ios" : "android";
  const appVersion = options["app-version"];
  const readInput = () => ({
    platform: options.platform,
    appVersion,
    sha: options.sha,
    platformOnlyReason: options["platform-only-reason"],
    platformRecords: readDeployments({ platform: options.platform, environment: options.environment, repository }),
    siblingRecords: readDeployments({ platform: siblingPlatform, environment: options.environment, repository }),
  });
  const input = readInput();
  const decision = checkVersionPair(input);
  if (decision.allowed || !awaitsAndroid(input)) return decision;
  const runs = readGitHub(`repos/${repository}/actions/workflows/${ANDROID_WORKFLOW}/runs?head_sha=${options.sha}&per_page=100`);
  if (androidReleaseRunning(runs, { appVersion, environment: options.environment, sha: options.sha })) {
    return { allowed: false, platformOnly: false, pending: true, message: `Android ${appVersion} runs on ${options.sha} and has not recorded its upload yet.` };
  }
  const recheck = checkVersionPair(readInput());
  if (recheck.allowed) return recheck;
  return refuse(`${recheck.message} No Android release of ${appVersion} runs on ${options.sha}: release Android first, or start iOS while it runs.`);
}

function runCheck(options) {
  const repository = requireRepository();
  const decide = () => decideCheck(options, repository);
  let decision;
  if (options.stage === "build") {
    decision = decide();
    if (decision.pending) {
      decision = { allowed: true, platformOnly: false, message: `${decision.message} The upload step waits for that record.` };
    }
  } else {
    decision = waitForAndroid({ decide, waitMinutes: Number(options["wait-minutes"] ?? "0") });
  }
  appendSummary([
    "### Mobile version pair",
    "",
    `| Platform | \`${options.platform}\` |`,
    "| --- | --- |",
    `| Environment | \`${options.environment}\` |`,
    `| Version | \`${options["app-version"]}\` |`,
    `| Commit | \`${options.sha}\` |`,
    `| Platform only | \`${decision.platformOnly}\` |`,
    `| Verdict | ${decision.allowed ? "allowed" : "refused"} |`,
    `| Detail | ${decision.message} |`,
  ]);
  if (decision.allowed) console.log(decision.message);
  else console.error(`::error::${decision.message} The check read the ${options.environment} environment. ${PAIRING}`);
  return decision.allowed ? 0 : 1;
}

function runRecordIos(options) {
  const repository = requireRepository();
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;
  const id = recordIosDeployment({
    environment: options.environment, appVersion: options["app-version"], buildNumber: options["build-number"],
    variant: options.variant, sha: options.sha, platformOnlyReason: options["platform-only-reason"], repository, logUrl: runUrl,
  });
  console.log(`iOS deployment ${id}: ${options.environment}, ${options["app-version"]} (${options["build-number"]}), ${options.sha}`);
  return 0;
}

function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed?.help) {
    console.log(USAGE);
    return 0;
  }
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  try {
    if (parsed.command === "check") return runCheck(parsed.options);
    if (parsed.command === "record-ios") return runRecordIos(parsed.options);
    const repository = requireRepository();
    console.log(JSON.stringify({ environment: parsed.options.environment, ...planVersions(readBothNewest({ environment: parsed.options.environment, repository })) }));
    return 0;
  } catch (error) {
    console.error(`::error::${error.message}`);
    return 1;
  }
}

module.exports = {
  androidReleaseRunning, awaitsAndroid, bumpPatch, checkVersionPair, compareVersions, newestVersion, planVersions,
  recordIosDeployment, waitForAndroid,
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));

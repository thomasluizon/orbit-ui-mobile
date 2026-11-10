const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const USAGE = `Usage: node scripts/mobile-version-pair.js <command> [options]

Keeps the Android and iOS user-facing versions on one number.
Both platforms record each upload as a GitHub Deployment (task android-release or ios-release).
Set GITHUB_REPOSITORY (owner/name) and GH_TOKEN, as in GitHub Actions.

Commands:
  check --platform <android|ios> --environment <staging|production> --app-version <x.y.z>
        [--platform-only-reason <text>]
      Refuse a version that puts the two platforms out of step. Exit 0 allows, 1 refuses.
  plan --environment <staging|production>
      Print the newest version of each platform and the next shared version as JSON.
  record-ios --environment <staging|production> --app-version <x.y.z> --build-number <n>
        --variant <staging|production> --sha <commit> [--platform-only-reason <text>]
      Record one iOS upload as a GitHub Deployment so the Android check can read it.

--help, -h  print this usage and exit 0
exit codes: 0 success; 1 refused or read error; 2 invalid arguments`;

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const TASKS = { android: "android-release", ios: "ios-release" };
const ENVIRONMENTS = ["staging", "production"];
const PLATFORMS = ["android", "ios"];
const DEPLOYMENT_PAGE_SIZE = 100;

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
 * Decide whether `platform` may release `appVersion`.
 * `platformNewest` and `siblingNewest` are the newest recorded versions (null when none exists).
 * Android leads a shared release, so it may start a new version. iOS follows the newest Android version.
 */
function checkVersionPair({ platform, appVersion, platformOnlyReason, platformNewest, siblingNewest }) {
  parseVersion(appVersion);
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform "${platform}"`);
  const reason = typeof platformOnlyReason === "string" ? platformOnlyReason.trim() : "";
  if (platformNewest !== null && compareVersions(appVersion, platformNewest) < 0) {
    return refuse(`${platform} ${appVersion} is older than its newest release ${platformNewest}.`);
  }
  if (reason) {
    return { allowed: true, platformOnly: true, message: `${platform} only release ${appVersion}. Reason: ${reason}` };
  }
  if (platform === "ios") {
    if (siblingNewest === null) {
      return refuse(`No Android release exists to mirror. Release Android ${appVersion} first, or give a platform-only reason.`);
    }
    if (compareVersions(appVersion, siblingNewest) !== 0) {
      return refuse(`iOS ${appVersion} differs from the newest Android version ${siblingNewest}. Release iOS at ${siblingNewest}, or give a platform-only reason for a defect specific to iOS.`);
    }
  } else if (siblingNewest !== null && compareVersions(appVersion, siblingNewest) < 0) {
    return refuse(`Android ${appVersion} is older than the newest iOS version ${siblingNewest}. Release Android at ${siblingNewest} or later, or give a platform-only reason for a defect specific to Android.`);
  }
  return { allowed: true, platformOnly: false, message: `${platform} ${appVersion} keeps both platforms on one version.` };
}

function refuse(message) {
  return { allowed: false, platformOnly: false, message };
}

function readGitHub(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }));
}

function readNewestVersion({ platform, environment, repository, read = readGitHub }) {
  const path = `repos/${repository}/deployments?task=${TASKS[platform]}&environment=${environment}&per_page=${DEPLOYMENT_PAGE_SIZE}`;
  return newestVersion(read(path));
}

function readBothNewest({ environment, repository, read }) {
  return {
    android: readNewestVersion({ platform: "android", environment, repository, read }),
    ios: readNewestVersion({ platform: "ios", environment, repository, read }),
  };
}

function planVersions(newest) {
  const { android, ios } = newest;
  const highest = [android, ios].filter(Boolean).sort(compareVersions).at(-1) ?? null;
  const inStep = android !== null && android === ios;
  const laggingPlatform = inStep || highest === null ? null
    : android === null || (ios !== null && compareVersions(android, ios) < 0) ? "android"
      : ios === null || compareVersions(ios, android) < 0 ? "ios" : null;
  return { android, ios, inStep, laggingPlatform, nextVersion: highest === null ? null : bumpPatch(highest) };
}

function recordIosDeployment({ environment, appVersion, buildNumber, variant, sha, platformOnlyReason, repository, logUrl, run = runGitHubWrite }) {
  const reason = typeof platformOnlyReason === "string" ? platformOnlyReason.trim() : "";
  const deployment = run(`repos/${repository}/deployments`, {
    ref: sha, task: TASKS.ios, environment,
    description: `iOS ${appVersion} (${buildNumber}) to TestFlight ${variant}`,
    auto_merge: false, required_contexts: [],
    payload: { app_version: appVersion, ios_build_number: buildNumber, variant, ...(reason ? { platform_only_reason: reason } : {}) },
  });
  if (!Number.isInteger(deployment?.id)) throw new Error("GitHub returned a deployment without a numeric id");
  run(`repos/${repository}/deployments/${deployment.id}/statuses`, { state: "success", log_url: logUrl, auto_inactive: false });
  return deployment.id;
}

function runGitHubWrite(path, payload) {
  return JSON.parse(execFileSync("gh", ["api", "--method", "POST", path, "--input", "-"], {
    encoding: "utf8", input: JSON.stringify(payload), timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  }));
}

const FLAGS = {
  check: { required: ["platform", "environment", "app-version"], optional: ["platform-only-reason"] },
  plan: { required: ["environment"], optional: [] },
  "record-ios": {
    required: ["environment", "app-version", "build-number", "variant", "sha"],
    optional: ["platform-only-reason"],
  },
};

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const allowed = FLAGS[command];
  if (!allowed) return null;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
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
  if (options.sha !== undefined && !/^[a-f0-9]{40}$/.test(options.sha)) return null;
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

function runCheck(options) {
  const repository = requireRepository();
  const siblingPlatform = options.platform === "android" ? "ios" : "android";
  const decision = checkVersionPair({
    platform: options.platform,
    appVersion: options["app-version"],
    platformOnlyReason: options["platform-only-reason"],
    platformNewest: readNewestVersion({ platform: options.platform, environment: options.environment, repository }),
    siblingNewest: readNewestVersion({ platform: siblingPlatform, environment: options.environment, repository }),
  });
  appendSummary([
    "### Mobile version pair",
    "",
    `| Platform | \`${options.platform}\` |`,
    "| --- | --- |",
    `| Version | \`${options["app-version"]}\` |`,
    `| Platform only | \`${decision.platformOnly}\` |`,
    `| Verdict | ${decision.allowed ? "allowed" : "refused"} |`,
    `| Detail | ${decision.message} |`,
  ]);
  if (decision.allowed) console.log(decision.message);
  else console.error(`::error::${decision.message}`);
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
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const parsed = parseArguments(argv);
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

module.exports = { bumpPatch, checkVersionPair, compareVersions, newestVersion, parseVersion, planVersions, readNewestVersion, recordIosDeployment };

if (require.main === module) process.exitCode = main(process.argv.slice(2));

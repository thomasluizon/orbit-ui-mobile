const fs = require("node:fs");
const path = require("node:path");

const nextVersion = process.argv[2];
const nextVersionCodeRaw = process.argv[3];

if (!nextVersion) {
  console.error(
    "Usage: node scripts/set-app-version.js <major.minor.patch> [androidVersionCode]"
  );
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error(`Invalid version "${nextVersion}". Expected format: major.minor.patch`);
  process.exit(1);
}

const nextVersionCode =
  typeof nextVersionCodeRaw === "string" && nextVersionCodeRaw.length > 0
    ? Number.parseInt(nextVersionCodeRaw, 10)
    : null;

if (nextVersionCodeRaw && (!Number.isInteger(nextVersionCode) || nextVersionCode <= 0)) {
  console.error(
    `Invalid Android versionCode "${nextVersionCodeRaw}". Expected a positive integer`
  );
  process.exit(1);
}

const appJsonPath = path.join(__dirname, "..", "app.json");
const appJsonRaw = fs.readFileSync(appJsonPath, "utf8");
const appJson = JSON.parse(appJsonRaw);
const buildGradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");

if (!appJson.expo || typeof appJson.expo !== "object") {
  console.error("Invalid app.json: missing expo config");
  process.exit(1);
}

const previousVersion =
  typeof appJson.expo.version === "string" ? appJson.expo.version : "unknown";
const previousVersionCode =
  typeof appJson.expo.android?.versionCode === "number"
    ? appJson.expo.android.versionCode
    : null;

appJson.expo.version = nextVersion;
if (nextVersionCode !== null && appJson.expo.android && typeof appJson.expo.android === "object") {
  appJson.expo.android.versionCode = nextVersionCode;
}

if (previousVersion !== nextVersion || previousVersionCode !== nextVersionCode) {
  const nextAppJsonRaw = appJsonRaw.replace(
    /"version"\s*:\s*"[^"]+"/,
    `"version": "${nextVersion}"`
  );

  const finalAppJsonRaw =
    nextVersionCode !== null
      ? nextAppJsonRaw.replace(
          /"versionCode"\s*:\s*\d+/,
          `"versionCode": ${nextVersionCode}`
        )
      : nextAppJsonRaw;

  if (finalAppJsonRaw === appJsonRaw) {
    console.error("Failed to update app.json app version data");
    process.exit(1);
  }

  fs.writeFileSync(appJsonPath, finalAppJsonRaw);
}

if (fs.existsSync(buildGradlePath)) {
  const buildGradle = fs.readFileSync(buildGradlePath, "utf8");
  const currentBuildGradleVersionMatch = buildGradle.match(/versionName\s+"([^"]+)"/);
  const currentBuildGradleVersionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);

  if (!currentBuildGradleVersionMatch || !currentBuildGradleVersionCodeMatch) {
    console.error("Failed to locate android/app/build.gradle app version values");
    process.exit(1);
  }

  let nextBuildGradle = buildGradle;

  if (currentBuildGradleVersionMatch[1] !== nextVersion) {
    nextBuildGradle = nextBuildGradle.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${nextVersion}"`
    );
  }

  if (
    nextVersionCode !== null &&
    Number.parseInt(currentBuildGradleVersionCodeMatch[1], 10) !== nextVersionCode
  ) {
    nextBuildGradle = nextBuildGradle.replace(
      /versionCode\s+\d+/,
      `versionCode ${nextVersionCode}`
    );
  }

  if (nextBuildGradle !== buildGradle) {
    fs.writeFileSync(buildGradlePath, nextBuildGradle);
  }
}

const versionCodeSummary =
  nextVersionCode === null ? "unchanged" : `${previousVersionCode ?? "unknown"} -> ${nextVersionCode}`;

console.log(`Synced app version ${previousVersion} -> ${nextVersion} and versionCode ${versionCodeSummary}`);

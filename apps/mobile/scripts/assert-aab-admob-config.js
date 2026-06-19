const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const {
  SAMPLE_AD_UNIT_IDS,
} = require("./assert-production-admob-config");

const JS_BUNDLE_ENTRY = "base/assets/index.android.bundle";

function readRequiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function readJsBundle(aabPath) {
  return execFileSync("unzip", ["-p", aabPath, JS_BUNDLE_ENTRY], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString("latin1");
}

function assertAabAdMobConfig(aabPath) {
  if (!fs.existsSync(aabPath)) {
    throw new Error(`AAB not found at ${aabPath}`);
  }

  const expectedUnitIds = [
    readRequiredEnv("EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID"),
    readRequiredEnv("EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID"),
  ];

  const bundle = readJsBundle(aabPath);

  const foundSampleId = SAMPLE_AD_UNIT_IDS.find((sampleId) =>
    bundle.includes(sampleId)
  );
  if (foundSampleId) {
    throw new Error(
      `Shipped AAB embeds a Google sample AdMob ID: ${foundSampleId}`
    );
  }

  const missingUnitId = expectedUnitIds.find(
    (unitId) => !bundle.includes(unitId)
  );
  if (missingUnitId) {
    throw new Error(
      `Shipped AAB does not embed the production AdMob ID: ${missingUnitId}`
    );
  }
}

if (require.main === module) {
  const aabPath = process.argv[2];

  if (!aabPath) {
    throw new Error(
      "Usage: node scripts/assert-aab-admob-config.js <app-release.aab>"
    );
  }

  assertAabAdMobConfig(aabPath);
  console.log("Shipped AAB AdMob validation passed.");
}

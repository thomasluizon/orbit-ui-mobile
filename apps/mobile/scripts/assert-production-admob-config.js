const fs = require("node:fs");

const SAMPLE_AD_UNIT_IDS = [
  "ca-app-pub-3940256099942544~3347511713",
  "ca-app-pub-3940256099942544/1033173712",
  "ca-app-pub-3940256099942544/5224354917",
];

function readRequiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function findAdMobPluginOptions(config) {
  const plugins = Array.isArray(config.plugins)
    ? config.plugins
    : Array.isArray(config.expo?.plugins)
      ? config.expo.plugins
      : [];

  const adMobPlugin = plugins.find((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "react-native-google-mobile-ads"
      : plugin === "react-native-google-mobile-ads"
  );

  return Array.isArray(adMobPlugin) &&
    adMobPlugin[1] &&
    typeof adMobPlugin[1] === "object"
    ? adMobPlugin[1]
    : {};
}

function assertResolvedId(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${label}=${expected}, got ${String(actual)}`);
  }

  if (SAMPLE_AD_UNIT_IDS.includes(actual)) {
    throw new Error(`Detected Google sample AdMob ID for ${label}`);
  }
}

function assertProductionAdMobConfig(config) {
  const expected = {
    androidAppId: readRequiredEnv("EXPO_PUBLIC_ADMOB_ANDROID_APP_ID"),
    androidInterstitialId: readRequiredEnv(
      "EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID"
    ),
    androidRewardedId: readRequiredEnv("EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID"),
  };

  const extra = config.extra ?? config.expo?.extra ?? {};
  const adMob = extra.adMob ?? {};

  if (adMob.useTestIds !== false) {
    throw new Error(
      `Expected extra.adMob.useTestIds=false, got ${String(adMob.useTestIds)}`
    );
  }

  assertResolvedId(
    "react-native-google-mobile-ads.androidAppId",
    findAdMobPluginOptions(config).androidAppId,
    expected.androidAppId
  );
  assertResolvedId(
    "extra.adMob.androidInterstitialId",
    adMob.androidInterstitialId,
    expected.androidInterstitialId
  );
  assertResolvedId(
    "extra.adMob.androidRewardedId",
    adMob.androidRewardedId,
    expected.androidRewardedId
  );
}

if (require.main === module) {
  const configPath = process.argv[2];

  if (!configPath) {
    throw new Error(
      "Usage: node scripts/assert-production-admob-config.js <expo-public-config.json>"
    );
  }

  assertProductionAdMobConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  console.log("Expo AdMob config validation passed.");
}

module.exports = { assertProductionAdMobConfig, SAMPLE_AD_UNIT_IDS };

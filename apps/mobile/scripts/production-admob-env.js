const REQUIRED_AD_UNIT_ENV_VARS = [
  "EXPO_PUBLIC_ADMOB_ANDROID_APP_ID",
  "EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID",
  "EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID",
];

function resolveProductionAdMobEnv(baseEnv) {
  const missing = REQUIRED_AD_UNIT_ENV_VARS.filter(
    (name) =>
      typeof baseEnv[name] !== "string" || baseEnv[name].trim().length === 0
  );

  if (missing.length > 0) {
    throw new Error(
      `Cannot build a release without production AdMob IDs. Set ${missing.join(", ")} ` +
        "before building (a release built without them ships Google test ad units)."
    );
  }

  return {
    ...baseEnv,
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_ADMOB_USE_TEST_IDS: "false",
  };
}

module.exports = { resolveProductionAdMobEnv };

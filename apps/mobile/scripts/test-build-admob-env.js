function resolveTestBuildAdMobEnv(baseEnv) {
  return {
    ...baseEnv,
    EXPO_PUBLIC_ADMOB_USE_TEST_IDS: "true",
  };
}

module.exports = { resolveTestBuildAdMobEnv };

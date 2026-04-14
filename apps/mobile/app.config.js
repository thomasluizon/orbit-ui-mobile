const appJson = require("./app.json");

const TEST_ANDROID_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const TEST_IOS_APP_ID = "ca-app-pub-3940256099942544~1458002511";

function readEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBooleanEnv(name, defaultValue) {
  const value = readEnv(name);

  if (!value) {
    return defaultValue;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function withAdMobPlugin(plugins, adMobOptions) {
  const nextPlugins = Array.isArray(plugins) ? [...plugins] : [];
  const pluginEntry = [
    "react-native-google-mobile-ads",
    {
      androidAppId: adMobOptions.androidAppId,
      iosAppId: adMobOptions.iosAppId,
      delayAppMeasurementInit: true,
    },
  ];

  const existingPluginIndex = nextPlugins.findIndex((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "react-native-google-mobile-ads"
      : plugin === "react-native-google-mobile-ads"
  );

  if (existingPluginIndex >= 0) {
    nextPlugins[existingPluginIndex] = pluginEntry;
    return nextPlugins;
  }

  nextPlugins.push(pluginEntry);
  return nextPlugins;
}

function assertProductionAdMobConfig(adMobOptions) {
  if (process.env.EAS_BUILD_PROFILE !== "production") {
    return;
  }

  if (adMobOptions.useTestIds) {
    throw new Error(
      "Production builds must use real AdMob IDs. Set EXPO_PUBLIC_ADMOB_USE_TEST_IDS=false."
    );
  }

  const missingEnvVars = [
    !adMobOptions.androidAppId && "EXPO_PUBLIC_ADMOB_ANDROID_APP_ID",
    !adMobOptions.androidInterstitialId &&
      "EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID",
    !adMobOptions.androidRewardedId && "EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID",
  ].filter(Boolean);

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing AdMob env vars for production Android build: ${missingEnvVars.join(", ")}`
    );
  }
}

module.exports = () => {
  const baseConfig = appJson.expo ?? {};
  const useTestIds = readBooleanEnv(
    "EXPO_PUBLIC_ADMOB_USE_TEST_IDS",
    process.env.EAS_BUILD_PROFILE !== "production"
  );

  const adMobOptions = {
    useTestIds,
    androidAppId: readEnv("EXPO_PUBLIC_ADMOB_ANDROID_APP_ID"),
    iosAppId: readEnv("EXPO_PUBLIC_ADMOB_IOS_APP_ID"),
    androidInterstitialId: readEnv("EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID"),
    androidRewardedId: readEnv("EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID"),
    iosInterstitialId: readEnv("EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID"),
    iosRewardedId: readEnv("EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID"),
  };

  assertProductionAdMobConfig(adMobOptions);

  return {
    ...baseConfig,
    plugins: withAdMobPlugin(baseConfig.plugins, {
      androidAppId: adMobOptions.androidAppId ?? TEST_ANDROID_APP_ID,
      iosAppId: adMobOptions.iosAppId ?? TEST_IOS_APP_ID,
    }),
    extra: {
      ...(baseConfig.extra ?? {}),
      adMob: {
        useTestIds: adMobOptions.useTestIds,
        androidInterstitialId: adMobOptions.androidInterstitialId ?? null,
        androidRewardedId: adMobOptions.androidRewardedId ?? null,
        iosInterstitialId: adMobOptions.iosInterstitialId ?? null,
        iosRewardedId: adMobOptions.iosRewardedId ?? null,
      },
    },
  };
};

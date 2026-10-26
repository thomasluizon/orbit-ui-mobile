const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins')

const LEGACY_START = /    window = UIWindow\(frame: UIScreen\.main\.bounds\)\n    factory\.startReactNative\(\n      withModuleName: "main",\n      in: window,\n      launchOptions: launchOptions\)\n/

function withIosScene(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        }],
      },
    }
    return mod
  })
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') throw new Error('The iOS scene adapter requires a Swift app delegate')
    const contents = mod.modResults.contents
    if (contents.includes('ExpoReactNativeFactoryProvider')) return mod
    const declaration = 'class AppDelegate: ExpoAppDelegate {'
    if (!contents.includes(declaration) || !LEGACY_START.test(contents)) {
      throw new Error('The Expo app delegate no longer matches the scene adapter anchors')
    }
    mod.modResults.contents = contents
      .replace(declaration, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
      .replace(LEGACY_START, '')
    return mod
  })
}

module.exports = withIosScene

const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('@expo/config-plugins')
const { copyFileSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const plist = require('@expo/plist')

const TARGET = 'OrbitWidgetExtension'
const SOURCES = ['WidgetState.swift', 'WidgetStore.swift', 'WidgetTimeline.swift', 'WidgetColors.generated.swift', 'OrbitWidget.swift']

function widgetIdentifiers(config) {
  const bundleIdentifier = config.ios.bundleIdentifier
  return { bundleIdentifier: `${bundleIdentifier}.widget`, group: `group.${bundleIdentifier}.widget` }
}

function writeWidgetFiles(config, directory) {
  const identifiers = widgetIdentifiers(config)
  const nativeRoot = path.join(__dirname, '../modules/orbit-widget/ios')
  const targetRoot = path.join(directory, TARGET)
  mkdirSync(targetRoot, { recursive: true })
  for (const source of SOURCES) {
    copyFileSync(path.join(nativeRoot, source === 'OrbitWidget.swift' ? 'Extension' : 'Shared', source), path.join(targetRoot, source))
  }
  for (const locale of ['en', 'pt-BR']) {
    mkdirSync(path.join(targetRoot, `${locale}.lproj`), { recursive: true })
    copyFileSync(path.join(nativeRoot, `Extension/${locale}.lproj/Localizable.strings`), path.join(targetRoot, `${locale}.lproj/Localizable.strings`))
  }
  writeFileSync(path.join(targetRoot, `${TARGET}.entitlements`), plist.default.build({
    'com.apple.security.application-groups': [identifiers.group],
  }))
  writeFileSync(path.join(targetRoot, 'Info.plist'), plist.default.build({
    CFBundleDevelopmentRegion: 'en', CFBundleDisplayName: config.name,
    CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0', CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'XPC!',
    CFBundleShortVersionString: config.version, CFBundleVersion: config.ios.buildNumber,
    CFBundleLocalizations: ['en', 'pt-BR'],
    NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' },
    OrbitWidgetAppGroup: identifiers.group, OrbitWidgetURL: `${config.scheme}:///`,
    OrbitWidgetAPIBase: config.ios.bundleIdentifier.endsWith('.staging') ? 'https://api-staging.useorbit.org' : 'https://api.useorbit.org',
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
  }))
}

function configureTarget(project, target, settings) {
  const configurations = project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList].buildConfigurations
  for (const configuration of configurations) {
    Object.assign(project.pbxXCBuildConfigurationSection()[configuration.value].buildSettings, settings)
  }
}

function addWidgetTarget(config, project) {
  const existing = project.pbxTargetByName(`"${TARGET}"`)
  project.hash.project.objects.PBXTargetDependency ??= {}
  project.hash.project.objects.PBXContainerItemProxy ??= {}
  const target = existing ? { pbxNativeTarget: existing } : project.addTarget(TARGET, 'app_extension', TARGET, widgetIdentifiers(config).bundleIdentifier)
  if (!existing) {
    const sources = SOURCES.map((source) => `${TARGET}/${source}`)
    const resources = ['en', 'pt-BR'].map((locale) => `${TARGET}/${locale}.lproj/Localizable.strings`)
    project.addBuildPhase(sources, 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase(resources, 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)
    const group = project.addPbxGroup([...sources, ...resources], TARGET, '""')
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)
  }
  const projectRoot = project.getFirstProject().firstProject
  projectRoot.knownRegions = [...new Set([...projectRoot.knownRegions, '"pt-BR"'])]
  configureTarget(project, target, {
    INFOPLIST_FILE: `${TARGET}/Info.plist`, CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
    IPHONEOS_DEPLOYMENT_TARGET: '17.4', SWIFT_VERSION: '5.9', TARGETED_DEVICE_FAMILY: '"1,2"',
    APPLICATION_EXTENSION_API_ONLY: 'YES', SKIP_INSTALL: 'YES',
    CURRENT_PROJECT_VERSION: config.ios.buildNumber, MARKETING_VERSION: config.version,
    GENERATE_INFOPLIST_FILE: 'NO', CLANG_ENABLE_MODULES: 'YES',
    // WHY: #1732 inherited React Native ccache wrappers resolve through PODS_ROOT on the non-pod widget.
    PODS_ROOT: '"$(SRCROOT)/Pods"',
    PRODUCT_BUNDLE_IDENTIFIER: widgetIdentifiers(config).bundleIdentifier,
    ...(config.ios.appleTeamId ? { DEVELOPMENT_TEAM: config.ios.appleTeamId } : {}),
    ...(process.env.IOS_WIDGET_PROVISIONING_PROFILE_NAME ? {
      CODE_SIGN_STYLE: 'Manual', PROVISIONING_PROFILE_SPECIFIER: `"${process.env.IOS_WIDGET_PROVISIONING_PROFILE_NAME}"`,
    } : {}),
  })
  if (process.env.IOS_PROVISIONING_PROFILE_NAME) {
    configureTarget(project, { pbxNativeTarget: project.getFirstTarget().firstTarget }, {
      CODE_SIGN_STYLE: 'Manual', PROVISIONING_PROFILE_SPECIFIER: `"${process.env.IOS_PROVISIONING_PROFILE_NAME}"`,
    })
  }
  // WHY: #1561 xcode serializes absent file attributes as literal undefined values.
  for (const reference of Object.values(project.pbxFileReferenceSection())) {
    if (typeof reference !== 'object') continue
    for (const key of Object.keys(reference)) if (reference[key] === undefined) delete reference[key]
  }
  return project
}

function withIosWidget(config) {
  config = withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults['com.apple.security.application-groups'] ?? []
    mod.modResults['com.apple.security.application-groups'] = [...new Set([...groups, widgetIdentifiers(config).group])]
    return mod
  })
  config = withInfoPlist(config, (mod) => {
    mod.modResults.OrbitWidgetAppGroup = widgetIdentifiers(config).group
    return mod
  })
  return withXcodeProject(config, (mod) => {
    writeWidgetFiles(config, mod.modRequest.platformProjectRoot)
    mod.modResults = addWidgetTarget(config, mod.modResults)
    return mod
  })
}

module.exports = withIosWidget

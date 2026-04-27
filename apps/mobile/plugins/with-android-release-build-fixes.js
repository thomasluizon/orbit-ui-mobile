const { withAppBuildGradle } = require('@expo/config-plugins')

const STAGING_DIR_MARKER = 'orbit.cmakeBuildStagingDirectory'
const STAGING_DIR_SNIPPET = `android {
    if (project.hasProperty("${STAGING_DIR_MARKER}")) {
        externalNativeBuild {
            cmake {
                buildStagingDirectory = file(project.property("${STAGING_DIR_MARKER}"))
            }
        }
    }
`

function withAndroidReleaseBuildFixes(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod
    }

    if (!mod.modResults.contents.includes(STAGING_DIR_MARKER)) {
      mod.modResults.contents = mod.modResults.contents.replace(/android\s*\{/, STAGING_DIR_SNIPPET)
    }

    return mod
  })
}

module.exports = withAndroidReleaseBuildFixes

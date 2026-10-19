const { withMainApplication } = require('@expo/config-plugins')

const LAUNCH_PREPARATION = `
    if (!BuildConfig.DEBUG) {
      org.useorbit.app.bundle.OrbitDesignBundleModule.prepareEmbeddedLaunch(this)
    }
`

module.exports = function withDesignBundleLaunch(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('Design bundle launch requires MainApplication.kt')
    }
    if (mod.modResults.contents.includes(LAUNCH_PREPARATION)) return mod
    const anchor = '    super.onCreate()'
    if (!mod.modResults.contents.includes(anchor)) {
      throw new Error('MainApplication.kt is missing the application creation anchor')
    }
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${anchor}\n${LAUNCH_PREPARATION}`)
    return mod
  })
}

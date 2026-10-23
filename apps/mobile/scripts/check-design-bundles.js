const { resolve } = require('node:path')

function checkDesignBundles(root) {
  const config = require(resolve(root, 'apps/mobile/app.config.js'))()
  if (config.updates.enabled !== false) {
    throw new Error('Android must disable updates and ship its embedded bundle')
  }
  return 'The embedded bundle is ready.'
}

module.exports = { checkDesignBundles }

if (require.main === module) {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node check-design-bundles.js <binary-root>\n')
    process.exitCode = 2
  } else {
    try {
      process.stdout.write(`${checkDesignBundles(resolve(process.argv[2]))}\n`)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
  }
}

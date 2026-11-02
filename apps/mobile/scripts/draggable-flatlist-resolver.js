const path = require('path')

function draggableFlatListNativeAdapter(moduleName, originModulePath, platform) {
  const origin = originModulePath.replace(/\\/g, '/')
  if (platform === 'android' && moduleName === 'react-native' &&
      /\/react-native-draggable-flatlist\/(src|lib\/(module|commonjs))\//.test(origin)) {
    return path.resolve(__dirname, '../lib/draggable-flatlist-native.ts')
  }
}

module.exports = { draggableFlatListNativeAdapter }

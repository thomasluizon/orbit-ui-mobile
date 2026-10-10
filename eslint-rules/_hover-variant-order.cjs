const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl']
const VARIANT_ORDER = ['*', '**', 'group', 'first-letter', 'first-line', 'marker', 'selection',
  'file', 'placeholder', 'backdrop', 'details-content', 'before', 'after', 'first', 'last', 'only',
  'odd', 'even', 'first-of-type', 'last-of-type', 'only-of-type', 'visited', 'target', 'open',
  'default', 'checked', 'indeterminate', 'placeholder-shown', 'autofill', 'optional', 'required',
  'valid', 'invalid', 'user-valid', 'user-invalid', 'in-range', 'out-of-range', 'read-only', 'empty',
  'focus-within', 'hover', 'focus', 'focus-visible', 'active', 'enabled', 'disabled', 'inert',
  'aria', 'data', 'motion-safe', 'motion-reduce', 'contrast-more', 'contrast-less', ...BREAKPOINTS,
  'portrait', 'landscape', 'ltr', 'rtl', 'dark', 'starting', 'print', 'forced-colors',
  'inverted-colors', 'pointer-none', 'pointer-coarse', 'pointer-fine', 'any-pointer-none',
  'any-pointer-coarse', 'any-pointer-fine', 'noscript']
const MEDIA_VARIANTS = new Set(['motion-safe', 'motion-reduce', 'contrast-more', 'contrast-less',
  ...BREAKPOINTS, 'portrait', 'landscape', 'dark', 'starting', 'print', 'forced-colors',
  'inverted-colors', 'pointer-none', 'pointer-coarse', 'pointer-fine', 'any-pointer-none',
  'any-pointer-coarse', 'any-pointer-fine', 'noscript'])
const GROUP_VARIANT = /^group-(hover|(?:aria|data)-(?:[\w-]+|\[[^\]]+\]))(?:\/([\w-]+))?$/

function variantRoot(variant) {
  if (GROUP_VARIANT.test(variant)) return 'group'
  if (/^(?:aria|data)-(?:[\w-]+|\[[^\]]+\])$/.test(variant)) return variant.slice(0, variant.indexOf('-'))
  if (variant.startsWith('[') && variant.endsWith(']') && variant.includes('&')) return 'arbitrary'
  return variant
}

function isSupportedVariant(variant) {
  const root = variantRoot(variant)
  return (root === 'arbitrary' && variant.startsWith('[')) || (VARIANT_ORDER.includes(root) && !['aria', 'data', 'group'].includes(root))
    || (root === 'group' && GROUP_VARIANT.test(variant))
    || ((root === 'aria' || root === 'data') && variant !== root)
}

function comparisonValue(variant, root) {
  const value = root === 'arbitrary' ? variant : variant.slice(root.length + 1)
  return value.startsWith('[') ? value.slice(1, -1).replace(/\\_|_/g, (match) => match === '_' ? ' ' : '_') : value
}

function compareVariants(left, right) {
  if (left === right) return 0
  const leftRoot = variantRoot(left)
  const rightRoot = variantRoot(right)
  if (leftRoot !== rightRoot) {
    if (leftRoot === 'arbitrary') return 1
    if (rightRoot === 'arbitrary') return -1
    return VARIANT_ORDER.indexOf(leftRoot) - VARIANT_ORDER.indexOf(rightRoot)
  }
  if (leftRoot === 'group') {
    const [, leftState, leftModifier = ''] = GROUP_VARIANT.exec(left)
    const [, rightState, rightModifier = ''] = GROUP_VARIANT.exec(right)
    const stateOrder = compareVariants(leftState, rightState)
    return stateOrder || (leftModifier < rightModifier ? -1 : leftModifier > rightModifier ? 1 : 0)
  }
  const leftValue = left.slice(leftRoot.length + 1)
  const rightValue = right.slice(rightRoot.length + 1)
  if (leftRoot === 'aria' || leftRoot === 'data') {
    if (leftValue.startsWith('[') !== rightValue.startsWith('[')) return leftValue.startsWith('[') ? 1 : -1
  }
  const leftSelector = comparisonValue(left, leftRoot)
  const rightSelector = comparisonValue(right, rightRoot)
  return leftSelector < rightSelector ? -1 : leftSelector > rightSelector ? 1 : 0
}

module.exports = { BREAKPOINTS, VARIANT_ORDER, MEDIA_VARIANTS, isSupportedVariant, compareVariants }

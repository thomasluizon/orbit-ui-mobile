/**
 * Local ESLint rule: icons render at 16, 20 or 24 and nowhere between.
 *
 * DESIGN.md "Icons": the sizes are 16, 20 and 24, with 24 the default. Tabler is
 * drawn on a 24 grid, so an off-grid size such as 22 renders with fractional
 * scaling and looks soft. DESIGN.md "Enforcement" lists this as a gate.
 *
 * THIS RULE ASKS THE TYPE CHECKER, NOT THE AST. An earlier revision resolved the
 * JSX name back to the icon barrel by walking syntax, and every Pullfrog round on
 * ui PR #751 found one more hop the repository actually uses: the barrel alias,
 * `const Icon = map[k]`, `as const`, descriptor arrays, and a `.map()` callback
 * whose root identifier is the parameter rather than the array. That chain has no
 * fixed length, so no set of AST special cases closes it. #368 replaced the walk
 * with one question the checker answers the same way for every hop: what is the
 * type of this JSX tag?
 *
 * An icon is identified by its PROPS TYPE. Every Tabler icon is declared
 * `ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>`, so the
 * component's own type symbol is React's, not Tabler's, and is useless here.
 * `IconProps` IS declared in the Tabler package, so the props are the part that
 * proves the icon. That also drops the hand-kept list of mark names the AST
 * revision needed: `OrbitMark` and `AstraGlyph` are local components whose props
 * are declared locally, so they are excluded because of what they are, not
 * because they were named. DESIGN.md wants exactly that, since the mark "is
 * neither type nor an icon, so it answers to neither the type scale nor the 24
 * icon grid".
 *
 * WHAT IT DOES NOT SEE, stated rather than guessed at:
 *   - a file linted without type information. The rule reports nothing at all
 *     there, because every answer it could give would be a guess.
 *   - a `size` that is not statically known. `size={iconSize}` is a value the checker knows
 *     only as `number`, and a rule cannot read a runtime variable.
 *   - a string `size` carrying a unit or a percentage, such as `size="1.5rem"`. Tabler accepts
 *     it, but it is not a value this rule can place on a 16/20/24 grid.
 *   - an icon whose props type resolves to `any`, which carries no declaration
 *     to attribute.
 *   - class names reached through variables, spreads, or runtime interpolation.
 *     Only literal string parts of `className` are scanned, including branches
 *     and class-builder arguments; class-builder execution is not evaluated.
 *   - arbitrary selector variants (`[&_path]:`), child selectors (`*:` / `**:`),
 *     and pseudo-element variants (`before:` etc.). Those can size another node.
 *     Arbitrary selectors are not interpreted, even if one would target the icon.
 *     Named variants are treated as conditions; custom variant definitions are not read.
 *   - classes other than `size-[Npx]`, `w-[Npx]` and `h-[Npx]`, optionally under
 *     conditions or with a trailing important `!`. Other units, CSS variables,
 *     calc(), theme spacing classes, and legacy leading `!` are not resolved.
 *     Neither are styles or stylesheets.
 *   - which declaration wins the CSS cascade. Each off-grid literal is reported
 *     even if another class or a style would override it at runtime.
 */

const { collectStaticStrings, getAttribute, getAttributeValueNode, getElementName } = require('./_jsx-strings.cjs')

const ALLOWED = new Set([16, 20, 24])

// Both barrels re-export from these two packages and nothing else, so a declaration
// inside either one is the icon set itself.
const TABLER_DECLARATION = /[\\/]@tabler[\\/]icons-react(?:-native)?[\\/]/

// `IconProps.size` is `string | number`, so `size="22"` is a supported form that reaches the
// SVG as width and height 22 and renders exactly as softly as `size={22}`. A string that is not
// a bare number is a length this rule cannot place on the grid, so it stays silent instead.
const BARE_NUMBER = /^\d+(?:\.\d+)?$/
const staticSize = (node) => {
  if (!node) return null
  if (node.type === 'JSXExpressionContainer') return staticSize(node.expression)
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const cooked = node.quasis[0]?.value.cooked ?? ''
    return BARE_NUMBER.test(cooked.trim()) ? Number(cooked) : null
  }
  if (node.type !== 'Literal') return null
  if (typeof node.value === 'number') return node.value
  if (typeof node.value === 'string' && BARE_NUMBER.test(node.value.trim())) return Number(node.value)
  return null
}

// These built-in variants select pseudo-elements, not the icon's width or height.
const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'first-letter', 'first-line', 'marker', 'selection',
  'file', 'placeholder', 'backdrop', 'details-content',
])

// Colons inside arbitrary values belong to the condition or selector, not the stack.
const splitVariants = (token) => {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let index = 0; index < token.length; index++) {
    const character = token[index]
    if (character === '\\') {
      index++
    } else if (quote) {
      if (character === quote) quote = null
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '[' || character === '(') {
      depth++
    } else if (character === ']' || character === ')') {
      depth--
    } else if (character === ':' && depth === 0) {
      parts.push(token.slice(start, index))
      start = index + 1
    }
  }
  parts.push(token.slice(start))
  return parts
}

const iconUtility = (token) => {
  const variants = splitVariants(token)
  const utility = variants.pop()
  // Standalone brackets carry selectors, except at-rules, which carry conditions.
  // Brackets within named variants (has-[], group-[], data-[]) still condition this node.
  if (variants.some((variant) => PSEUDO_ELEMENTS.has(variant) || /^\*{1,2}$/.test(variant) ||
    (variant.startsWith('[') && !variant.startsWith('[@')))) return null
  return utility.endsWith('!') ? utility.slice(0, -1) : utility
}

// Check each dimension independently: a legal width cannot excuse an off-grid height.
// Repeated values (including a square w/h pair) need only one diagnostic per attribute.
const classSizes = (attribute) => {
  const sizes = new Set()
  for (const part of collectStaticStrings(getAttributeValueNode(attribute))) {
    for (const token of part.split(/\s+/)) {
      const match = /^(?:size|w|h)-\[(\d+(?:\.\d+)?)px\]$/.exec(iconUtility(token))
      if (match && !ALLOWED.has(Number(match[1]))) sizes.add(Number(match[1]))
    }
  }
  return [...sizes]
}

// A union or an intersection has to be opened up: an icon map indexed at render time
// gives a union of icon components, and Tabler's own props arrive as
// `IconProps & RefAttributes<SVGSVGElement>`.
const constituentsOf = (type) => {
  if (!type) return []
  if (type.isUnionOrIntersection?.()) return type.types ?? []
  return [type]
}

const declaredInTabler = (symbol) =>
  Boolean(symbol?.declarations?.some((declaration) => TABLER_DECLARATION.test(declaration.getSourceFile?.().fileName ?? '')))

// True when any part of this props type is declared in the Tabler package. `IconProps`
// carries its own symbol there, so this never has to know a property name.
const isTablerProps = (type) =>
  constituentsOf(type).some((part) => declaredInTabler(part.aliasSymbol) || declaredInTabler(part.getSymbol?.()))

const isTablerIcon = (type, services, node) =>
  constituentsOf(type).some((component) => {
    const signatures = [...(component.getCallSignatures?.() ?? []), ...(component.getConstructSignatures?.() ?? [])]
    return signatures.some((signature) => {
      const parameter = signature.parameters?.[0]
      if (!parameter) return false
      return isTablerProps(services.getTypeOfSymbolAtLocation(parameter, node))
    })
  })

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Icon size props and arbitrary pixel classes must be 16, 20 or 24 (DESIGN.md "Icons").',
    },
    schema: [],
    messages: {
      offGridIconSize:
        'Icon size {{size}} is off the grid. DESIGN.md "Icons" allows 16, 20 and 24 only, with 24 the default: Tabler is drawn on a 24 grid, so an off-grid size renders with fractional scaling and looks soft.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices
    // Without a program there is no type to ask about. Reporting on the name alone is
    // what produced the false positives this rule exists to stop, so it stays silent.
    if (!services?.program || typeof services.getTypeAtLocation !== 'function') return {}

    return {
      JSXOpeningElement(node) {
        if (!getElementName(node)) return

        // The cheap AST test runs FIRST and rejects almost every element in the
        // repository, so the checker is asked only about the few tags that carry an
        // off-grid literal size prop or class. That keeps a type-aware rule affordable.
        const sizeAttribute = getAttribute(node, 'size')
        const size = staticSize(getAttributeValueNode(sizeAttribute))
        const classAttribute = getAttribute(node, 'className')
        const offGridClasses = classSizes(classAttribute)
        const offGridProp = size !== null && !ALLOWED.has(size)
        if (!offGridProp && offGridClasses.length === 0) return

        if (!isTablerIcon(services.getTypeAtLocation(node.name), services, node.name)) return

        if (offGridProp) {
          context.report({ node: sizeAttribute, messageId: 'offGridIconSize', data: { size: String(size) } })
        }
        for (const classSize of offGridClasses) {
          context.report({ node: classAttribute, messageId: 'offGridIconSize', data: { size: String(classSize) } })
        }
      },
    }
  },
}

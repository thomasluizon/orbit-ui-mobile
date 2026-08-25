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
 */

const { getAttribute, getAttributeValueNode, getElementName } = require('./_jsx-strings.cjs')

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
      description: 'Icon `size` must be 16, 20 or 24 (DESIGN.md "Icons": Tabler is drawn on a 24 grid).',
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
        // off-grid literal size. That is what keeps a type-aware rule affordable.
        const sizeAttribute = getAttribute(node, 'size')
        if (!sizeAttribute) return

        const size = staticSize(getAttributeValueNode(sizeAttribute))
        if (size === null || ALLOWED.has(size)) return

        if (!isTablerIcon(services.getTypeAtLocation(node.name), services, node.name)) return

        context.report({ node: sizeAttribute, messageId: 'offGridIconSize', data: { size: String(size) } })
      },
    }
  },
}

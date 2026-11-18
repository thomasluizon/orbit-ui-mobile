import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { completionControls } from './tool-schema.mjs'

const catalog = parse(readFileSync(new URL('./catalog.yaml', import.meta.url), 'utf8'))
export const { habitSetupBinding } = catalog

// The path of a run. The block-first path is the API without the ai_change_plan flag; the change-plan path is the API
// with that flag on for the account (orbit-api FeatureFlagKeys.AiChangePlan, which ChatContext.Policy resolves through TurnPolicy.For). The API sends
// other tool declarations on each path, so each path has its own lists of the catalog.
export const RUN_PATH_VARIABLE = 'ORBIT_EVAL_ASTRA_PATH'
export const BLOCK_FIRST_PATH = 'block-first'
export const CHANGE_PLAN_PATH = 'change-plan'
export const RUN_PATHS = [BLOCK_FIRST_PATH, CHANGE_PLAN_PATH]
export const CHANGE_PLAN_FLAG = 'ai_change_plan'

// The path that one run measures. A run that names no path measures the block-first path.
export function runPathOf(environment = process.env) {
  const named = environment[RUN_PATH_VARIABLE]
  if (named === undefined) return BLOCK_FIRST_PATH
  if (!RUN_PATHS.includes(named)) {
    throw new Error(`${RUN_PATH_VARIABLE} is "${named}"; name ${BLOCK_FIRST_PATH}, the default, for the path without ${CHANGE_PLAN_FLAG}, or ${CHANGE_PLAN_PATH} for the path of that flag.`)
  }
  return named
}

// The path of a summary. A summary written before summaries named their path measured the block-first path.
export const pathOf = (summary) => summary.path ?? BLOCK_FIRST_PATH

const { tools, legacyTools, postReadTools, habitSetupTools, offerTools = [], offerPostReadTools = [], offerHabitSetupTools = [] } = catalog
const { changeKinds, planTitleArgument, wrapperName, changesArgument, shapes } = catalog.changePlan
const kindOf = new Map(changeKinds.map((kind) => [kind.name, kind]))

// A kind call of the kinds shape without its plan title, which is an argument of the model call only.
function withoutPlanTitle(tool) {
  const { properties, required } = tool.function.parameters
  return { ...tool, function: { ...tool.function, parameters: { ...tool.function.parameters,
    properties: Object.fromEntries(Object.entries(properties).filter(([name]) => name !== planTitleArgument)),
    required: required.filter((name) => name !== planTitleArgument) } } }
}

// One declaration for each alternative of the wrapper: the kind of the alternative, with the arguments of that kind. The
// registry facts of the kind come from changeKinds, because the wrapper itself has no registry entry.
function wrappedKinds(wrapper) {
  const root = wrapper.function.parameters
  return root.properties[changesArgument].items.anyOf.map((change) => {
    const { name, writes, sensitiveFields } = kindOf.get(change.properties.kind.enum[0])
    return { type: wrapper.type, writes, sensitiveFields, function: { name, description: change.description,
      strict: wrapper.function.strict, parameters: { ...change.properties.arguments, $defs: root.$defs } } }
  })
}

// The declarations that a traced call of the change-plan path is read against. The eval trace records each change of a
// change list as one call with the name of its kind and the arguments of the change, in each shape (orbit-api
// ChangeDeclarations.Read). So a traced change is no model call: the kinds shape removes the plan title, and the wrapper
// shape holds each change as one item of its list. The wrapper stays, because a wrapper call with no change is a traced call.
function traceList(list) {
  const wrapper = list.find((tool) => tool.function.name === wrapperName)
  return [...list.map((tool) => kindOf.has(tool.function.name) ? withoutPlanTitle(tool) : tool),
    ...(wrapper ? wrappedKinds(wrapper) : [])]
}

// The lists of one path, which a reader takes only through catalogsOf, one set for each declaration shape that the catalog
// holds for it. The change-plan path keeps one ask declaration for the whole turn (orbit-api RefreshAskSchema returns no
// update there), so it has no post-read list and no habit-setup list. It has one set for each shape of its change list
// (orbit-api AI:ChangePlanShape). No run names its shape, so a traced call of that path is valid when the lists of one
// shape accept it.
const pathLists = {
  [BLOCK_FIRST_PATH]: [{ tools, legacyTools, postReadTools, habitSetupTools, offerTools, offerPostReadTools, offerHabitSetupTools }],
  [CHANGE_PLAN_PATH]: Object.values(shapes).map((lists) => ({
    ...Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, traceList(list)])),
    postReadTools: [], habitSetupTools: [], offerPostReadTools: [], offerHabitSetupTools: [] })),
}
export const catalogsOf = (path) => pathLists[path]

// The exporter takes the write class and the sensitive fields of a tool from its registry entry, which no flag changes,
// so one map of each classifies the calls of both paths.
const allTools = RUN_PATHS.flatMap((path) => pathLists[path].flatMap((lists) => Object.values(lists).flat()))
export const toolCompletionControls = new Map(tools.map((tool) => [tool.function.name, completionControls(tool.function.parameters)]))
export const toolWrites = new Map(allTools.map((tool) => [tool.function.name, tool.writes]))
export const normalizeField = (name) => name.replaceAll('_', '').replaceAll('-', '').toLowerCase()
export const toolSensitiveFields = new Map(allTools.map((tool) => [tool.function.name, new Set(tool.sensitiveFields)]))

// Both eval runs read the tool lists of this catalog: the launch corpus grades tool calls against them, and both runs
// keep only the declared, non-sensitive call arguments in their private evidence (evidence.mjs). So both refuse, with one
// check and one message, an API built from a commit other than the one that the catalog was generated at.
export function requireCatalogCommit(servedCommit) {
  if (!/^[a-f0-9]{40}$/u.test(catalog.apiCommit) || catalog.apiCommit !== servedCommit) {
    throw new Error(`Astra catalog ${catalog.apiCommit} differs from API ${servedCommit}. Regenerate from a clean API checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.`)
  }
}

export function observableSchema(schema, sensitiveFields) {
  if (Array.isArray(schema)) return schema.map((entry) => observableSchema(entry, sensitiveFields))
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => {
    if (key === 'properties') return [key, Object.fromEntries(Object.entries(value)
      .filter(([name]) => !sensitiveFields.has(normalizeField(name)))
      .map(([name, property]) => [name, observableSchema(property, sensitiveFields)]))]
    if (key === 'required') return [key, value.filter((name) => !sensitiveFields.has(normalizeField(name)))]
    return [key, observableSchema(value, sensitiveFields)]
  }))
}

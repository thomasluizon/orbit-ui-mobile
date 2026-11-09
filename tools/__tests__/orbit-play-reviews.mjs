import { generateKeyPairSync, verify } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"
import { collectReviewCycle, importPlayReviews, playAccessToken, readPlayReviews, PLAY_PACKAGES } from "../orbit-play-reviews.mjs"
import { acknowledgeIntake, intakeSource, saveIntakeSource } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root, REPO_ROOT } from "./_harness.mjs"

const ok = (stdout) => ({ status: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "", timedOut: false })
const failed = (stderr, status = 1) => ({ status, stdout: "", stderr, timedOut: false })

const cycleCheckout = (label) => {
  const checkout = join(root, "play-cycle", label)
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "cycle", sleep: true, autoWork: true, remaining: [] }, checkout)
  return checkout
}

/** One Play review page through the real reader, so the artifact carries the producer's own fields. */
const playArtifact = async (failStaging = false) => {
  const snapshot = await readPlayReviews("access", async (address) => new URL(address).pathname.includes(".staging")
    ? (failStaging ? new Response("denied", { status: 403 }) : Response.json({}))
    : Response.json({ reviews: [{ reviewId: "r2", authorName: "Reviewer", comments: [{ userComment: { text: "Bom", starRating: 5, lastModified: { seconds: "1", nanos: 0 } } }] }] }))
  return { ...snapshot, collectedAt: "2026-11-08T22:45:20.000Z" }
}

/**
 * A gh stand-in. The run list fields and the in-progress empty conclusion, the artifact name list
 * from the code's --jq filter, and the artifact files are copied from live orbit-play-reviews.yml runs.
 */
const cycleRunner = (checkout, play, { artifacts = ["orbit-app-store-reviews", "orbit-play-reviews"], dispatchStatus = 0, completed = true, runs } = {}) => {
  const log = []
  let cycle = null
  const appStore = { appId: "6831372835", collectedAt: "2026-11-08T22:45:45.018Z", reviews: [] }
  const run = async (file, args) => {
    log.push({ file, args, workflowCycle: intakeSource("play", checkout).workflowCycle })
    if (args[0] === "workflow") { cycle = args.at(-1).slice("cycle=".length); return dispatchStatus === 0 ? ok("") : failed("dispatch refused by the stand-in", dispatchStatus) }
    if (args[0] === "run" && args[1] === "list") {
      return ok(runs ?? [{ conclusion: "success", databaseId: 42516228559, displayTitle: "Orbit review intake 25768799-c1-20261108T1940", status: "completed" },
        { conclusion: completed ? "success" : "", databaseId: 42531799858, displayTitle: `Orbit review intake ${cycle}`, status: completed ? "completed" : "in_progress" }])
    }
    if (args[0] === "api") return ok(artifacts)
    if (args[0] === "run" && args[1] === "download") {
      writeFileSync(join(args[6], `${args[4]}.json`), JSON.stringify(args[4] === "orbit-play-reviews" ? play : appStore))
      return ok("")
    }
    return failed(`unexpected ${file} ${args.join(" ")}`)
  }
  return { run, log }
}

const cycleCases = async () => {
  const play = await playArtifact()
  const reviewId = play.reviews[0].id
  const clock = Date.parse("2026-11-08T23:00:00.000Z")
  const checkout = cycleCheckout("complete")
  const runner = cycleRunner(checkout, play)
  const result = await collectReviewCycle({ run: runner.run, repoRoot: checkout, sleep: async () => {}, now: () => clock })
  const dispatch = runner.log.find((call) => call.args[0] === "workflow")
  T("play cycle: the cycle is persisted before dispatch", /^review-20261108T230000-[0-9a-f]{6}$/.test(dispatch.workflowCycle) &&
    JSON.stringify(dispatch.args) === JSON.stringify(["workflow", "run", "orbit-play-reviews.yml", "--ref", "main", "-f", `cycle=${dispatch.workflowCycle}`]), JSON.stringify(dispatch))
  const downloads = runner.log.filter((call) => call.args[1] === "download")
  T("play cycle: only the exact cycle run is downloaded, both artifacts", downloads.length === 2 && downloads.every((call) => call.args[2] === "42531799858"))
  T("play cycle: imported reviews become keys and pending items, and the cycle clears", JSON.stringify(result.keys) === JSON.stringify([`play ${reviewId}`]) &&
    result.pending[0].source === "play" && result.pending[0].id === reviewId && result.failure === undefined && result.backfillRequiredSince === null &&
    intakeSource("play", checkout).workflowCycle === undefined && intakeSource("play", checkout).lastCollectedAt === "2026-11-08T22:45:20.000Z" &&
    intakeSource("appStore", checkout).lastCollectedAt === "2026-11-08T22:45:45.018Z", JSON.stringify(result))

  const resumed = cycleCheckout("resume")
  saveIntakeSource("play", { ...intakeSource("play", resumed), workflowCycle: "4b980cf7-c1-20261108T2245" }, resumed)
  const resume = cycleRunner(resumed, play, { runs: [{ conclusion: "success", databaseId: 42531799858, displayTitle: "Orbit review intake 4b980cf7-c1-20261108T2245", status: "completed" }] })
  await collectReviewCycle({ run: resume.run, repoRoot: resumed, sleep: async () => {} })
  T("play cycle: a persisted cycle reuses its run without a dispatch", !resume.log.some((call) => call.args[0] === "workflow") &&
    resume.log.some((call) => call.args[1] === "download" && call.args[2] === "42531799858") && intakeSource("play", resumed).workflowCycle === undefined)

  const partialCheckout = cycleCheckout("partial")
  const partial = await collectReviewCycle({ run: cycleRunner(partialCheckout, await playArtifact(true)).run, repoRoot: partialCheckout, sleep: async () => {}, now: () => clock })
  T("play cycle: a partial Play collection imports the reviews and names the failure", partial.keys.length === 1 &&
    partial.failure === "Play review collection failed: org.useorbit.app.staging Play reviews failed (HTTP 403)", JSON.stringify(partial))

  for (const [label, options, expected, keepsCycle] of [
    ["dispatch", { dispatchStatus: 1 }, "gh workflow run failed (exit 1): dispatch refused by the stand-in", false],
    ["artifact", { artifacts: ["orbit-app-store-reviews"] }, "The review workflow run ended success without the orbit-play-reviews artifact", false],
    ["slow", { completed: false }, "The review workflow run did not complete within 600 seconds", true],
    ["missing", { runs: [] }, "The review workflow run was not found within 600 seconds", false],
  ]) {
    const failing = cycleCheckout(label)
    let elapsed = 0
    let message = ""
    try {
      await collectReviewCycle({ run: cycleRunner(failing, play, options).run, repoRoot: failing,
        sleep: async (milliseconds) => { elapsed += milliseconds }, now: () => clock + elapsed })
    } catch (error) { message = error.message }
    T(`play cycle: a ${label} failure has a stable message`, message === expected, message)
    T(`play cycle: a ${label} failure ${keepsCycle ? "keeps" : "clears"} its cycle`, Boolean(intakeSource("play", failing).workflowCycle) === keepsCycle)
  }
}

export const cases = async () => {
  await cycleCases()
  const schemas = JSON.parse(readFileSync(new URL("./fixtures/auto-work-google-schemas.json", import.meta.url), "utf8"))
  T("play: fixture pagination and modification fields derive from discovery", schemas.play.schemas.ReviewsListResponse.properties.tokenPagination.$ref === "TokenPagination" &&
    schemas.play.schemas.Timestamp.properties.seconds.type === "string")
  const network = []
  let failStaging = false
  const request = async (address, options) => {
    const url = new URL(address)
    network.push({ url, options })
    if (failStaging && url.pathname.includes(".staging")) return new Response("secret", { status: 403 })
    const second = url.searchParams.has("token")
    return Response.json({ reviews: [{ reviewId: second ? "r2" : "r1", authorName: "Reviewer", comments: [
      { userComment: { text: "Muito bom", reviewerLanguage: "pt-BR", starRating: 5, lastModified: { seconds: "100", nanos: 5 } } },
      { developerComment: { text: "Previous reply", lastModified: { seconds: "101" } } },
    ] }], ...(second ? {} : { tokenPagination: { nextPageToken: "next" } }) })
  }
  const snapshot = await readPlayReviews("access", request)
  T("play: both packages and all review pages are read", snapshot.reviews.length === 4 && snapshot.failures.length === 0 && network.length === 4)
  T("play: collection is GET-only and never posts replies", network.every(({ url, options }) => options.method === "GET" && url.pathname.endsWith("/reviews")))
  const checkout = join(root, "play-intake")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "play-parent", sleep: true, autoWork: true, intake: { play: { workflowCycle: "first-cycle" } } }, checkout)
  const first = importPlayReviews(snapshot, checkout)
  T("play: first-cycle workflow metadata initializes source maps and survives import", intakeSource("play", checkout).workflowCycle === "first-cycle" && typeof intakeSource("play", checkout).completed === "object")
  T("play: tied timestamps keep each independent review", first.pending.length === 4)
  const id = first.pending[0].id
  acknowledgeIntake("play", { id, classification: "praise", person: true, reply: "Obrigada!" }, checkout)
  writeRunState({ sessionId: "play-child", sleep: true, relay: { from: "play-parent" } }, checkout)
  T("play: importing again after relay does not repeat completed reviews", importPlayReviews(snapshot, checkout).pending.length === 3)
  const edited = structuredClone(snapshot)
  edited.reviews[0].id = edited.reviews[0].id.replace("100.000000005", "102.000000000")
  edited.reviews[0].version = "102.000000000"
  T("play: an edited review is new even with the same review id", importPlayReviews(edited, checkout).pending.length === 4)
  failStaging = true
  const partial = await readPlayReviews("access", request)
  const partialImport = importPlayReviews(partial, checkout)
  T("play: one package failure preserves the other's reviews and reports it", partial.reviews.length === 2 && partialImport.failures[0].packageName === PLAY_PACKAGES[1] && !partialImport.failures[0].reason.includes("secret"))
  const gap = structuredClone(snapshot)
  gap.collectedAt = new Date(Date.parse(snapshot.collectedAt) + 8 * 86400_000).toISOString()
  T("play: a collection gap outside the API window is explicit", importPlayReviews(gap, checkout).backfillRequiredSince === snapshot.collectedAt)
  T("play: per-package high-water timestamps survive review receipts", intakeSource("play", checkout).highWater[PLAY_PACKAGES[0]] === "102.000000000")
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  let claims
  const access = await playAccessToken({ client_email: "publisher@example.org", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }, async (url, options) => {
    const assertion = options.body.get("assertion")
    const [header, payload, signature] = assertion.split(".")
    claims = JSON.parse(Buffer.from(payload, "base64url"))
    T("play: service-account JWT is signed with the publishing key", String(url) === "https://oauth2.googleapis.com/token" && verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")))
    return Response.json({ access_token: "access" })
  })
  T("play: JWT requests publishing scope without mailbox impersonation", access === "access" && claims.sub === undefined && claims.exp - claims.iat === 3600 && claims.scope === "https://www.googleapis.com/auth/androidpublisher")
  const workflow = yaml.load(readFileSync(join(REPO_ROOT, ".github/workflows/orbit-play-reviews.yml"), "utf8"))
  T("play: workflow is manual and trusts only main", Object.keys(workflow.on).join(",") === "workflow_dispatch" &&
    Object.values(workflow.jobs).every((job) => job.if.startsWith("github.ref == 'refs/heads/main'")) &&
    workflow.jobs.reviews.if.includes("inputs.replies == ''") && workflow.jobs.replies.if.includes("inputs.replies != ''"))
  const appStore = workflow.jobs["app-store-reviews"]
  const appStoreGate = appStore.steps[0]
  const readsProductionEnvironment = (job) => job.environment?.name === "ios-production" && job.environment.deployment === false
  T("app store: reviews read the app id and key from the production iOS environment without a deployment record", readsProductionEnvironment(appStore) &&
    appStore.if === "github.ref == 'refs/heads/main' && inputs.replies == ''" &&
    appStoreGate.env?.ORBIT_IOS_APP_STORE_ID === "${{ vars.ORBIT_IOS_APP_STORE_ID }}" &&
    appStore.steps.slice(1).every((step) => step.if === `steps.${appStoreGate.id}.outputs.configured == 'true'`) &&
    appStore.steps.at(-1).with.name === "orbit-app-store-reviews")
  const replies = workflow.jobs.replies
  const replyStep = replies.steps.find((step) => step.env?.REVIEW_REPLIES)
  T("app store: replies read the app id and key from the production iOS environment without a deployment record", readsProductionEnvironment(replies) &&
    replyStep.env.ORBIT_IOS_APP_STORE_ID === "${{ vars.ORBIT_IOS_APP_STORE_ID }}" &&
    replyStep.env.APP_STORE_CONNECT_API_PRIVATE_KEY === "${{ secrets.APP_STORE_CONNECT_API_PRIVATE_KEY }}")
  T("play: key stays in the collection step and artifact expires", workflow.jobs.reviews.steps.filter((step) => step.env?.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).length === 1 &&
    workflow.jobs.reviews.steps.at(-1).with["retention-days"] === 1 && workflow.permissions.contents === "read")
}

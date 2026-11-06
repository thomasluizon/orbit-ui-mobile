import { generateKeyPairSync, verify } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"
import { importPlayReviews, playAccessToken, readPlayReviews, PLAY_PACKAGES } from "../orbit-play-reviews.mjs"
import { acknowledgeIntake, intakeSource } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root, REPO_ROOT } from "./_harness.mjs"

export const cases = async () => {
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

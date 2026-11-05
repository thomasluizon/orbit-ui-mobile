import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { importReviewReplies, postReviewReply, prepareReviewReply } from "../orbit-review-replies.mjs"
import { readAppStoreReviews } from "../orbit-app-store-reviews.mjs"
import { reviewItem } from "../orbit-play-reviews.mjs"
import { acknowledgeIntake, intakeSource, saveIntakeSource } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root, toolPath } from "./_harness.mjs"

export const cases = async () => {
  const googleSchemas = JSON.parse(readFileSync(new URL("./fixtures/auto-work-google-schemas.json", import.meta.url)))
  const appleSchemas = JSON.parse(readFileSync(new URL("./fixtures/auto-work-apple-schemas.json", import.meta.url)))
  T("store reply: reply fixtures derive from the producer schemas", googleSchemas.play.schemas.DeveloperComment.properties.text.type === "string" &&
    appleSchemas.schemas.CustomerReviewResponseV1.properties.attributes.properties.responseBody.type === "string")
  const checkout = join(root, "review-replies")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "review-parent", sleep: true, autoWork: true }, checkout)
  const review = { reviewId: "r1", authorName: "Reviewer", comments: [{ userComment: { text: "Thanks!", lastModified: { seconds: "100", nanos: 0 }, starRating: 5 } }] }
  const item = reviewItem("org.useorbit.app", review, review.comments[0].userComment)
  saveIntakeSource("play", { completed: {}, pending: { [item.id]: item }, highWater: null }, checkout)
  const receipt = { source: "play", id: item.id, person: true, classification: "praise", replyKind: "thanks", clear: true, concerns: [], reply: "Thank you!" }
  const [prepared] = prepareReviewReply(receipt, checkout)
  writeRunState({ sessionId: "review-child", sleep: true, relay: { from: "review-parent" } }, checkout)
  T("store reply: prepared request survives relay", JSON.stringify(intakeSource("play", checkout).pending[item.id].replyRequest) === JSON.stringify(prepared))
  const calls = []
  const request = async (address, options) => {
    calls.push({ address: String(address), options })
    return options.method === "POST" ? new Response(null, { status: 200 }) : Response.json(review)
  }
  await postReviewReply(prepared, "token", request)
  T("store reply: clear Play reply uses the discovered endpoint and body", calls.length === 2 && calls[1].address.endsWith("/reviews/r1:reply") && JSON.parse(calls[1].options.body).replyText === receipt.reply)
  for (const changed of [{ ...receipt, classification: "billing" }, { ...receipt, concerns: ["complaint"] }, { ...receipt, clear: false }]) {
    let contacted = false
    let refused = false
    try { await postReviewReply({ ...prepared, receipt: changed }, "token", async () => { contacted = true }) } catch { refused = true }
    T("store reply: sensitive and unclear replies cannot reach the network", refused && !contacted)
  }
  review.comments.push({ developerComment: { text: receipt.reply, lastModified: { seconds: "101", nanos: 0 } } })
  calls.length = 0
  await postReviewReply(prepared, "token", request)
  T("store reply: retry recovers a previously posted Play reply without posting twice", calls.length === 1)
  review.comments[1].developerComment.text = "Owner reply"
  let refused = false
  try { await postReviewReply(prepared, "token", request) } catch { refused = true }
  T("store reply: an owner's existing reply is preserved", refused && calls.every(({ options }) => options.method === "GET"))
  review.comments[0].userComment.lastModified.seconds = "102"
  refused = false
  try { await postReviewReply(prepared, "token", request) } catch { refused = true }
  T("store reply: an edited review must be classified again", refused)
  importReviewReplies({ posted: [prepared], failures: [] }, checkout)
  acknowledgeIntake("play", receipt, checkout)
  T("store reply: acknowledgement retains confirmation and text", intakeSource("play", checkout).completed[item.id].replyPosted === true && intakeSource("play", checkout).completed[item.id].reply === receipt.reply)
  T("store reply: repeated receipt import remains idempotent", importReviewReplies({ posted: [prepared], failures: [] }, checkout).posted === 1)
  const apple = { data: [{ type: "customerReviews", id: "apple-review", attributes: { rating: 5, title: "Thanks", body: "Great", reviewerNickname: "Reviewer", createdDate: "2026-01-01T00:00:00Z", territory: "USA" } }], links: { self: "https://api.appstoreconnect.apple.com/v1/apps/123/customerReviews" } }
  const snapshot = await readAppStoreReviews("123", "token", async () => Response.json(apple))
  const appleItem = snapshot.reviews[0]
  const appleReply = { item: appleItem, receipt: { ...receipt, source: "appStore", id: appleItem.id } }
  const appleCalls = []
  let posted = false
  const appleRequest = async (address, options) => {
    appleCalls.push({ address: String(address), options })
    if (String(address).endsWith("/response")) return posted ? Response.json({ data: { type: "customerReviewResponses", id: "response-1", attributes: { responseBody: receipt.reply } }, links: {} }) : new Response(null, { status: 404 })
    if (options.method === "POST") { posted = true; return new Response(null, { status: 201 }) }
    return Response.json(apple)
  }
  await postReviewReply(appleReply, "token", appleRequest, "123")
  await postReviewReply(appleReply, "token", appleRequest, "123")
  const applePosts = appleCalls.filter(({ options }) => options.method === "POST")
  T("store reply: App Store creation and interrupted-receipt recovery post once", applePosts.length === 1 && JSON.parse(applePosts[0].options.body).data.relationships.review.data.id === "apple-review")
  const workflow = readFileSync(join(toolPath(".."), ".github/workflows/orbit-play-reviews.yml"), "utf8")
  T("store reply: workflow passes untrusted reply JSON through environment and stdin", workflow.includes('printf \'%s\' "$REVIEW_REPLIES" | node tools/orbit-review-replies.mjs --post') && workflow.includes("name: orbit-review-replies") && !workflow.includes("run: ${{ inputs.replies }}"))
}

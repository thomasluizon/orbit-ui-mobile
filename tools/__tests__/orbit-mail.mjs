import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { collectMail, draftReply, replyToMail } from "../orbit-mail.mjs"
import { gmailClient } from "../lib/auto-work-google.mjs"
import { acknowledgeIntake, intakeSource } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"

export const cases = async () => {
  const checkout = join(root, "mail-intake")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "mail-parent", sleep: true, autoWork: true }, checkout)
  const calls = []
  let created = false
  let failSecondPage = true
  const request = async (address, options) => {
    const url = new URL(address)
    calls.push({ url, options })
    if (url.pathname.endsWith("/messages")) {
      if (url.searchParams.has("pageToken")) {
        if (failSecondPage) return new Response("unavailable", { status: 503 })
        return Response.json({ messages: [{ id: "m2", threadId: "t2" }], resultSizeEstimate: 1 })
      }
      return Response.json({ messages: [{ id: "m1", threadId: "t1" }], nextPageToken: "page-2", resultSizeEstimate: 2 })
    }
    if (url.pathname.endsWith("/drafts")) {
      if (options.method === "POST") { created = true; return Response.json({ id: "draft-1", message: { id: "dm1", threadId: "t1" } }) }
      return Response.json(created ? { drafts: [{ id: "draft-1", message: { id: "dm1", threadId: "t1" } }] } : {})
    }
    const id = url.pathname.split("/").at(-1)
    return Response.json({ id, threadId: id === "m1" ? "t1" : "t2", internalDate: "1234567890000", snippet: "Oi",
      payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "Pessoa <person@example.org>" },
        { name: "Subject", value: "Uma dúvida" }, { name: "Message-ID", value: `<${id}@example.org>` }],
        parts: [{ mimeType: "text/plain", body: { size: 3, data: Buffer.from("Oi").toString("base64url") } }] } })
  }
  const client = gmailClient("access", request)
  let refused = false
  try { await collectMail(client, checkout) } catch { refused = true }
  T("mail: a failed page retains the earlier message for retry", refused && intakeSource("gmail", checkout).pending.m1.bodies[0].text === "Oi")
  failSecondPage = false
  writeRunState({ sessionId: "mail-child", sleep: true, relay: { from: "mail-parent" } }, checkout)
  const pending = await collectMail(client, checkout)
  T("mail: relay retry paginates and fetches each new message once", pending.length === 2 && calls.filter(({ url }) => url.pathname.endsWith("/messages/m1")).length === 1)
  T("mail: collection includes every received label without an age cutoff", calls.filter(({ url }) => url.pathname.endsWith("/messages")).every(({ url }) =>
    url.searchParams.get("includeSpamTrash") === "true" && url.searchParams.get("q") === "-in:sent -in:drafts"))
  const draft = await draftReply(client, { id: "m1", text: "Olá, vamos verificar." }, checkout)
  const posted = calls.find(({ options }) => options.method === "POST")
  const message = JSON.parse(posted.options.body).message
  const decoded = Buffer.from(message.raw, "base64url").toString("utf8")
  T("mail: reply draft preserves language, headers and thread", draft === "draft-1" && message.threadId === "t1" &&
    decoded.includes("In-Reply-To: <m1@example.org>") && Buffer.from(decoded.split("\r\n\r\n")[1], "base64").toString("utf8") === "Olá, vamos verificar.")
  await draftReply(client, { id: "m1", text: "Olá" }, checkout)
  T("mail: repeated drafting creates no duplicate", calls.filter(({ options }) => options.method === "POST").length === 1)
  const state = intakeSource("gmail", checkout)
  delete state.pending.m1.draftId
  writeRunState({ sessionId: "mail-child", sleep: true, intake: { gmail: state } }, checkout)
  await draftReply(client, { id: "m1", text: "Olá" }, checkout)
  T("mail: recovery after a lost draft receipt finds the existing Message-ID", calls.filter(({ options }) => options.method === "POST").length === 1 && intakeSource("gmail", checkout).pending.m1.draftId === "draft-1")
  const before = calls.length
  await collectMail(client, checkout)
  T("mail: cached pending messages are not read again", calls.slice(before).every(({ url }) => url.pathname.endsWith("/messages")))
  T("mail: no operation calls messages.send or drafts.send", calls.every(({ url }) => !/\/(messages|drafts)\/send$/.test(url.pathname)))
  const unsafe = intakeSource("gmail", checkout)
  unsafe.pending.m2.replyTo = "person@example.org\r\nBcc: someone@example.org"
  writeRunState({ sessionId: "mail-child", sleep: true, intake: { gmail: unsafe } }, checkout)
  let unsafePost = false
  let unsafeRefused = false
  try { await draftReply({ listDrafts: async () => ({}), createDraft: async () => { unsafePost = true } }, { id: "m2", text: "Reply" }, checkout) } catch { unsafeRefused = true }
  T("mail: an injected header is refused before draft creation", unsafeRefused && !unsafePost)
  let sends = 0
  let sentVisible = false
  let sentMessage
  const sendingClient = gmailClient("access", async (address, options) => {
    const url = new URL(address)
    if (url.pathname.endsWith("/drafts/send")) { sends++; sentVisible = true; sentMessage = JSON.parse(options.body).message; return Response.json({ id: "sent-1", threadId: "t1", labelIds: ["SENT"] }) }
    if (url.pathname.endsWith("/messages")) return Response.json(sentVisible ? { messages: [{ id: "sent-1", threadId: "t1" }] } : {})
    return request(address, options)
  })
  const simple = { id: "m1", text: "Obrigado!", person: true, classification: "praise", replyKind: "thanks", clear: true, concerns: [] }
  const result = await replyToMail(sendingClient, simple, checkout)
  await replyToMail(sendingClient, simple, checkout)
  T("mail: a clear reply sends once and persists confirmation", result.disposition === "sent" && sends === 1 && intakeSource("gmail", checkout).pending.m1.sentId === "sent-1")
  const sentMime = sentMessage?.raw ? Buffer.from(sentMessage.raw, "base64url").toString("utf8") : ""
  T("mail: sending replaces an old draft with the exact classified reply", sentMessage?.threadId === "t1" && Buffer.from(sentMime.split("\r\n\r\n")[1] ?? "", "base64").toString("utf8") === simple.text)
  const lost = intakeSource("gmail", checkout)
  delete lost.pending.m1.sentId
  writeRunState({ sessionId: "mail-child", sleep: true, intake: { gmail: lost } }, checkout)
  await replyToMail(sendingClient, simple, checkout)
  T("mail: a lost send receipt recovers through the deterministic sent Message-ID", sends === 1 && intakeSource("gmail", checkout).pending.m1.sentId === "sent-1")
  delete lost.pending.m1.sentId
  writeRunState({ sessionId: "mail-child", sleep: true, intake: { gmail: lost } }, checkout)
  sentVisible = false
  let ambiguous = false
  try { await replyToMail(sendingClient, simple, checkout) } catch { ambiguous = true }
  T("mail: an unconfirmed attempt cannot send twice", ambiguous && sends === 1)
  const sensitive = { ...simple, concerns: ["refund"] }
  const held = await replyToMail(sendingClient, sensitive, checkout)
  T("mail: a sensitive reply stays in Gmail drafts", held.disposition === "draft" && sends === 1)

  const limitedCheckout = join(root, "mail-rate-limit")
  mkdirSync(join(limitedCheckout, ".git"), { recursive: true })
  writeRunState({ sessionId: "rate-limit-mail", sleep: true, autoWork: true }, limitedCheckout)
  const rateLimited = (reason) => Response.json({ error: { code: 403, message: "Rate Limit Exceeded",
    errors: [{ domain: "usageLimits", reason, message: "Rate Limit Exceeded" }] } }, { status: 403 })
  const limitedAnswers = { r1: [() => rateLimited("rateLimitExceeded")], r2: [() => rateLimited("userRateLimitExceeded")],
    r3: [() => new Response("Too many requests", { status: 429, headers: { "Retry-After": "3" } })] }
  const limitedReads = []
  let limitedClock = 0
  const limitedWaits = []
  const limitedPacing = { now: () => limitedClock, sleep: async (milliseconds) => { limitedWaits.push(milliseconds); limitedClock += milliseconds }, random: () => 0.5 }
  const limitedClient = gmailClient("access", async (address) => {
    const url = new URL(address)
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: ["r1", "r2", "r3"].map((id) => ({ id, threadId: `t-${id}` })) })
    const id = url.pathname.split("/").at(-1)
    limitedReads.push(id)
    const answer = limitedAnswers[id]?.shift()
    if (answer) return answer()
    return Response.json({ id, threadId: `t-${id}`, snippet: "Oi", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "person@example.org" }],
      body: { size: 2, data: Buffer.from("Oi").toString("base64url") } } })
  }, limitedPacing)
  let limitedError
  let limitedPending = []
  try { limitedPending = await collectMail(limitedClient, limitedCheckout) } catch (error) { limitedError = error.message }
  T("mail: a per-minute Gmail rate limit is retried instead of failing the collect", limitedError === undefined && limitedPending.length === 3 &&
    limitedPending.every((item) => item.bodies[0]?.text === "Oi"))
  T("mail: each rate-limited read is retried once after its backoff", limitedReads.join(",") === "r1,r1,r2,r2,r3,r3" &&
    limitedWaits.length === 3 && limitedWaits.slice(0, 2).every((milliseconds) => milliseconds >= 1_000) && limitedWaits[2] === 3_000)
  const revokedCheckout = join(root, "mail-forbidden")
  mkdirSync(join(revokedCheckout, ".git"), { recursive: true })
  writeRunState({ sessionId: "forbidden-mail", sleep: true, autoWork: true }, revokedCheckout)
  let forbiddenReads = 0
  const forbiddenWaits = []
  const forbiddenClient = gmailClient("access", async (address) => {
    const url = new URL(address)
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "f1", threadId: "t-f1" }] })
    forbiddenReads++
    return Response.json({ error: { code: 403, message: "Request had insufficient authentication scopes.",
      errors: [{ domain: "global", reason: "insufficientPermissions", message: "Insufficient Permission" }] } }, { status: 403 })
  }, { now: () => 0, sleep: async (milliseconds) => { forbiddenWaits.push(milliseconds) }, random: () => 0.5 })
  let forbiddenError
  try { await collectMail(forbiddenClient, revokedCheckout) } catch (error) { forbiddenError = error.message }
  T("mail: a 403 that is not a rate limit fails at once with its reason", forbiddenError === "Gmail GET failed (HTTP 403 insufficientPermissions)" &&
    forbiddenReads === 1 && forbiddenWaits.length === 0)
  T("mail: a failed read leaves no pending item for the unread message", intakeSource("gmail", revokedCheckout).pending.f1 === undefined)

  for (const variant of ["complaint", "unavailable", "malformed", "truncated"]) {
    const attachmentCheckout = join(root, `mail-attachment-${variant}`)
    mkdirSync(join(attachmentCheckout, ".git"), { recursive: true })
    writeRunState({ sessionId: "attachment-mail", sleep: true, autoWork: true }, attachmentCheckout)
    let attachmentReads = 0
    let attachmentSends = 0
    const attachmentClient = gmailClient("access", async (address, options) => {
      const url = new URL(address)
      if (url.pathname.endsWith("/attachments/external-part")) {
        attachmentReads++
        if (variant === "unavailable") return new Response("unavailable", { status: 503 })
        if (variant === "malformed") return Response.json({ size: 30 })
        return Response.json({ size: variant === "truncated" ? 100 : Buffer.byteLength("This is a complaint about billing."),
          data: Buffer.from("This is a complaint about billing.").toString("base64url") })
      }
      if (url.pathname.endsWith("/messages/attachment-mail")) return Response.json({ id: "attachment-mail", threadId: "thread", snippet: "Thanks!",
        payload: { mimeType: "multipart/mixed", headers: [{ name: "From", value: "person@example.org" }], parts: [
          { mimeType: "text/plain", body: { size: 7, data: Buffer.from("Thanks!").toString("base64url") } },
          { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { size: 33, attachmentId: "external-part" } }] },
        ] } })
      if (url.pathname.endsWith("/messages")) return Response.json(url.searchParams.get("q").startsWith("in:sent") ? {} : { messages: [{ id: "attachment-mail", threadId: "thread" }] })
      if (url.pathname.endsWith("/drafts/send")) { attachmentSends++; return Response.json({ id: "sent" }) }
      if (url.pathname.endsWith("/drafts")) return Response.json(options.method === "POST" ? { id: "attachment-draft" } : {})
      throw new Error(`Unexpected Gmail path ${url.pathname}`)
    })
    const [collected] = await collectMail(attachmentClient, attachmentCheckout)
    const complaint = collected.bodies.some((body) => body.text?.includes("complaint"))
    const receipt = { ...simple, id: "attachment-mail", concerns: complaint ? ["complaint", "billing"] : [] }
    const reply = await replyToMail(attachmentClient, receipt, attachmentCheckout)
    T(`mail: ${variant} external text part is fetched`, attachmentReads === 1)
    T(`mail: ${variant} external text part retains its identity and completeness`, collected.bodies.some((body) => body.attachmentId === "external-part") && collected.bodiesComplete === (variant === "complaint"))
    if (variant === "complaint") T("mail: inline thanks cannot conceal an externally stored complaint", complaint)
    T(`mail: ${variant} external text part routes to draft without sending`, reply.disposition === "draft" && attachmentSends === 0)
    let acknowledged = false
    try { acknowledgeIntake("gmail", receipt, attachmentCheckout); acknowledged = true } catch {}
    T(`mail: ${variant} draft disposition can complete without a send`, acknowledged)
  }
}

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { collectMail, draftReply, replyToMail } from "../orbit-mail.mjs"
import { gmailClient } from "../lib/auto-work-google.mjs"
import { intakeSource } from "../lib/auto-work-intake.mjs"
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
}

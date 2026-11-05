import { readFileSync } from "node:fs"
import { authenticatedGmail, gmailClient, googleToken, readGmailCredential, storeGmailCredential, MAILBOX } from "../lib/auto-work-google.mjs"
import { T } from "./_harness.mjs"

export const cases = async () => {
  const schemas = JSON.parse(readFileSync(new URL("./fixtures/auto-work-google-schemas.json", import.meta.url), "utf8"))
  T("google: Gmail fixture fields derive from the discovery response", schemas.gmail.schemas.Profile.properties.emailAddress.type === "string" &&
    schemas.gmail.schemas.ListMessagesResponse.properties.messages.items.$ref === "Message")
  T("google: attachment contract derives from the live discovery resource", schemas.gmail.methods.attachmentsGet.httpMethod === "GET" &&
    schemas.gmail.methods.attachmentsGet.path === "gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}" &&
    schemas.gmail.methods.attachmentsGet.response.$ref === "MessagePartBody" &&
    Object.keys(schemas.gmail.schemas.MessagePartBody.properties).sort().join(",") === "attachmentId,data,size")
  const credential = { client_id: "client", client_secret: "secret", refresh_token: "refresh" }
  const calls = []
  const execute = (binary, args, options) => {
    calls.push({ binary, args, options })
    return { status: 0, stdout: args[0] === "-i" ? "" : Buffer.from(JSON.stringify(credential)).toString("base64") }
  }
  storeGmailCredential(credential, execute)
  T("google: Keychain token is piped and read back without secret argv", calls.length === 2 &&
    calls.every((call) => !call.args.join(" ").includes("refresh") && !call.args.join(" ").includes("secret")) &&
    calls[0].options.input.includes(Buffer.from(JSON.stringify(credential)).toString("base64")))
  for (const result of [{ status: 1, stdout: "refresh" }, { status: 0, stdout: "invalid" }]) {
    let error
    try { readGmailCredential(() => result) } catch (caught) { error = caught.message }
    T("google: Keychain errors never echo its contents", Boolean(error) && !error.includes("refresh"))
  }
  const network = []
  const request = async (url, options) => {
    network.push({ url: String(url), options })
    return Response.json({ emailAddress: MAILBOX, access_token: "access", refresh_token: "rotated" })
  }
  let rotated
  const client = await authenticatedGmail({ read: () => credential, store: (value) => { rotated = value }, request })
  T("google: refresh uses the token endpoint and persists rotation", network[0].url === "https://oauth2.googleapis.com/token" &&
    network[0].options.body.get("refresh_token") === "refresh" && rotated.refresh_token === "rotated")
  T("google: public client exposes reads, drafts and a guarded send", Object.keys(client).sort().join(",") === "createDraft,list,listDrafts,profile,read,readAttachment,sendDraft")
  await client.list({ maxResults: "500" }); await client.read("message-1"); await client.listDrafts({ q: "rfc822msgid:test" }); await client.createDraft({ raw: "body" })
  T("google: every reachable Gmail write creates a draft, never sends", network.slice(1).every(({ url, options }) =>
    !/\/(messages|drafts)\/send(?:\?|$)/.test(url) && (options.method === "GET" || options.method === "POST" && new URL(url).pathname.endsWith("/drafts"))))
  T("google: draft creation wraps the message according to the discovery schema", JSON.parse(network.at(-1).options.body).message.raw === "body" && schemas.gmail.schemas.Draft.properties.message.$ref === "Message")
  await client.readAttachment("message/id", "part/id")
  T("google: text attachment reads encode both identities and use GET", network.at(-1).url.endsWith("/messages/message%2Fid/attachments/part%2Fid") && network.at(-1).options.method === "GET")
  let wrongAccount = false
  try { await authenticatedGmail({ read: () => credential, request: async (url) => Response.json(String(url).includes("/profile") ? { emailAddress: "someone@example.org" } : { access_token: "access" }) }) } catch { wrongAccount = true }
  T("google: a different mailbox is refused", wrongAccount)
  let failure
  try { await googleToken({}, async () => new Response("secret response", { status: 400 })) } catch (error) { failure = error.message }
  T("google: token failure contains only status and recovery", failure.includes("400") && !failure.includes("secret response"))
  let malformed
  try { await googleToken({}, async () => new Response('access_token: "private-token"')) } catch (error) { malformed = error.message }
  T("google: malformed token responses cannot leak their body", malformed === "Google token response is not valid JSON")
  let invalidRotationStored = false
  let invalidRotationRefused = false
  try { await authenticatedGmail({ read: () => credential, store: () => { invalidRotationStored = true },
    request: async (url) => Response.json(String(url).includes("/profile") ? { emailAddress: MAILBOX } : { access_token: "access", refresh_token: 42 }) }) } catch { invalidRotationRefused = true }
  T("google: an invalid token rotation cannot overwrite Keychain", invalidRotationRefused && !invalidRotationStored)
  const isolated = gmailClient("token", async () => Response.json({}))
  let refused = false
  try { await isolated.sendDraft("draft", { person: true, classification: "billing" }) } catch { refused = true }
  T("google: unsafe sends are refused before the network", refused)
  const pacedClock = { value: 0 }
  const pacedWaits = []
  const pacing = { now: () => pacedClock.value, sleep: async (milliseconds) => { pacedWaits.push(milliseconds); pacedClock.value += milliseconds }, random: () => 0.25 }
  const readTimes = []
  const paced = gmailClient("token", async () => { readTimes.push(pacedClock.value); return Response.json({ id: "message" }) }, pacing)
  for (let index = 0; index < 101; index++) await paced.read(`message-${index}`)
  T("google: full reads stay inside 6000 units per minute per user", readTimes.slice(0, 100).every((time) => time === 0) && readTimes[100] === 60_000 &&
    pacedWaits.length === 1)
  const limitedWaits = []
  let limitedCalls = 0
  const always = gmailClient("token", async () => { limitedCalls++; return Response.json({ error: { code: 403, errors: [{ domain: "usageLimits", reason: "userRateLimitExceeded" }] } }, { status: 403 }) },
    { now: () => 0, sleep: async (milliseconds) => { limitedWaits.push(milliseconds) }, random: () => 0.999 })
  let exhausted
  try { await always.list({}) } catch (error) { exhausted = error.message }
  T("google: a lasting rate limit fails after the capped attempts", exhausted === "Gmail GET failed (HTTP 403 userRateLimitExceeded) after 7 attempts" && limitedCalls === 7)
  T("google: backoff doubles from one second with jitter under one second", limitedWaits.join(",") === "1999,2999,4999,8999,16999,32999")
  const retryAfter = (value) => gmailClient("token", async () => new Response("Too many requests", { status: 429, headers: { "Retry-After": value } }),
    { now: () => Date.parse("Thu, 05 Nov 2026 12:00:00 GMT"), sleep: async () => { throw new Error("slept") }, random: () => 0 })
  let longWait
  try { await retryAfter("7200").read("message") } catch (error) { longWait = error.message }
  T("google: a Retry-After beyond the maximum backoff fails at once", longWait === "Gmail GET failed (HTTP 429); Gmail asks to retry after 7200 seconds")
  let dateWait
  try { await retryAfter("Thu, 05 Nov 2026 12:00:10 GMT").read("message") } catch (error) { dateWait = error.message }
  T("google: an HTTP-date Retry-After is honoured", dateWait === "slept")
  let sendCalls = 0
  const throttledSend = gmailClient("token", async () => { sendCalls++; return new Response("Too many requests: User-rate limit exceeded (Mail sending)", { status: 429 }) },
    { now: () => 0, sleep: async () => { throw new Error("slept") }, random: () => 0 })
  let sendFailure
  try { await throttledSend.sendDraft("draft", { person: true, classification: "praise", replyKind: "thanks", clear: true, concerns: [] }, { raw: "reply" }) } catch (error) { sendFailure = error.message }
  T("google: a rate-limited send is never repeated by the client", sendCalls === 1 && sendFailure === "Gmail POST failed (HTTP 429)")
  const simple = { person: true, classification: "praise", replyKind: "thanks", clear: true, concerns: [] }
  await client.sendDraft("draft", simple, { raw: "reply", threadId: "thread" })
  T("google: an authorized send uses the discovered draft send endpoint", network.at(-1).url.endsWith("/drafts/send") && JSON.parse(network.at(-1).options.body).id === "draft")
}

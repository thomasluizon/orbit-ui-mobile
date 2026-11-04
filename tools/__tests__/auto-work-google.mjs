import { readFileSync } from "node:fs"
import { authenticatedGmail, gmailClient, googleToken, readGmailCredential, storeGmailCredential, MAILBOX } from "../lib/auto-work-google.mjs"
import { T } from "./_harness.mjs"

export const cases = async () => {
  const schemas = JSON.parse(readFileSync(new URL("./fixtures/auto-work-google-schemas.json", import.meta.url), "utf8"))
  T("google: Gmail fixture fields derive from the discovery response", schemas.gmail.schemas.Profile.properties.emailAddress.type === "string" &&
    schemas.gmail.schemas.ListMessagesResponse.properties.messages.items.$ref === "Message")
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
  T("google: public client exposes only read and draft operations", Object.keys(client).sort().join(",") === "createDraft,list,listDrafts,profile,read")
  await client.list({ maxResults: "500" }); await client.read("message-1"); await client.listDrafts({ q: "rfc822msgid:test" }); await client.createDraft({ raw: "body" })
  T("google: every reachable Gmail write creates a draft, never sends", network.slice(1).every(({ url, options }) =>
    !/\/(messages|drafts)\/send(?:\?|$)/.test(url) && (options.method === "GET" || options.method === "POST" && new URL(url).pathname.endsWith("/drafts"))))
  T("google: draft creation wraps the message according to the discovery schema", JSON.parse(network.at(-1).options.body).message.raw === "body" && schemas.gmail.schemas.Draft.properties.message.$ref === "Message")
  let wrongAccount = false
  try { await authenticatedGmail({ read: () => credential, request: async (url) => Response.json(String(url).includes("/profile") ? { emailAddress: "someone@example.org" } : { access_token: "access" }) }) } catch { wrongAccount = true }
  T("google: a different mailbox is refused", wrongAccount)
  let failure
  try { await googleToken({}, async () => new Response("secret response", { status: 400 })) } catch (error) { failure = error.message }
  T("google: token failure contains only status and recovery", failure.includes("400") && !failure.includes("secret response"))
  const isolated = gmailClient("token", async () => Response.json({}))
  T("google: sending cannot be selected through the client", isolated.send === undefined && isolated.messages === undefined && isolated.drafts === undefined)
  for (const relative of ["../lib/auto-work-google.mjs", "../orbit-mail.mjs", "../authorize-orbit-mail.mjs"]) {
    T(`google: ${relative} contains no Gmail send call`, !/(?:messages|drafts)(?:\.|\/)send\b/.test(readFileSync(new URL(relative, import.meta.url), "utf8")))
  }
}

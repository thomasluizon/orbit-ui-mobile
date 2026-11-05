#!/usr/bin/env node
import { createServer } from "node:http"
import { createHash, randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { GMAIL_SCOPES, MAILBOX, gmailClient, googleToken, storeGmailCredential } from "./lib/auto-work-google.mjs"

const USAGE = `usage: authorize-orbit-mail.mjs --client-file <absolute OAuth client JSON path>
One-time Internal Desktop OAuth consent for contact@useorbit.org.
Prints a Google consent URL for the orchestrator to open in claude-in-chrome.
Accepts the callback only on 127.0.0.1 with state and PKCE; times out after ten minutes.
Stores the client and refresh token in macOS Keychain through stdin, never argv or logs.
No stdin. No browser is launched by this command. No email is sent.
--help, -h print usage
exit codes: 0 authorized and confirmed; 1 consent, mailbox or Keychain failure; 2 invalid arguments`

export const consentCallback = (url, state) => {
  if (url.pathname !== "/oauth2callback" || url.searchParams.get("state") !== state) throw new Error("Invalid OAuth callback state")
  if (url.searchParams.has("error") || !url.searchParams.get("code")) throw new Error("Google consent was denied")
  return url.searchParams.get("code")
}

export const consentUrl = (clientId, redirectUri, state, verifier) => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: GMAIL_SCOPES.join(" "), access_type: "offline", prompt: "consent", login_hint: MAILBOX, state,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") }).toString()
  return url.toString()
}

export const receiveConsent = (clientId, announce) => new Promise((resolve, reject) => {
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(64).toString("base64url")
  let redirectUri
  const server = createServer((request, response) => {
    let url
    try {
      url = new URL(request.url, redirectUri)
      const code = consentCallback(url, state)
      response.end("Consent received. You can close this tab.")
      clearTimeout(timeout)
      server.close(() => resolve({ code, verifier, redirectUri }))
    } catch (error) {
      response.writeHead(400)
      response.end("Invalid consent callback.")
      if (url?.pathname === "/oauth2callback" && url.searchParams.get("state") === state) {
        clearTimeout(timeout)
        server.close(() => reject(error))
      }
    }
  })
  const timeout = setTimeout(() => { server.close(); reject(new Error("Google consent timed out")) }, 600_000)
  server.once("error", () => { clearTimeout(timeout); reject(new Error("Could not start OAuth loopback listener")) })
  server.listen(0, "127.0.0.1", () => {
    redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`
    announce(consentUrl(clientId, redirectUri, state, verifier))
  })
})

export const authorizeMailbox = async (client, { receive = receiveConsent, announce = console.log, request = fetch, store = storeGmailCredential } = {}) => {
  if (!client?.client_id || !client.client_secret) throw new Error("Use the downloaded Desktop OAuth client JSON")
  const { code, verifier, redirectUri } = await receive(client.client_id, announce)
  const token = await googleToken({ client_id: client.client_id, client_secret: client.client_secret, code,
    code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }, request)
  if (typeof token.refresh_token !== "string" || !token.refresh_token) throw new Error("Consent did not return a refresh token")
  const granted = typeof token.scope === "string" ? token.scope.split(" ") : []
  if (!GMAIL_SCOPES.every((scope) => granted.includes(scope))) throw new Error("Both Gmail scopes must be granted")
  const profile = await gmailClient(token.access_token, request).profile()
  if (profile.emailAddress?.toLowerCase() !== MAILBOX) throw new Error("Authorize contact@useorbit.org alone")
  store({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: token.refresh_token })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (args.length !== 2 || args[0] !== "--client-file" || !args[1].startsWith("/")) { console.error(USAGE); process.exit(2) }
  try {
    let client
    try { client = JSON.parse(readFileSync(args[1], "utf8")).installed } catch { throw new Error("Cannot read Desktop OAuth client JSON") }
    await authorizeMailbox(client)
    console.log(JSON.stringify({ mailbox: MAILBOX, authorized: true }))
  } catch (error) { console.error(error.message); process.exit(1) }
}

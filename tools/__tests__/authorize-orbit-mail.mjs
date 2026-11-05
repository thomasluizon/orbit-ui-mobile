import { authorizeMailbox, consentCallback, consentUrl } from "../authorize-orbit-mail.mjs"
import { GMAIL_SCOPES, MAILBOX } from "../lib/auto-work-google.mjs"
import { T, run } from "./_harness.mjs"

export const cases = async () => {
  const url = new URL(consentUrl("client", "http://127.0.0.1:1234/oauth2callback", "state", "verifier"))
  T("mail consent: loopback flow requests only the specified scopes with offline access and PKCE", url.origin === "https://accounts.google.com" &&
    url.searchParams.get("scope") === GMAIL_SCOPES.join(" ") && url.searchParams.get("login_hint") === MAILBOX &&
    url.searchParams.get("access_type") === "offline" && url.searchParams.get("code_challenge_method") === "S256" && !url.toString().includes("verifier"))
  T("mail consent: a matching callback yields the code", consentCallback(new URL("http://127.0.0.1/oauth2callback?state=state&code=code"), "state") === "code")
  for (const query of ["?state=wrong&code=code", "?state=state&error=access_denied", "?state=state"]) {
    let rejected = false
    try { consentCallback(new URL(`http://127.0.0.1/oauth2callback${query}`), "state") } catch { rejected = true }
    T("mail consent: invalid state, refusal or absent code is rejected", rejected)
  }
  for (const mode of ["success", "wrong-mailbox", "missing-scope", "missing-refresh"]) {
    let stored
    const request = async (address) => Response.json(String(address).includes("/profile")
      ? { emailAddress: mode === "wrong-mailbox" ? "someone@example.org" : MAILBOX }
      : { access_token: "access", ...(mode === "missing-refresh" ? {} : { refresh_token: "refresh" }), scope: mode === "missing-scope" ? GMAIL_SCOPES[0] : GMAIL_SCOPES.join(" ") })
    let refused = false
    try {
      await authorizeMailbox({ client_id: "client", client_secret: "secret" }, { request, store: (value) => { stored = value },
        receive: async () => ({ code: "code", verifier: "verifier", redirectUri: "http://127.0.0.1:1234/oauth2callback" }) })
    } catch { refused = true }
    T(`mail consent ${mode}: only complete mailbox consent reaches Keychain`, mode === "success" ? stored?.refresh_token === "refresh" && !refused : stored === undefined && refused)
  }
  T("mail consent: invalid invocation never starts a listener", run("authorize-orbit-mail.mjs", ["--client-file", "relative.json"]).status === 2)
}

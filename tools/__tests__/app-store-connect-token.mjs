import { generateKeyPairSync, verify } from "node:crypto"
import { appStoreToken } from "../lib/app-store-connect-token.mjs"
import { T } from "./_harness.mjs"

export const cases = async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const [header, claims, signature] = appStoreToken({ keyId: "key", issuerId: "issuer", privateKey }).split(".")
  T("app store: JWT header matches the team-key contract", JSON.stringify(JSON.parse(Buffer.from(header, "base64url"))) === JSON.stringify({ alg: "ES256", kid: "key", typ: "JWT" }))
  T("app store: ES256 signature uses the required JWT encoding", verify("SHA256", Buffer.from(`${header}.${claims}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")))
  const payload = JSON.parse(Buffer.from(claims, "base64url"))
  T("app store: JWT is short-lived and scoped to App Store Connect", payload.iss === "issuer" && Number.isInteger(payload.iat) &&
    Math.abs(payload.iat - Date.now() / 1000) < 5 && payload.aud === "appstoreconnect-v1" && payload.exp - payload.iat === 600 &&
    Object.keys(payload).sort().join(",") === "aud,exp,iat,iss")
  const differentHeader = Buffer.from(JSON.stringify({ alg: "ES256", kid: "other", typ: "JWT" })).toString("base64url")
  T("app store: the key identifier is authenticated by the signature", !verify("SHA256", Buffer.from(`${differentHeader}.${claims}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")))
  let refused = false
  try { appStoreToken({ keyId: "key", issuerId: "", privateKey }) } catch { refused = true }
  T("app store: a missing credential refuses to sign", refused)
}

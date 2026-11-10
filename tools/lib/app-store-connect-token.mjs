import { createSign } from "node:crypto"

/** Signs the short-lived ES256 token the App Store Connect API requires for a team key. */
export const appStoreToken = ({ keyId, issuerId, privateKey }) => {
  if (!keyId || !issuerId || !privateKey) throw new Error("App Store Connect review credentials unavailable")
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const issuedAt = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuerId, iat: issuedAt, exp: issuedAt + 600, aud: "appstoreconnect-v1" })}`
  const signature = createSign("SHA256").update(unsigned).sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64url")
  return `${unsigned}.${signature}`
}

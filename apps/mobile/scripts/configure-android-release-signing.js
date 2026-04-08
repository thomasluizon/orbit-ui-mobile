const fs = require("node:fs");
const path = require("node:path");

const requiredEnvVars = [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

for (const key of requiredEnvVars) {
  if (!process.env[key] || process.env[key].trim().length === 0) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const androidDir = path.join(__dirname, "..", "android");
const appDir = path.join(androidDir, "app");
const keystorePath = path.join(appDir, "upload-keystore.jks");
const keystorePropertiesPath = path.join(androidDir, "keystore.properties");
const buildGradlePath = path.join(appDir, "build.gradle");

if (!fs.existsSync(buildGradlePath)) {
  console.error(`Missing expected file: ${buildGradlePath}`);
  process.exit(1);
}

const keystoreBuffer = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, "base64");
if (keystoreBuffer.length === 0) {
  console.error("Decoded keystore is empty. Check ANDROID_KEYSTORE_BASE64.");
  process.exit(1);
}

fs.writeFileSync(keystorePath, keystoreBuffer);
fs.writeFileSync(
  keystorePropertiesPath,
  [
    "ORBIT_UPLOAD_STORE_FILE=upload-keystore.jks",
    `ORBIT_UPLOAD_STORE_PASSWORD=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `ORBIT_UPLOAD_KEY_ALIAS=${process.env.ANDROID_KEY_ALIAS}`,
    `ORBIT_UPLOAD_KEY_PASSWORD=${process.env.ANDROID_KEY_PASSWORD}`,
    "",
  ].join("\n")
);

let buildGradle = fs.readFileSync(buildGradlePath, "utf8");

if (!buildGradle.includes("keystore.properties")) {
  const marker = "\nandroid {";
  if (!buildGradle.includes(marker)) {
    console.error("Could not find android block marker in build.gradle for keystore injection");
    process.exit(1);
  }

  const keystoreInjection = `

def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {`;

  buildGradle = buildGradle.replace(marker, keystoreInjection);
}

if (!buildGradle.includes("signingConfigs.release")) {
  const signingConfigsRegex = /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*\}/;
  const signingConfigsMatch = buildGradle.match(signingConfigsRegex);

  if (!signingConfigsMatch) {
    console.error("Could not find signingConfigs.debug block in build.gradle");
    process.exit(1);
  }

  const releaseSigningConfig = `
        release {
            storeFile file(keystoreProperties['ORBIT_UPLOAD_STORE_FILE'])
            storePassword keystoreProperties['ORBIT_UPLOAD_STORE_PASSWORD']
            keyAlias keystoreProperties['ORBIT_UPLOAD_KEY_ALIAS']
            keyPassword keystoreProperties['ORBIT_UPLOAD_KEY_PASSWORD']
        }`;

  const expandedSigningConfigs = signingConfigsMatch[0].replace(/\}\s*$/, `${releaseSigningConfig}\n    }`);
  buildGradle = buildGradle.replace(signingConfigsRegex, expandedSigningConfigs);
}

const releaseBlockRegex = /release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/;
if (!releaseBlockRegex.test(buildGradle)) {
  console.error("Could not find release signingConfig pointing to debug in build.gradle");
  process.exit(1);
}

buildGradle = buildGradle.replace(
  releaseBlockRegex,
  (match) => match.replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release")
);

fs.writeFileSync(buildGradlePath, buildGradle);

console.log("Configured Android release signing for Gradle build.");

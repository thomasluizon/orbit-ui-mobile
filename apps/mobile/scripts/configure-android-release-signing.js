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
const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
const rootBuildGradlePath = path.join(androidDir, "build.gradle");
const buildGradlePath = path.join(appDir, "build.gradle");
const androidManifestPath = path.join(appDir, "src", "main", "AndroidManifest.xml");

function findBraceBlock(source, startRegex, fromIndex = 0, toIndex = source.length) {
  const searchTarget = source.slice(fromIndex, toIndex);
  const match = searchTarget.match(startRegex);

  if (!match || typeof match.index !== "number") {
    return null;
  }

  const start = fromIndex + match.index;
  const openBraceIndex = source.indexOf("{", start);

  if (openBraceIndex === -1) {
    return null;
  }

  let depth = 0;

  for (let index = openBraceIndex; index < toIndex; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          start,
          openBraceIndex,
          end: index + 1,
          content: source.slice(start, index + 1),
        };
      }
    }
  }

  return null;
}

function upsertGradleProperty(source, key, value) {
  const propertyPattern = new RegExp(`^${key}=.*$`, "m");
  const nextLine = `${key}=${value}`;

  if (propertyPattern.test(source)) {
    return source.replace(propertyPattern, nextLine);
  }

  const normalizedSource = source.endsWith("\n") ? source : `${source}\n`;
  return `${normalizedSource}${nextLine}\n`;
}

function failAnchor(anchor) {
  console.error(`Could not verify ${anchor}`);
  process.exit(1);
}

function requireBlock(source, pattern, anchor, parent) {
  const block = findBraceBlock(
    source, pattern, parent ? parent.openBraceIndex + 1 : 0, parent ? parent.end - 1 : source.length
  );
  if (!block) failAnchor(anchor);
  return block;
}

function replaceBlock(source, block, content) {
  return `${source.slice(0, block.start)}${content}${source.slice(block.end)}`;
}

function signingBlocks(source) {
  const android = requireBlock(source, /^[ \t]*android\s*\{/m, "android block in app/build.gradle");
  const configs = requireBlock(source, /^[ \t]*signingConfigs\s*\{/m, "signingConfigs block in app/build.gradle", android);
  const types = requireBlock(source, /^[ \t]*buildTypes\s*\{/m, "buildTypes block in app/build.gradle", android);
  const release = requireBlock(source, /^[ \t]*release\s*\{/m, "release buildType in app/build.gradle", types);
  return { configs, release };
}

function verifyReleaseSigning(source) {
  const { configs, release } = signingBlocks(source);
  requireBlock(source, /^[ \t]*release\s*\{/m, "signingConfigs release entry in app/build.gradle", configs);
  if (!/^[ \t]*signingConfig\s*(?:=\s*)?signingConfigs\s*\.\s*release\b/m.test(release.content) ||
      /\bsigningConfigs\s*\.\s*debug\b/.test(release.content)) {
    failAnchor("release signingConfig must reference signingConfigs.release without signingConfigs.debug");
  }
}

function ensureAndroidAppLinkAutoVerify(source) {
  const appLinkDataTagPattern =
    /<data\b(?=[^>]*android:scheme="https")(?=[^>]*android:pathPrefix="\/auth-callback")[^>]*\/>/;
  const intentFilter = [...source.matchAll(/<intent-filter\b[^>]*>[\s\S]*?<\/intent-filter>/g)]
    .find((match) => appLinkDataTagPattern.test(match[0]));
  if (!intentFilter) failAnchor("auth-callback App Link intent-filter in AndroidManifest.xml");

  const updatedFilter = intentFilter[0].replace(/<intent-filter\b[^>]*>/, (tag) =>
    /android:autoVerify="[^"]*"/.test(tag)
      ? tag.replace(/android:autoVerify="[^"]*"/, 'android:autoVerify="true"')
      : tag.replace(/>$/, ' android:autoVerify="true">')
  );
  return source.replace(intentFilter[0], updatedFilter);
}

if (
  !fs.existsSync(buildGradlePath) ||
  !fs.existsSync(rootBuildGradlePath) ||
  !fs.existsSync(gradlePropertiesPath) ||
  !fs.existsSync(androidManifestPath)
) {
  console.error(
    `Missing expected Android release file: ${buildGradlePath}, ${rootBuildGradlePath}, ${gradlePropertiesPath}, or ${androidManifestPath}`
  );
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
let rootBuildGradle = fs.readFileSync(rootBuildGradlePath, "utf8");
let gradleProperties = fs.readFileSync(gradlePropertiesPath, "utf8");
let androidManifest = fs.readFileSync(androidManifestPath, "utf8");

if (!rootBuildGradle.includes("asyncStorageLocalRepo")) {
  const repositoriesAnchor = /\ballprojects\s*\{\s*repositories\s*\{/;

  if (!repositoriesAnchor.test(rootBuildGradle)) {
    console.error("Could not find allprojects repositories block in android/build.gradle");
    process.exit(1);
  }

  const asyncStorageRepoBlock = `allprojects {\n  repositories {\n    def asyncStorageRepoCandidates = [\n      new File(rootDir, "../node_modules/@react-native-async-storage/async-storage/android/local_repo"),\n      new File(rootDir, "../../../node_modules/@react-native-async-storage/async-storage/android/local_repo"),\n    ]\n    def asyncStorageLocalRepo = asyncStorageRepoCandidates.find { it.exists() }\n\n    if (asyncStorageLocalRepo != null) {\n      maven { url asyncStorageLocalRepo.toURI() }\n    }`;

  rootBuildGradle = rootBuildGradle.replace(repositoriesAnchor, asyncStorageRepoBlock);
}

const generatedExpoEntryFileLine = `    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())`;
const stableExpoEntryFileLine = '    entryFile = file("${projectRoot}/index.js")';

if (buildGradle.includes(generatedExpoEntryFileLine)) {
  buildGradle = buildGradle.replace(generatedExpoEntryFileLine, stableExpoEntryFileLine);
} else if (!buildGradle.includes(stableExpoEntryFileLine)) {
  failAnchor("entryFile anchor in app/build.gradle");
}

if (!buildGradle.includes("keystore.properties")) {
  const marker = /^[ \t]*android\s*\{/m;
  if (!marker.test(buildGradle)) {
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

const { configs: signingConfigsBlock } = signingBlocks(buildGradle);
if (!findBraceBlock(buildGradle, /^[ \t]*release\s*\{/m, signingConfigsBlock.openBraceIndex + 1, signingConfigsBlock.end - 1)) {

  const releaseSigningConfig = `
        release {
            storeFile file(keystoreProperties['ORBIT_UPLOAD_STORE_FILE'])
            storePassword keystoreProperties['ORBIT_UPLOAD_STORE_PASSWORD']
            keyAlias keystoreProperties['ORBIT_UPLOAD_KEY_ALIAS']
            keyPassword keystoreProperties['ORBIT_UPLOAD_KEY_PASSWORD']
        }`;

  const expandedSigningConfigs = `${signingConfigsBlock.content.slice(0, -1)}${releaseSigningConfig}\n    }`;
  buildGradle = `${buildGradle.slice(0, signingConfigsBlock.start)}${expandedSigningConfigs}${buildGradle.slice(signingConfigsBlock.end)}`;
}

const { release: releaseBuildTypeBlock } = signingBlocks(buildGradle);
const debugSigningConfig = /^([ \t]*)signingConfig\s*(?:=\s*)?signingConfigs\s*\.\s*debug\b/gm;
const updatedReleaseBuildType = releaseBuildTypeBlock.content.replace(
  debugSigningConfig,
  "$1signingConfig = signingConfigs.release"
);
buildGradle = replaceBlock(buildGradle, releaseBuildTypeBlock, updatedReleaseBuildType);
verifyReleaseSigning(buildGradle);

gradleProperties = upsertGradleProperty(
  gradleProperties,
  "kotlin.daemon.jvmargs",
  "-Xmx1536m,-XX:MaxMetaspaceSize=512m,-Dfile.encoding=UTF-8"
);
gradleProperties = upsertGradleProperty(gradleProperties, "org.gradle.workers.max", "2");
androidManifest = ensureAndroidAppLinkAutoVerify(androidManifest);

fs.writeFileSync(buildGradlePath, buildGradle);
verifyReleaseSigning(fs.readFileSync(buildGradlePath, "utf8"));
fs.writeFileSync(rootBuildGradlePath, rootBuildGradle);
fs.writeFileSync(gradlePropertiesPath, gradleProperties);
fs.writeFileSync(androidManifestPath, androidManifest);

console.log("Configured Android release signing, verified app links autoVerify, Gradle memory settings, and local Maven repos for Gradle build.");

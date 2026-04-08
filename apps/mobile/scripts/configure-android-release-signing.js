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

function findBraceBlock(source, startRegex, fromIndex = 0) {
  const searchTarget = source.slice(fromIndex);
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

  for (let index = openBraceIndex; index < source.length; index += 1) {
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

if (!fs.existsSync(buildGradlePath) || !fs.existsSync(rootBuildGradlePath) || !fs.existsSync(gradlePropertiesPath)) {
  console.error(
    `Missing expected Android Gradle file: ${buildGradlePath}, ${rootBuildGradlePath}, or ${gradlePropertiesPath}`
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

if (!rootBuildGradle.includes("asyncStorageLocalRepo")) {
  const repositoriesAnchor = "allprojects {\n  repositories {";

  if (!rootBuildGradle.includes(repositoriesAnchor)) {
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
}

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
  const signingConfigsBlock = findBraceBlock(buildGradle, /signingConfigs\s*\{/);

  if (!signingConfigsBlock) {
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

  const expandedSigningConfigs = `${signingConfigsBlock.content.slice(0, -1)}${releaseSigningConfig}\n    }`;
  buildGradle = `${buildGradle.slice(0, signingConfigsBlock.start)}${expandedSigningConfigs}${buildGradle.slice(signingConfigsBlock.end)}`;
}

const buildTypesBlock = findBraceBlock(buildGradle, /buildTypes\s*\{/);
if (!buildTypesBlock) {
  console.error("Could not find buildTypes block in build.gradle");
  process.exit(1);
}

const releaseBuildTypeBlock = findBraceBlock(buildGradle, /release\s*\{/, buildTypesBlock.openBraceIndex);
if (!releaseBuildTypeBlock) {
  console.error("Could not find release buildType block in build.gradle");
  process.exit(1);
}

if (releaseBuildTypeBlock.content.includes("signingConfig signingConfigs.debug")) {
  const updatedReleaseBuildTypeBlock = releaseBuildTypeBlock.content.replace(
    "signingConfig signingConfigs.debug",
    "signingConfig signingConfigs.release"
  );

  buildGradle = `${buildGradle.slice(0, releaseBuildTypeBlock.start)}${updatedReleaseBuildTypeBlock}${buildGradle.slice(releaseBuildTypeBlock.end)}`;
}

gradleProperties = upsertGradleProperty(
  gradleProperties,
  "org.gradle.jvmargs",
  "-Xmx4g -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8 -XX:+HeapDumpOnOutOfMemoryError -Dkotlin.daemon.jvm.options=-Xmx1536m,-XX:MaxMetaspaceSize=512m,-Dfile.encoding=UTF-8"
);
gradleProperties = upsertGradleProperty(
  gradleProperties,
  "kotlin.daemon.jvmargs",
  "-Xmx1536m,-XX:MaxMetaspaceSize=512m,-Dfile.encoding=UTF-8"
);
gradleProperties = upsertGradleProperty(gradleProperties, "org.gradle.workers.max", "2");

fs.writeFileSync(buildGradlePath, buildGradle);
fs.writeFileSync(rootBuildGradlePath, rootBuildGradle);
fs.writeFileSync(gradlePropertiesPath, gradleProperties);

console.log("Configured Android release signing, Gradle memory settings, and local Maven repos for Gradle build.");

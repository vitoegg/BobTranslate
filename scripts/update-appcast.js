const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const REPO = process.env.GITHUB_REPOSITORY || "vitoegg/BobTranslate";
const RELEASE_TAG = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
const TIMESTAMP = Number(process.env.APPCAST_TIMESTAMP || Date.now());

if (!RELEASE_TAG) {
  throw new Error("RELEASE_TAG or GITHUB_REF_NAME is required");
}

if (!Number.isFinite(TIMESTAMP)) {
  throw new Error("APPCAST_TIMESTAMP must be a millisecond timestamp");
}

const plugins = [
  {
    provider: "openai",
    packageName: "openai-bob-translate.bobplugin",
    appcastName: "openai.json"
  },
  {
    provider: "fireworks",
    packageName: "fireworks-bob-translate.bobplugin",
    appcastName: "fireworks.json"
  }
];
const requestedProviders = process.argv.slice(2);
const selectedPlugins = requestedProviders.length > 0
  ? requestedProviders.map((provider) => {
      const plugin = plugins.find((item) => item.provider === provider);
      if (!plugin) {
        throw new Error(`Unknown provider: ${provider}`);
      }
      return plugin;
    })
  : plugins;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

fs.mkdirSync(path.join(ROOT_DIR, "appcast"), { recursive: true });

for (const plugin of selectedPlugins) {
  const info = readJson(path.join(ROOT_DIR, "plugins", plugin.provider, "info.json"));
  const packagePath = path.join(DIST_DIR, plugin.packageName);

  writeJson(path.join(ROOT_DIR, "appcast", plugin.appcastName), {
    identifier: info.identifier,
    versions: [
      {
        version: info.version,
        desc: `${info.name} ${info.version}`,
        sha256: sha256(packagePath),
        url: `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${plugin.packageName}`,
        minBobVersion: info.minBobVersion,
        timestamp: TIMESTAMP
      }
    ]
  });
}

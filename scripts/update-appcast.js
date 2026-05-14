const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const REPO = process.env.GITHUB_REPOSITORY || "vitoegg/BobTranslate";
const TIMESTAMP = Number(process.env.APPCAST_TIMESTAMP || Date.now());

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

for (const plugin of plugins) {
  const info = readJson(path.join(ROOT_DIR, "plugins", plugin.provider, "info.json"));
  const packagePath = path.join(DIST_DIR, plugin.packageName);
  const tag = `v${info.version}`;

  writeJson(path.join(ROOT_DIR, "appcast", plugin.appcastName), {
    identifier: info.identifier,
    versions: [
      {
        version: info.version,
        desc: `${info.name} ${info.version}`,
        sha256: sha256(packagePath),
        url: `https://github.com/${REPO}/releases/download/${tag}/${plugin.packageName}`,
        minBobVersion: info.minBobVersion,
        timestamp: TIMESTAMP
      }
    ]
  });
}

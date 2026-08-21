const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const REPO = process.env.GITHUB_REPOSITORY || "vitoegg/BobTranslate";
const TIMESTAMP = Number(process.env.APPCAST_TIMESTAMP || Date.now());

if (!Number.isFinite(TIMESTAMP)) {
  throw new Error("APPCAST_TIMESTAMP must be a millisecond timestamp");
}

// appcast 与插件包同属一个 release，全部通过 /releases/latest/download/ 访问：
// 该地址返回 no-cache 的 302，永远解析到当前唯一的 release，因此不会 404，
// 也不会出现 appcast 与插件包新旧错配导致的 sha256 校验失败。
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
  },
  {
    provider: "vercel",
    packageName: "vercel-bob-translate.bobplugin",
    appcastName: "vercel.json"
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function commitDesc() {
  try {
    return execFileSync("git", ["log", "-1", "--pretty=%B"], {
      cwd: ROOT_DIR,
      encoding: "utf8"
    }).trim();
  } catch (_) {
    return "";
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

const commitDescription = commitDesc();

for (const plugin of plugins) {
  const info = readJson(path.join(ROOT_DIR, "plugins", plugin.provider, "info.json"));
  const packagePath = path.join(DIST_DIR, plugin.packageName);
  const desc = commitDescription || `${info.name} ${info.version}`;

  writeJson(path.join(DIST_DIR, plugin.appcastName), {
    identifier: info.identifier,
    versions: [
      {
        version: info.version,
        desc: desc,
        sha256: sha256(packagePath),
        url: `https://github.com/${REPO}/releases/latest/download/${plugin.packageName}`,
        minBobVersion: info.minBobVersion,
        timestamp: TIMESTAMP
      }
    ]
  });
}

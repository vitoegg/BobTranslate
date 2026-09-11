const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function compareVersions(a, b) {
  const parse = value => {
    if (typeof value !== 'string' || !/^\d+(\.\d+)*$/.test(value)) throw new Error(`Invalid numeric version: ${value}`);
    return value.split('.').map(BigInt);
  };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] || 0n, y = right[i] || 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function verifyAssets(release, files) {
  if (!release || release.assets.length !== files.length) throw new Error('Release asset count mismatch');
  for (const file of files) {
    const asset = release.assets.find(a => a.name === path.basename(file));
    if (!asset || asset.state !== 'uploaded' || asset.digest !== `sha256:${sha256(file)}`) {
      throw new Error(`Release asset mismatch: ${path.basename(file)}`);
    }
  }
}

function release({ root = path.resolve(__dirname, '..'), repo = process.env.GITHUB_REPOSITORY,
  run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  verifyTag } = {}) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is required');
  const gh = (...args) => run('gh', args);
  const api = endpoint => JSON.parse(gh('api', `repos/${repo}/${endpoint}`));
  const releases = () => JSON.parse(gh('api', `repos/${repo}/releases`, '--paginate', '--slurp')).flat();
  const dist = path.join(root, 'dist');
  const providers = fs.readdirSync(path.join(root, 'plugins')).filter(p => !p.startsWith('.') && fs.existsSync(path.join(root, 'plugins', p, 'info.json'))).sort();
  const files = providers.flatMap(p => [path.join(dist, `${p}-bob-translate.bobplugin`), path.join(dist, `${p}.json`)]);

  // 清理后的最终验收也使用同一资产校验，避免仅检查 Release 数量。
  if (verifyTag) {
    const remaining = releases();
    if (remaining.length !== 1 || remaining[0].tag_name !== verifyTag || remaining[0].draft) {
      throw new Error('Expected only the verified Release to remain');
    }
    const latest = api('releases/latest');
    if (latest.tag_name !== verifyTag) throw new Error('Latest Release mismatch');
    verifyAssets(latest, files);
    return verifyTag;
  }

  run('sh', ['scripts/package.sh']);
  const commit = run('git', ['rev-parse', 'HEAD']).trim();
  const tag = `r-${commit}`;
  const history = releases();
  const previous = history.some(r => !r.draft && !r.prerelease) ? api('releases/latest') : null;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-release-'));
  try {
    if (previous) gh('release', 'download', previous.tag_name, '--repo', repo, '--pattern', '*.json', '--dir', temp);
    const errors = [];
    const plugins = providers.map(provider => {
      const packageName = `${provider}-bob-translate.bobplugin`;
      const packagePath = path.join(dist, packageName);
      const info = JSON.parse(run('unzip', ['-p', packagePath, 'info.json']));
      compareVersions(info.version, '0');
      const digest = sha256(packagePath);
      const old = previous ? readJson(path.join(temp, `${provider}.json`)) : null;
      const version = old?.versions?.[0];
      if (old && (old.identifier !== info.identifier || !/^[a-f0-9]{64}$/.test(version?.sha256 || '') || typeof version?.desc !== 'string')) {
        throw new Error(`Invalid previous appcast: ${provider}`);
      }
      const order = old ? compareVersions(info.version, version.version) : 1;
      const changed = !old || digest !== version.sha256;
      if (old && ((changed && order <= 0) || (!changed && order !== 0))) {
        errors.push(`${provider}: package/version mismatch (${version.version} -> ${info.version})`);
      }
      return { provider, packageName, info, digest, old: version, changed };
    });
    if (errors.length) throw new Error(errors.join('\n'));
    if (plugins.every(p => !p.changed)) {
      for (const p of providers) fs.copyFileSync(path.join(temp, `${p}.json`), path.join(dist, `${p}.json`));
      verifyAssets(previous, files);
      return previous.tag_name;
    }
    const existing = history.find(r => r.tag_name === tag);
    if (existing && !existing.draft) throw new Error(`Refusing to overwrite published Release: ${tag}`);
    const timestamp = Number(run('git', ['show', '-s', '--format=%ct', 'HEAD']).trim()) * 1000;
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('Invalid commit timestamp');
    const desc = run('git', ['log', '-1', '--pretty=%B']).trim();
    for (const p of plugins) {
      fs.writeFileSync(path.join(dist, `${p.provider}.json`), JSON.stringify({
        identifier: p.info.identifier,
        versions: [{ version: p.info.version, desc: p.changed ? desc || `${p.info.name} ${p.info.version}` : p.old.desc,
          sha256: p.digest, url: `https://github.com/${repo}/releases/download/${tag}/${p.packageName}`,
          minBobVersion: p.info.minBobVersion, timestamp: p.changed ? timestamp : p.old.timestamp }]
      }, null, 2) + '\n');
    }
    try {
      if (!existing) gh('release', 'create', tag, '--repo', repo, '--target', commit, '--draft', '--title', 'BobTranslate', '--notes', desc);
      gh('release', 'upload', tag, ...files, '--repo', repo, '--clobber');
      verifyAssets(releases().find(r => r.tag_name === tag), files);
      gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest');
      const latest = api('releases/latest');
      if (latest.tag_name !== tag) throw new Error('Latest Release mismatch');
      verifyAssets(latest, files);
      return tag;
    } catch (error) {
      // 只删除本次未公开的草稿；响应丢失时先查真值，绝不删除已发布版本。
      try {
        const pending = releases().find(r => r.tag_name === tag);
        if (pending?.draft) gh('release', 'delete', tag, '--repo', repo, '--yes');
      } catch (cleanupError) {
        error.message += `\nDraft cleanup failed: ${cleanupError.message}`;
      }
      throw error;
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    if (process.argv[2] && (process.argv[2] !== '--verify' || !process.env.RELEASE_TAG)) throw new Error('Usage: RELEASE_TAG=<tag> node scripts/release.js --verify');
    const tag = release({ verifyTag: process.argv[2] === '--verify' ? process.env.RELEASE_TAG : undefined });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
    console.log(`Verified Release: ${tag}`);
  } catch (error) {
    console.error(error.stderr?.toString() || error.message);
    process.exitCode = 1;
  }
}
module.exports = { release, compareVersions, verifyAssets };

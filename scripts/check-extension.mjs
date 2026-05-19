import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const extensionDir = join(rootDir, 'extension');
const manifestPath = join(extensionDir, 'manifest.json');

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: ${error.message}`);
    return null;
  }
}

function assertFile(relativePath) {
  const absolutePath = join(extensionDir, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Missing extension file: ${relativePath}`);
  }
  return absolutePath;
}

function checkJsSyntax(relativePath) {
  const absolutePath = assertFile(relativePath);
  if (!existsSync(absolutePath)) return;

  const result = spawnSync(process.execPath, ['--check', absolutePath], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    fail(`${relativePath}: ${result.stderr || result.stdout}`.trim());
  }
}

function readPngSize(relativePath) {
  const buffer = readFileSync(assertFile(relativePath));
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    fail(`${relativePath}: not a PNG file`);
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function checkIconSize(relativePath, expectedSize) {
  if (!existsSync(join(extensionDir, relativePath))) {
    assertFile(relativePath);
    return;
  }

  const size = readPngSize(relativePath);
  if (!size) return;

  if (size.width !== expectedSize || size.height !== expectedSize) {
    fail(`${relativePath}: expected ${expectedSize}x${expectedSize}, got ${size.width}x${size.height}`);
  }
}

function collectPopupAssetRefs(relativePath) {
  const absolutePath = assertFile(relativePath);
  if (!existsSync(absolutePath)) return [];

  const html = readFileSync(absolutePath, 'utf8');
  const refs = [];
  const assetPattern = /\b(?:src|href)="([^"]+)"/g;
  let match;

  while ((match = assetPattern.exec(html))) {
    const value = match[1];
    if (/^(?:https?:|data:|#)/.test(value)) continue;
    refs.push(value);
  }

  return refs;
}

const manifest = readJson(manifestPath);
if (manifest) {
  if (manifest.manifest_version !== 3) {
    fail('manifest.json: manifest_version must be 3');
  }

  if (!manifest.background?.service_worker) {
    fail('manifest.json: missing background.service_worker');
  } else {
    checkJsSyntax(manifest.background.service_worker);
  }

  if (manifest.action?.default_popup) {
    assertFile(manifest.action.default_popup);
    for (const ref of collectPopupAssetRefs(manifest.action.default_popup)) {
      assertFile(ref);
      if (ref.endsWith('.js')) checkJsSyntax(ref);
    }
  }

  for (const script of manifest.content_scripts || []) {
    for (const jsFile of script.js || []) {
      checkJsSyntax(jsFile);
    }
  }

  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    checkIconSize(iconPath, Number(size));
  }

  for (const [size, iconPath] of Object.entries(manifest.action?.default_icon || {})) {
    checkIconSize(iconPath, Number(size));
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Extension check passed.');

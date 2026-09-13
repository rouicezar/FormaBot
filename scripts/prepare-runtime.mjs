import { copyFile, mkdir, readFile, chmod, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Only the macOS arm64 build is currently validated.');
const archive = 'node-v26.7.0-darwin-arm64.tar.gz';
await mkdir('.tmp/preflight', { recursive: true });
async function verifiedDownload(name, url, expected) {
  const file = `.tmp/preflight/${name}`;
  try { await access(file); } catch {
    // Build-machine setup only. This script is not included in the app.
    execFileSync('/usr/bin/curl', ['-fL', '--max-time', '300', '-o', file, url], { stdio: 'inherit' });
  }
  if (createHash('sha256').update(await readFile(file)).digest('hex') !== expected) throw new Error(`Checksum mismatch: ${name}. Remove this build cache file and retry.`);
  return file;
}
await verifiedDownload(archive, `https://nodejs.org/dist/v26.7.0/${archive}`, '7ee659a7768e641bbfd5360940660b8e8fd0052f77488f365562bac522fc15d4');
execFileSync('tar', ['-xzf', `.tmp/preflight/${archive}`, '-C', '.tmp/preflight']);
await mkdir('.local/runtime', { recursive: true });
await copyFile('.tmp/preflight/node-v26.7.0-darwin-arm64/bin/node', '.local/runtime/node');
await copyFile('.tmp/preflight/node-v26.7.0-darwin-arm64/LICENSE', '.local/runtime/LICENSE-node');
await chmod('.local/runtime/node', 0o755);
console.log(execFileSync(resolve('.local/runtime/node'), ['--version'], { encoding: 'utf8' }).trim());
const electronArchive = 'electron-v44.2.0-darwin-arm64.zip';
const electronZip = await verifiedDownload(electronArchive, `https://github.com/electron/electron/releases/download/v44.2.0/${electronArchive}`, 'f906dff5d054b1b92e5711781b13cc206fd7139ce66467503b9d0a3e6fbc9b02');
execFileSync('/usr/bin/ditto', ['-x', '-k', electronZip, 'node_modules/electron/dist']);
await writeFile('node_modules/electron/path.txt', 'Electron.app/Contents/MacOS/Electron');
console.log('Bundled Node and Electron prepared; no runtime download is required.');

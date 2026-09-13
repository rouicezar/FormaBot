import { readFile, readdir, writeFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const sections = ['# Third-Party Notices\n\nThird-party components retain their original licenses. The FormaBot personal-use license does not replace them. Node.js, Electron, and Chromium notices are also included with the application runtime.\n'];
const missing = [];
const upstream = {
  '@aws-sdk/credential-provider-http': ['aws.txt'],
  '@aws-sdk/credential-provider-login': ['aws.txt'],
  '@aws-sdk/nested-clients': ['aws.txt'],
  '@earendil-works/pi-ai': ['pi.txt'],
  '@earendil-works/pi-telemetry': ['pi.txt'],
  '@xterm/headless': ['xterm.txt'],
  '@koromix/koffi-darwin-arm64': ['koffi.txt'],
  'data-uri-to-buffer': ['data-uri.txt'],
  '@img/sharp-libvips-darwin-arm64': ['libvips-license.txt', 'libvips-third-party-notices.md.txt'],
};

function notice(title, text) {
  // Normalize line endings and trailing whitespace without changing license terms.
  const normalized = text.replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trimEnd();
  return `\n### ${title}\n\n\`\`\`text\n${normalized}\n\`\`\`\n`;
}

for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path || entry.dev) continue;
  let pkg;
  try {
    pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
  } catch (error) {
    if (entry.optional && error.code === 'ENOENT') continue;
    throw new Error(`Cannot read installed dependency: ${path}`, { cause: error });
  }
  const names = (await readdir(path, { withFileTypes: true }))
    .filter(item => item.isFile() && /^(license|licence|copying|notice)(?:$|[.-])/i.test(item.name))
    .map(item => item.name).sort();
  let text = '';
  for (const name of names) text += notice(name, await readFile(`${path}/${name}`, 'utf8'));
  if (!text && upstream[pkg.name]) {
    for (const name of upstream[pkg.name]) {
      text += notice(`Supplied upstream notice: ${name}`, await readFile(`docs/licenses/${name}`, 'utf8'));
    }
  }
  if (!text) missing.push(`${pkg.name}@${pkg.version}`);
  sections.push(`## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license ?? entry.license ?? 'See package terms'}.\n${text}`);
}
await writeFile('THIRD_PARTY_NOTICES.md', sections.join('\n'));
console.log(JSON.stringify({ packages: sections.length - 1, missingLicenseText: missing }, null, 2));
if (missing.length) process.exitCode = 1;

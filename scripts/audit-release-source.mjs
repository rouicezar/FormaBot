import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Inspect the proposed source tree, never ignored runtime data or credentials.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const sensitivePath = /(^|\/)(\.env(?:\.|$)|Cookies$|Login Data$|browser-profiles|runtime-data|\.auth)(\/|$)|\.(?:pem|key|sqlite|sqlite3|db|p12|pfx)$/i;
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, /\bsk-[A-Za-z0-9_-]{32,}\b/, /\bAKIA[0-9A-Z]{16}\b/];
let textCount = 0;
for (const file of files) {
  if (sensitivePath.test(file) && file !== '.env.example') failures.push({ file, reason: 'sensitive filename' });
  if (/[^\x20-\x7e]/.test(file)) failures.push({ file, reason: 'non-English filename' });
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  textCount++;
  const text = content.toString('utf8');
  if (secretPatterns.some(pattern => pattern.test(text))) failures.push({ file, reason: 'credential-like content; inspect locally' });
}
for (const readme of ['README.md', 'README.zh-CN.md']) {
  for (const match of readFileSync(readme, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(readme), target))) failures.push({ file: readme, reason: `missing link: ${target}` });
  }
}
console.log(JSON.stringify({ files: files.length, textFiles: textCount, failures, limits: 'Pattern-based current-tree check; not proof of absence of all secrets, license clearance, or historical Git cleanup.' }, null, 2));
if (failures.length) process.exitCode = 1;

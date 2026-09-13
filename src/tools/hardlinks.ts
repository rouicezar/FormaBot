import { readdirSync, statSync, copyFileSync, renameSync, chmodSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface HardlinkScanLimits { maxEntries?: number; maxDepth?: number }
export const DEFAULT_HARDLINK_LIMITS = { maxEntries: 50000, maxDepth: 32 };

// F01：任务启动前打断工作空间内指向外部的硬链接（复制替换，路径/内容/权限不变）。
// 沙箱无法按 nlink 拦截写入，pre-existing 链接必须在沙箱外处理；超上限时拒绝启动。
export function breakWorkspaceHardlinks(root: string, limits: HardlinkScanLimits = {}): { broken: string[] } {
  const maxEntries = limits.maxEntries ?? DEFAULT_HARDLINK_LIMITS.maxEntries;
  const maxDepth = limits.maxDepth ?? DEFAULT_HARDLINK_LIMITS.maxDepth;
  const broken: string[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) throw new Error('工作空间目录过深，无法完成硬链接安全检查。');
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (++seen > maxEntries) throw new Error(`工作空间超过 ${maxEntries} 个条目，无法完成硬链接安全检查。`);
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(path, depth + 1); continue; }
      if (!entry.isFile()) continue;
      let info;
      try { info = statSync(path); } catch { continue; }
      if (info.nlink <= 1) continue;
      const tmp = `${path}.formabot-unlink-${process.pid}-${broken.length}`;
      copyFileSync(path, tmp);
      chmodSync(tmp, info.mode);
      renameSync(tmp, path);
      try { unlinkSync(tmp); } catch {}
      broken.push(path);
    }
  };
  walk(root, 0);
  return { broken };
}

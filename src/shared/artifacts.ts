import { createHash } from 'node:crypto';
import { basename } from 'node:path';

// E07a：交付版本快照的确定路径（taskId + 原路径 → userData 内快照文件名）。
export function artifactSnapshotName(taskId: string, path: string): string {
  const hash = createHash('sha256').update(`${taskId}:${path}`).digest('hex').slice(0, 16);
  return `${hash}-${basename(path)}`;
}
export const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
export const TEXT_EXTS = ['.md', '.txt', '.json', '.csv', '.html', '.htm', '.css', '.js', '.ts', '.py', '.log', '.yaml', '.yml', '.xml', '.svg'];

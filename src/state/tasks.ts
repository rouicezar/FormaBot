import { DatabaseSync } from 'node:sqlite';
import { realpathSync, statSync } from 'node:fs';

export class TaskStore {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS grants(path TEXT PRIMARY KEY, identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, prompt TEXT NOT NULL, workspace TEXT NOT NULL, status TEXT NOT NULL, output TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
      UPDATE tasks SET status='interrupted' WHERE status='running';`);
  }
  identity(path: string) { const s = statSync(path); if (!s.isDirectory()) throw new Error('工作空间不是文件夹。'); return `${s.dev}:${s.ino}`; }
  authorized(path: string) {
    // 空间不存在/不可解析视同未授权：撤销或目录被替换后工具必须拒绝，不能抛错中断任务判定。
    let canonical: string; let id: string;
    try { canonical = realpathSync(path); id = this.identity(canonical); } catch { return false; }
    return this.db.prepare('SELECT identity FROM grants WHERE path=?').get(canonical)?.identity === id;
  }
  authorize(path: string) { this.db.prepare('INSERT OR REPLACE INTO grants VALUES(?,?)').run(realpathSync(path), this.identity(path)); }
  revoke(path: string) { let canonical = path; try { canonical = realpathSync(path); } catch {} this.db.prepare('DELETE FROM grants WHERE path=?').run(canonical); }
  start(id: string, prompt: string, workspace: string) { this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)').run(id,prompt,workspace,'running','',new Date().toISOString()); }
  finish(id: string, status: string, output: string) { this.db.prepare('UPDATE tasks SET status=?,output=? WHERE id=?').run(status,output,id); }
  removeBotData(privateRoots:string[],roots:string[]){
    this.db.exec('BEGIN IMMEDIATE');try{
      for(const id of roots)this.db.prepare("UPDATE tasks SET output='' WHERE id=?").run(id);
      for(const id of privateRoots)this.db.prepare('DELETE FROM tasks WHERE id=?').run(id);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  latest() { return this.db.prepare('SELECT * FROM tasks ORDER BY created DESC LIMIT 1').get(); }
  close() { this.db.close(); }
}

import type {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';

const LEDGER_DDL=`CREATE TABLE IF NOT EXISTS delivery_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS delivery_ledger_job ON delivery_ledger(job_id);`;
const MEMORY_DDL=`CREATE TABLE IF NOT EXISTS bot_memories(id INTEGER PRIMARY KEY AUTOINCREMENT, bot_id TEXT NOT NULL, conversation_id TEXT NOT NULL, content TEXT NOT NULL, source_kind TEXT NOT NULL, source_ref TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, supersedes INTEGER);
CREATE INDEX IF NOT EXISTS bot_memories_scope ON bot_memories(bot_id, conversation_id, active);`;
const SCALE_DDL=`CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation);
CREATE INDEX IF NOT EXISTS group_jobs_conversation ON group_jobs(conversation);
CREATE INDEX IF NOT EXISTS group_jobs_status ON group_jobs(status);`;

// A SQLite snapshot includes committed WAL content; copying the main file alone does not.
export function migrateWorkbench(db:DatabaseSync,file:string){
  const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if(version>4)throw Error('此数据由更新版本创建，请使用新版 FormaBot 打开。');
  if(version===4)return;
  const applyScale=()=>{db.exec(SCALE_DDL);db.exec('PRAGMA user_version=4;');};
  if(version===3){
    db.exec('BEGIN IMMEDIATE');
    try{applyScale();db.exec('COMMIT');}
    catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
    return;
  }
  if(version===2){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`${LEDGER_DDL}
      ${MEMORY_DDL}`);applyScale();db.exec('COMMIT');}
    catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
    return;
  }
  if(version===1){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`${LEDGER_DDL}
      ${MEMORY_DDL}`);applyScale();db.exec('COMMIT');}
    catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
    return;
  }
  const exists=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversations'").get();
  if(exists){
    const directory=join(dirname(file),'backups');mkdirSync(directory,{recursive:true,mode:0o700});
    const snapshot=join(directory,`${basename(file)}-before-e05a-${randomUUID()}.sqlite`);
    db.prepare('VACUUM INTO ?').run(snapshot);chmodSync(snapshot,0o600);
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL, members TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, conversation TEXT NOT NULL, speaker TEXT NOT NULL, content TEXT NOT NULL, task TEXT, artifacts TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS teams(workspace TEXT NOT NULL,manager TEXT NOT NULL,name TEXT NOT NULL,group_id TEXT NOT NULL UNIQUE,roster TEXT NOT NULL,PRIMARY KEY(workspace,manager,name));
      CREATE TABLE IF NOT EXISTS group_jobs(id TEXT PRIMARY KEY,root TEXT NOT NULL,conversation TEXT NOT NULL,member TEXT NOT NULL,instruction TEXT NOT NULL,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE bot_role_versions(bot_id TEXT NOT NULL,version INTEGER NOT NULL,role TEXT NOT NULL,source TEXT NOT NULL,actor_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(bot_id,version));
      ALTER TABLE messages ADD COLUMN author_kind TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE messages ADD COLUMN author_id TEXT;
      ALTER TABLE messages ADD COLUMN role_version INTEGER;
      ALTER TABLE group_jobs ADD COLUMN role_version INTEGER;
      CREATE INDEX messages_author ON messages(author_id);
      ${LEDGER_DDL}
      ${MEMORY_DDL}
      ${SCALE_DDL}
    `);
    db.prepare("INSERT INTO bot_role_versions SELECT id,1,role,'migration',NULL,? FROM conversations WHERE kind='bot'").run(new Date().toISOString());
    // Only execution records prove authorship. Never infer identity from a display name.
    // Reserved legacy labels cannot distinguish a human/system from an identically named Bot.
    db.exec(`UPDATE messages SET author_kind='bot',author_id=(SELECT member FROM group_jobs WHERE id=messages.task)
      WHERE speaker NOT IN ('你','系统') AND EXISTS (SELECT 1 FROM group_jobs j JOIN conversations c ON c.id=j.member WHERE j.id=messages.task AND c.kind='bot' AND j.conversation=messages.conversation);
      PRAGMA user_version=4;`);
    db.exec('COMMIT');
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}

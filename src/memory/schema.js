'use strict';
// Migração local explícita; dados e IDs não dependem do canal nem do provedor de IA.
const TABLES = ['settings', 'conversations', 'messages', 'attempts', 'notes', 'note_versions', 'digests', 'checkpoints', 'tasks', 'task_versions', 'audit'];
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS conversations(
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, channel TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS messages(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), owner TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TEXT NOT NULL,
 client_id TEXT, status TEXT NOT NULL DEFAULT 'saved', reply_to TEXT REFERENCES messages(id),
 error_code TEXT, refs TEXT NOT NULL DEFAULT '[]', UNIQUE(owner, client_id)
) STRICT;
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS attempts(
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id), owner TEXT NOT NULL,
 created_at TEXT NOT NULL, status TEXT NOT NULL, model TEXT NOT NULL,
 input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
 request_id TEXT, error_code TEXT, usage_known INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE IF NOT EXISTS notes(
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
 area TEXT NOT NULL DEFAULT 'Geral', source_id TEXT REFERENCES messages(id), pinned INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'active', revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS note_versions(
 id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(note_id, revision)
) STRICT;
CREATE TABLE IF NOT EXISTS digests(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
 content TEXT NOT NULL, source_ids TEXT NOT NULL, method TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS checkpoints(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), owner TEXT NOT NULL,
 reason TEXT NOT NULL, topic TEXT NOT NULL, next_step TEXT NOT NULL, digest_id TEXT REFERENCES digests(id),
 last_message_id TEXT REFERENCES messages(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS tasks(
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, area TEXT NOT NULL, state TEXT NOT NULL,
 priority INTEGER NOT NULL DEFAULT 0, due_at TEXT, original_due_at TEXT, source_id TEXT REFERENCES messages(id),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS task_versions(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(task_id, revision)
) STRICT;
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, event TEXT NOT NULL, entity_id TEXT, created_at TEXT NOT NULL) STRICT;

`;
module.exports = { SCHEMA, TABLES };

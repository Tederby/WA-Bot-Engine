/**
 * SQLite Database Engine
 *
 * Central database connection used by all modules.
 * Uses WAL (Write-Ahead Logging) mode for safe concurrent access
 * from multiple bot processes (PM2 instances).
 *
 * Tables are auto-created on first connection.
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "database.db");

const db = new Database(DB_PATH);

// ── Performance & Safety Pragmas ────────────────────────────────────────────
// WAL mode allows concurrent readers + one writer without blocking
db.pragma("journal_mode = WAL");
// Wait up to 5 seconds if another process is writing
db.pragma("busy_timeout = 5000");
// Sync only at critical moments (good balance of speed & safety)
db.pragma("synchronous = NORMAL");

// ── Schema Initialization ───────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        registered INTEGER DEFAULT 0,
        registered_at INTEGER,
        name TEXT,
        banned INTEGER DEFAULT 0,
        banned_at INTEGER,
        banned_by TEXT,
        ban_reason TEXT,
        meta TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        welcome INTEGER DEFAULT 0,
        welcome_text TEXT DEFAULT '',
        goodbye INTEGER DEFAULT 0,
        goodbye_text TEXT DEFAULT '',
        registered INTEGER DEFAULT 0,
        registered_at INTEGER,
        registered_by TEXT,
        banned INTEGER DEFAULT 0,
        banned_at INTEGER,
        banned_by TEXT,
        ban_reason TEXT,
        auto_replies TEXT DEFAULT '{}',
        meta TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS group_banned_users (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS message_claims (
        id TEXT PRIMARY KEY,
        bot_id TEXT,
        created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bot_registry (
        bot_id TEXT PRIMARY KEY,
        jid TEXT,
        last_seen INTEGER
    );

    CREATE TABLE IF NOT EXISTS identity_map (
        lid TEXT PRIMARY KEY,
        pn TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_identity_pn ON identity_map(pn);
    CREATE INDEX IF NOT EXISTS idx_claims_created ON message_claims(created_at);
`);

export default db;

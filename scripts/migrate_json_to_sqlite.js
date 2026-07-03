/**
 * Migration Script — JSON → SQLite
 *
 * One-time script to migrate existing data from database.json
 * into the new SQLite database (database.db).
 *
 * Usage: node scripts/migrate_json_to_sqlite.js
 *
 * Safe to run multiple times (uses INSERT OR IGNORE / ON CONFLICT).
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_JSON_PATH = path.resolve(process.cwd(), "database.json");
const DB_SQLITE_PATH = path.resolve(process.cwd(), "database.db");

console.log("╭━━━〔 📦 JSON → SQLite Migration 〕━━━");
console.log("┃ Source : " + DB_JSON_PATH);
console.log("┃ Target : " + DB_SQLITE_PATH);
console.log("╰━━━━━━━━━━━━━━━━━━━━");

// ── Read JSON ───────────────────────────────────────────────────────────────

if (!fs.existsSync(DB_JSON_PATH)) {
    console.log("\n⚠️  database.json not found — nothing to migrate.");
    process.exit(0);
}

let jsonData;
try {
    jsonData = JSON.parse(fs.readFileSync(DB_JSON_PATH, "utf-8"));
    console.log("\n✅ Loaded database.json");
} catch (err) {
    console.error("\n❌ Failed to parse database.json:", err.message);
    process.exit(1);
}

// ── Open SQLite ─────────────────────────────────────────────────────────────

const db = new Database(DB_SQLITE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

// Create tables (same as lib/db.js)
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
`);

// ── Migrate Users ───────────────────────────────────────────────────────────

const upsertUser = db.prepare(`
    INSERT INTO users (id, registered, registered_at, name, banned, banned_at, banned_by, ban_reason, meta)
    VALUES (@id, @registered, @registered_at, @name, @banned, @banned_at, @banned_by, @ban_reason, @meta)
    ON CONFLICT(id) DO UPDATE SET
        registered = @registered,
        registered_at = @registered_at,
        name = @name,
        banned = @banned,
        banned_at = @banned_at,
        banned_by = @banned_by,
        ban_reason = @ban_reason,
        meta = @meta
`);

let userCount = 0;
if (jsonData.users) {
    const tx = db.transaction(() => {
        for (const [id, data] of Object.entries(jsonData.users)) {
            upsertUser.run({
                id,
                registered: data.registered ? 1 : 0,
                registered_at: data.registeredAt ?? null,
                name: data.name ?? null,
                banned: data.banned ? 1 : 0,
                banned_at: data.bannedAt ?? null,
                banned_by: data.bannedBy ?? null,
                ban_reason: data.banReason ?? null,
                meta: JSON.stringify(data.meta || {}),
            });
            userCount++;
        }
    });
    tx();
}
console.log(`✅ Migrated ${userCount} user(s)`);

// ── Migrate Groups ──────────────────────────────────────────────────────────

const upsertGroup = db.prepare(`
    INSERT INTO groups (id, welcome, welcome_text, goodbye, goodbye_text, registered, registered_at, registered_by, banned, banned_at, banned_by, ban_reason, auto_replies, meta)
    VALUES (@id, @welcome, @welcome_text, @goodbye, @goodbye_text, @registered, @registered_at, @registered_by, @banned, @banned_at, @banned_by, @ban_reason, @auto_replies, @meta)
    ON CONFLICT(id) DO UPDATE SET
        welcome = @welcome,
        welcome_text = @welcome_text,
        goodbye = @goodbye,
        goodbye_text = @goodbye_text,
        registered = @registered,
        registered_at = @registered_at,
        registered_by = @registered_by,
        banned = @banned,
        banned_at = @banned_at,
        banned_by = @banned_by,
        ban_reason = @ban_reason,
        auto_replies = @auto_replies,
        meta = @meta
`);

const addGroupBan = db.prepare("INSERT OR IGNORE INTO group_banned_users (group_id, user_id) VALUES (?, ?)");

let groupCount = 0;
let bannedUserCount = 0;

if (jsonData.groups) {
    const tx = db.transaction(() => {
        for (const [id, data] of Object.entries(jsonData.groups)) {
            upsertGroup.run({
                id,
                welcome: data.welcome ? 1 : 0,
                welcome_text: data.welcomeText ?? "",
                goodbye: data.goodbye ? 1 : 0,
                goodbye_text: data.goodbyeText ?? "",
                registered: data.registered ? 1 : 0,
                registered_at: data.registeredAt ?? null,
                registered_by: data.registeredBy ?? null,
                banned: data.banned ? 1 : 0,
                banned_at: data.bannedAt ?? null,
                banned_by: data.bannedBy ?? null,
                ban_reason: data.banReason ?? null,
                auto_replies: JSON.stringify(data.autoReplies || {}),
                meta: JSON.stringify(data.meta || {}),
            });
            groupCount++;

            // Migrate bannedUsers array to junction table
            if (Array.isArray(data.bannedUsers)) {
                for (const userId of data.bannedUsers) {
                    addGroupBan.run(id, userId);
                    bannedUserCount++;
                }
            }
        }
    });
    tx();
}

console.log(`✅ Migrated ${groupCount} group(s)`);
if (bannedUserCount > 0) {
    console.log(`✅ Migrated ${bannedUserCount} group-level ban(s)`);
}

// ── Summary ─────────────────────────────────────────────────────────────────

db.close();

console.log("\n╭━━━〔 ✅ Migration Complete 〕━━━");
console.log(`┃ Users  : ${userCount}`);
console.log(`┃ Groups : ${groupCount}`);
console.log(`┃ Bans   : ${bannedUserCount}`);
console.log("╰━━━━━━━━━━━━━━━━━━━━");
console.log("\n💡 Tip: database.json is no longer used. You can archive or delete it.");

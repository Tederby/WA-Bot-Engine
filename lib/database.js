/**
 * Database Module — SQLite Backend
 *
 * Drop-in replacement for the old JSON-based database.
 * All exported function signatures remain identical so that
 * existing commands and middleware require ZERO changes.
 *
 * Uses better-sqlite3 with WAL mode (via lib/db.js) for safe
 * concurrent access from multiple bot processes.
 */

import db from "./db.js";

// ── Default Schemas ─────────────────────────────────────────────────────────

const DEFAULT_USER = {
    registered: false,
    registeredAt: null,
    name: null,
    banned: false,
    bannedAt: null,
    bannedBy: null,
    banReason: null,
    meta: {},
};

const DEFAULT_GROUP = {
    welcome: false,
    welcomeText: "",
    goodbye: false,
    goodbyeText: "",
    registered: false,
    registeredAt: null,
    registeredBy: null,
    bannedUsers: [],
    banned: false,
    bannedAt: null,
    bannedBy: null,
    banReason: null,
    autoReplies: {},
    meta: {},
};

// ── Prepared Statements (cached for performance) ────────────────────────────

const stmts = {
    // Users
    getUser: db.prepare("SELECT * FROM users WHERE id = ?"),
    upsertUser: db.prepare(`
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
    `),
    allUsers: db.prepare("SELECT * FROM users"),
    allBannedUsers: db.prepare("SELECT * FROM users WHERE banned = 1"),

    // Groups
    getGroup: db.prepare("SELECT * FROM groups WHERE id = ?"),
    upsertGroup: db.prepare(`
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
    `),
    allGroups: db.prepare("SELECT * FROM groups"),
    allBannedGroups: db.prepare("SELECT * FROM groups WHERE banned = 1"),

    // Group Banned Users
    getGroupBanned: db.prepare("SELECT user_id FROM group_banned_users WHERE group_id = ?"),
    addGroupBan: db.prepare("INSERT OR IGNORE INTO group_banned_users (group_id, user_id) VALUES (?, ?)"),
    removeGroupBan: db.prepare("DELETE FROM group_banned_users WHERE group_id = ? AND user_id = ?"),
    isGroupBanned: db.prepare("SELECT 1 FROM group_banned_users WHERE group_id = ? AND user_id = ? LIMIT 1"),
};

// ── Row Converters ──────────────────────────────────────────────────────────

function rowToUser(row) {
    if (!row) return null;
    return {
        registered: !!row.registered,
        registeredAt: row.registered_at,
        name: row.name,
        banned: !!row.banned,
        bannedAt: row.banned_at,
        bannedBy: row.banned_by,
        banReason: row.ban_reason,
        meta: safeJsonParse(row.meta, {}),
    };
}

function userToParams(id, data) {
    return {
        id,
        registered: data.registered ? 1 : 0,
        registered_at: data.registeredAt ?? null,
        name: data.name ?? null,
        banned: data.banned ? 1 : 0,
        banned_at: data.bannedAt ?? null,
        banned_by: data.bannedBy ?? null,
        ban_reason: data.banReason ?? null,
        meta: JSON.stringify(data.meta || {}),
    };
}

function rowToGroup(row) {
    if (!row) return null;
    const bannedUsers = stmts.getGroupBanned.all(row.id).map(r => r.user_id);
    return {
        welcome: !!row.welcome,
        welcomeText: row.welcome_text || "",
        goodbye: !!row.goodbye,
        goodbyeText: row.goodbye_text || "",
        registered: !!row.registered,
        registeredAt: row.registered_at,
        registeredBy: row.registered_by,
        bannedUsers,
        banned: !!row.banned,
        bannedAt: row.banned_at,
        bannedBy: row.banned_by,
        banReason: row.ban_reason,
        autoReplies: safeJsonParse(row.auto_replies, {}),
        meta: safeJsonParse(row.meta, {}),
    };
}

function groupToParams(id, data) {
    return {
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
    };
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

// ── Core I/O (backward compat) ──────────────────────────────────────────────

/**
 * Get the entire database as a plain object.
 * Used by info.js for stats display. Prefer specific getters for normal use.
 */
export function getDB() {
    const users = {};
    for (const row of stmts.allUsers.all()) {
        users[row.id] = rowToUser(row);
    }
    const groups = {};
    for (const row of stmts.allGroups.all()) {
        groups[row.id] = rowToGroup(row);
    }
    return { users, groups };
}

/**
 * @deprecated Use specific save functions instead.
 * Kept for backward compatibility — performs full upsert of all data.
 */
export function saveDB(data) {
    const tx = db.transaction(() => {
        if (data.users) {
            for (const [id, userData] of Object.entries(data.users)) {
                stmts.upsertUser.run(userToParams(id, { ...DEFAULT_USER, ...userData }));
            }
        }
        if (data.groups) {
            for (const [id, groupData] of Object.entries(data.groups)) {
                stmts.upsertGroup.run(groupToParams(id, { ...DEFAULT_GROUP, ...groupData }));
            }
        }
    });
    tx();
}

// ── User Operations ─────────────────────────────────────────────────────────

/**
 * Get user record, initializing with defaults if not found.
 */
export function getUser(userId) {
    const row = stmts.getUser.get(userId);
    if (!row) {
        stmts.upsertUser.run(userToParams(userId, DEFAULT_USER));
        return { ...DEFAULT_USER };
    }
    return { ...DEFAULT_USER, ...rowToUser(row) };
}

/**
 * Save user data back to database.
 */
export function saveUser(userId, data) {
    stmts.upsertUser.run(userToParams(userId, { ...DEFAULT_USER, ...data }));
}

/**
 * Register a user.
 */
export function registerUser(userId, name) {
    const current = getUser(userId);
    current.registered = true;
    current.registeredAt = Date.now();
    current.name = name || current.name;
    saveUser(userId, current);
    return current;
}

/**
 * Unregister a user (keep record but reset registration).
 */
export function unregisterUser(userId) {
    const row = stmts.getUser.get(userId);
    if (!row) return;
    const user = rowToUser(row);
    user.registered = false;
    user.registeredAt = null;
    saveUser(userId, user);
}

/**
 * Quick check: is user registered?
 */
export function isRegistered(userId) {
    const row = stmts.getUser.get(userId);
    return row ? !!row.registered : false;
}

// ── User Ban (Global — Owner Only) ──────────────────────────────────────────

/**
 * Ban a user globally. They cannot use the bot anywhere.
 */
export function banUser(userId, bannedBy, reason) {
    const current = getUser(userId);
    current.banned = true;
    current.bannedAt = Date.now();
    current.bannedBy = bannedBy;
    current.banReason = reason || null;
    saveUser(userId, current);
    return current;
}

/**
 * Unban a user globally.
 */
export function unbanUser(userId) {
    const row = stmts.getUser.get(userId);
    if (!row) return;
    const user = rowToUser(row);
    user.banned = false;
    user.bannedAt = null;
    user.bannedBy = null;
    user.banReason = null;
    saveUser(userId, user);
}

/**
 * Quick check: is user globally banned?
 */
export function isBanned(userId) {
    const row = stmts.getUser.get(userId);
    return row ? !!row.banned : false;
}

/**
 * List all globally banned users.
 * @returns {Array<{userId: string, data: object}>}
 */
export function getAllBannedUsers() {
    return stmts.allBannedUsers.all().map(row => ({
        userId: row.id,
        data: rowToUser(row),
    }));
}

// ── Group Operations ────────────────────────────────────────────────────────

/**
 * Get group config, initializing with defaults if not found.
 * Backward-compatible with existing welcome/goodbye data.
 */
export function getGroupConfig(chatId) {
    const row = stmts.getGroup.get(chatId);
    if (!row) {
        stmts.upsertGroup.run(groupToParams(chatId, DEFAULT_GROUP));
        return { ...DEFAULT_GROUP, bannedUsers: [], autoReplies: {} };
    }
    const merged = { ...DEFAULT_GROUP, ...rowToGroup(row) };
    if (!Array.isArray(merged.bannedUsers)) merged.bannedUsers = [];
    if (!merged.autoReplies || typeof merged.autoReplies !== "object" || Array.isArray(merged.autoReplies)) {
        merged.autoReplies = {};
    }
    return merged;
}

/**
 * Save group config back to database.
 */
export function saveGroupConfig(chatId, config) {
    stmts.upsertGroup.run(groupToParams(chatId, { ...DEFAULT_GROUP, ...config }));
    // Sync bannedUsers array to the junction table
    if (Array.isArray(config.bannedUsers)) {
        // Get current banned users in DB
        const current = stmts.getGroupBanned.all(chatId).map(r => r.user_id);
        // Add new ones
        for (const uid of config.bannedUsers) {
            if (!current.includes(uid)) {
                stmts.addGroupBan.run(chatId, uid);
            }
        }
        // Remove ones no longer in the list
        for (const uid of current) {
            if (!config.bannedUsers.includes(uid)) {
                stmts.removeGroupBan.run(chatId, uid);
            }
        }
    }
}

/**
 * Register a group.
 */
export function registerGroup(chatId, registeredBy) {
    const current = getGroupConfig(chatId);
    current.registered = true;
    current.registeredAt = Date.now();
    current.registeredBy = registeredBy;
    saveGroupConfig(chatId, current);
    return current;
}

/**
 * Unregister a group (keep record but reset registration).
 */
export function unregisterGroup(chatId) {
    const row = stmts.getGroup.get(chatId);
    if (!row) return;
    const group = rowToGroup(row);
    group.registered = false;
    group.registeredAt = null;
    group.registeredBy = null;
    saveGroupConfig(chatId, group);
}

// ── Group Ban (Global — Owner bans entire group) ────────────────────────────

/**
 * Ban a group globally. Bot stops responding in this group.
 */
export function banGroup(chatId, bannedBy, reason) {
    const current = getGroupConfig(chatId);
    current.banned = true;
    current.bannedAt = Date.now();
    current.bannedBy = bannedBy;
    current.banReason = reason || null;
    saveGroupConfig(chatId, current);
    return current;
}

/**
 * Unban a group globally.
 */
export function unbanGroup(chatId) {
    const row = stmts.getGroup.get(chatId);
    if (!row) return;
    const group = rowToGroup(row);
    group.banned = false;
    group.bannedAt = null;
    group.bannedBy = null;
    group.banReason = null;
    saveGroupConfig(chatId, group);
}

/**
 * Quick check: is group globally banned?
 */
export function isGroupBanned(chatId) {
    const row = stmts.getGroup.get(chatId);
    return row ? !!row.banned : false;
}

/**
 * List all globally banned groups.
 * @returns {Array<{chatId: string, data: object}>}
 */
export function getAllBannedGroups() {
    return stmts.allBannedGroups.all().map(row => ({
        chatId: row.id,
        data: rowToGroup(row),
    }));
}

// ── Group-Level User Ban (Admin/Owner bans user in specific group) ──────────

/**
 * Ban a user in a specific group.
 */
export function banUserInGroup(chatId, userId) {
    stmts.addGroupBan.run(chatId, userId);
}

/**
 * Unban a user in a specific group.
 */
export function unbanUserInGroup(chatId, userId) {
    stmts.removeGroupBan.run(chatId, userId);
}

/**
 * Quick check: is user banned in a specific group?
 */
export function isUserGroupBanned(chatId, userId) {
    return !!stmts.isGroupBanned.get(chatId, userId);
}

/**
 * List all banned users in a specific group.
 * @returns {string[]}
 */
export function getGroupBannedUsers(chatId) {
    return stmts.getGroupBanned.all(chatId).map(r => r.user_id);
}

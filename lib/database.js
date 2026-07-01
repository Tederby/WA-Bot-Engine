import fs from "fs";
import path from "path";

const dbFile = path.resolve(process.cwd(), "database.json");

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
    autoReplies: {}, // key = trigger, value = { text, mentions }
    meta: {},
};

// ── Core I/O ────────────────────────────────────────────────────────────────

export function getDB() {
    if (!fs.existsSync(dbFile)) return { users: {}, groups: {} };
    try {
        const data = JSON.parse(fs.readFileSync(dbFile, "utf-8"));
        // Auto-migration: ensure top-level keys exist
        if (!data.users) data.users = {};
        if (!data.groups) data.groups = {};
        return data;
    } catch (e) {
        return { users: {}, groups: {} };
    }
}

export function saveDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), "utf-8");
}

// ── User Operations ─────────────────────────────────────────────────────────

/**
 * Get user record, initializing with defaults if not found.
 * Does NOT auto-save — caller decides when to persist.
 */
export function getUser(userId) {
    const db = getDB();
    if (!db.users[userId]) {
        db.users[userId] = { ...DEFAULT_USER };
        saveDB(db);
    }
    // Merge defaults for backward compat (new fields added later)
    return { ...DEFAULT_USER, ...db.users[userId] };
}

/**
 * Save user data back to database.
 */
export function saveUser(userId, data) {
    const db = getDB();
    db.users[userId] = data;
    saveDB(db);
}

/**
 * Register a user.
 */
export function registerUser(userId, name) {
    const db = getDB();
    const user = { ...DEFAULT_USER, ...db.users[userId] };
    user.registered = true;
    user.registeredAt = Date.now();
    user.name = name || user.name;
    db.users[userId] = user;
    saveDB(db);
    return user;
}

/**
 * Unregister a user (keep record but reset registration).
 */
export function unregisterUser(userId) {
    const db = getDB();
    if (!db.users[userId]) return;
    db.users[userId].registered = false;
    db.users[userId].registeredAt = null;
    saveDB(db);
}

/**
 * Quick check: is user registered?
 */
export function isRegistered(userId) {
    const db = getDB();
    return db.users[userId]?.registered === true;
}

// ── User Ban (Global — Owner Only) ──────────────────────────────────────────

/**
 * Ban a user globally. They cannot use the bot anywhere.
 */
export function banUser(userId, bannedBy, reason) {
    const db = getDB();
    const user = { ...DEFAULT_USER, ...db.users[userId] };
    user.banned = true;
    user.bannedAt = Date.now();
    user.bannedBy = bannedBy;
    user.banReason = reason || null;
    db.users[userId] = user;
    saveDB(db);
    return user;
}

/**
 * Unban a user globally.
 */
export function unbanUser(userId) {
    const db = getDB();
    if (!db.users[userId]) return;
    db.users[userId].banned = false;
    db.users[userId].bannedAt = null;
    db.users[userId].bannedBy = null;
    db.users[userId].banReason = null;
    saveDB(db);
}

/**
 * Quick check: is user globally banned?
 */
export function isBanned(userId) {
    const db = getDB();
    return db.users[userId]?.banned === true;
}

/**
 * List all globally banned users.
 * @returns {Array<{userId: string, data: object}>}
 */
export function getAllBannedUsers() {
    const db = getDB();
    return Object.entries(db.users)
        .filter(([, u]) => u.banned === true)
        .map(([userId, data]) => ({ userId, data }));
}

// ── Group Operations ────────────────────────────────────────────────────────

/**
 * Get group config, initializing with defaults if not found.
 * Backward-compatible with existing welcome/goodbye data.
 */
export function getGroupConfig(chatId) {
    const db = getDB();
    if (!db.groups[chatId]) {
        db.groups[chatId] = { ...DEFAULT_GROUP };
        saveDB(db);
    }
    // Merge defaults for backward compat
    const merged = { ...DEFAULT_GROUP, ...db.groups[chatId] };
    // Ensure arrays are arrays (not overwritten by spread)
    if (!Array.isArray(merged.bannedUsers)) merged.bannedUsers = [];
    if (!merged.autoReplies || typeof merged.autoReplies !== 'object' || Array.isArray(merged.autoReplies)) {
        merged.autoReplies = {};
    }
    return merged;
}

/**
 * Save group config back to database.
 */
export function saveGroupConfig(chatId, config) {
    const db = getDB();
    if (!db.groups) db.groups = {};
    db.groups[chatId] = config;
    saveDB(db);
}

/**
 * Register a group.
 */
export function registerGroup(chatId, registeredBy) {
    const db = getDB();
    const group = { ...DEFAULT_GROUP, ...db.groups[chatId] };
    group.registered = true;
    group.registeredAt = Date.now();
    group.registeredBy = registeredBy;
    db.groups[chatId] = group;
    saveDB(db);
    return group;
}

/**
 * Unregister a group (keep record but reset registration).
 */
export function unregisterGroup(chatId) {
    const db = getDB();
    if (!db.groups[chatId]) return;
    db.groups[chatId].registered = false;
    db.groups[chatId].registeredAt = null;
    db.groups[chatId].registeredBy = null;
    saveDB(db);
}

// ── Group Ban (Global — Owner bans entire group) ────────────────────────────

/**
 * Ban a group globally. Bot stops responding in this group.
 */
export function banGroup(chatId, bannedBy, reason) {
    const db = getDB();
    const group = { ...DEFAULT_GROUP, ...db.groups[chatId] };
    group.banned = true;
    group.bannedAt = Date.now();
    group.bannedBy = bannedBy;
    group.banReason = reason || null;
    db.groups[chatId] = group;
    saveDB(db);
    return group;
}

/**
 * Unban a group globally.
 */
export function unbanGroup(chatId) {
    const db = getDB();
    if (!db.groups[chatId]) return;
    db.groups[chatId].banned = false;
    db.groups[chatId].bannedAt = null;
    db.groups[chatId].bannedBy = null;
    db.groups[chatId].banReason = null;
    saveDB(db);
}

/**
 * Quick check: is group globally banned?
 */
export function isGroupBanned(chatId) {
    const db = getDB();
    return db.groups[chatId]?.banned === true;
}

/**
 * List all globally banned groups.
 * @returns {Array<{chatId: string, data: object}>}
 */
export function getAllBannedGroups() {
    const db = getDB();
    return Object.entries(db.groups)
        .filter(([, g]) => g.banned === true)
        .map(([chatId, data]) => ({ chatId, data }));
}

// ── Group-Level User Ban (Admin/Owner bans user in specific group) ──────────

/**
 * Ban a user in a specific group.
 */
export function banUserInGroup(chatId, userId) {
    const db = getDB();
    const group = { ...DEFAULT_GROUP, ...db.groups[chatId] };
    if (!Array.isArray(group.bannedUsers)) group.bannedUsers = [];
    if (!group.bannedUsers.includes(userId)) {
        group.bannedUsers.push(userId);
    }
    db.groups[chatId] = group;
    saveDB(db);
}

/**
 * Unban a user in a specific group.
 */
export function unbanUserInGroup(chatId, userId) {
    const db = getDB();
    if (!db.groups[chatId]) return;
    const group = db.groups[chatId];
    if (!Array.isArray(group.bannedUsers)) return;
    group.bannedUsers = group.bannedUsers.filter(id => id !== userId);
    saveDB(db);
}

/**
 * Quick check: is user banned in a specific group?
 */
export function isUserGroupBanned(chatId, userId) {
    const db = getDB();
    const group = db.groups[chatId];
    if (!group || !Array.isArray(group.bannedUsers)) return false;
    return group.bannedUsers.includes(userId);
}

/**
 * List all banned users in a specific group.
 * @returns {string[]}
 */
export function getGroupBannedUsers(chatId) {
    const db = getDB();
    const group = db.groups[chatId];
    if (!group || !Array.isArray(group.bannedUsers)) return [];
    return group.bannedUsers;
}

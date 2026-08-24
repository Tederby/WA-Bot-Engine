/**
 * Context Builder — Extracts sender, group, and admin info from a message.
 *
 * Previously all this logic lived inline in handler.js (~50 lines).
 * Now the handler just calls `buildContext(message, sock)` and gets
 * a clean object back.
 */

import setting from "../setting.js";
import { isBotAdmin, saveIdentityMapping, resolveUserId } from "./database.js"; // isBotAdmin is [OPTIONAL] — part of the built-in admin system

// ── Group Metadata Cache (TTL-based) ────────────────────────────────────────
// Prevents repeated network calls to WhatsApp servers on every message.
const groupMetadataCache = new Map();
const GROUP_METADATA_TTL = 60_000; // 60 seconds

/**
 * Get group metadata with caching.
 * @param {object} sock - Baileys WASocket
 * @param {string} chatId - Group JID
 * @returns {Promise<object>}
 */
async function getCachedGroupMetadata(sock, chatId) {
    const cached = groupMetadataCache.get(chatId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < GROUP_METADATA_TTL)) {
        return cached.data;
    }
    try {
        const metadata = await sock.groupMetadata(chatId);
        groupMetadataCache.set(chatId, { data: metadata, timestamp: now });
        return metadata;
    } catch (err) {
        // If fetch fails, return stale cache if available, otherwise empty
        return cached ? cached.data : {};
    }
}

/**
 * @typedef {Object} MessageContext
 * @property {string} sender - Normalized sender JID
 * @property {string} pushname - Display name or fallback to sender
 * @property {boolean} isGroup - Whether this is a group message
 * @property {object} groupMetadata - Group metadata (empty if DM)
 * @property {string} groupName - Group subject (empty if DM)
 * @property {boolean} isGroupAdmins - Whether sender is a group admin
 * @property {boolean} isBotGroupAdmins - Whether bot is a group admin
 * @property {string} ownerNumber - Owner's JID
 * @property {string} botNumber - Bot's JID
 * @property {boolean} isOwner - Whether sender is the system owner
 * @property {boolean} isBotAdmin - Whether sender is a bot admin
 */

/**
 * Build a full context object from a message.
 *
 * @param {object} message - Extended WAMessage from Messages()
 * @param {object} sock - Baileys WASocket
 * @returns {Promise<MessageContext>}
 */
export async function buildContext(message, sock) {
    const isGroup = message.isGroup;
    const groupMetadata = isGroup
        ? await getCachedGroupMetadata(sock, message.chat)
        : {};

    // ── Resolve sender (handles LID addressing mode) ────────────────
    let sender;
    if (!message.key.addressingMode || message.key.addressingMode === "pn") {
        // PN (phone number) mode — standard JID
        // For private chats, if not from bot itself (fromMe), check remoteJidAlt
        if (!isGroup && !message.key.fromMe && message.key.remoteJidAlt) {
            sender = message.key.remoteJidAlt;
        } else {
            sender = message.sender;
        }
    } else {
        // LID mode — use alternative identity
        // For other people in PC, remoteJidAlt is their alternative identity.
        sender = message.key.fromMe ? message.sender : (message.key.remoteJidAlt || message.sender);
    }

    // ── Helper: Normalize JID for strict matching ────────────────────
    const normalizeForCompare = (jid) => {
        if (!jid) return "";
        let base = resolveUserId(jid).split(":")[0].split("@")[0];
        if (base.startsWith("0")) base = setting.defaultCountryCode + base.slice(1);
        return base;
    };

    // ── Group admin checks ──────────────────────────────────────────
    let isGroupAdmins = false;
    let isBotGroupAdmins = false;

    if (isGroup) {
        const isLidMode = message.key.addressingMode && message.key.addressingMode !== "pn";

        const adminIds = groupMetadata.participants
            .filter((p) => p.admin)
            .map((p) => {
                if (!isLidMode) {
                    return p.id;
                }
                return p.phoneNumber || p.id;
            });

        // Resolve sender for LID in group context
        if (isLidMode) {
            sender = message.key.participantAlt || message.sender;
            // Passive: save LID → PN mapping for identity resolution
            if (sender !== message.sender && message.sender.endsWith("@lid")) {
                saveIdentityMapping(message.sender, sender);
            }
        }

        // Sanitize sender — strip device ID for consistent DB lookups
        if (sender && sender.includes(":")) {
            sender = sender.split(":")[0] + (sender.includes("@") ? "@" + sender.split("@")[1] : "");
        }

        const senderBase = normalizeForCompare(sender);
        isGroupAdmins = adminIds.some(id => normalizeForCompare(id) === senderBase);

        const botBase = normalizeForCompare(sock.user.id);
        isBotGroupAdmins = adminIds.some(id => normalizeForCompare(id) === botBase);
    } else {
        // Also sanitize sender in private chats (strip device ID)
        if (sender && sender.includes(":")) {
            sender = sender.split(":")[0] + (sender.includes("@") ? "@" + sender.split("@")[1] : "");
        }
    }

    const groupName = isGroup ? groupMetadata.subject : "";
    const pushname = message.pushName || sender;
    const botNumber = sock.user.id;
    
    // ── Owner & Bot Admin Checks (Strict Normalization Match) ───────
    const ownerNumbers = setting.owner.map(num => num + "@s.whatsapp.net");
    const senderCompare = normalizeForCompare(sender);
    const isOwner = setting.owner.some(num => normalizeForCompare(num) === senderCompare);
    
    // isBotAdmin(sender) is safe to call because sender is already sanitized (device ID stripped)
    const isBotAdminStatus = isOwner || isBotAdmin(sender);

    return {
        sender,
        pushname,
        isGroup,
        groupMetadata,
        groupName,
        isGroupAdmins,
        isBotGroupAdmins,
        ownerNumbers,
        botNumber,
        isOwner,
        isBotAdmin: isBotAdminStatus,
    };
}

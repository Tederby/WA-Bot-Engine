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
        sender = message.sender;
    } else {
        sender = message.key.remoteJidAlt || message.sender;
    }

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

        isGroupAdmins = adminIds.includes(sender);

        // Fix: resolve bot JID the same way as admin IDs to handle LID mode
        let botJid = sock.user.id;
        if (isLidMode) {
            // In LID mode, adminIds contains PN values — resolve bot JID to PN too
            botJid = resolveUserId(botJid);
            // Also try matching the raw bot ID (handles edge cases)
            const botBase = botJid.split(":")[0].split("@")[0];
            isBotGroupAdmins = adminIds.some(id => {
                const idBase = id.split(":")[0].split("@")[0];
                return idBase === botBase;
            });
        } else {
            isBotGroupAdmins = adminIds.includes(botJid);
        }
    }

    const groupName = isGroup ? groupMetadata.subject : "";
    const pushname = message.pushName || sender;
    const botNumber = sock.user.id;
    const ownerNumbers = setting.owner.map(num => num + "@s.whatsapp.net");
    const isOwner = ownerNumbers.includes(sender);

    // [OPTIONAL] Bot admin system — remove if not needed
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

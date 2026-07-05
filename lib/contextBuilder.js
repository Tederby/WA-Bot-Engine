/**
 * Context Builder — Extracts sender, group, and admin info from a message.
 *
 * Previously all this logic lived inline in handler.js (~50 lines).
 * Now the handler just calls `buildContext(message, sock)` and gets
 * a clean object back.
 */

import setting from "../setting.js";
import { isBotAdmin, saveIdentityMapping } from "./database.js";

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
        ? await sock.groupMetadata(message.chat)
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
        const adminIds = groupMetadata.participants
            .filter((p) => p.admin)
            .map((p) => {
                if (!message.key.addressingMode || message.key.addressingMode === "pn") {
                    return p.id;
                }
                return p.phoneNumber || p.id;
            });

        // Resolve sender for LID in group context
        if (message.key.addressingMode && message.key.addressingMode !== "pn") {
            sender = message.key.participantAlt || message.sender;
            // Pasif: simpan mapping LID → PN untuk resolusi identity nanti
            if (sender !== message.sender && message.sender.endsWith("@lid")) {
                saveIdentityMapping(message.sender, sender);
            }
        }

        isGroupAdmins = adminIds.includes(sender);
        isBotGroupAdmins = adminIds.includes(sock.user.id);
    }

    const groupName = isGroup ? groupMetadata.subject : "";
    const pushname = message.pushName || sender;
    const botNumber = sock.user.id;
    const ownerNumbers = setting.owner.map(num => num + "@s.whatsapp.net");
    const isOwner = ownerNumbers.includes(sender);
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

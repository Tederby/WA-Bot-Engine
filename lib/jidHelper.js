/**
 * JID Helper — Shared utilities for resolving WhatsApp JIDs.
 *
 * Centralizes the pattern: raw JID → jidNormalizedUser() → resolveUserId() → canonical PN.
 * All commands should use these helpers instead of rolling their own resolution logic.
 */

import { jidNormalizedUser } from "baileys";
import { resolveUserId } from "./database.js";
import setting from "../setting.js";

/**
 * Resolve a raw JID to canonical PN form + extract baseId.
 *
 * Steps:
 *  1. jidNormalizedUser() — strip device ID (e.g. "62812:34@s.whatsapp.net" → "62812@s.whatsapp.net")
 *  2. resolveUserId() — convert LID → PN via identity_map table
 *
 * @param {string} rawJid - Raw JID from mention/quoted/participant
 * @returns {{ jid: string|null, baseId: string|null }}
 *   - jid: canonical PN JID (e.g. "62812xxx@s.whatsapp.net") — safe for DB + mentions
 *   - baseId: phone number base (e.g. "62812xxx") — safe for text display @baseId
 */
export function resolveTarget(rawJid) {
    if (!rawJid) return { jid: null, baseId: null };
    const jid = resolveUserId(jidNormalizedUser(rawJid));
    const baseId = jid.split("@")[0];
    return { jid, baseId };
}

/**
 * Extract target JID from message context.
 *
 * Priority: mention > quoted > args (manual phone number).
 *
 * When a manual number is provided, local-format numbers starting with "0"
 * are normalized using `setting.defaultCountryCode` (e.g. "08123..." → "628123...").
 *
 * @param {object} message - Extended WAMessage
 * @param {string[]} [args] - Command arguments
 * @returns {{ raw: string, jid: string, baseId: string } | null}
 *   - raw: raw JID from source (may be LID/PN, for reference only)
 *   - jid: resolved canonical PN (for DB lookup + mentions array)
 *   - baseId: phone number base (for text display @baseId)
 */
export function extractTarget(message, args) {
    let raw = null;

    if (message.mentionedJid?.length > 0) {
        raw = message.mentionedJid[0];
    } else if (message.quoted) {
        raw = message.quoted.sender || message.quoted.participant;
    } else if (args?.[0]) {
        let num = args[0].replace(/[^0-9]/g, "");
        if (num && num.length >= 10) {
            // Normalize local-format numbers (e.g. "08123..." → "<countryCode>8123...")
            if (num.startsWith("0")) num = setting.defaultCountryCode + num.slice(1);
            raw = num + "@s.whatsapp.net";
        }
    }

    if (!raw) return null;

    const { jid, baseId } = resolveTarget(raw);
    return { raw, jid, baseId };
}

/**
 * Find actual participant JID from group metadata.
 *
 * Required for API calls (kick/promote/demote/add) because WhatsApp
 * requires JIDs matching the group's addressing mode (may be LID).
 * Matches via phone number base to handle both modes.
 *
 * @param {object} groupMetadata - From sock.groupMetadata()
 * @param {string} baseId - Phone number base (from resolveTarget)
 * @returns {{ participant: string, isAdmin: boolean } | null}
 */
export function findParticipant(groupMetadata, baseId) {
    if (!groupMetadata?.participants || !baseId) return null;

    const p = groupMetadata.participants.find(p => {
        const pBase = p.id.split(":")[0].split("@")[0];
        const pPhone = p.phoneNumber
            ? p.phoneNumber.split(":")[0].split("@")[0]
            : null;
        return pBase === baseId || pPhone === baseId;
    });

    if (!p) return null;
    return { participant: p.id, isAdmin: !!p.admin };
}

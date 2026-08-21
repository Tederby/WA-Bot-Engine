/**
 * JID Helper — Shared utilities for resolving WhatsApp JIDs.
 *
 * Centralizes the pattern: raw JID → jidNormalizedUser() → resolveUserId() → canonical PN.
 * All commands should use these helpers instead of rolling their own resolution logic.
 */

import { jidNormalizedUser } from "baileys";
import { resolveUserId } from "./database.js";

/**
 * Resolve raw JID ke canonical PN form + extract baseId.
 *
 * Langkah:
 *  1. jidNormalizedUser() — strip device ID (e.g. "62812:34@s.whatsapp.net" → "62812@s.whatsapp.net")
 *  2. resolveUserId() — convert LID → PN via identity_map table
 *
 * @param {string} rawJid - JID mentah dari mention/quoted/participant
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
 * Extract target JID dari message context.
 *
 * Prioritas: mention > quoted > args (nomor manual).
 *
 * @param {object} message - Extended WAMessage
 * @param {string[]} [args] - Command arguments
 * @returns {{ raw: string, jid: string, baseId: string } | null}
 *   - raw: JID mentah dari source (bisa LID/PN, untuk reference saja)
 *   - jid: resolved canonical PN (untuk DB lookup + mentions array)
 *   - baseId: phone number base (untuk text display @baseId)
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
            if (num.startsWith("0")) num = "62" + num.slice(1);
            else if (num.startsWith("8")) num = "62" + num;
            raw = num + "@s.whatsapp.net";
        }
    }

    if (!raw) return null;

    const { jid, baseId } = resolveTarget(raw);
    return { raw, jid, baseId };
}

/**
 * Find actual participant JID dari group metadata.
 *
 * Dibutuhkan untuk API calls (kick/promote/demote/add) karena
 * WhatsApp memerlukan JID sesuai addressing mode grup (bisa LID).
 * Cocokkan via phone number base untuk handle kedua mode.
 *
 * @param {object} groupMetadata - Dari sock.groupMetadata()
 * @param {string} baseId - Phone number base (dari resolveTarget)
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

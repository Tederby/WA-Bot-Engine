/**
 * Database Fix — Owner-only database repair and maintenance command.
 *
 * Runs comprehensive checks:
 *  - SQLite integrity check
 *  - Orphan record cleanup (group_banned_users, message_claims, bot_registry)
 *  - Empty user record cleanup
 *  - PFP directory ↔ database sync
 *
 * Reports all actions taken with statistics.
 */

import { repairDatabase } from "../lib/database.js";

export default {
    name: "dbfix",
    aliases: ["dbrepair", "fixdb", "dbclean"],
    category: "system",
    description: "Memperbaiki dan membersihkan database bot (System Owner Only)",
    usage: "!dbfix",
    ownerOnly: true,

    async handler({ message }) {
        const update = await message.replyUpdate("⏳ Menjalankan perbaikan database...");

        try {
            const startTime = Date.now();
            const report = repairDatabase();
            const elapsed = Date.now() - startTime;

            let text = `╭━━━〔 🔧 Database Repair 〕━━━\n`;
            text += `┃ Selesai dalam ${elapsed}ms\n`;
            text += `╰━━━━━━━━━━━━━━━━━━━━\n\n`;

            // Integrity
            text += `╭───「 🛡️ Integrity Check 」\n`;
            text += `│ ⋄ Status : ${report.integrityOk ? "✅ OK" : "❌ CORRUPT"}\n`;
            text += `╰──────────────\n\n`;

            // Cleanup stats
            const totalCleaned = report.orphanGroupBans + report.staleClaims + report.staleRegistry + report.emptyUsers + report.pfpOrphans + report.pfpMissing;

            text += `╭───「 🧹 Pembersihan 」\n`;
            text += `│ ⋄ Orphan group bans : ${report.orphanGroupBans}\n`;
            text += `│ ⋄ Stale claims      : ${report.staleClaims}\n`;
            text += `│ ⋄ Stale bot registry : ${report.staleRegistry}\n`;
            text += `│ ⋄ Empty user records : ${report.emptyUsers}\n`;
            text += `│ ⋄ PFP file orphans  : ${report.pfpOrphans}\n`;
            text += `│ ⋄ PFP missing refs  : ${report.pfpMissing}\n`;
            text += `╰──────────────\n\n`;

            if (totalCleaned > 0) {
                text += `✅ Total ${totalCleaned} record berhasil dibersihkan.`;
            } else {
                text += `✅ Database bersih, tidak ada yang perlu diperbaiki.`;
            }

            if (!report.integrityOk) {
                text += `\n\n⚠️ *WARNING*: Database memiliki masalah integritas!\nDisarankan untuk backup file \`database.db\` segera.`;
            }

            await update(text);
        } catch (error) {
            console.error("[DBFIX CMD]", error);
            await update("❌ Terjadi kesalahan saat memperbaiki database: " + error.message);
        }
    }
};

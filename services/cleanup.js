/**
 * Cleanup Service
 *
 * Handles periodic purging of:
 *  - Temporary download files older than `fileExpiry`
 *  - Expired reply-handler state entries
 *  - Expired info-cache entries
 *
 * Also performs a full temp purge on startup when configured.
 */

import fs from "fs";
import path from "path";
import setting from "../setting.js";
import { cleanupExpiredReplyHandlers } from "../commands/_registry.js";
import { purgeExpired as purgeInfoCache } from "./infoCache.js";
import { purgeOldClaims } from "../lib/database.js";
import { color } from "../lib/utils.js";

let initialized = false;

/**
 * Initialise the cleanup service.  Safe to call multiple times;
 * only the first invocation has any effect.
 */
export function initCleanup() {
    if (initialized) return;
    initialized = true;

    const cfg = setting.ytdlp;
    const tempDir = path.resolve(cfg.tempDir);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Purge all temp files on startup
    if (cfg.purgeOnStartup) {
        purgeAllTemp(tempDir);
    }

    // Periodic cleanup
    setInterval(() => {
        let filesPurged = cleanupTempFiles(tempDir, cfg.fileExpiry);
        let statesPurged = cleanupExpiredReplyHandlers(cfg.stateExpiry);
        let cachePurged = purgeInfoCache();
        purgeOldClaims(5 * 60 * 1000); // 5 mins

        if (filesPurged + statesPurged + cachePurged > 0) {
            console.log(
                color("[CLEANUP]", "yellow"),
                `files: ${filesPurged}, states: ${statesPurged}, cache: ${cachePurged}`
            );
        }
    }, cfg.cleanupInterval);

    console.log(color("[CLEANUP]", "yellow"), "Cleanup service initialized");
}

/**
 * Delete every file in the temp directory.
 * @param {string} tempDir
 */
function purgeAllTemp(tempDir) {
    try {
        const files = fs.readdirSync(tempDir).filter((f) => f !== ".gitkeep");
        for (const file of files) {
            fs.unlinkSync(path.join(tempDir, file));
        }
        if (files.length > 0) {
            console.log(color("[CLEANUP]", "yellow"), `Startup purge: removed ${files.length} temp file(s)`);
        }
    } catch (e) {
        console.error(color("[CLEANUP ERROR]", "red"), e.message);
    }
}

/**
 * Delete temp files older than `maxAgeMs`.
 * @param {string} tempDir
 * @param {number} maxAgeMs
 * @returns {number} Number of files deleted
 */
function cleanupTempFiles(tempDir, maxAgeMs) {
    let count = 0;
    try {
        const now = Date.now();
        const files = fs.readdirSync(tempDir).filter((f) => f !== ".gitkeep");
        for (const file of files) {
            const fp = path.join(tempDir, file);
            const stat = fs.statSync(fp);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(fp);
                count++;
            }
        }
    } catch (e) {
        console.error(color("[CLEANUP ERROR]", "red"), e.message);
    }
    return count;
}

/**
 * Try to delete a specific file.  Swallows errors silently.
 * @param {string} filePath
 */
export function tryDelete(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* best-effort */ }
}

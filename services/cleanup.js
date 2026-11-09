/**
 * Cleanup Service
 *
 * Handles periodic purging of:
 *  - Temporary files older than `fileExpiry`
 *  - Expired reply-handler state entries
 *  - Expired multi-bot message claims
 *  - Periodic VACUUM to reclaim SQLite disk space
 */

import fs from "fs";
import path from "path";
import setting from "../setting.js";
import { cleanupExpiredReplyHandlers } from "../commands/_registry.js";
import { purgeOldClaims } from "../lib/database.js";
import db from "../lib/db.js";
import { logger } from "../lib/logger.js";

let initialized = false;

/**
 * Initialise the cleanup service. Safe to call multiple times;
 * only the first invocation has any effect.
 */
export function initCleanup() {
    if (initialized) return;
    initialized = true;

    const tempDir = path.resolve(setting.tempDir);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Purge all temp files on startup
    purgeAllTemp(tempDir);

    // Periodic cleanup
    setInterval(() => {
        let filesPurged = cleanupTempFiles(tempDir, setting.fileExpiry);
        let statesPurged = cleanupExpiredReplyHandlers(setting.replyHandlerExpiry);
        purgeOldClaims(setting.claimsPurgeAge);

        if (filesPurged + statesPurged > 0) {
            logger.info("CLEANUP", `files: ${filesPurged}, states: ${statesPurged}`);
        }
    }, setting.cleanupInterval);

    logger.info("CLEANUP", "Service initialized");

    // Periodic VACUUM to reclaim disk space
    setInterval(() => {
        try {
            db.exec("VACUUM");
            logger.info("CLEANUP", "VACUUM completed");
        } catch (e) {
            logger.warn("CLEANUP", `VACUUM failed: ${e.message}`);
        }
    }, setting.vacuumInterval);
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
            logger.info("CLEANUP", `Startup purge: removed ${files.length} temp file(s)`);
        }
    } catch (e) {
        logger.error("CLEANUP", `Startup purge error: ${e.message}`);
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
        logger.warn("CLEANUP", `Temp files cleanup error: ${e.message}`);
    }
    return count;
}

/**
 * Try to delete a specific file. Swallows errors silently.
 * @param {string} filePath
 */
export function tryDelete(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* best-effort */ }
}

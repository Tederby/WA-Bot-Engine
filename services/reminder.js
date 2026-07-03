import fs from "fs";
import path from "path";
import { color } from "../lib/utils.js";

const BOT_ID = process.env.BOT_ID || "default";
const DB_PATH = path.resolve(`./database_reminders_${BOT_ID}.json`);
let reminders = [];
let timers = new Map(); // key: userId_chatId, value: setTimeout ID
let globalSock = null;

// Ensure database file exists
function _load() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_PATH, JSON.stringify([]));
        }
        const data = fs.readFileSync(DB_PATH, "utf-8");
        reminders = JSON.parse(data);
    } catch (err) {
        console.error(color("[REMINDER ERROR]", "red"), "Gagal memuat database reminder:", err.message);
        reminders = [];
    }
}

function _save() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(reminders, null, 2));
    } catch (err) {
        console.error(color("[REMINDER ERROR]", "red"), "Gagal menyimpan database reminder:", err.message);
    }
}

/**
 * Memicu eksekusi reminder
 */
async function _triggerReminder(reminder) {
    if (!globalSock) return;
    const { userId, chatId, message } = reminder;

    try {
        // Tag user and send the reminder message
        await globalSock.sendMessage(chatId, {
            text: `⏰ *REMINDER*\n\n@${userId.split("@")[0]}\n\n${message}`,
            mentions: [userId],
        });
    } catch (err) {
        console.error(color("[REMINDER ERROR]", "red"), `Gagal mengirim reminder ke ${userId} di ${chatId}:`, err.message);
    }

    // Remove from DB and memory after triggering
    removeReminder(userId, chatId);
}

/**
 * Initialize all reminders on startup.
 * @param {object} sock Baileys socket instance
 */
export function initReminders(sock) {
    globalSock = sock;
    _load();

    const now = Date.now();
    let triggeredCount = 0;
    let scheduledCount = 0;

    for (const reminder of reminders) {
        const key = `${reminder.userId}_${reminder.chatId}`;
        const delay = reminder.triggerTime - now;

        if (delay <= 0) {
            // Already expired while bot was off, trigger immediately
            _triggerReminder(reminder);
            triggeredCount++;
        } else {
            // Schedule it
            const timerId = setTimeout(() => _triggerReminder(reminder), delay);
            timers.set(key, timerId);
            scheduledCount++;
        }
    }

    if (triggeredCount > 0 || scheduledCount > 0) {
        console.log(color("[REMINDER]", "yellow"), `Loaded: ${scheduledCount} scheduled, ${triggeredCount} triggered immediately.`);
    }
}

/**
 * Check if a user already has an active reminder in a specific chat
 * @param {string} userId 
 * @param {string} chatId 
 * @returns {boolean}
 */
export function hasReminder(userId, chatId) {
    const key = `${userId}_${chatId}`;
    return timers.has(key) || reminders.some(r => r.userId === userId && r.chatId === chatId);
}

/**
 * Add a new reminder
 * @param {string} userId 
 * @param {string} chatId 
 * @param {number} triggerTime Unix timestamp in ms
 * @param {string} message 
 */
export function addReminder(userId, chatId, triggerTime, message) {
    if (hasReminder(userId, chatId)) {
        throw new Error("Reminder sudah ada");
    }

    const reminder = {
        id: Date.now().toString(),
        userId,
        chatId,
        triggerTime,
        message,
        createdAt: Date.now()
    };

    reminders.push(reminder);
    _save();

    const delay = triggerTime - Date.now();
    const key = `${userId}_${chatId}`;
    
    // Only schedule if sock is available
    if (globalSock && delay > 0) {
        const timerId = setTimeout(() => _triggerReminder(reminder), delay);
        timers.set(key, timerId);
    } else if (delay <= 0) {
        _triggerReminder(reminder);
    }
}

/**
 * Remove an active reminder manually
 * @param {string} userId 
 * @param {string} chatId 
 * @returns {boolean} true if removed, false if not found
 */
export function removeReminder(userId, chatId) {
    const key = `${userId}_${chatId}`;
    
    // Clear timeout if exists
    if (timers.has(key)) {
        clearTimeout(timers.get(key));
        timers.delete(key);
    }

    const initialLength = reminders.length;
    reminders = reminders.filter(r => !(r.userId === userId && r.chatId === chatId));
    
    if (reminders.length !== initialLength) {
        _save();
        return true;
    }
    return false;
}

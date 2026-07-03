import fs from "fs";
import path from "path";

const BOT_ID = process.env.BOT_ID || "default";

function getFile(type) {
    return path.resolve(process.cwd(), `database_${type}s_${BOT_ID}.json`);
}

function readDB(type) {
    const file = getFile(type);
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (e) {
        return [];
    }
}

function writeDB(type, data) {
    const file = getFile(type);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function addReport(type, sender, pushname, text, isGroup, groupName, chatId, messageKey) {
    const db = readDB(type);
    const newItem = {
        id: db.length > 0 ? Math.max(...db.map(d => d.id)) + 1 : 1,
        sender,
        pushname,
        text,
        isGroup,
        groupName: groupName || null,
        chatId,
        messageKey,
        replied: false,
        timestamp: Date.now()
    };
    db.push(newItem);
    writeDB(type, db);
    return newItem;
}

export function getReports(type) {
    return readDB(type);
}

export function deleteReport(type, id) {
    let db = readDB(type);
    const initialLen = db.length;
    db = db.filter(item => item.id !== id);
    if (db.length !== initialLen) {
        writeDB(type, db);
        return true;
    }
    return false;
}

export function markAsReplied(type, id) {
    let db = readDB(type);
    const index = db.findIndex(item => item.id === id);
    if (index !== -1) {
        db[index].replied = true;
        writeDB(type, db);
        return db[index];
    }
    return null;
}

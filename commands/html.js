import vm from "node:vm";
import { sendUI } from "../lib/uiEngine.js";

// ── HTML5 Void & Self-Closing Elements ───────────────────────────────────────
const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
]);

const SELF_CLOSING_SVG = new Set([
    "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "stop", "use"
]);

/**
 * Validate HTML structure, script syntax, and style brackets.
 * Returns { valid: true } or { valid: false, error: string }.
 *
 * @param {string} raw - Raw HTML code
 * @returns {{ valid: boolean, error?: string }}
 */
function validateHtml(raw) {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: "Kode HTML tidak boleh kosong." };
    }

    const trimmed = raw.trim();

    // Check if there are any HTML tags at all
    if (!/<[a-zA-Z!/][\s\S]*>/.test(trimmed)) {
        return { valid: false, error: "Tidak ditemukan tag HTML yang valid. Pastikan input berupa kode HTML." };
    }

    // ── 1. Script checks & JS syntax validation ──────────────────────────────
    const openScripts = (trimmed.match(/<script\b[^>]*>/gi) || []).length;
    const closeScripts = (trimmed.match(/<\/script>/gi) || []).length;
    if (openScripts > closeScripts) {
        return { valid: false, error: "Terdapat tag '<script>' yang belum ditutup dengan '</script>'." };
    }
    if (closeScripts > openScripts) {
        return { valid: false, error: "Terdapat tag penutup '</script>' berlebih tanpa tag pembuka '<script>'." };
    }

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(trimmed)) !== null) {
        const js = scriptMatch[1].trim();
        if (!js) continue;
        try {
            // Compile without executing to detect JavaScript syntax errors
            new vm.Script(js);
        } catch (err) {
            return { valid: false, error: `Syntax Error pada <script>: ${err.message}` };
        }
    }

    // ── 2. Style checks & CSS brace validation ───────────────────────────────
    const openStyles = (trimmed.match(/<style\b[^>]*>/gi) || []).length;
    const closeStyles = (trimmed.match(/<\/style>/gi) || []).length;
    if (openStyles > closeStyles) {
        return { valid: false, error: "Terdapat tag '<style>' yang belum ditutup dengan '</style>'." };
    }
    if (closeStyles > openStyles) {
        return { valid: false, error: "Terdapat tag penutup '</style>' berlebih tanpa tag pembuka '<style>'." };
    }

    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    while ((styleMatch = styleRegex.exec(trimmed)) !== null) {
        const css = styleMatch[1];
        let openBraces = 0;
        let inString = null;
        for (let i = 0; i < css.length; i++) {
            const char = css[i];
            if (inString) {
                if (char === inString && css[i - 1] !== "\\") {
                    inString = null;
                }
            } else if (char === '"' || char === "'") {
                inString = char;
            } else if (char === "{") {
                openBraces++;
            } else if (char === "}") {
                openBraces--;
                if (openBraces < 0) {
                    return { valid: false, error: "Syntax Error pada <style>: Kurung kurawal tutup '}' berlebih." };
                }
            }
        }
        if (openBraces > 0) {
            return { valid: false, error: `Syntax Error pada <style>: ${openBraces} blok kurung kurawal '{' belum ditutup.` };
        }
    }

    // ── 3. HTML tag balancing ────────────────────────────────────────────────
    // Strip comments
    let stripped = trimmed.replace(/<!--[\s\S]*?-->/g, "");

    // Neutralize script and style contents so internal operators (<, >, <=) aren't parsed as tags
    stripped = stripped.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
    stripped = stripped.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");

    // Ignore DOCTYPE declaration
    stripped = stripped.replace(/<!doctype\b[^>]*>/gi, "");

    // Verify bracket integrity outside string literals
    let inTag = false;
    let quote = null;
    for (let i = 0; i < stripped.length; i++) {
        const c = stripped[i];
        if (inTag) {
            if (quote) {
                if (c === quote && stripped[i - 1] !== "\\") {
                    quote = null;
                }
            } else if (c === '"' || c === "'") {
                quote = c;
            } else if (c === '>') {
                inTag = false;
            } else if (c === '<') {
                return { valid: false, error: `Tag tidak valid: Menemukan '<' baru sebelum tag sebelumnya ditutup dengan '>' pada posisi karakter ${i}.` };
            }
        } else {
            if (c === '<') {
                inTag = true;
            }
        }
    }
    if (inTag) {
        return { valid: false, error: "Terdapat tag pembuka '<' yang tidak pernah ditutup dengan '>'." };
    }

    // Parse tag hierarchy using stack
    const tagRegex = /<(\/)?([a-zA-Z0-9\-]+)([^>]*)>/g;
    const stack = [];
    let match;

    while ((match = tagRegex.exec(stripped)) !== null) {
        const isClosing = Boolean(match[1]);
        const tagName = match[2].toLowerCase();
        const attrs = match[3] || "";
        const isSelfClosing = attrs.trim().endsWith("/") || VOID_TAGS.has(tagName) || SELF_CLOSING_SVG.has(tagName);

        if (isClosing) {
            if (VOID_TAGS.has(tagName)) {
                return { valid: false, error: `Tag penutup '</${tagName}>' tidak valid karena '<${tagName}>' adalah void element.` };
            }
            if (stack.length === 0) {
                return { valid: false, error: `Tag penutup '</${tagName}>' ditemukan tanpa ada tag pembuka yang sesuai.` };
            }
            const expected = stack.pop();
            if (expected !== tagName) {
                return { valid: false, error: `Struktur tag tidak cocok: Menutup '</${tagName}>' tetapi seharusnya '</${expected}>'.` };
            }
        } else if (!isSelfClosing) {
            stack.push(tagName);
        }
    }

    if (stack.length > 0) {
        return { valid: false, error: `Tag tidak lengkap: Tag '<${stack[stack.length - 1]}>' belum ditutup (antrean belum ditutup: ${stack.join(", ")}).` };
    }

    return { valid: true };
}

/**
 * Wrap partial HTML fragments into a complete responsive HTML5 document.
 * If the input already contains <html> or <!DOCTYPE>, it is returned intact.
 *
 * @param {string} code - HTML snippet or full document
 * @returns {string} Full HTML document
 */
function prepareFullHtml(code) {
    const trimmed = code.trim();
    if (/<!doctype\b/i.test(trimmed) || /<html\b/i.test(trimmed)) {
        return trimmed;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}
body{margin:0;padding:16px;background:#0d0f13;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;word-wrap:break-word}
</style>
</head>
<body>
${trimmed}
</body>
</html>`;
}

export default {
    name: "html",
    aliases: ["renderhtml", "previewhtml", "webui"],
    category: "tools",
    description: "Render HTML code into an interactive WhatsApp webview",
    usage: "!html <kode_html> (atau balas pesan berisi kode HTML)",
    groupOnly: false,
    adminOnly: false,
    botAdminRequired: false,
    ownerOnly: false,
    privateOnly: false,
    registerRequired: false,

    async handler({ message, sock, rawArgs, text, prefix }) {
        // Resolve input from direct arguments or quoted message text
        const rawInput = rawArgs || text;
        let code = rawInput ? rawInput.trim() : (message.quoted?.text ? message.quoted.text.trim() : "");

        if (!code) {
            return message.reply(
                `╭━━━〔 🌐 *HTML RENDERER* 〕━━━\n` +
                `┃ *Format:* \`${prefix}html <kode_html>\`\n` +
                `┃ *Atau:* Balas pesan berisi kode HTML dengan \`${prefix}html\`\n` +
                `┃\n` +
                `┃ *Contoh:* \`${prefix}html <h1>Halo Dunia</h1>\`\n` +
                `┃ _Tampilan interaktif otomatis dihapus dalam 2 menit._\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        // Strip markdown code fences if wrapped by user (```html ... ``` or ``` ... ```)
        const fenceMatch = code.match(/^```(?:html|xml)?\s*\n?([\s\S]*?)\n?```$/i);
        if (fenceMatch) {
            code = fenceMatch[1].trim();
        }

        // Validate HTML syntax, JS script compilation, and CSS braces
        const validation = validateHtml(code);
        if (!validation.valid) {
            return message.reply(
                `╭━━━〔 ❌ *KODE HTML TIDAK VALID* 〕━━━\n` +
                `┃ Kode tidak dapat dirender karena terdeteksi kesalahan:\n` +
                `┃\n` +
                `┃ ⚠️ *Error:* ${validation.error}\n` +
                `┃\n` +
                `┃ _Silakan periksa dan perbaiki sintaks kode Anda._\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        const finalHtml = prepareFullHtml(code);

        // Derive title from <title> if present, otherwise default to "HTML Preview"
        const titleMatch = finalHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        const previewTitle = titleMatch && titleMatch[1].trim()
            ? `🌐 ${titleMatch[1].trim().substring(0, 40)}`
            : "🌐 HTML Preview";

        try {
            const sent = await sendUI(sock, message.chat, {
                title: previewTitle,
                html: finalHtml
            });

            await message.reply(
                `🌐 *HTML Berhasil Dirender!*\n` +
                `⏱️ _Tampilan interaktif ini akan otomatis dihapus dalam 2 menit._`
            );

            // Auto-delete HTML webview payload after 2 minutes (120,000 ms) to prevent viewport lag
            if (sent?.key) {
                setTimeout(() => {
                    sock.sendMessage(message.chat, {
                        delete: { ...sent.key, fromMe: true }
                    }).catch(() => {});
                }, 120000);
            }
        } catch (error) {
            console.error("[HTML Command Error] Failed to render HTML:", error);
            await message.reply("❌ Gagal merender HTML. Pastikan aplikasi WhatsApp Anda mendukung pesan interaktif.");
        }
    }
};

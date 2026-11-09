# Command & UI Development Guide

This guide covers everything you need to create commands, apply middleware security rules, handle user interactions, parse declarative CLI flags, format clean WhatsApp typography, and render rich in-app HTML webview interfaces in **WA-Bot-Engine**.

---

## 1. Command Module Anatomy

Commands are placed as individual `.js` files inside the `commands/` directory. They are auto-discovered on startup and hot-reloaded upon file modification.

### Standard Template

```javascript
export default {
    name: "ping",
    aliases: ["p", "speed"],
    category: "general",
    description: "Check bot responsiveness and server latency.",
    usage: "!ping",

    // Declarative Middleware Flags
    groupOnly: false,
    adminOnly: false,
    botAdminRequired: false,
    ownerOnly: false,
    privateOnly: false,
    silentDrop: false,
    multiBot: true,

    // Optional POSIX Flag Schema (auto-parsed by handler.js via lib/flagParser.js)
    flags: {
        verbose: { type: "boolean", char: "v", aliases: ["detail"] },
    },

    async handler({
        message,
        sock,
        args,
        cleanArgs,
        rawArgs,
        flags,
        sender,
        isGroup,
        pushname,
        groupMetadata,
        groupName,
        isGroupAdmins,
        isBotGroupAdmins,
        isOwner,
        isBotAdmin,
        prefix,
        botNumber,
        commandName
    }) {
        const start = Date.now();
        const latency = Math.max(0, Date.now() - message.messageTimestamp * 1000);
        await message.reply(
            `🏓 *PONG*\n` +
            `────────────────────────\n` +
            `⋄ Response : *${latency} ms*\n` +
            `────────────────────────`
        );
    }
};
```

---

## 2. Declarative Permission Flags

Rather than writing manual permission checks inside command bodies, define declarative flags on your command object:

| Flag | Type | Description |
| :--- | :--- | :--- |
| `groupOnly` | `boolean` | Rejects execution outside of WhatsApp groups. |
| `privateOnly` | `boolean` | Rejects execution inside groups (1-on-1 chats only). |
| `adminOnly` | `boolean` | Requires sender to be a group admin or bot owner. |
| `botAdminRequired` | `boolean` | Requires the bot itself to be an admin in the current group. |
| `botAdminOnly` | `boolean` | Requires sender to have the `isBotAdmin` role or be the owner. |
| `ownerOnly` | `boolean` | Restricts command to numbers listed in `setting.owner`. |
| `silentDrop` | `boolean` | When blocked by `ownerOnly`, silently drops without sending an error notice. |
| `multiBot` | `boolean` | Bypasses multi-bot claim checks so all active bots respond concurrently. |

---

## 3. Handler Context Properties

The `handler` method receives a consolidated context object:

| Property | Type | Description |
| :--- | :--- | :--- |
| `message` | `object` | Extended Baileys message object with helper methods (e.g. `message.reply(text)`). |
| `sock` | `object` | Active Baileys `WASocket` connection instance. |
| `args` | `string[]` | Clean command arguments (positional arguments with flags stripped if `flags` schema is used). |
| `cleanArgs` | `string[]` | Explicit positional arguments isolated from CLI flags. |
| `rawArgs` | `string` | Raw unparsed argument string following the command name. |
| `flags` | `object` | Key-value dictionary of parsed CLI flags according to the command's schema. |
| `sender` | `string` | Canonical Phone Number JID of the sender (`<number>@s.whatsapp.net`). |
| `isGroup` | `boolean` | `true` if executed in a group chat, `false` if in direct message. |
| `pushname` | `string` | Sender's WhatsApp display name (falls back to JID if unset). |
| `groupMetadata` | `object` | Cached group metadata object (participants, subject, owner). |
| `groupName` | `string` | Group subject string (empty in private chats). |
| `isGroupAdmins` | `boolean` | `true` if the sender is an admin in the current group. |
| `isBotGroupAdmins` | `boolean` | `true` if this bot instance is an admin in the group. |
| `isOwner` | `boolean` | `true` if the sender's number is present in `setting.owner`. |
| `isBotAdmin` | `boolean` | `true` if the sender is an owner or recorded as a bot admin in SQLite. |
| `prefix` | `string` | The prefix trigger used (`!`, `.`, `#`, etc.). |
| `botNumber` | `string` | Active bot instance JID. |
| `commandName` | `string` | Name or alias that triggered the command. |

---

## 4. Declarative POSIX Flag System (`lib/flagParser.js`)

WA-Bot-Engine includes a centralized CLI flag engine supporting standard POSIX and GNU flag conventions:

### Features
- **Long Flags**: `--keep`, `--verbose`, `--wait=5`
- **Short Flags**: `-k`, `-v`, `-w 5`
- **Clustered Short Flags**: `-tu` resolves to `-t` and `-u`
- **Positional Isolation**: Flags are parsed into `flags`, while positional text remains in `cleanArgs` and `args`
- **Termination Marker**: `--` stops flag parsing; all subsequent tokens are treated as positional arguments
- **Freeform Extraction**: `extractFlagsFromText(text, schema)` extracts flags without corrupting multiline markdown or code blocks

### Example Schema Definition

```javascript
flags: {
    keep: { type: "boolean", char: "k", aliases: ["permanent"] },
    wait: { type: "number", char: "w", default: 5 },
    format: { type: "string", char: "f", default: "mp4" }
}
```

---

## 5. Clean Typography & Output Styling Standards

To ensure optimal readability across mobile screens and prevent broken layouts caused by narrow viewport wrapping:

### Rules
1. **Header Format**: Bold uppercase title with leading emoji, followed by an exact 24-character divider line:
   ```text
   🏷️ *COMMAND TITLE*
   ────────────────────────
   ```
2. **Key-Value Pairs**: Prefix items with diamond bullets (`⋄`):
   ```text
   ⋄ Status : *Active*
   ⋄ Latency : *45 ms*
   ```
3. **Closing Divider**: Terminate structured cards with the matching 24-character line:
   ```text
   ────────────────────────
   ```
4. **No Box-Borders**: Avoid multi-line box drawing characters (`╭━━━`, `┃`, `╰━━━`) that wrap unpredictably on small smartphone viewports.
5. **Dynamic Prefix**: Never hardcode `!` in command reply hints. Always use `const p = prefix || "!"`.

---

## 6. Shared Formatting Utilities (`lib/utils.js`)

Centralized formatting helpers are available in `lib/utils.js`:

| Export | Type | Description |
|:---|:---|:---|
| `ITEMS_PER_PAGE` | `number` (5) | Standard page size constant for search and list paginators. |
| `generatePaginator(page, totalPages)` | `function` | Generates a clean pagination bar (`[ 📄 Page 1/3 ] ─── « ─ *1* ─ 2 ─ 3 ─ »`). |
| `formatUptime(seconds, options)` | `function` | Converts uptime seconds to readable strings (`{ short: true }` for `1d 4h 12m 30s` or `{ short: false }` for full units). |

---

## 7. Interactive HTML UI Engine (Webview)

WA-Bot-Engine includes a native UI engine ([`lib/uiEngine.js`](../lib/uiEngine.js)) that renders interactive HTML, CSS, and client-side JavaScript inside WhatsApp using the native `richResponseMessage` protocol.

### Helper Functions

```javascript
import { sendUI, renderPage, renderCard, renderList } from "../lib/uiEngine.js";

export default {
    name: "dashboard",
    async handler({ message, sock }) {
        const body = `
            ${renderCard({
                badge: "ONLINE",
                title: "Server Cluster 01",
                subtitle: "Region: ap-southeast-1",
                content: "<p>CPU: 12% | RAM: 340MB / 2GB</p>",
                footer: "Status: Operational"
            })}
        `;

        const html = renderPage({
            title: "Cluster Monitor",
            body,
            brand: "WA-Bot-Engine"
        });

        const sent = await sendUI(sock, message.chat, {
            title: "🖥️ Cluster Dashboard",
            html
        });

        // Recommended: Auto-delete after 2 minutes to prevent viewport lag spikes
        if (sent?.key) {
            setTimeout(() => {
                sock.sendMessage(message.chat, { delete: sent.key }).catch(() => {});
            }, 120_000);
        }
    }
};
```

> For deep protocol architecture, sandbox capabilities, and empirical constraints, consult [**`docs/WEBVIEW_PAYLOAD.md`**](WEBVIEW_PAYLOAD.md).

---

## 8. Interactive Reply Handlers

When a command requires a follow-up response from the user (multi-step dialogs, confirmations):

```javascript
import { registerReplyHandler } from "./_registry.js";

export default {
    name: "askname",
    async handler({ message, sock, sender }) {
        const sent = await message.reply("Please reply to this message with your nickname:");
        const stanzaId = sent.key.id;

        registerReplyHandler(stanzaId, async ({ message, sock, text, state }) => {
            await message.reply(`Nice to meet you, ${text.trim()}!`);
        }, {
            userId: sender,
            commandName: "askname",
            createdAt: Date.now()
        });
    }
};
```

---

## 9. Auto-Detection Registry

You can register URL patterns or triggers that execute without a standard command prefix using [`lib/autoDetect.js`](../lib/autoDetect.js):

```javascript
import { registerAutoDetect } from "./lib/autoDetect.js";

registerAutoDetect({
    name: "github-link",
    test(text, message) {
        if (message?.key?.fromMe) return false;
        return /github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/i.test(text);
    },
    async handler({ text, message, sock }) {
        await message.reply("🔍 GitHub repository detected!");
    }
});
```

---

## 10. Working with JIDs and Mentions

Always use [`lib/jidHelper.js`](../lib/jidHelper.js) when handling user targets:

```javascript
import { extractTarget, findParticipant } from "../lib/jidHelper.js";

export default {
    name: "promote",
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    async handler({ message, sock, args, groupMetadata }) {
        const target = extractTarget(message, args);
        if (!target) return message.reply("Please mention a user or quote their message.");

        const participant = findParticipant(groupMetadata, target.baseId);
        if (!participant) return message.reply("User is not in this group.");

        await sock.groupParticipantsUpdate(message.chat, [participant.participant], "promote");
        await message.reply(`✅ Promoted @${target.baseId}`, { mentions: [target.jid] });
    }
};
```

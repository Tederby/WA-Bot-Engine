# Command & UI Development Guide

This guide covers everything you need to create commands, apply middleware security rules, handle user interactions, and render rich in-app HTML webview interfaces in **WA-Bot-Engine**.

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
    multiBot: false,

    async handler({
        message,
        sock,
        args,
        text,
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
        await message.reply("Pong!");
        const latency = Date.now() - start;
        await message.reply(`⚡ Latency: ${latency}ms`);
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

```javascript
async handler(context) { ... }
```

| Property | Type | Description |
| :--- | :--- | :--- |
| `message` | `object` | Extended Baileys message object with helper methods (e.g. `message.reply(text)`). |
| `sock` | `object` | Active Baileys `WASocket` connection instance. |
| `args` | `string[]` | Command arguments split by whitespace (excluding the command name). |
| `text` | `string` | Raw unparsed argument string following the command. |
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

## 4. Interactive HTML UI Engine (Webview)

WA-Bot-Engine includes a native UI engine ([`lib/uiEngine.js`](../lib/uiEngine.js)) that renders interactive HTML, CSS, and client-side JavaScript inside WhatsApp using the native `richResponseMessage` protocol.

### Why Webview?
- **Rich Presentations**: Tabbed dashboards, responsive cards, styled badges, and progress bars.
- **Client-Side Interactivity**: Tab switching, search filtering, and state toggles happen instantly without waiting for network round-trips to the bot.
- **Auto-Deletion Protection**: The engine automatically includes `fromMe: true` in return keys so messages can be revoked cleanly.

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

### In-App Navigation (Pseudo-Buttons)

WhatsApp webview sandboxes external navigation, but allows hash-based anchor navigation:

```html
<!-- Tabs / Pseudo-Buttons -->
<div class="tab-bar">
    <a href="#overview" class="btn">Overview</a>
    <a href="#stats" class="btn">Stats</a>
</div>

<!-- Tab Content Panels -->
<div id="overview" class="tab-panel">Overview details...</div>
<div id="stats" class="tab-panel" style="display:none;">Statistics...</div>

<script>
window.addEventListener('hashchange', () => {
    const active = location.hash.replace('#', '') || 'overview';
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.style.display = (p.id === active) ? 'block' : 'none';
    });
});
</script>
```

---

## 5. Interactive Reply Handlers

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

- Handlers expire automatically after `setting.replyHandlerExpiry` (default: 15 minutes).
- Security: The handler verifies `state.userId === ctx.sender` to prevent unauthorized users from answering another user's prompt.

---

## 6. Auto-Detection Registry

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

## 7. Working with JIDs and Mentions

Always use [`lib/jidHelper.js`](../lib/jidHelper.js) when handling user targets:

```javascript
import { extractTarget, findParticipant } from "../lib/jidHelper.js";

export default {
    name: "promote",
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    async handler({ message, sock, args, groupMetadata }) {
        // Resolves target from: 1) @mention, 2) Quoted message sender, 3) Typed phone number
        const target = extractTarget(message, args);
        if (!target) return message.reply("Please mention a user or quote their message.");

        // Find participant identifier matching group's addressing mode (LID or PN)
        const participant = findParticipant(groupMetadata, target.baseId);
        if (!participant) return message.reply("User is not in this group.");

        await sock.groupParticipantsUpdate(message.chat, [participant.participant], "promote");
        await message.reply(`✅ Promoted @${target.baseId}`, { mentions: [target.jid] });
    }
};
```

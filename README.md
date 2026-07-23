# WA Bot Engine

A minimal, multi-instance WhatsApp bot engine built with [Baileys](https://github.com/WhiskeySockets/Baileys) and Node.js. Designed as a **barebone framework**. Connect as many bot numbers as you want, then build your own commands and features on top.

## What's Included

- **Multi-Bot** — Run multiple bot numbers from one codebase via PM2. Each instance gets its own session and config.
- **SQLite Database** — Concurrent-safe database with WAL mode. User/group management, bans, and multi-bot priority out of the box.
- **Hot-Reload** — Edit commands or the handler while the bot is running. Changes apply instantly without restart.
- **Command Auto-Loader** — Drop a `.js` file in `commands/` and it works. No manual imports needed.
- **Middleware Pipeline** — Clean architecture: `guard → ban-check → context → auto-detect → parse → spam-filter → permissions → execute`.
- **Permission System** — Declarative flags: `groupOnly`, `adminOnly`, `ownerOnly`, `privateOnly`, `botAdminRequired`.
- **Identity Resolution** — Handles WhatsApp's LID (Linked Device ID) addressing mode transparently.

## What's NOT Included

This is an engine, not a full bot. There are no built-in commands except `!ping` (as an example). You build everything else:

- No media downloaders
- No sticker maker
- No group management commands

**That's the point.** Start clean, build what you need.

---

## Requirements

- **Node.js** v18+
- **PM2** *(optional)* — for multi-bot process management
- **build-essential** *(Linux)* or **Visual Studio Build Tools** *(Windows)* — for `better-sqlite3` native bindings

---

## Quick Start

```bash
# Clone & install
git clone https://github.com/YourUsername/wa-bot-engine.git
cd wa-bot-engine
npm install

# Configure
cp .env.example .env
# Edit .env with your phone number and bot name
```

### Single Bot

```bash
npm start
# Scan the QR code in terminal with WhatsApp → Linked Devices
```

### Multi-Bot (PM2)

```bash
# Edit ecosystem.config.cjs to define your bot instances
# Then start all bots:
npm run pm2

# View QR code for a specific bot:
pm2 logs bot1

# Add a new bot: add an entry in ecosystem.config.cjs, then:
pm2 start ecosystem.config.cjs --only bot2
pm2 logs bot2    # Scan QR
```

### Pairing Code (No QR)

If you can't scan a QR code (headless VPS, etc.), login via phone number:

Set `PAIRING_NUMBER` in `ecosystem.config.cjs`:
```javascript
env: {
  BOT_ID: "bot1",
  // ...
  PAIRING_NUMBER: "6281234567890", // Start with country code
}
```
Restart the bot and check logs for the 8-digit pairing code. Enter it on your phone via *Linked Devices* > *Link with phone number instead*.

---

## Project Structure

```
wa-bot-engine/
├── commands/               # Auto-loaded command modules
│   ├── _registry.js        # Dynamic loader & reply handler registry
│   └── ping.js             # Example command
├── lib/                    # Core engine libraries
│   ├── db.js               # SQLite engine (WAL mode)
│   ├── database.js         # User/group CRUD, bans*, multi-bot priority
│   ├── Messages.js         # Baileys message wrapper & serializer
│   ├── commandParser.js    # Command prefix & argument parser
│   ├── contextBuilder.js   # Message context extraction (sender, group, admin)
│   ├── middleware.js        # Permission guards
│   ├── autoDetect.js       # Auto-detect framework (disabled by default)
│   ├── logger.js           # Centralized console logging
│   └── utils.js            # Helpers (chalk colors, spam filter)
├── services/
│   └── cleanup.js          # Periodic temp/state cleanup + VACUUM
├── temp/                   # Per-bot temp files (gitignored)
├── index.js                # Entry point & connection lifecycle
├── handler.js              # Message processing pipeline
├── setting.js              # Configuration (reads from env)
├── ecosystem.config.cjs    # PM2 multi-bot config
└── database.db             # SQLite database (gitignored)
```

---

## Creating Commands

Drop a new `.js` file in `commands/` — the bot picks it up automatically (even at runtime via hot-reload).

```javascript
// commands/hello.js
export default {
    name: "hello",
    aliases: ["hi", "hey"],
    category: "general",
    description: "Sends a greeting",

    // Optional permission flags:
    // groupOnly: true,        — Only works in groups
    // adminOnly: true,        — Requires group admin
    // ownerOnly: true,        — Requires system owner
    // privateOnly: true,      — Only works in DMs
    // botAdminRequired: true, — Bot must be group admin
    // botAdminOnly: true,     — Requires bot admin role

    async handler({ message, sock, args, rawArgs, prefix, sender, pushname, isGroup, groupName }) {
        await message.reply(`Hello ${pushname}! 👋`);
    }
};
```

### Handler Context

Every command handler receives these properties:

| Property | Type | Description |
|----------|------|-------------|
| `message` | object | Extended WAMessage with `.reply()`, `.react()`, `.download()`, `.delete()`, `.replyUpdate()` |
| `sock` | object | Baileys WASocket instance |
| `args` | string[] | Parsed arguments (split by whitespace) |
| `rawArgs` | string | Raw argument string (after command name) |
| `prefix` | string | The prefix used (e.g. `!`, `.`, `#`) |
| `sender` | string | Sender's JID |
| `pushname` | string | Sender's display name |
| `isGroup` | boolean | Whether message is from a group |
| `groupName` | string | Group name (empty if DM) |
| `groupMetadata` | object | Full group metadata (empty if DM) |
| `isGroupAdmins` | boolean | Whether sender is a group admin |
| `isBotGroupAdmins` | boolean | Whether bot is a group admin |
| `isOwner` | boolean | Whether sender is the system owner |
| `isBotAdmin` | boolean | Whether sender is a bot admin |
| `ownerNumbers` | string[] | Owner JIDs |
| `botNumber` | string | Bot's own JID |

### Reply Handlers (Multi-Step Commands)

For commands that need follow-up replies (e.g. format selection):

```javascript
import { registerReplyHandler } from "./_registry.js";

export default {
    name: "quiz",
    async handler({ message, sock }) {
        const sent = await sock.sendMessage(message.chat, {
            text: "What is 2 + 2? Reply to this message with your answer."
        }, { quoted: message });

        registerReplyHandler(sent.key.id, async ({ message: reply, sock: s, state }) => {
            const answer = reply.text?.trim();
            if (answer === "4") {
                await reply.reply("✅ Correct!");
            } else {
                await reply.reply("❌ Wrong! The answer is 4.");
            }
        }, { userId: message.sender, commandName: "quiz" });
    }
};
```

### Auto-Detect (Pattern Matching)

Respond to URLs or text patterns without a command prefix:

```javascript
// In any module (e.g. commands/mycommand.js or a dedicated file)
import { registerAutoDetect } from "../lib/autoDetect.js";

registerAutoDetect({
    name: "github",
    test(text, message) {
        if (message?.key?.fromMe) return false;
        return /github\.com\/[\w-]+\/[\w-]+/i.test(text);
    },
    async handler({ text, message, sock }) {
        await message.reply("🔗 Detected a GitHub repo link!");
    },
});
```

---

## Database

The engine uses SQLite (via `better-sqlite3`) with these built-in tables:

**Core tables:**
- **users** — Registration, extensible `meta` JSON field
- **groups** — Group settings, extensible `meta` JSON field
- **bot_registry** — Multi-bot heartbeat tracking
- **message_claims** — Multi-bot message deduplication
- **identity_map** — LID ↔ Phone Number mapping

**Optional tables** (used by the built-in ban system, can be removed):
- **users.banned** / **groups.banned** — Global user/group bans
- **group_banned_users** — Per-group user bans

> All optional features are marked with `[OPTIONAL]` comments in the source code. Search for `[OPTIONAL]` to find and remove them if you don't need banning or bot admin roles.

Use the functions in `lib/database.js` to interact with the database:

```javascript
import { getUser, saveUser, registerUser } from "../lib/database.js";

// Get or create user
const user = getUser(sender);

// Register
registerUser(sender, "John");

// Use meta for custom data
user.meta.score = 100;
saveUser(sender, user);
```

---

## License

[MIT](LICENSE)

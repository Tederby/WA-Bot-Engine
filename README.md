# WA-Bot-Engine

A minimal, high-performance, multi-instance WhatsApp bot engine built with [Baileys](https://github.com/WhiskeySockets/Baileys), Node.js (ES Modules), and SQLite (WAL mode). 

Designed as a **production-ready barebone framework**. Run multiple bot phone numbers concurrently from a single codebase, hot-reload commands with zero downtime, render native interactive HTML webviews, and build custom features without architectural bloat.

---

## Highlights

- **Multi-Instance Concurrency (PM2)**: Run dozens of bot numbers simultaneously with process isolation, independent session stores, and atomic SQLite message claim deduplication.
- **SQLite with WAL Mode**: Embedded zero-config database using `better-sqlite3` with Write-Ahead Logging for high-throughput concurrent reads and writes.
- **Interactive HTML UI Engine (Webview)**: Send native in-app HTML5/CSS3 graphical interfaces (cards, dashboards, pseudo-buttons, client-side tabs) via WhatsApp's `richResponseMessage` protocol.
- **Zero-Downtime Hot-Reload**: Live-edit command files and the core message pipeline without disconnecting the WhatsApp socket.
- **Deterministic Identity Resolution**: Fully resolves WhatsApp's Linked Device ID (LID) privacy mode and multi-device suffixes into canonical phone number JIDs.
- **Declarative Middleware**: Protect commands with simple declarative flags (`groupOnly`, `adminOnly`, `botAdminRequired`, `ownerOnly`, `privateOnly`, `silentDrop`).
- **Headless Pairing Code**: Authenticate on headless VPS environments without QR code scanning using 8-character phone pairing codes.
- **Call Protection**: Automatically rejects unsolicited voice/video calls with progressive warnings and automatic auto-ban.

---

## Documentation Suite

Comprehensive technical guides are available in the [`docs/`](docs/README.md) directory:

| Guide | Description |
| :--- | :--- |
| [**Architecture & Pipeline**](docs/ARCHITECTURE.md) | 12-stage message pipeline, PM2 multi-instance model, hot-reload internals, and LID/PN identity resolution. |
| [**Command & UI Development**](docs/COMMAND_DEVELOPMENT.md) | Command anatomy, declarative permission flags, Interactive HTML UI Engine (`uiEngine`), reply handlers, and auto-detection. |
| [**Database & Storage**](docs/DATABASE.md) | Complete SQLite schema, WAL configuration, canonical JID rules (`toCanonicalUserId`), and ban subsystems. |
| [**Configuration & Deployment**](docs/CONFIGURATION_DEPLOYMENT.md) | Environment variables, PM2 setup (`ecosystem.config.cjs`), QR vs. Pairing Code, and automated VACUUM cleanup. |
| [**Changelog**](docs/CHANGELOG.md) | Structured SemVer release notes documenting features, fixes, and engine upgrades. |

---

## Quick Start

### 1. Requirements
- **Node.js** v18+ (v20 LTS recommended)
- **C++ Build Tools** (for `better-sqlite3` native compilation):
  - *Linux*: `sudo apt install -y build-essential python3`
  - *Windows*: Visual Studio Build Tools (Desktop C++)

### 2. Installation
```bash
git clone https://github.com/Tederby/WA-Bot-Engine.git
cd WA-Bot-Engine
npm install
```

### 3. Configuration
```bash
cp .env.example .env
# Configure your OWNER_NUMBER, PREFIXES, and bot settings
```

### 4. Running the Bot

#### Mode A: Single Bot (Terminal QR Code)
```bash
npm start
# Scan the QR code displayed in your terminal with WhatsApp
```

#### Mode B: Multi-Bot / Production (PM2)
Edit `ecosystem.config.cjs` to define your bot instances, then start them:
```bash
npm run pm2

# Check status and logs
pm2 status
pm2 logs bot1
```

#### Mode C: Headless Pairing Code (No QR)
Set `PAIRING_NUMBER` in `.env` or `ecosystem.config.cjs`:
```javascript
PAIRING_NUMBER: "6281234567890" // Start with country code
```
Start the bot, copy the 8-character pairing code from the logs, and enter it under **Linked Devices** > **Link with phone number instead**.

---

## Creating a Command

Create a `.js` file in `commands/`. The bot discovers and hot-reloads it instantly:

```javascript
// commands/hello.js
export default {
    name: "hello",
    aliases: ["hi"],
    category: "general",
    description: "Greets the user",
    usage: "!hello",

    async handler({ message, pushname }) {
        await message.reply(`Hello, ${pushname}! 👋`);
    }
};
```

### Rendering Native HTML Webviews

WA-Bot-Engine can render sandboxed HTML interfaces directly inside WhatsApp:

```javascript
// commands/card.js
import { sendUI, renderPage, renderCard } from "../lib/uiEngine.js";

export default {
    name: "card",
    async handler({ message, sock, pushname, sender }) {
        const html = renderPage({
            title: "Member Card",
            body: renderCard({
                icon: "👤",
                title: pushname || "User",
                subtitle: sender,
                content: "<p>Welcome to <b>WA-Bot-Engine</b>!</p>"
            })
        });

        const sent = await sendUI(sock, message.chat, {
            title: "Member Card",
            html
        });

        // Auto-delete after 2 minutes to keep chat clean
        setTimeout(() => {
            sock.sendMessage(message.chat, { delete: sent.key }).catch(() => {});
        }, 120_000);
    }
};
```

---

## Project Structure

```
wa-bot-engine/
├── commands/                   # Auto-loaded command modules
│   ├── _registry.js            # Dynamic loader & reply handler registry
│   ├── ping.js                 # Minimal latency check command
│   └── html.js                 # Interactive HTML webview renderer command
├── docs/                       # Technical documentation suite
│   ├── README.md               # Documentation index
│   ├── ARCHITECTURE.md         # Pipeline & concurrency architecture
│   ├── COMMAND_DEVELOPMENT.md  # Command & UI development guide
│   ├── DATABASE.md             # SQLite schema & canonical JID reference
│   ├── CONFIGURATION_DEPLOYMENT.md # PM2 & deployment reference
│   └── CHANGELOG.md            # Structured SemVer changelog
├── lib/                        # Core engine modules
│   ├── db.js                   # SQLite connection & WAL pragmas
│   ├── database.js             # User/group CRUD, canonical ID & claims
│   ├── uiEngine.js             # Native HTML webview renderer & templates
│   ├── Messages.js             # Baileys message wrapper & serializer
│   ├── commandParser.js        # Prefix & argument parsing
│   ├── contextBuilder.js       # Context resolution (sender, admin, group)
│   ├── jidHelper.js            # JID normalization & extraction helpers
│   ├── middleware.js           # Declarative permission checks
│   ├── autoDetect.js           # Pattern & URL matching registry
│   ├── logger.js               # Centralized formatted terminal logging
│   └── utils.js                # Utilities & spam filter
├── patches/
│   └── baileys+7.0.0-rc13.patch # tcToken protocol fix via patch-package
├── services/
│   └── cleanup.js              # Background temp file & SQLite VACUUM cleanup
├── index.js                    # Entry point, socket & connection lifecycle
├── handler.js                  # 12-stage message processing pipeline
├── setting.js                  # Consolidated configuration
└── ecosystem.config.cjs        # PM2 multi-instance cluster definition
```

---

## License

[MIT](LICENSE)

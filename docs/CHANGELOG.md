# Changelog

All notable changes to **WA-Bot-Engine** are documented in this file. This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-09-03

### Added
- **Interactive HTML UI Engine**: Introduced [`lib/uiEngine.js`](../lib/uiEngine.js) for rendering sandboxed HTML, CSS, and client-side JavaScript inside WhatsApp using the native `richResponseMessage` protocol.
- **Example `!html` Command**: Demonstrates interactive webview rendering, responsive styling, client-side pseudo-buttons via hash routing, and 2-minute auto-deletion lifecycle.
- **Canonical JID Resolution (`toCanonicalUserId`)**: Added deterministic normalization across all user and group ban database queries in [`lib/database.js`](../lib/database.js), preventing LID bypass vulnerabilities.
- **Context Sender Normalization**: Automatically resolves `sender` to canonical Phone Number JID in [`lib/contextBuilder.js`](../lib/contextBuilder.js).
- **Group Metadata Cache Invalidation**: Exported `invalidateGroupMetadataCache(chatId)` to allow manual cache clearing upon participant or role changes.
- **Silent Drop for Group Bans**: Returns `SILENT_DROP` for group-banned users in [`lib/middleware.js`](../lib/middleware.js) and enforces early silent drops in [`handler.js`](../handler.js) to prevent bot spam loops.
- **Baileys Protocol Patch**: Bundled `patches/baileys+7.0.0-rc13.patch` via `patch-package` to resolve the `tcToken` crash in Baileys v7.
- **International Country Code Agnosticism**: Added `setting.defaultCountryCode` (default: `"62"`) to replace hardcoded local phone prefixes in target resolution.
- **Documentation Suite**: Created dedicated architectural, command development, database, configuration, and deployment guides under `docs/`.

### Fixed
- **SQLite Group Ban Race Condition**: Removed the destructive `bannedUsers` syncing loop in `saveGroupConfig()`, ensuring direct junction table records in `group_banned_users` are preserved.
- **Media Download DNS Resolution**: Fixed `a.whatsapp.net` DNS lookups in [`lib/Messages.js`](../lib/Messages.js).
- **Webview Key Ownership**: Ensured `fromMe: true` is included in `sendUI()` response keys for reliable group auto-deletion.

### Changed
- **Decoupled Cleanup Configuration**: Moved temporary file expiry and SQLite VACUUM settings to root [`setting.js`](../setting.js).
- **Stripped Domain Bloat**: Removed non-engine heavy dependencies (Puppeteer, Jimp, wa-sticker-formatter) to maintain a lightweight core.

---

## [1.0.0] — 2026-07-13

### Added
- **Core Barebone Engine**: Extracted essential multi-bot architecture into a standalone framework.
- **Pipeline Architecture**: 12-stage message processing pipeline in `handler.js`.
- **SQLite with WAL Mode**: Concurrency-safe SQLite storage powered by `better-sqlite3`.
- **PM2 Multi-Instance Concurrency**: Process clustering with atomic message claims (`message_claims`) and heartbeat discovery (`bot_registry`).
- **Hot-Reloading**: Zero-downtime command and handler reloading via Chokidar and ESM query string cache-busting.
- **Call Protection System**: Automatic call rejection, deduplication cache, progressive warnings, and 4th-call auto-ban.
- **Dynamic Command Registry**: Auto-loading ES module command structure with declarative permission flags.

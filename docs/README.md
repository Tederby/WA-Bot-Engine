# WA-Bot-Engine Documentation Suite

Welcome to the technical documentation for **WA-Bot-Engine**, a high-performance, modular, multi-instance WhatsApp bot framework built with [Baileys](https://github.com/WhiskeySockets/Baileys), Node.js (ES Modules), and SQLite (WAL mode).

---

## Documentation Index

The documentation is organized into focused, topic-specific guides:

- [System Architecture and Pipeline](ARCHITECTURE.md)  
  High-level architectural philosophy, 12-stage message processing pipeline, PM2 multi-instance coordination, hot-reloading internals, and WhatsApp LID/PN identity resolution.

- [Command and UI Development Guide](COMMAND_DEVELOPMENT.md)  
  Guide to building commands, declarative permission flags, context builder reference, interactive reply handlers, auto-detection regex registry, and the native **Interactive HTML UI Engine (Webview)**.

- [Database and Storage Architecture](DATABASE.md)  
  Complete SQLite schema reference, Write-Ahead Logging (WAL) configuration, concurrency safety, canonical JID resolution (`toCanonicalUserId`), and optional sub-systems (global bans & bot admin hierarchy).

- [Configuration and Deployment Guide](CONFIGURATION_DEPLOYMENT.md)  
  Environment variables reference, PM2 multi-bot clustering setup (`ecosystem.config.cjs`), QR code vs headless pairing code login, and automated cleanup maintenance.

- [Release Changelog](CHANGELOG.md)  
  Structured SemVer release notes documenting features, bug fixes, breaking changes, and architectural upgrades.

---

## Architectural Principles

1. **Engine vs. Application Separation**: The core provides routing, identity resolution, concurrency, state management, and messaging abstractions. Domain-specific features (downloaders, AI integrations, media manipulators) remain purely as commands and plugins.
2. **Deterministic Identity Resolution**: Multi-device addressing (`:device@...`) and WhatsApp LID mode (`@lid`) are transparently normalized into canonical phone number JIDs before database persistence.
3. **Zero-Downtime Development**: Modifying command modules or message handler logic does not require restarting active bot sessions or breaking WhatsApp WebSocket connections.
4. **Isolated Processes, Shared Storage**: Multiple bot instances run in isolated Node.js processes with separate session directories, coordinating via SQLite in WAL mode.

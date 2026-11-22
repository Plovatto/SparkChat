# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-22

First stable release of the SparkChat web client.

### Added

- Real-time private chats and groups over Socket.IO, with invite links and silent reconnection.
- End-to-end encryption of messages, attachments, reactions, and group names with libsodium, with optional key transparency.
- Voice and video calls over WebRTC with signed signaling, screen sharing, camera switching, and RNNoise noise reduction, plus a movie mode that lowers the shared show while someone talks.
- SparkAI, an assistant pinned to the top of the chat list.
- Photos, voice messages, files with PDF previews, GIFs, reactions, quoted replies, batch deletion for everyone, and typing and recording indicators.
- Private translation between Portuguese and English in the browser with Mozilla's Bergamot models, verified by sha256 at build time.
- Three modes, 96 color themes, 121 wallpapers, and custom bubble colors, transparency, and blur, per chat or for all chats.
- Signature motion across messages, the chat list, overlays, and a circular theme reveal.
- Browser notifications, sounds, and unread badges.
- A presentation page rendered per language at `/` and `/en/`, with the app at `/app/` and a Content-Security-Policy on every page.
- CI with lint, type checks, and tests, CodeQL, OpenSSF Scorecard, Lighthouse audits, and a pull request title check.
- A README in English and Portuguese, issue forms, a code of conduct, and code owners.

[1.0.0]: https://github.com/Plovatto/SparkChat/releases/tag/v1.0.0

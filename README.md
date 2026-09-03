# Pi Desktop

A polished Electron interface for the Pi coding agent. It uses Pi's supported RPC mode, so it keeps the same models, credentials, sessions, tools, skills, extensions, context files, and settings as the terminal application.

## Development

Requirements:

- Node.js 22.19 or newer
- Pi installed and available at `/opt/homebrew/bin/pi`, `/usr/local/bin/pi`, `~/.local/bin/pi`, or on `PATH`

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run dist:mac
```

Unsigned macOS artifacts are written to `release/`.

## Current compatibility

The desktop bridge covers Pi's RPC surface: streaming chat, images, tools, direct shell commands, models, thinking levels, session persistence, resume, naming, clone and fork, queues, compaction, retry controls, export, commands, and standard extension UI dialogs.

Pi extensions that use terminal-only `ctx.ui.custom()` components cannot render through RPC. Their tools and non-terminal UI methods still work, but those custom views need app-native replacements.

## License

MIT

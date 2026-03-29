# Technical Architecture

## Shell Process Management

PuTTrY uses [node-pty](https://github.com/microsoft/node-pty) to spawn and manage terminal sessions on your server. Each session is a genuine pseudo-terminal (PTY) running your default shell (`$SHELL` or bash). This means:

- Shells run natively on your server with full access to your user's environment, files, and permissions
- Process signals (Ctrl+C, Ctrl+Z) work as expected
- Shell features like job control, background processes, and terminal multiplexing are fully supported
- When you switch browsers or lose connection, your shell keeps running on the server

## Browser Communication: Two WebSocket Types

PuTTrY uses two separate WebSocket channels for different purposes:

### Sync WebSocket (`/sync`)

A single persistent connection per browser that carries **control and coordination messages**:
- Session creation, deletion, and renaming
- Input lock acquisition/release (write access changes)
- Data activity notifications

This channel keeps all tabs/windows of the same browser synchronized about what's happening in the backend.

### Per-Session WebSocket (`/terminal/:sessionId`)

Individual connections for each terminal session you're viewing. These carry:
- Raw terminal output data (from your shell to the browser)
- Raw input data (from your keyboard to the shell)
- Resize messages (when your browser window changes size)

## Foreground vs. Background Sessions

To minimize traffic between your browser and backend, **only the currently active (foreground) session receives real-time data**.

**When you're viewing a session:**
1. A per-session WebSocket connection is established
2. The server immediately replays the **scrollback buffer** (recent output history, configurable up to thousands of lines)
3. Real-time updates begin flowing from the shell to your terminal
4. Input from your keyboard is sent to the shell

**When you switch to a different session:**
1. The WebSocket for the previous (background) session closes
2. That session stops receiving updates, reducing server-to-client traffic
3. A new WebSocket opens for the newly active session
4. Its scrollback buffer is replayed so you see where you left off
5. Real-time updates resume

**Multiple browsers viewing the same shell:**
- All connected browsers receive real-time output simultaneously
- Only one browser can hold the write lock (input control) at a time
- Background browsers are read-only—they see all output but cannot send input

This design keeps bandwidth usage low even when you have many sessions open, since each browser only streams data for the session you're currently viewing.

## Output Buffering

Each terminal session maintains an output buffer on the server that stores recent terminal history (default 10,000 lines, configurable). This buffer:
- Captures all output from your terminal sessions
- Is sent to new browsers connecting to the session (or existing browsers that had their connection closed)
- Is trimmed as new output arrives to prevent unbounded memory growth

This makes it safe to view a session from a new device without losing context—you immediately get the recent history when you connect.

## Write Lock Mechanism

The input lock ensures only one browser can write to a shell at any given time:

- **Lock holder**: The browser with write access sends input to the shell
- **Lock seekers**: Other browsers see who holds the lock and can request it
- **Force takeover**: Any browser can force the lock away from another at any time (no permission needed)
- **Sync broadcast**: Lock changes are broadcast via the sync WebSocket so all browsers know who's in control
- **Automatic release**: Locks are automatically released when the browser disconnects

## Terminal Emulation

PuTTrY uses [xterm.js](https://xtermjs.org/) as its terminal emulator. xterm.js is a mature, open-source JavaScript terminal implementation that provides full VT102 emulation in the browser. It handles complex terminal features like mouse support, Unicode rendering, and custom color schemes—all while maintaining excellent performance even on resource-constrained devices.

We're grateful to the xterm.js project and its contributors for building a robust foundation that powers PuTTrY's web-based terminal experience.

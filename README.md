# Pip

Need it later? Pip it.

Pip is a calm little notes app for Windows. Shake your mouse (or press Ctrl+Shift+Space), write the thought down, and get back to what you were doing.

Free while Pip is in early access. Windows 11, 64-bit.

Website: https://pip-note.pages.dev/

## Download

Get the latest installer from the [latest release](https://github.com/Jmasis23/pip-note/releases/latest) and run the `.exe`. After that, Pip updates from Settings > Updates.

The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC". Choose "More info", then "Run anyway".

## Features

- **Quick capture.** Shake the mouse or press Ctrl+Shift+Space to open a small capture box. Ctrl+Enter saves. Esc keeps your half-written thought as a draft.
- **Resizable capture box.** Drag its edges and corners. It stays on screen, and long pasted text scrolls inside the box so the Keep button is always visible.
- **Folders.** Pick a folder in the capture box or move notes between folders later.
- **Title and folder suggestions, powered by Jev.** While you capture, Pip suggests a title from your own words and one of your existing folders. Your folder choice always wins. If a suggestion isn't available, Pip uses the first line as the title and keeps the current folder. There is no switch to turn suggestions off in 0.2.x.
- **Note board.** Color cards, pinned notes, checklists, search by title or body, light and dark mode, and adjustable text size. Cards can be dragged freely, with Auto arrange to tidy them.
- **Floating notes.** Keep a note on screen while you work in something else.
- **Accounts and sync.** Sign in with Google or ChatGPT (required). Your notes sync through your Pip account.
- **Clipboard history.** Paused by default. When you turn it on, it keeps copied text and images on your PC.
- **Export.** Export any note as Markdown from its editor, or all active notes as one JSON file from Settings.
- **Updates.** The Windows installer includes an in-app updater under Settings > Updates.

## Privacy

- **Notes and your account.** A copy of your notes lives on your PC. Pip requires sign-in, and notes sync through your Pip account. They are not stored only on your PC.
- **Suggestions.** While you're signed in, the text you're capturing and your folder names are sent to Pip's own service for title and folder suggestions powered by Jev. This happens as you type, before you save. Your other notes and your clipboard history are not sent for suggestions.
- **Clipboard history.** Paused by default, saved unencrypted on your PC, and never synced. If you choose "Keep as note" on an item, it becomes a note and syncs with your account. Pause history before copying secrets.

## Good to know

- Windows only for now. There is no Mac, Linux or phone version.
- Source for the app lives on the `windows/pip-app` branch.

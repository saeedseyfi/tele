# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

Tele — a Mac teleprompter app that sits in the MacBook notch area. Built with Electron + TypeScript (main/preload) and vanilla JS (renderer).

## Commands

- `npm run dev` — watch mode: rebuilds and relaunches on file changes
- `npm run build` — compile TS + copy renderer assets to `dist/`
- `npm start` — build then launch Electron

No test framework is configured.

## Architecture

Three-process Electron app:

- **Main** (`src/main/index.ts`) — window management, global shortcuts, config persistence (JSON in `userData`), menu bar color sampling via `desktopCapturer`
- **Preload** (`src/preload/index.ts`) — exposes `window.api` bridge (IPC channels: `media`, `config-changed`, `stuck-top`, `menu-bar-color`)
- **Renderer** (`src/renderer/`) — vanilla JS, no bundler. Two views: editor (textarea) and prompter (auto-scrolling). Settings window is a separate HTML page.

Key design details:
- Window snaps to notch position (`y=38`) with a stuck threshold; background color is sampled from the actual menu bar pixels
- Prompter splits text on sentence boundaries, renders minimal markdown (bold/italic/headers/directions), scrolls via `requestAnimationFrame`
- Config stored at `app.getPath('userData')/config.json`; shortcuts are Electron accelerator strings

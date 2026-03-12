# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + production build (output: dist/)
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

## Stack

- **Vite 7** + **React 19** + **TypeScript 5.9**
- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`); use `@import "tailwindcss"` in CSS
- **Supabase JS v2** — installed, not yet initialized

## Architecture

Currently a blank slate — `src/App.tsx` is the single component. The project is a multiplayer browser game (Battleship / Statki).

Tailwind v4 differs from v3: no config file, CSS-first configuration. Add theme customizations directly in `src/index.css` using `@theme { }` blocks.

## Conventions

- Components go in `src/components/`
- Game state goes in `src/store/`
- Variable and file names in English, comments in Polish
- Do not install new UI libraries without asking first

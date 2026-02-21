# AGENTS.md

## Goal
Ship and maintain `web-messenger` safely.

## Stack
- Package manager: `bun`
- Monorepo runner: `turbo`
- Web: Next.js (`apps/web`)
- API: Hono + tRPC (`apps/api`)

## Setup
1. Install deps: `bun install`
2. Start dev: `bun run dev`
3. Web only: `bun run --filter web dev`
4. API only: `bun run --filter @workspace/api dev`

## Release Gate (must pass)
1. `bun run --filter web build`
2. `bun run --filter @workspace/api build`
3. `bun run --filter web typecheck`
4. `bun run --filter @workspace/api typecheck`
5. `bun run --filter web lint`
6. `bun run --filter @workspace/api lint`

## Coding Rules
- Keep Telegram-like UX mood and interaction model.
- Prefer existing shared UI components from `packages/ui`.
- For menus/popovers, use shadcn/Radix components.
- Do not introduce `npm` lockfiles; use `bun.lock` only.
- Avoid destructive git commands (`reset --hard`, forced checkout).

## QA Checklist (manual)
- Identity create/restore
- Add contact by user id
- Send/edit/delete/pin/reply/forward message
- Reactions add/remove
- Desktop + mobile sidebar behavior
- Dropdown positioning and visibility (no clipping/overlap)

## Notes
- Store secrets only in `.env` and never commit credentials.
- Keep changes small and commit with clear scope.

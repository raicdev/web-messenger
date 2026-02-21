# E2E Web Messenger (MVP+)

Monorepo structure:

- `apps/web`: Next.js (App Router) + tRPC client + IndexedDB
- `apps/api`: Hono + tRPC server + Drizzle (PostgreSQL/Neon)
- `packages/shared`: zod schemas / shared types
- `packages/db`: Drizzle schema + migration SQL
- `packages/ui`: shadcn/ui shared components

## Environment

Create `.env` at repository root:

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Run

```bash
bun install
bun run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## Database migration (Drizzle)

```bash
bun run --filter @workspace/db db:generate
bun run --filter @workspace/db db:migrate
```

## Implemented security model

- 1:1 message encryption: Signal protocol library (`@privacyresearch/libsignal-protocol-typescript`) with PreKey session bootstrap + Double Ratchet session messages.
- Group encryption: Sender Key equivalent (per-sender symmetric key, distributed to members over encrypted 1:1 channel).
- Safety UX: identity key mismatch warning + safety number display.
- API stores ciphertext only (`message_queue`, `group_message_queue`).
- Stateless request authentication (nonce + signature verification + replay prevention).
- Client key/session persistence in IndexedDB (with recovery string export/import).

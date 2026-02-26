# Database Migrations

Migrations are applied in numeric order.

## History

- `db/schema.sql` — Initial schema (messages, memory, logs tables, helper functions, semantic search RPCs). Apply this first on a fresh database.
- `001` — Reserved for the initial schema (see `db/schema.sql`).
- `002_attachments.sql` — Adds `attachments` table for uploaded files (images, documents, audio) with HNSW vector index and `match_attachments` RPC for semantic search.

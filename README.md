# Automate DNS API

Automate DNS is a JSON-only API server built on Cloudflare Workers. It exposes CRUD endpoints for managing resolver records, routes requests with [Hono](https://hono.dev/), and persists data with [Drizzle ORM](https://orm.drizzle.team/) + Cloudflare [D1](https://developers.cloudflare.com/d1/).

## Features

- RESTful CRUD endpoints for resolver records with soft-delete semantics.
- Input validation for provider, hostname, alias, and IPv4 fields plus uniqueness enforcement on provider/hostname pairs.
- Health/root discovery endpoints for quick observability checks.
- Automatic Cloudflare DNS A-record sync whenever a resolver's IPv4 changes.

### Endpoints

| Method | Path             | Description                                  |
|--------|------------------|----------------------------------------------|
| GET    | `/`              | Service metadata + endpoint list             |
| GET    | `/health`        | Simple health probe                          |
| GET    | `/resolvers`     | List resolvers (supports filters & paging)   |
| POST   | `/resolvers`     | Create resolver                              |
| GET    | `/resolvers/:id` | Fetch resolver by id                         |
| PUT    | `/resolvers/:id` | Replace/patch resolver (same as PATCH)       |
| PATCH  | `/resolvers/:id` | Replace/patch resolver (same as PUT)         |
| DELETE | `/resolvers/:id` | Soft-delete resolver                         |

Query params: `provider`, `hostname`, `includeDeleted`, `limit`, `offset`.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a D1 database and update `wrangler.json` with the binding id/name.
3. Configure Cloudflare credentials used for DNS syncing:
   ```bash
   wrangler secret put CLOUDFLARE_API_TOKEN   # API token with DNS edit permissions
   wrangler secret put CLOUDFLARE_ZONE_ID     # Zone ID that owns the records
   ```
4. Run migrations (local or remote):
   ```bash
   npx wrangler d1 migrations apply DB --local
   npx wrangler d1 migrations apply DB --remote
   ```
5. Start the worker locally:
   ```bash
   npm run dev
   ```
6. Deploy:
   ```bash
   npm run deploy
   ```

Invoke the endpoints with `curl`, `HTTPie`, or the Cloudflare dashboard. Every response is JSON, so you can wire it into automation pipelines easily.

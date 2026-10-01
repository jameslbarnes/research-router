# ORCID signing on Cloudflare

This Worker requires ORCID authentication before accepting a signature request. It uses Cloudflare D1. New requests stay private until an operator reviews their academic evidence and approves them. ORCID authentication confirms control of the record, not academic credentials.

The letter uses the repository's existing GitHub Pages site, published from the root of `main`. Read [the published letter](https://jameslbarnes.github.io/research-router/site/letter/studies/split-view.html) or open [the signing page](https://bargaining-letter-signing.jameslbarnes.workers.dev/letter/sign/).

Cloudflare hosts the signing page at `/letter/sign/` and the API at `/letter/api/*` on its own HTTPS hostname. Signing moves to that hostname in a normal browser tab. OAuth and session requests remain on the signing origin, so they do not depend on third-party cookies. Only the approved public signatory list permits reads from the GitHub Pages origin. The production Worker and D1 database were deployed on 1 October 2026.

## Local development

Requires Node 24 or later. From this directory:

```sh
npm ci
npm run db:local
npm run dev
```

In another terminal:

```sh
npm run preview
```

Open [the local signing page](http://localhost:8766/letter/sign/) or [the selected letter design](http://localhost:8766/letter/studies/split-view.html). Port 8787 is Wrangler; port 8766 serves the static letter and proxies its API calls. The earlier static-only preview at port 8765 cannot perform OAuth.

Without credentials the page shows an honest setup message and disables sign-in. There is no email fallback and no client-side substitute for authentication.

## ORCID clients

Use separate clients for sandbox and production. The sandbox is a separate ORCID registry with separate accounts.

| Field | Value |
| --- | --- |
| Application name | Bargaining For Our Minds |
| Description | Connect an ORCID iD when signing an open letter from scientists to frontier AI labs. We use public research records to review academic identity. |
| Scope | `/authenticate` |
| Local sandbox callback | `http://localhost:8766/letter/api/auth/orcid/callback` |
| Production application website | `https://jameslbarnes.github.io/research-router/site/letter/studies/split-view.html` |
| Production callback | `https://bargaining-letter-signing.jameslbarnes.workers.dev/letter/api/auth/orcid/callback` |

Register the exact callback path. ORCID requires a verified email and acceptance of its Public API terms before client registration. Confirm the project's eligibility for the Public API; its credentials belong to an individual and its use is limited to non-commercial activity. See [ORCID's authentication tutorial](https://info.orcid.org/documentation/api-tutorials/api-tutorial-get-and-authenticated-orcid-id/) and [Public API terms](https://info.orcid.org/public-client-terms-of-service/).

Copy `.dev.vars.example` to `.dev.vars`, fill in the sandbox client ID and secret, and generate a 32-byte encryption key. These values stay outside the static site and are ignored by Git. Do not paste them into HTML or JavaScript served to visitors. Store a backup of the encryption key with the database backup; changing it makes earlier encrypted tokens unreadable.

## Production deployment

The default D1 ID is a local sandbox placeholder. The explicit `production` environment uses the separate `bargaining-letter-signing-production` database in James's selected Cloudflare account. Wrangler is authenticated for that account with account/user read access, background access, Workers Scripts Write and D1 Write. Its warning about other missing default scopes does not require granting unrelated permissions.

The `production` environment in `wrangler.toml` contains:

- `vars.APP_ORIGIN` equal to the signing Worker's exact HTTPS origin and `vars.ORCID_ENV = "production"`.
- `vars.PUBLIC_LETTER_URL = "https://jameslbarnes.github.io/research-router/site/letter/studies/split-view.html"` and `vars.PUBLIC_AUDIT_URL = "https://jameslbarnes.github.io/research-router/site/letter/check/"`.
- A separate D1 `DB` binding and real database ID, with `migrations_dir = "migrations"`.
- `workers_dev = true` for the chosen production Worker, or a custom signing hostname. GitHub's hostname cannot be used as a Cloudflare Worker route.
- References to the production service configuration. `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` are installed separately as Worker secrets.

The `signingUrl` in `site/letter/hosting.js` points to the production `/letter/sign/` address. This is public configuration and contains no credentials. The selected design links directly to signing. Visits to the signing page on GitHub Pages redirect to Cloudflare. Local previews keep using the local service.

The initial migration has been applied to the production database. Future authorised deployments use `wrangler deploy --env production`. Apply new migrations with `wrangler d1 migrations apply DB --remote --env production`. The default local configuration keeps `workers_dev` and preview URLs disabled. Never point the sandbox at the production database. See [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) and [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Production secrets were sent directly to Cloudflare without creating a local credentials file. The token encryption key was generated in memory. Cloudflare holds the only persisted copy; no separate recovery copy was created. Preserve that secret when deploying or moving the service. Replacing it makes previously encrypted tokens unreadable.

The build copies an explicit list of signing assets into the ignored `public/` directory for Cloudflare. It excludes the letter's film, draft notes and service source. The Worker serves signing HTML with `Cache-Control: no-store` and `Referrer-Policy: same-origin` and points reading links back to GitHub Pages. API responses set `Cache-Control: no-store`; OAuth callback redirects use `Referrer-Policy: no-referrer`.

The build extracts the exact letter from `site/letter/index.html`, excludes archived HTML comments, and hashes the title and paragraphs. Rebuild and deploy the Worker alongside each letter revision. A stale browser cannot submit consent to a newer letter without reloading. Previous signatures are retained under the version they signed; the API shows approvals for the current version only.

## Reviewing signatures

`npm run db:local` initialises only the local database. Use these commands from this directory:

```sh
node review.mjs list
node review.mjs show ORCID LETTER_HASH
node review.mjs approve ORCID LETTER_HASH
node review.mjs withdraw ORCID LETTER_HASH
```

They operate on the local sandbox by default. `--remote` selects the explicitly configured production environment. A remote approval or withdrawal additionally requires `--confirm-publish` because it changes the public list. Do not run those commands during an unpublished design review.

Review the authenticated ORCID profile and the stored public affiliation/work evidence. Examine who supplied each assertion. Cross-check uncertain cases against an institutional profile or published work. Sparse or unavailable records stay pending; there is no publication-count threshold or automatic “verified scientist” badge. A public-record fetch failure preserves the request for manual review. An ORCID iD supplied by the browser is ignored.

Private contact emails are self-supplied and have not been email-verified. The organising checkbox records a preference; this integration sends no email and does not subscribe anybody to a mailing service. An invitation sender or mailing-list integration will need its own verification and delivery flow.

The existing `site/letter/signatories.json` remains unchanged. The main letter and selected design add approved production records from the API when available. New requests remain private until reviewed.

## Validation and limits

```sh
npm test
npm run test:worker
npm run check
```

`check` performs a Cloudflare build with `--dry-run`; it does not deploy. The 20 core tests use isolated, in-memory SQLite databases and mocked ORCID responses. They cover state binding and replay, explicit consent, encrypted tokens, CSRF, input validation, duplicate submissions and sandbox isolation. `test:worker` runs the complete OAuth and signature flow in Cloudflare's local runtime with D1 and fixture provider responses. It also checks signing assets, links back to GitHub Pages, private endpoint isolation and public-list CORS. Duplicate submissions produce one private request. These tests do not authenticate a real ORCID account.

Opaque session cookies are HttpOnly and SameSite=Lax, with Secure and `__Host-` names in production. States are browser-bound, expire after ten minutes and are consumed once. Sessions expire after twelve hours. POSTs require the configured origin and a custom request header; authenticated mutations also require a session CSRF token. Login and submission attempts are rate-limited in D1. OAuth tokens are encrypted using AES-256-GCM and never sent to the browser. Logs intentionally omit tokens, callback parameters and contact data.

The interface currently provides a copyable letter link after signing. Coauthor discovery, contact matching and invitation sending remain separate work. No collaborator is contacted by this integration.

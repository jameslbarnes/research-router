# ORCID signing on Cloudflare

This Worker requires ORCID authentication before accepting a signature request. It uses Cloudflare D1. New requests stay private until an operator reviews their academic evidence and approves them. ORCID authentication confirms control of the record, not academic credentials.

The letter uses the repository's existing GitHub Pages site, published from the root of `main`. Read [the published letter](https://bargainingforourminds.org/science/) or open [the signing page](https://bargaining-letter-signing.jameslbarnes.workers.dev/letter/sign/).

The form sits below the letter on GitHub Pages. Cloudflare hosts the API and a sign-in bridge at `/letter/sign/`. ORCID sign-in briefly leaves the letter, then returns to its inline form in the same tab. The standalone Cloudflare signing page also remains available. The initial production Worker and D1 database were deployed on 1 October 2026.

The inline flow works without third-party cookies. The letter stores a temporary random verifier in its tab's session storage before visiting Cloudflare. The bridge creates a single-use handoff tied to its SHA-256 challenge and returns only to the configured letter URL. The letter removes the handoff from its fragment immediately and exchanges it with the verifier for a one-hour application session. That session token stays in memory, is restricted to the letter origin and never contains an ORCID token. Refreshing the page requires reconnecting. Signing still requires an explicit consent checkbox and a session CSRF token.

Public ORCID names and current affiliations can prefill the editable form. An expandable summary shows public affiliations, research keywords and up to three recent works. Profile loading cannot overwrite fields the visitor has edited. Empty records and provider failures leave manual entry available. Email and update preferences remain for the visitor to enter. Reading public data does not require broader ORCID consent; see [ORCID's record-reading tutorial](https://info.orcid.org/documentation/api-tutorials/api-tutorial-read-data-on-a-record/). Profile and review lookups use the documented `/person` and `/activities` endpoints.

Public reads reuse the encrypted token obtained during sign-in. Decryption and authenticated ORCID requests happen only on the Worker. ORCID confirms that [`/authenticate` tokens also allow public reads](https://info.orcid.org/ufaqs/how-do-i-get-read-public-access-token/). The browser receives only the selected profile fields.

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
| Production application website | `https://bargainingforourminds.org/science/` |
| Production callback | `https://bargaining-letter-signing.jameslbarnes.workers.dev/letter/api/auth/orcid/callback` |

Register the exact callback path. ORCID requires a verified email and acceptance of its Public API terms before client registration. Confirm the project's eligibility for the Public API; its credentials belong to an individual and its use is limited to non-commercial activity. See [ORCID's authentication tutorial](https://info.orcid.org/documentation/api-tutorials/api-tutorial-get-and-authenticated-orcid-id/) and [Public API terms](https://info.orcid.org/public-client-terms-of-service/).

Copy `.dev.vars.example` to `.dev.vars`, fill in the sandbox client ID and secret, and generate a 32-byte encryption key. These values stay outside the static site and are ignored by Git. Do not paste them into HTML or JavaScript served to visitors. Store a backup of the encryption key with the database backup; changing it makes earlier encrypted tokens unreadable.

## Production deployment

The default D1 ID is a local sandbox placeholder. The explicit `production` environment uses the separate `bargaining-letter-signing-production` database in James's selected Cloudflare account. Wrangler is authenticated for that account with account/user read access, background access, Workers Scripts Write and D1 Write. Its warning about other missing default scopes does not require granting unrelated permissions.

The `production` environment in `wrangler.toml` contains:

- `vars.APP_ORIGIN` equal to the signing Worker's exact HTTPS origin and `vars.ORCID_ENV = "production"`.
- `vars.PUBLIC_LETTER_URL = "https://bargainingforourminds.org/science/"` and `vars.PUBLIC_AUDIT_URL = "https://bargainingforourminds.org/science/check/"`.
- A separate D1 `DB` binding and real database ID, with `migrations_dir = "migrations"`.
- `workers_dev = true` for the chosen production Worker, or a custom signing hostname. GitHub's hostname cannot be used as a Cloudflare Worker route.
- References to the production service configuration. `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` are installed separately as Worker secrets.

The `signingUrl` in `site/letter/hosting.js` points to the production `/letter/sign/` bridge. This is public configuration and contains no credentials. “Add your name” scrolls to the inline form. The old GitHub signing URL returns visitors to that form. Local previews keep using the local service.

Migrations through `0004_signer_citations.sql` have been applied to the production database. Future authorised deployments use `wrangler deploy --env production`. Apply new migrations with `wrangler d1 migrations apply DB --remote --env production`. The default local configuration keeps `workers_dev` and preview URLs disabled. Never point the sandbox at the production database. See [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) and [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Production secrets were sent directly to Cloudflare without creating a local credentials file. The token encryption key was generated in memory. Cloudflare holds the only persisted copy; no separate recovery copy was created. Preserve that secret when deploying or moving the service. Replacing it makes previously encrypted tokens unreadable.

The build copies an explicit list of signing assets into the ignored `public/` directory for Cloudflare. It excludes the letter's film, draft notes and service source. The Worker serves signing HTML with `Cache-Control: no-store` and `Referrer-Policy: same-origin` and points reading links back to GitHub Pages. API responses set `Cache-Control: no-store`; OAuth callback redirects use `Referrer-Policy: no-referrer`.

The build extracts the exact letter from `site/letter/index.html`, excludes archived HTML comments, and hashes the title and paragraphs. Rebuild and deploy the Worker alongside each letter revision. The inline form compares the displayed title and paragraphs with the API's current letter before allowing sign-in or signing. A mismatch shows a reload prompt. The server also rejects submissions for an outdated letter hash. Previous signatures are retained under the version they signed; the API shows approvals for the current version only.

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

Public signers are ordered by total citations in OpenAlex, using a unique primary ORCID match and a compatible name. Each available count links to its source. Unknown counts follow known counts; ties retain signing order. Static and ORCID signatures with the same name and affiliation are counted once. The subtitle gains a total once three people have signed. When at least two have matched citation records, it names the two highest-cited signers and gives the number of others. Featured names come from the current public list.

Migration `0004_signer_citations.sql` adds a public citation cache. A public-list request refreshes up to 50 stale records, within a four-second provider budget and a database lease that prevents concurrent refreshes. Successful lookups are cached for a day. Failed requests preserve confirmed counts for the same name and retry after an hour. The list checks approval and letter version again after a lookup. No private contact information or OAuth credentials are sent to OpenAlex.

## Validation and limits

```sh
npm test
npm run test:worker
npm run check
```

`check` performs a Cloudflare build with `--dry-run`; it does not deploy. The core tests use isolated, in-memory SQLite databases and mocked provider responses. They cover state binding and replay, explicit consent, encrypted tokens, CSRF, input validation, duplicate submissions, sandbox isolation, the inline handoff and profile extraction. Invitation tests cover coauthor evidence, namesake separation, caching, limits, private access and referral attribution. `test:worker` runs the OAuth, signature and invitation flow in Cloudflare's local runtime with D1 and fixture provider responses. It also checks signing assets, the handoff to GitHub Pages and endpoint access rules. Duplicate submissions produce one private request. These tests do not authenticate a real ORCID account.

Opaque session cookies on Cloudflare are HttpOnly and SameSite=Lax, with Secure and `__Host-` names in production. OAuth states are browser-bound, expire after ten minutes and are consumed once. Cookie sessions expire after twelve hours. Inline handoffs expire after two minutes; inline sessions expire after one hour. Cross-origin authenticated requests require the exact configured letter origin and a bearer session with that audience. Cookies are never accepted as inline authentication, and CORS does not allow credentials. POSTs require an allowed origin and a custom request header; authenticated mutations also require a session CSRF token. Login, profile and submission requests are rate-limited in D1. OAuth tokens are encrypted using AES-256-GCM and never sent to the browser. Logs intentionally omit tokens, callback parameters and contact data.

## Science route

The `/science/` entry point and its `/science/check/` and `/science/paper/` companion pages are generated by `build-science.mjs`. The regular Worker build regenerates them; `npm run build:science` can also run this step alone. Edit the existing source pages in `site/letter/`, then regenerate. Shared assets remain in `site/letter/`. The film loader resolves its script relative to its own location so both the existing address and `/science/` work. The GoDaddy domain is `bargainingforourminds.org`. GitHub Pages serves the static site from the root of `main`, with its custom domain recorded in `CNAME`. Production signing uses the `/science/` URL for CORS, OAuth return handoffs and invitation links; the ORCID callback remains on the existing Cloudflare Worker. The domain root redirects to `/science/`.

## Coauthor invitations

Connecting ORCID starts a public coauthor lookup while the researcher reviews the signing form. The same lookup continues through submission, so signing does not restart it. This creates no signature or invitation. After submission, the invitation prompt names up to two ranked coauthors, includes the number found when there are more, and offers Share invitation and Copy invitation. The count describes the lookup results, which may cover only part of the signer’s research record. The outgoing message stays general. The signer chooses the recipient in their usual messaging app. The site does not send email or SMS, request an address book, or collect phone numbers.

Sharing works immediately with the canonical letter URL while a general referral link is prepared. Once ready, that link is reused for every invitation from the signer for this letter version. A preparation failure leaves canonical sharing available. Unsupported native sharing leaves Copy invitation available; a blocked clipboard leaves the full message and link selected in a text box.

Discovery and citations use separate authenticated POSTs, `coauthors` and `coauthors/citations`. Discovery saves the paper evidence before requesting citations. The prompt uses the final ranking once the lookup settles; citation failures fall back to shared-paper order. Before results arrive, or when discovery fails, it asks the signer to invite a collaborator. Once someone uses a sharing action, the prompt stays fixed. Signing still requires explicit consent; preparing invitation links requires a pending or approved signature. Logout cancels the browser subscription, so late results cannot populate another account's interface. These lookups are tied to the authenticated ORCID, with origin, CSRF and rate-limit checks on both endpoints.

Discovery first queries the [DBLP knowledge graph](https://github.com/dblp/kg/wiki/dblp-KG-Tutorial) through the signer's ORCID. DBLP's person-level ORCID links are manually verified. A unique linked bibliography with a compatible name supplies the publication and coauthor records, including works absent from ORCID. The query has a five-second timeout, returns up to 2,000 authorship rows and retains up to 500 coauthors. A sentinel row detects truncation. Coauthors without ORCIDs are joined by their stable DBLP IDs. The stored snapshot records the source and whether results were limited.

DBLP covers computer science. If it has no usable linked bibliography or the request fails, discovery uses [Crossref's public REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) for up to 12 DOI-linked papers from the ORCID evidence sample and retains up to 60 suggestions. This fallback still depends on what the signer has listed in ORCID. Broader coverage across other disciplines needs additional bibliography sources. Neither route is presented as a complete list of collaborators. Missing metadata and provider failures leave the general invitation available. ORCID tokens are used only for ORCID requests and never sent to DBLP, Crossref or OpenAlex.

Suggested invitations are ranked by `shared papers × √(total citations + 1)`, highest first. The square root softens the effect of citation totals so repeated collaborations carry more weight. [OpenAlex author citation totals](https://help.openalex.org/data/authors/#cited_by_count) cover the author's work indexed by OpenAlex, beyond the papers shared with the signer. When citations are unavailable, the score is the shared-paper count alone; the citation count stays unknown. Equal scores use shared-paper count, then name and researcher ID. The prompt uses this ranking without displaying the counts. Shared-paper counts use distinct provider publication records; preprint and conference versions may appear separately.

Batch requests match up to 50 public ORCID IDs at a time, with a four-second timeout per request and an eight-second total deadline. A count requires a unique matching profile with the same primary ORCID and a compatible primary name. Alternate names alone do not resolve a conflicting primary name. Ambiguous profiles, missing IDs and invalid counts remain unknown. If all citation lookups fail, the list remains usable in shared-paper order. Counts include a profile link and retrieval timestamp in the stored snapshot.

Basic [OpenAlex API access](https://help.openalex.org/api/authentication/) needs no key. The lookup sends only public ORCID IDs and requests public author metadata. It makes no account or billing changes. If the provider throttles or rejects a request, discovery falls back without a retry in that request. A free API key may be useful for greater usage later.

Crossref's [public access limits](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/) require serial requests. A database lease prevents concurrent discovery jobs from different Worker instances. Requests are paced, time-bounded and stopped on throttling. Successful bibliographies are cached for a day and partial results for a minute. Citation lookup failures are cached for a minute and can be retried without fetching a fresh bibliography. A conditional database update prevents late citations from overwriting a newer discovery result. Snapshots made before the two-stage lookup refresh on the next discovery request. Large records and truncated samples are flagged in the stored snapshot.

Migration `0003_invitations.sql` adds public researcher records, private per-account network snapshots, invitation links, referral records and the discovery lease. A valid ORCID joins a researcher across papers. Without an ORCID, a researcher record uses its DBLP person ID when available, or remains scoped to its paper to avoid merging namesakes. Recipient labels from earlier invitation flows remain private. Existing private signature emails are never used as a contact directory.

Invitation preparation is idempotent per signer, letter version and recipient key. Each link uses a random identifier. Recipient names and ORCID iDs stay out of the URL. Invitations and their source papers can be read only by their creator. Rate limits, CSRF, current signature status and the existing session-origin rules apply. Withdrawing a signature disables its invitation tools. The site shares a general message. Any edits made in the messaging app stay there; our database stores no message text.

An invitation's `via` parameter is removed from the address bar and retained in the current tab's session storage for up to seven days. This preserves it through the existing ORCID redirect without putting it in an OAuth request. The signing form explains that the connection is recorded on submission. Only a new signature for the same letter version can create a referral. Retrying an existing signature cannot change its attribution. A forwarded link records the invitation that led to signing; it does not prove that the named recipient signed. Referral identities and pending signatures are not exposed to the inviter.

The database records `copied` or `share_menu`, never `sent` or `delivered`. The [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) requires a user gesture, so it is invoked directly from the button handler before network bookkeeping. Cancellation records no action. A successful share call only hands the content to the device's sharing system. Actions are recorded only for the referral URL actually shared or copied; sharing the canonical URL while preparation is pending creates no attributed action.

Run `npm run preview:invitations` to open the [Andrew Miller preview](http://127.0.0.1:8779/qa), [phone layout](http://127.0.0.1:8779/qa?phone), or [browser checks](http://127.0.0.1:8779/qa/checks). The preview uses saved public records for [Andrew Miller](https://orcid.org/0000-0002-9910-0292). His [DBLP bibliography](https://dblp.org/pid/39/1855-1) supplies 97 publications and 181 coauthors as retrieved on 4 October 2026. OpenAlex supplies citation counts where its author profiles can be matched. ORCID and the original Crossref records remain in the fixture for the fallback route. The ORCID-linked OpenAlex profile itself contains only two works, and some name-based OpenAlex matches mix in other Andrew Millers; discovery therefore uses the curated DBLP identity link instead of selecting a profile by name or citation count.

Authentication and signing are simulated in an in-memory database, with no real OAuth credentials or outgoing provider requests. The interface labels this as an unauthenticated preview; Andrew is not added to the public signatories. The separate browser checks retain fictional fixtures and stub sharing and clipboard calls; no messages leave that test page. The preview server binds only to loopback and is not part of the Worker. Testing at phone width checks layout; delivery through iOS or Android messaging apps still needs a physical-device check.

The invitation flow and citation-ranked public signers were deployed to the production Worker on 4 October 2026, with migrations `0003_invitations.sql` and `0004_signer_citations.sql`. The letter revision adds the labor movement paragraph and updates the closing commitment. Its consent hash begins `2a094634023c`. Future revisions must rebuild and deploy the Worker with the matching static letter; deploy the Worker before publishing the updated static scripts.

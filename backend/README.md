# Backend deployment (Cloudflare Worker)

This is the small server that both apps call for their AI features. It holds
your Anthropic API key so it never has to sit in the public frontend code.
Nobody has automated this part for you on purpose: deploying it means *you*
create the Cloudflare account and set *your own* secret key, so only you
ever have access to it.

It costs $0 for normal portfolio-demo traffic (Cloudflare Workers free tier:
100,000 requests/day; KV free tier: plenty for rate-limit counters).

## What you'll need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Node.js installed on your computer
- Your Anthropic API key (from [console.anthropic.com](https://console.anthropic.com/settings/keys))

## One-time setup

Open a terminal in this `backend/` folder and run:

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` opens a browser tab asking you to approve access. That's
normal, it's how Wrangler connects to *your* Cloudflare account.

### 1. Create the rate-limit KV namespace

```bash
wrangler kv namespace create RATE_LIMIT
```

This prints something like:

```
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abcd1234..."
```

Copy that `id` value into `wrangler.toml` in this folder, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`.

### 2. Set your Anthropic API key as a secret

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Paste your key when prompted. This is stored encrypted by Cloudflare. It is
never written to any file in this repo and never sent to the browser.

### 3. Check the model name is current

Open `wrangler.toml` and check the `ANTHROPIC_MODEL` value against the
current list at https://docs.claude.com/en/docs/about-claude/models. Model
names change over time, so confirm it's still valid before deploying.

### 4. Check the allowed origin

`ALLOWED_ORIGIN` in `wrangler.toml` should exactly match your GitHub Pages
URL with no trailing slash (already set to
`https://sherinjames-sj.github.io`). This is what stops other websites from
quietly using your API key through your Worker.

### 5. Deploy

```bash
wrangler deploy
```

Wrangler prints your Worker's URL, something like:

```
https://sherin-ai-projects-backend.<your-subdomain>.workers.dev
```

### 6. Point the two apps at it

Open both `purrfect-match/index.html` and `brainrot-o-meter/index.html` and
change the `BACKEND_URL` constant near the top of the `<script>` section to
the URL from step 5. Commit and push that one-line change, and the live
demos will start working.

## Updating later

If you ever tweak `worker.js`, redeploy with:

```bash
wrangler deploy
```

## What's already built in

- **Rate limiting**: 20 requests per IP per endpoint per hour (via the KV
  namespace above). Tune `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` at
  the top of `worker.js` if you want it looser or stricter.
- **Input length limits**: CVs/job descriptions capped at 9,000 characters,
  chat messages at 2,000, Brainrot-O-Meter text at 4,000. Requests over that
  are rejected with a 400 before they ever reach the Claude API.
- **CORS locked down**: only `ALLOWED_ORIGIN` gets a successful response,
  so other sites can't piggyback on your key from a browser.
- **No key exposure**: the key lives only as a Cloudflare secret, read at
  request time inside the Worker. It's never in the repo, never in a
  frontend file, never sent to the browser.
- **Error handling**: validation errors return clear 400 messages, rate
  limit hits return a friendly 429, and unexpected failures return a generic
  500 rather than leaking internals.

## Estimating cost

Even if this got surprisingly popular, the rate limit caps each visitor's
IP at 20 requests/hour per endpoint. With a small/fast model (the default,
Haiku-class) and the token caps already set in `worker.js`, realistic worst
case is a few dollars a month, and Cloudflare's free tier covers the
compute itself. If you want a hard ceiling, Anthropic Console also lets you
set a monthly spend limit on the API key.

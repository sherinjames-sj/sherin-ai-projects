# Sherin's AI Projects

Two small, live AI tools built by [Sherin James](https://sherinjames-sj.github.io/sherin-portfolio/), each with a
Claude-API-powered backend and a static frontend on GitHub Pages.

## 💌 [Purrfect Match](./purrfect-match/)

An honest CV × job-description matching copilot, plus a companion chat, an
interview question predictor, a cover letter starter, a local job-hunt
journal, and two just-for-fun games (Snake, Flappy Cat).

## 🧠 [Brainrot-O-Meter](./brainrot-o-meter/)

A deliberately ridiculous tool that scores how much "brainrot" a piece of
text has, roasts it, and — if you dare — translates it into maximum Gen
Alpha slang, streamed live.

## How it's wired up

Both frontends are static HTML/CSS/JS (no build step) and call a single
shared backend:

```
GitHub Pages (static)  --->  Cloudflare Worker  --->  Claude API
  purrfect-match/             backend/worker.js       api.anthropic.com
  brainrot-o-meter/
```

The Worker holds the Anthropic API key as a server-side secret, so it's
never exposed in the browser or committed to this repo. It also rate-limits
and validates every request. See [`backend/README.md`](./backend/README.md)
for the full deployment guide.

## Tech

Claude API · Cloudflare Workers · Cloudflare KV · vanilla JavaScript ·
Canvas · localStorage · zero frontend build step.

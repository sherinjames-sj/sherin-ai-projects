# Sherin's AI Projects

Two small, live AI tools built by [Sherin James](https://sherinjames-sj.github.io/sherin-portfolio/). Each one is a static frontend on GitHub Pages backed by a small Claude powered server.

## Projects

**[💌 Purrfect Match](./purrfect-match/README.md)**
An honest CV x job description matching copilot, plus a companion chat, an interview question predictor, a cover letter starter, a local job hunt journal, and two just for fun games.
[Try it live →](https://sherinjames-sj.github.io/sherin-ai-projects/purrfect-match/)

**[🧠 Brainrot-O-Meter](./brainrot-o-meter/README.md)**
A deliberately ridiculous tool that scores how much "brainrot" a piece of text has, roasts it, and (if you dare) translates it into maximum Gen Alpha slang, streamed live.
[Try it live →](https://sherinjames-sj.github.io/sherin-ai-projects/brainrot-o-meter/)

## Backend

Both frontends call one shared Cloudflare Worker, so the Anthropic API key stays server side, never in the browser and never committed to this repo. It also handles rate limiting, input validation, and error handling. See [backend/README.md](./backend/README.md) for the full architecture and deployment steps.

## Tech

Claude API, Cloudflare Workers, Cloudflare KV, vanilla JavaScript, Canvas, localStorage. No frontend build step.

# 🧠 Brainrot-O-Meter

**[Try it live →](https://sherinjames-sj.github.io/sherin-ai-projects/brainrot-o-meter/)**

A deliberately ridiculous tool, built in an afternoon to try something different from a serious CV tool: getting an LLM to make consistent, structured judgments about something as fuzzy and subjective as internet slang.

## What it does

Paste in any text and Claude gives it a brainrot score out of 100, assigns it a completely unnecessary tier name, delivers a short roast, and (if you're brave) translates it into maximum Gen Alpha slang, streamed live token by token.

Both interactions are stateless. New text means a new diagnosis, nothing is remembered between requests.

## How it's built

- **Structured JSON**: Claude returns a predictable schema (score, tier, roast, recovery tip) so the UI can render it directly.
- **Streaming**: the translation is streamed straight through from Claude's API to the browser via Server-Sent Events, parsed on the client as it arrives.
- **Playful UX**: a completely different visual language from the rest of the portfolio, neon and chaotic on purpose.

Small and silly on the surface, but the underlying problem, getting consistent structured output from an LLM on subjective input, shows up in far more serious applications too.

## Tech

Claude API, streaming responses, structured JSON, vanilla JavaScript.

---

Part of [Sherin's AI Projects](../). See the [backend](../backend/) for how the server side is wired up.

# 💌 Purrfect Match

**[Try it live →](https://sherinjames-sj.github.io/sherin-ai-projects/purrfect-match/)**

A CV x job description matching copilot, built because most AI resume tools confidently tell people they have skills they don't. Purrfect Match is designed around one rule: never tell someone they're qualified for something they're not.

## What it does

Paste in a CV and a job description and it analyses the genuine overlap, points out what's actually missing, and helps you word your real experience closer to the language of the role. It won't invent a skill you don't have.

From there it grew into a small toolkit:

- **🐾 Whiskers & Biscuit**: an AI chat companion for wording help, pep talks, and job hunt questions.
- **🎯 Interview Predictor**: likely interview questions generated from the actual job posting.
- **✉️ Cover Letter Starter**: a first draft grounded only in your real experience.
- **📓 Job Hunt Journal**: private notes stored locally in your browser, nothing sent anywhere.
- **🎮 Need a break?**: Snake and Flappy Cat, built in vanilla JavaScript and Canvas. Zero AI, just procrastination.

## How it's built

The matching, chat, interview and cover letter features call Claude through a small serverless backend, so the API key never sits in this frontend. The match analysis asks Claude to return structured JSON so the UI can render fields directly instead of parsing free text. The games are plain client side JavaScript with no backend involved at all.

## Tech

Claude API, structured JSON prompting, vanilla JavaScript, Canvas, localStorage.

## Credit

Built and designed by Sherin James. Uses the Claude API for the matching, chat, and writing features.

---

Part of [Sherin's Projects](../). See the [backend](../backend/) for how the server side is wired up.

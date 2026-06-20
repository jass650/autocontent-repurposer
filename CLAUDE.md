# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`autocontent-repurposer` is a Python CLI agent that fetches trending topics from social media platforms and uses Claude to generate ready-to-post content in multiple formats (short-form posts, long-form articles, Twitter thread scripts).

**GitHub**: `jass650/autocontent-repurposer`  
**Branch convention**: feature branches are prefixed with `claude/`

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run the agent (auto-detects sources from .env keys present)
python main.py

# Run with explicit sources and options
python main.py --sources google reddit --count 3 --output json
```

Copy `.env.example` to `.env` — `ANTHROPIC_API_KEY` is required; all other keys are optional and unlock additional trend sources.

## Architecture

```
main.py                   # CLI entry — arg parsing, output formatting
src/
  agent.py                # ContentRepurposerAgent: orchestrates fetch → generate
  generator.py            # Claude API call using tool_use for structured output
  trends/
    base.py               # TrendingTopic dataclass shared by all sources
    google_trends.py      # pytrends — no API key needed
    reddit.py             # public JSON fallback; PRAW if credentials present
    twitter.py            # tweepy Client — requires TWITTER_BEARER_TOKEN
    youtube.py            # YouTube Data API v3 — requires YOUTUBE_API_KEY
    facebook.py           # Graph API — requires FACEBOOK_ACCESS_TOKEN
```

**Data flow**: `main.py` → `ContentRepurposerAgent.run()` → each enabled `trends/*.get_trending()` → deduplicated list → `generator.generate_content()` per topic → structured dict output.

**Content generation** uses Claude's `tool_use` with `tool_choice={"type":"tool","name":"create_content"}` to guarantee a structured JSON response with `topic_summary`, `short_form` (twitter/instagram/facebook), `long_form` (title/body), and `thread` (posts array).

## Adding a New Trend Source

1. Create `src/trends/<platform>.py` with a `get_trending(count: int) -> list[TrendingTopic]` function.
2. Register it in the `_SOURCE_MODULES` dict in `src/agent.py`.
3. Add the CLI `--sources` choice in `main.py → _parse_args()`.
4. Document any required env var in `.env.example`.

Sources must raise an exception (not return empty) when a required API key is missing — the agent catches and logs these per-source, then continues with the rest.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`autocontent-repurposer` is a Python CLI agent that fetches trending topics from social media platforms and generates ready-to-post content in multiple formats (short-form posts, long-form articles, Twitter thread scripts). It runs fully locally via **Ollama** (default, no API key) or optionally via the Claude API.

**GitHub**: `jass650/autocontent-repurposer`  
**Branch convention**: feature branches are prefixed with `claude/`

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Pull the default Ollama model (first-time setup, no API key needed)
ollama pull llama3.2

# Run the agent (Ollama by default; auto-detects trend sources from .env)
python main.py

# Run with explicit sources and options
python main.py --sources google reddit --count 3 --output json
```

Copy `.env.example` to `.env`. By default the agent uses **Ollama** (no API key required). Set `LLM_PROVIDER=claude` and `ANTHROPIC_API_KEY` to use Claude instead. All social media API keys are optional and unlock additional trend sources.

## Architecture

```
main.py                   # CLI entry — arg parsing, output formatting
src/
  agent.py                # ContentRepurposerAgent: orchestrates fetch → generate
  generator.py            # Dual-provider content generation (Ollama default, Claude optional)
  trends/
    base.py               # TrendingTopic dataclass shared by all sources
    google_trends.py      # pytrends — no API key needed
    reddit.py             # public JSON fallback; PRAW if credentials present
    twitter.py            # tweepy Client — requires TWITTER_BEARER_TOKEN
    youtube.py            # YouTube Data API v3 — requires YOUTUBE_API_KEY
    facebook.py           # Graph API — requires FACEBOOK_ACCESS_TOKEN
```

**Data flow**: `main.py` → `ContentRepurposerAgent.run()` → each enabled `trends/*.get_trending()` → deduplicated list → `generator.generate_content()` per topic → structured dict output.

**Content generation** (`src/generator.py`) supports two backends selected via `LLM_PROVIDER`:
- **Ollama** (default): calls `ollama.chat()` with `format="json"` and a JSON schema embedded in the system prompt. Model defaults to `llama3.2`, overridable via `OLLAMA_MODEL`.
- **Claude**: uses `tool_use` with `tool_choice={"type":"tool","name":"create_content"}` for server-enforced structured output. Requires `ANTHROPIC_API_KEY`.

Both produce the same dict shape: `topic_summary`, `short_form` (twitter/instagram/facebook), `long_form` (title/body), `thread` (posts array).

## Adding a New Trend Source

1. Create `src/trends/<platform>.py` with a `get_trending(count: int) -> list[TrendingTopic]` function.
2. Register it in the `_SOURCE_MODULES` dict in `src/agent.py`.
3. Add the CLI `--sources` choice in `main.py → _parse_args()`.
4. Document any required env var in `.env.example`.

Sources must raise an exception (not return empty) when a required API key is missing — the agent catches and logs these per-source, then continues with the rest.

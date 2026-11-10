# autocontent-repurposer

AI agent that pulls trending topics from social media platforms and generates ready-to-post content in every format — short-form posts, long-form articles, and thread scripts.

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Pull the default local model (no API key needed)
ollama pull llama3.2

# 3. Run
python main.py                 # auto-detects sources from .env keys present
```

Google Trends and Reddit work without any API keys. The agent uses **Ollama by default** — no API key required. To switch to Claude, set `LLM_PROVIDER=claude` and `ANTHROPIC_API_KEY` in your `.env`.

## Usage

```bash
# Use specific sources
python main.py --sources google reddit

# Process 5 trends and save as JSON
python main.py --count 5 --output json --outfile results.json

# All sources (requires all API keys)
python main.py --sources google reddit twitter youtube facebook
```

## Output per Trend

Each trending topic produces:
- **Short-form** — Twitter/X post, Instagram caption, Facebook post
- **Long-form** — 600–800 word blog/LinkedIn article
- **Thread script** — 5–8 post Twitter thread

## Sources

| Source | API Key Required | Notes |
|--------|-----------------|-------|
| Google Trends | No | via `pytrends` |
| Reddit | No (or optional) | public JSON; optional PRAW auth for more data |
| Twitter/X | Yes (Basic tier) | `TWITTER_BEARER_TOKEN` |
| YouTube | Yes (free quota) | `YOUTUBE_API_KEY` via Google Cloud Console |
| Facebook | Yes | `FACEBOOK_ACCESS_TOKEN` — User token with `pages_read_engagement` |

import json
import os

from src.trends.base import TrendingTopic

_SYSTEM_BASE = (
    "You are a social media content strategist. Repurpose trending topics into "
    "compelling, platform-native content. Match each platform's voice: "
    "Twitter: direct and witty. Instagram: visual with emojis and hashtags. "
    "Facebook: conversational with a hook. Long-form: informative and story-driven. "
    "Never fabricate facts; base everything on the context provided."
)

# Shared schema description embedded in the Ollama system prompt
_JSON_SHAPE = """
Return ONLY a valid JSON object — no markdown, no extra text — with this exact shape:
{
  "topic_summary": "<1-2 sentences: why this is trending>",
  "short_form": {
    "twitter":   "<Twitter/X post, max 280 chars>",
    "instagram": "<Instagram caption with emojis and 5-10 hashtags>",
    "facebook":  "<Facebook post with a hook sentence>"
  },
  "long_form": {
    "title": "<article title>",
    "body":  "<600-800 word blog or LinkedIn article>"
  },
  "thread": {
    "posts": ["<post 1>", "<post 2>", "... (5-8 posts, each under 280 chars, no numbering)"]
  }
}
"""

# Claude tool_use schema (guarantees structured output server-side)
_CLAUDE_TOOL = {
    "name": "create_content",
    "description": "Create repurposed social media content for a trending topic",
    "input_schema": {
        "type": "object",
        "properties": {
            "topic_summary": {"type": "string"},
            "short_form": {
                "type": "object",
                "properties": {
                    "twitter":   {"type": "string"},
                    "instagram": {"type": "string"},
                    "facebook":  {"type": "string"},
                },
                "required": ["twitter", "instagram", "facebook"],
            },
            "long_form": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body":  {"type": "string"},
                },
                "required": ["title", "body"],
            },
            "thread": {
                "type": "object",
                "properties": {
                    "posts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 5,
                        "maxItems": 8,
                    }
                },
                "required": ["posts"],
            },
        },
        "required": ["topic_summary", "short_form", "long_form", "thread"],
    },
}


def generate_content(topic: TrendingTopic) -> dict:
    provider = _resolve_provider()
    if provider == "claude":
        return _generate_claude(topic)
    return _generate_ollama(topic)


def _resolve_provider() -> str:
    """
    Priority: LLM_PROVIDER env var → auto-detect.
    Auto-detect defaults to ollama; falls back to claude only if ANTHROPIC_API_KEY is set
    and no explicit provider is chosen.
    """
    explicit = os.getenv("LLM_PROVIDER", "").lower()
    if explicit in ("claude", "ollama"):
        return explicit
    return "claude" if os.getenv("ANTHROPIC_API_KEY") else "ollama"


# ── Ollama backend ────────────────────────────────────────────────────────────

def _generate_ollama(topic: TrendingTopic) -> dict:
    import ollama

    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    system = _SYSTEM_BASE + "\n\n" + _JSON_SHAPE

    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"Create content for this trending topic:\n\n"
                    f"{topic.to_prompt_context()}\n\n"
                    "Generate engaging content across all required formats."
                ),
            },
        ],
        format="json",
        options={"temperature": 0.7},
    )

    raw = response.message.content
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ollama returned invalid JSON for '{topic.title}': {exc}\n{raw[:300]}")


# ── Claude backend ────────────────────────────────────────────────────────────

_claude_client = None


def _get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _claude_client


def _generate_claude(topic: TrendingTopic) -> dict:
    response = _get_claude_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=_SYSTEM_BASE,
        tools=[_CLAUDE_TOOL],
        tool_choice={"type": "tool", "name": "create_content"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"Create content for this trending topic:\n\n"
                    f"{topic.to_prompt_context()}\n\n"
                    "Generate engaging content across all required formats."
                ),
            }
        ],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "create_content":
            return block.input

    raise RuntimeError(f"No content generated for topic: {topic.title}")

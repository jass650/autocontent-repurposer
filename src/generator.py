import os

import anthropic

from src.trends.base import TrendingTopic

_client: anthropic.Anthropic | None = None

_CONTENT_TOOL = {
    "name": "create_content",
    "description": "Create repurposed social media content for a trending topic in multiple formats",
    "input_schema": {
        "type": "object",
        "properties": {
            "topic_summary": {
                "type": "string",
                "description": "1-2 sentence plain-English summary of why this topic is trending",
            },
            "short_form": {
                "type": "object",
                "properties": {
                    "twitter": {
                        "type": "string",
                        "description": "Twitter/X post — max 280 characters, punchy and shareable",
                    },
                    "instagram": {
                        "type": "string",
                        "description": "Instagram caption with emojis and 5-10 relevant hashtags",
                    },
                    "facebook": {
                        "type": "string",
                        "description": "Facebook post with a hook sentence and conversational tone",
                    },
                },
                "required": ["twitter", "instagram", "facebook"],
            },
            "long_form": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body": {
                        "type": "string",
                        "description": "600-800 word article suitable for a blog or LinkedIn post",
                    },
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
                        "description": (
                            "Twitter thread — each post under 280 chars. "
                            "Start with a hook, end with a CTA. "
                            "Do not include manual numbering; it will be added automatically."
                        ),
                    }
                },
                "required": ["posts"],
            },
        },
        "required": ["topic_summary", "short_form", "long_form", "thread"],
    },
}

_SYSTEM = (
    "You are a social media content strategist. Your job is to repurpose trending "
    "topics into compelling, platform-native content. Write authentically — match "
    "each platform's voice. Twitter: direct and witty. Instagram: visual and aspirational. "
    "Facebook: conversational. Long-form: informative and story-driven. "
    "Never fabricate facts; base everything on the trend context provided."
)


def _client_instance() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def generate_content(topic: TrendingTopic) -> dict:
    response = _client_instance().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=_SYSTEM,
        tools=[_CONTENT_TOOL],
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

"""
Facebook trend source.

Facebook removed its Trending Topics feature in 2019. This source
approximates trends by fetching popular public posts via the Graph API.

Requirements:
- FACEBOOK_ACCESS_TOKEN: a User Access Token with pages_read_engagement
  and public_profile permissions. Generate one at:
  https://developers.facebook.com/tools/explorer/

Note: Facebook's Graph API restricts what public data is accessible
without business verification or elevated app review. Results may be
limited depending on token permissions.
"""

import os

import requests

from .base import TrendingTopic

_GRAPH_BASE = "https://graph.facebook.com/v19.0"


def get_trending(count: int = 10) -> list[TrendingTopic]:
    access_token = os.getenv("FACEBOOK_ACCESS_TOKEN")
    if not access_token:
        raise ValueError("FACEBOOK_ACCESS_TOKEN not set")

    response = requests.get(
        f"{_GRAPH_BASE}/search",
        params={
            "q": "trending today",
            "type": "post",
            "fields": "message,story,created_time,likes.summary(true)",
            "access_token": access_token,
            "limit": min(count, 25),
        },
        timeout=10,
    )
    response.raise_for_status()
    data = response.json()

    topics = []
    for post in data.get("data", []):
        text = post.get("message") or post.get("story") or ""
        if not text.strip():
            continue
        likes = post.get("likes", {}).get("summary", {}).get("total_count", 0)
        topics.append(TrendingTopic(
            title=text[:100],
            source="facebook",
            description=text[:200],
            score=float(likes),
        ))
    return topics[:count]

import os

from googleapiclient.discovery import build

from .base import TrendingTopic


def get_trending(count: int = 10) -> list[TrendingTopic]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not set")

    youtube = build("youtube", "v3", developerKey=api_key)
    request = youtube.videos().list(
        part="snippet,statistics",
        chart="mostPopular",
        regionCode="US",
        maxResults=min(count, 50),
    )
    response = request.execute()

    topics = []
    for item in response.get("items", []):
        snippet = item["snippet"]
        stats = item.get("statistics", {})
        topics.append(TrendingTopic(
            title=snippet["title"],
            source="youtube",
            description=snippet.get("description", "")[:200],
            url=f"https://youtube.com/watch?v={item['id']}",
            score=float(stats.get("viewCount", 0)),
            tags=(snippet.get("tags") or [])[:5],
        ))
    return topics

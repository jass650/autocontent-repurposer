import os

import requests

from .base import TrendingTopic

_PUBLIC_URL = "https://www.reddit.com/r/all/hot.json"
_USER_AGENT = "autocontent-repurposer/1.0 (by /u/autocontent_bot)"


def get_trending(count: int = 10) -> list[TrendingTopic]:
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if client_id and client_secret:
        return _get_authenticated(client_id, client_secret, count)
    return _get_public(count)


def _get_public(count: int) -> list[TrendingTopic]:
    response = requests.get(
        _PUBLIC_URL,
        headers={"User-Agent": _USER_AGENT},
        params={"limit": min(count, 25)},
        timeout=10,
    )
    response.raise_for_status()
    posts = response.json()["data"]["children"]
    return [_post_to_topic(p["data"]) for p in posts]


def _get_authenticated(client_id: str, client_secret: str, count: int) -> list[TrendingTopic]:
    import praw

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=_USER_AGENT,
    )
    topics = []
    for post in reddit.subreddit("all").hot(limit=count):
        topics.append(TrendingTopic(
            title=post.title,
            source="reddit",
            description=(post.selftext or "")[:200],
            url=f"https://reddit.com{post.permalink}",
            score=float(post.score),
            tags=[post.subreddit.display_name],
        ))
    return topics


def _post_to_topic(data: dict) -> TrendingTopic:
    return TrendingTopic(
        title=data["title"],
        source="reddit",
        description=(data.get("selftext") or "")[:200],
        url=f"https://reddit.com{data['permalink']}",
        score=float(data.get("score", 0)),
        tags=[data.get("subreddit", "")],
    )

"""
Twitter/X trend source.

Requires TWITTER_BEARER_TOKEN. The dedicated trending-topics endpoint
requires the Basic tier ($100/mo). This implementation approximates
trends by finding the most-common hashtags in recent high-engagement
tweets, which works on the free tier.
"""

import os
from collections import Counter

import tweepy

from .base import TrendingTopic


def get_trending(count: int = 10) -> list[TrendingTopic]:
    bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
    if not bearer_token:
        raise ValueError("TWITTER_BEARER_TOKEN not set")

    client = tweepy.Client(bearer_token=bearer_token, wait_on_rate_limit=True)
    response = client.search_recent_tweets(
        query="lang:en -is:retweet has:hashtags",
        max_results=100,
        tweet_fields=["public_metrics", "entities"],
    )

    hashtag_counter: Counter = Counter()
    hashtag_tweets: dict[str, list[str]] = {}

    for tweet in response.data or []:
        entities = tweet.entities or {}
        for tag in entities.get("hashtags", []):
            ht = tag["tag"].lower()
            hashtag_counter[ht] += tweet.public_metrics.get("retweet_count", 0) + 1
            hashtag_tweets.setdefault(ht, [])
            if len(hashtag_tweets[ht]) < 2:
                hashtag_tweets[ht].append(tweet.text[:150])

    topics = []
    for tag, score in hashtag_counter.most_common(count):
        description = " | ".join(hashtag_tweets.get(tag, []))
        topics.append(TrendingTopic(
            title=f"#{tag}",
            source="twitter",
            description=description,
            url=f"https://twitter.com/search?q=%23{tag}",
            score=float(score),
            tags=[tag],
        ))
    return topics

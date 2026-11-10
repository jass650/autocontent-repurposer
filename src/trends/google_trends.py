from pytrends.request import TrendReq
from .base import TrendingTopic


def get_trending(count: int = 10) -> list[TrendingTopic]:
    pytrends = TrendReq(hl="en-US", tz=360)
    df = pytrends.trending_searches(pn="united_states")
    topics = []
    for i, title in enumerate(df[0].tolist()[:count]):
        topics.append(TrendingTopic(
            title=title,
            source="google_trends",
            score=float(count - i),
        ))
    return topics

import importlib

from src.trends.base import TrendingTopic
from src import generator

_SOURCE_MODULES = {
    "google": "src.trends.google_trends",
    "reddit": "src.trends.reddit",
    "twitter": "src.trends.twitter",
    "youtube": "src.trends.youtube",
    "facebook": "src.trends.facebook",
}


class ContentRepurposerAgent:
    """
    Fetches trending topics from one or more social platforms, then uses
    Claude to generate short-form posts, a long-form article, and a thread
    script for each trend.
    """

    def __init__(self, sources: list[str], count: int = 3):
        self.sources = sources
        self.count = count

    def run(self) -> list[dict]:
        print(f"Fetching trends from: {', '.join(self.sources)}")
        trends = self._fetch_trends()

        if not trends:
            print("No trends found. Check your API keys / network connection.")
            return []

        print(f"\nGenerating content for {len(trends)} trend(s)...\n")
        results = []
        for trend in trends:
            print(f"  -> {trend.title}  [{trend.source}]")
            try:
                content = generator.generate_content(trend)
                results.append({
                    "trend": {
                        "title": trend.title,
                        "source": trend.source,
                        "url": trend.url,
                    },
                    "content": content,
                })
            except Exception as exc:
                print(f"     [!] Skipped: {exc}")

        return results

    def _fetch_trends(self) -> list[TrendingTopic]:
        all_trends: list[TrendingTopic] = []

        for source in self.sources:
            module_path = _SOURCE_MODULES.get(source)
            if not module_path:
                print(f"  [!] Unknown source '{source}', skipping.")
                continue
            try:
                mod = importlib.import_module(module_path)
                topics = mod.get_trending(count=self.count * 3)
                print(f"  [{source}] {len(topics)} topics fetched")
                all_trends.extend(topics)
            except Exception as exc:
                print(f"  [{source}] Skipped: {exc}")

        return self._deduplicate(all_trends)

    def _deduplicate(self, trends: list[TrendingTopic]) -> list[TrendingTopic]:
        seen: set[str] = set()
        unique: list[TrendingTopic] = []
        for t in sorted(trends, key=lambda x: x.score, reverse=True):
            key = t.title.lower().strip()
            if key not in seen:
                seen.add(key)
                unique.append(t)
            if len(unique) >= self.count:
                break
        return unique

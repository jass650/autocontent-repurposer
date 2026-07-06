#!/usr/bin/env python3
"""
AutoContent Repurposer — entry point.

Usage:
    python main.py                          # auto-detect sources from .env
    python main.py --sources google reddit  # explicit sources
    python main.py --count 5 --output json  # 5 trends, JSON output
    python main.py --output json --outfile out.json
"""

import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    args = _parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        sys.exit("Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.")

    sources = args.sources or _auto_detect_sources()
    if not sources:
        sys.exit("No trend sources available. Set at least ANTHROPIC_API_KEY and one source API key.")

    from src.agent import ContentRepurposerAgent

    agent = ContentRepurposerAgent(sources=sources, count=args.count)
    results = agent.run()

    if not results:
        sys.exit(1)

    if args.output == "json":
        payload = json.dumps(results, indent=2)
        if args.outfile:
            with open(args.outfile, "w") as f:
                f.write(payload)
            print(f"Saved to {args.outfile}")
        else:
            print(payload)
    else:
        _print_console(results)


def _auto_detect_sources() -> list[str]:
    sources = ["google", "reddit"]  # no API keys required for basic access
    if os.getenv("TWITTER_BEARER_TOKEN"):
        sources.append("twitter")
    if os.getenv("YOUTUBE_API_KEY"):
        sources.append("youtube")
    if os.getenv("FACEBOOK_ACCESS_TOKEN"):
        sources.append("facebook")
    return sources


def _print_console(results: list[dict]) -> None:
    bar = "=" * 64
    for r in results:
        trend = r["trend"]
        c = r["content"]
        sf = c.get("short_form", {})
        lf = c.get("long_form", {})
        thread_posts = c.get("thread", {}).get("posts", [])
        total = len(thread_posts)

        print(f"\n{bar}")
        print(f"TREND : {trend['title']}")
        print(f"SOURCE: {trend['source']}" + (f"  |  {trend['url']}" if trend.get("url") else ""))
        print(bar)

        print(f"\nSUMMARY\n{c.get('topic_summary', '')}")

        print("\n--- SHORT-FORM ---")
        print(f"\n[Twitter/X]\n{sf.get('twitter', '')}")
        print(f"\n[Instagram]\n{sf.get('instagram', '')}")
        print(f"\n[Facebook]\n{sf.get('facebook', '')}")

        print("\n--- LONG-FORM ARTICLE ---")
        print(f"\n{lf.get('title', '')}\n")
        print(lf.get("body", ""))

        print("\n--- THREAD SCRIPT ---")
        for i, post in enumerate(thread_posts, 1):
            print(f"\n[{i}/{total}] {post}")

    print(f"\n{bar}")
    print(f"Done — {len(results)} trend(s) processed.")


def _parse_args():
    import argparse

    parser = argparse.ArgumentParser(
        description="AutoContent Repurposer: AI agent that turns trending social media topics into ready-to-post content.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--sources",
        nargs="+",
        choices=["google", "reddit", "twitter", "youtube", "facebook"],
        default=None,
        help="Trend sources (default: auto-detect from .env). google and reddit need no API keys.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        metavar="N",
        help="Number of trending topics to process (default: 3)",
    )
    parser.add_argument(
        "--output",
        choices=["console", "json"],
        default="console",
        help="Output format (default: console)",
    )
    parser.add_argument(
        "--outfile",
        metavar="FILE",
        help="Write JSON output to FILE (implies --output json)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    main()

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TrendingTopic:
    title: str
    source: str
    description: str = ""
    url: Optional[str] = None
    score: float = 0.0
    tags: list[str] = field(default_factory=list)

    def to_prompt_context(self) -> str:
        parts = [f"Topic: {self.title}", f"Source: {self.source}"]
        if self.description:
            parts.append(f"Context: {self.description}")
        if self.tags:
            parts.append(f"Tags: {', '.join(self.tags)}")
        return "\n".join(parts)

"""
Dump GKToday scraped articles into the MongoDB CurrentAffairs collection.

Usage:
    python gktoday_dump.py [path/to/gktoday_articles.json]

Reads from gktoday_articles.json in the same directory by default.
Skips if the file is empty or if no article is dated today.
Deduplicates by article URL (upsert).
"""

import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv(Path(__file__).parents[2] / ".env")

MONGO_URL = os.getenv("mongoDB_URL")
COLLECTION = "currentaffairs"
DEFAULT_JSON = Path(__file__).parent / "gktoday_articles.json"

DATE_FORMATS = [
    "%B %d, %Y",   # July 28, 2025
    "%B %d %Y",    # July 28 2025
    "%d %b %Y",    # 28 Jul 2025
    "%d %B %Y",    # 28 July 2025
    "%Y-%m-%d",    # 2025-07-28
    "%Y-%m-%dT%H:%M:%S",  # ISO datetime
]


def parse_date(date_str: str) -> date | None:
    if not date_str:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def is_today(date_str: str) -> bool:
    parsed = parse_date(date_str)
    return parsed == date.today() if parsed else False


def build_doc(article: dict) -> dict:
    now = datetime.now(timezone.utc)
    parsed = parse_date(article.get("date", ""))
    doc_date = datetime(parsed.year, parsed.month, parsed.day, tzinfo=timezone.utc) if parsed else now
    return {
        "title": article.get("title", "").strip(),
        "content": article.get("content", "").strip(),
        "summary": "",
        "date": doc_date,
        "category": article.get("category", "General").strip() or "General",
        "category_link": article.get("category_link", ""),
        "tags": article.get("tags", []),
        "image": article.get("image_link", ""),
        "url": article.get("url", ""),
        "source": article.get("source", ""),
        "source_link": article.get("source_link", ""),
        "isPublished": True,
        "isActive": True,
        "updatedAt": now,
    }


def dump(json_path: Path) -> None:
    if not json_path.exists():
        print(f"[ERROR] File not found: {json_path}")
        sys.exit(1)

    articles = json.loads(json_path.read_text(encoding="utf-8"))

    if not articles:
        print("[SKIP] No articles in file.")
        return

    today_articles = [a for a in articles if is_today(a.get("date", ""))]
    if not today_articles:
        print(f"[SKIP] No articles dated today ({date.today().isoformat()}). File may be from a previous run.")
        return

    if not MONGO_URL:
        print("[ERROR] mongoDB_URL not set in .env")
        sys.exit(1)

    client = MongoClient(MONGO_URL)
    try:
        db = client.get_default_database()
    except Exception:
        db = client["test"]

    collection = db[COLLECTION]

    ops = []
    for article in today_articles:
        doc = build_doc(article)
        url = doc.get("url")
        if not url:
            continue
        ops.append(
            UpdateOne(
                {"url": url},
                {
                    "$set": doc,
                    "$setOnInsert": {"createdAt": doc["updatedAt"], "views": 0},
                },
                upsert=True,
            )
        )

    if not ops:
        print("[SKIP] No articles with a valid URL to insert.")
        return

    result = collection.bulk_write(ops, ordered=False)
    print(
        f"[OK] GKToday — {result.upserted_count} inserted, "
        f"{result.modified_count} updated out of {len(ops)} articles."
    )
    client.close()


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_JSON
    dump(path)

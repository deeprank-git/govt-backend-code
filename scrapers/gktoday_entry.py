"""
GKToday pipeline entry point — scrapes articles then dumps them to MongoDB.

Cron usage:
    python gktoday_entry.py

Individual steps can still be run standalone:
    python gktoday/gktoday_scraper.py     # scrape only  → gktoday_articles.json
    python gktoday/gktoday_dump.py        # dump only    ← reads gktoday_articles.json
"""

import asyncio
import logging

from gktoday.gktoday_scraper import (
    ARTICLE_CONCURRENCY,
    MAX_LISTING_PAGES,
    MAX_RETRIES,
    START_URL,
    GKTodayScraper,
    write_json,
)
from gktoday.gktoday_dump import DEFAULT_JSON, dump

logger = logging.getLogger("gktoday_entry")


async def _scrape() -> None:
    async with GKTodayScraper(
        concurrency=ARTICLE_CONCURRENCY,
        max_retries=MAX_RETRIES,
    ) as scraper:
        articles = await scraper.scrape(
            start_url=START_URL,
            max_pages=MAX_LISTING_PAGES,
        )

    write_json(articles, DEFAULT_JSON)
    logger.info("Saved %d articles to %s", len(articles), DEFAULT_JSON.resolve())


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    logger.info("=== GKToday pipeline starting ===")

    logger.info("Step 1/2: Scraping articles ...")
    asyncio.run(_scrape())

    logger.info("Step 2/2: Dumping to MongoDB ...")
    dump(DEFAULT_JSON)

    logger.info("=== GKToday pipeline complete ===")


if __name__ == "__main__":
    main()

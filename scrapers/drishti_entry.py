"""
Drishti IAS pipeline entry point — scrapes articles then dumps them to MongoDB.

Cron usage:
    python drishti_entry.py

Individual steps can still be run standalone:
    python drishti/drishti_ias_scraper.py     # scrape only  → drishti_articles.json
    python drishti/drishti_dump.py            # dump only    ← reads drishti_articles.json
"""

import argparse
import json
import logging
from datetime import date, datetime

from drishti.drishti_ias_scraper import scrape
from drishti.drishti_dump import DEFAULT_JSON, dump

logger = logging.getLogger("drishti_entry")


def _scrape(target: date) -> None:
    logger.info("Scraping Drishti IAS for %s ...", target.strftime("%d %b %Y"))

    articles = scrape(target)
    logger.info("Found %d articles.", len(articles))

    DEFAULT_JSON.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_JSON.write_text(
        json.dumps(articles, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info("Saved to %s", DEFAULT_JSON.resolve())


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    logger.info("=== Drishti IAS pipeline starting ===")

    logger.info("Step 1/2: Scraping articles ...")
    _scrape()

    logger.info("Step 2/2: Dumping to MongoDB ...")
    dump(DEFAULT_JSON)

    logger.info("=== Drishti IAS pipeline complete ===")


if __name__ == "__main__":
    main()

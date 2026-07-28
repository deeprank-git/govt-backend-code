"""
GKToday current-affairs scraper using Crawl4AI.

Output format:
{
    "title": "...",
    "url": "...",
    "date": "...",
    "category": "...",
    "category_link": "...",
    "source": "",
    "source_link": "",
    "content": "...",
    "tags": [],
    "image_link": ""
}

Usage:
    python gktoday_scraper.py

Install:
    pip install crawl4ai beautifulsoup4 lxml
    crawl4ai-setup
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, Tag
from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CacheMode,
    CrawlerRunConfig,
)

BASE_URL = "https://www.gktoday.in"
START_URL = "https://www.gktoday.in/current-affairs/"
OUTPUT_FILE = Path("gktoday_articles.json")

MAX_LISTING_PAGES = 3
ARTICLE_CONCURRENCY = 4
REQUEST_TIMEOUT_MS = 60_000
MAX_RETRIES = 3

logger = logging.getLogger("gktoday_scraper")


@dataclass(slots=True)
class Article:
    title: str
    url: str
    date: str = ""
    category: str = ""
    category_link: str = ""
    source: str = ""
    source_link: str = ""
    content: str = ""
    tags: list[str] = field(default_factory=list)
    image_link: str = ""


@dataclass(slots=True)
class ListingArticle:
    title: str
    url: str
    date: str = ""
    category: str = ""
    category_link: str = ""
    image_link: str = ""


def clean_text(value: str | None) -> str:
    if not value:
        return ""

    return re.sub(r"\s+", " ", value).strip()


def normalize_url(url: str, base_url: str = BASE_URL) -> str:
    """
    Convert relative URLs to absolute URLs and remove fragments.

    Query parameters are retained because WordPress image URLs may depend
    on them.
    """
    absolute = urljoin(base_url, url.strip())
    parsed = urlparse(absolute)

    return urlunparse(
        (
            parsed.scheme or "https",
            parsed.netloc.lower(),
            parsed.path,
            parsed.params,
            parsed.query,
            "",  # Remove fragment.
        )
    )


def normalize_article_url(url: str) -> str:
    """
    Normalize article URLs for deduplication.

    Tracking query parameters and fragments are removed from article URLs.
    """
    absolute = normalize_url(url)
    parsed = urlparse(absolute)

    path = re.sub(r"/+", "/", parsed.path)

    if path and not path.endswith("/"):
        path += "/"

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            path,
            "",
            "",
            "",
        )
    )


def is_gktoday_article_url(url: str) -> bool:
    parsed = urlparse(url)

    if parsed.netloc not in {"www.gktoday.in", "gktoday.in"}:
        return False

    excluded_prefixes = (
        "/current-affairs/",
        "/category/",
        "/topics/",
        "/tag/",
        "/author/",
        "/page/",
        "/hindi/",
        "/shop/",
        "/cart/",
        "/checkout/",
        "/my-account/",
        "/wp-content/",
    )

    if any(parsed.path.startswith(prefix) for prefix in excluded_prefixes):
        return False

    path_parts = [part for part in parsed.path.split("/") if part]

    # Most GKToday article URLs have one slug path component.
    return len(path_parts) == 1


def get_image_url(image: Tag | None) -> str:
    if image is None:
        return ""

    # Prefer the original/largest URL when WordPress provides srcset.
    srcset = clean_text(image.get("srcset"))

    if srcset:
        candidates: list[tuple[int, str]] = []

        for candidate in srcset.split(","):
            parts = candidate.strip().split()

            if not parts:
                continue

            candidate_url = parts[0]
            width = 0

            if len(parts) > 1 and parts[1].endswith("w"):
                try:
                    width = int(parts[1][:-1])
                except ValueError:
                    width = 0

            candidates.append((width, candidate_url))

        if candidates:
            _, selected_url = max(candidates, key=lambda item: item[0])
            return normalize_url(selected_url)

    for attribute in (
        "data-lazy-src",
        "data-src",
        "data-original",
        "src",
    ):
        value = image.get(attribute)

        if value:
            return normalize_url(str(value))

    return ""


def extract_listing_date_and_category(
    card: Tag,
) -> tuple[str, str, str]:
    meta = card.select_one(".home-post-data-meta")

    if meta is None:
        return "", "", ""

    category_anchor = meta.select_one(
        'a[href*="/current-affairs/category/"]'
    )

    category = ""
    category_link = ""

    if category_anchor:
        category = clean_text(category_anchor.get_text(" ", strip=True))
        category_link = normalize_url(category_anchor.get("href", ""))

    meta_text = clean_text(meta.get_text(" ", strip=True))

    # Examples:
    # July 28, 2026
    # September 7, 2025
    date_match = re.search(
        r"\b(?:January|February|March|April|May|June|July|August|"
        r"September|October|November|December)\s+\d{1,2},\s+\d{4}\b",
        meta_text,
    )

    date = date_match.group(0) if date_match else ""

    return date, category, category_link


def parse_listing_page(
    html: str,
    page_url: str,
) -> tuple[list[ListingArticle], str | None]:
    soup = BeautifulSoup(html, "lxml")
    articles: list[ListingArticle] = []

    for card in soup.select("div.home-post-item"):
        title_anchor = card.select_one(".post-data h3 a[href]")

        if title_anchor is None:
            continue

        url = normalize_article_url(title_anchor.get("href", ""))

        if not is_gktoday_article_url(url):
            continue

        date, category, category_link = extract_listing_date_and_category(
            card
        )

        articles.append(
            ListingArticle(
                title=clean_text(
                    title_anchor.get_text(" ", strip=True)
                ),
                url=url,
                date=date,
                category=category,
                category_link=category_link,
                image_link=get_image_url(
                    card.select_one(".featured-image img")
                ),
            )
        )

    next_page_anchor = (
        soup.select_one("a.next.page-numbers[href]")
        or soup.select_one('a[rel="next"][href]')
    )

    # GKToday may label pagination as "Older Posts".
    if next_page_anchor is None:
        for anchor in soup.select("a[href]"):
            anchor_text = clean_text(
                anchor.get_text(" ", strip=True)
            ).lower()

            if anchor_text in {
                "older posts",
                "next",
                "next page",
                "older entries",
            }:
                next_page_anchor = anchor
                break

    next_page_url = None

    if next_page_anchor:
        next_page_url = normalize_url(
            next_page_anchor.get("href", ""),
            page_url,
        )

    return articles, next_page_url


def first_element(
    soup: BeautifulSoup | Tag,
    selectors: tuple[str, ...],
) -> Tag | None:
    for selector in selectors:
        element = soup.select_one(selector)

        if element is not None:
            return element

    return None


def extract_article_title(soup: BeautifulSoup) -> str:
    element = first_element(
        soup,
        (
            "main article h1.entry-title",
            "article h1.entry-title",
            "h1.entry-title",
            "main h1",
            "article h1",
            "h1",
        ),
    )

    if element:
        return clean_text(element.get_text(" ", strip=True))

    og_title = soup.select_one('meta[property="og:title"]')

    if og_title:
        return clean_text(og_title.get("content"))

    return ""


def extract_article_date(soup: BeautifulSoup) -> str:
    selectors = (
        "article time.entry-date",
        "article time[datetime]",
        "time.entry-date",
        "time[datetime]",
        ".entry-meta time",
        ".post-meta time",
        ".posted-on",
    )

    for selector in selectors:
        element = soup.select_one(selector)

        if element is None:
            continue

        value = clean_text(element.get_text(" ", strip=True))

        date_match = re.search(
            r"\b(?:January|February|March|April|May|June|July|August|"
            r"September|October|November|December)\s+"
            r"\d{1,2},\s+\d{4}\b",
            value,
        )

        if date_match:
            return date_match.group(0)

        datetime_value = clean_text(element.get("datetime"))

        if datetime_value:
            return datetime_value

    # Fallback: search near the article heading rather than the whole page.
    heading = first_element(
        soup,
        ("h1.entry-title", "article h1", "main h1", "h1"),
    )

    search_container: Tag | BeautifulSoup = soup

    if heading and heading.parent:
        search_container = heading.parent

    date_match = re.search(
        r"\b(?:January|February|March|April|May|June|July|August|"
        r"September|October|November|December)\s+\d{1,2},\s+\d{4}\b",
        clean_text(search_container.get_text(" ", strip=True)),
    )

    return date_match.group(0) if date_match else ""


def extract_category(soup: BeautifulSoup) -> tuple[str, str]:
    selectors = (
        'article a[href*="/current-affairs/category/"]',
        '.entry-meta a[href*="/current-affairs/category/"]',
        '.cat-links a[href*="/current-affairs/category/"]',
        'a[rel="category tag"]',
    )

    for selector in selectors:
        anchor = soup.select_one(selector)

        if anchor:
            return (
                clean_text(anchor.get_text(" ", strip=True)),
                normalize_url(anchor.get("href", "")),
            )

    # Some GKToday articles show "Category:" as plain text followed by an
    # anchor. Search for that text and inspect its parent.
    category_text = soup.find(
        string=re.compile(r"^\s*Category\s*:", re.IGNORECASE)
    )

    if category_text and category_text.parent:
        parent = category_text.parent
        anchor = parent.find("a", href=True)

        if anchor:
            return (
                clean_text(anchor.get_text(" ", strip=True)),
                normalize_url(anchor.get("href", "")),
            )

    return "", ""


def extract_tags(soup: BeautifulSoup) -> list[str]:
    tags: list[str] = []

    selectors = (
        'article a[rel="tag"]',
        '.tags-links a[rel="tag"]',
        '.tag-links a',
        'a[href*="/tag/"]',
    )

    for selector in selectors:
        for anchor in soup.select(selector):
            value = clean_text(anchor.get_text(" ", strip=True))

            if value and value not in tags:
                tags.append(value)

    return tags


def extract_source(soup: BeautifulSoup) -> tuple[str, str]:
    """
    Extract a source only when the article explicitly labels one.

    It intentionally does not treat every external link as the source.
    """
    source_pattern = re.compile(
        r"^\s*(?:source|official source|reference)\s*:?\s*$",
        re.IGNORECASE,
    )

    source_label = soup.find(string=source_pattern)

    if source_label and source_label.parent:
        parent = source_label.parent

        anchor = parent.find("a", href=True)

        if anchor is None:
            anchor = parent.find_next("a", href=True)

        if anchor:
            return (
                clean_text(anchor.get_text(" ", strip=True)),
                normalize_url(anchor.get("href", "")),
            )

    return "", ""


def extract_article_image(soup: BeautifulSoup) -> str:
    og_image = soup.select_one('meta[property="og:image"]')

    if og_image and og_image.get("content"):
        return normalize_url(og_image.get("content", ""))

    image = first_element(
        soup,
        (
            "article .post-thumbnail img",
            "article .featured-image img",
            "article img.wp-post-image",
            ".entry-content img",
            "main article img",
        ),
    )

    return get_image_url(image)


def remove_noise(content: Tag) -> None:
    selectors_to_remove = (
        "script",
        "style",
        "noscript",
        "iframe",
        "form",
        "button",
        "nav",
        ".sharedaddy",
        ".social-share",
        ".social-sharing",
        ".share-buttons",
        ".adsbygoogle",
        ".advertisement",
        ".ad-container",
        ".google-auto-placed",
        ".code-block",
        ".comments-area",
        "#comments",
        ".related-posts",
        ".post-navigation",
        ".navigation",
        ".author-box",
        ".newsletter",
        ".popup",
        ".modal",
    )

    for selector in selectors_to_remove:
        for node in content.select(selector):
            node.decompose()


def find_content_container(soup: BeautifulSoup) -> Tag | None:
    return first_element(
        soup,
        (
            "article .entry-content",
            "main article .entry-content",
            ".single-post-content",
            ".post-content",
            "article .post-content",
            "article",
            "main",
        ),
    )


def extract_content(soup: BeautifulSoup) -> str:
    container = find_content_container(soup)

    if container is None:
        return ""

    # Work on a separate parsed copy so other metadata extraction is
    # unaffected.
    cloned_soup = BeautifulSoup(str(container), "lxml")
    cloned_container = cloned_soup.body or cloned_soup

    remove_noise(cloned_container)

    # Remove metadata blocks that should not become article content.
    for selector in (
        "h1.entry-title",
        ".entry-title",
        ".entry-meta",
        ".post-meta",
        ".posted-on",
        ".cat-links",
        ".tags-links",
    ):
        for node in cloned_container.select(selector):
            node.decompose()

    content_parts: list[str] = []

    # Preserve paragraph and heading boundaries without preserving HTML.
    for element in cloned_container.select(
        "p, h2, h3, h4, blockquote, li"
    ):
        text = clean_text(element.get_text(" ", strip=True))

        if not text:
            continue

        lowered = text.lower()

        if lowered.startswith(
            (
                "your email address will not be published",
                "required fields are marked",
                "leave a reply",
                "category:",
            )
        ):
            continue

        # Avoid duplicated text where a parent block contains child list
        # entries that are also extracted separately.
        if content_parts and text == content_parts[-1]:
            continue

        content_parts.append(text)

    return "\n\n".join(content_parts)


def parse_article_page(
    html: str,
    url: str,
    listing_data: ListingArticle | None = None,
) -> Article:
    soup = BeautifulSoup(html, "lxml")

    title = extract_article_title(soup)
    date = extract_article_date(soup)
    category, category_link = extract_category(soup)
    source, source_link = extract_source(soup)
    image_link = extract_article_image(soup)

    # Listing data is a useful fallback because GKToday exposes the date,
    # category and image directly on each home-post-item card.
    if listing_data:
        title = title or listing_data.title
        date = date or listing_data.date
        category = category or listing_data.category
        category_link = (
            category_link or listing_data.category_link
        )
        image_link = image_link or listing_data.image_link

    return Article(
        title=title,
        url=normalize_article_url(url),
        date=date,
        category=category,
        category_link=category_link,
        source=source,
        source_link=source_link,
        content=extract_content(soup),
        tags=extract_tags(soup),
        image_link=image_link,
    )


class GKTodayScraper:
    def __init__(
        self,
        *,
        concurrency: int = ARTICLE_CONCURRENCY,
        max_retries: int = MAX_RETRIES,
    ) -> None:
        self.concurrency = max(1, concurrency)
        self.max_retries = max(1, max_retries)
        self.semaphore = asyncio.Semaphore(self.concurrency)

        self.browser_config = BrowserConfig(
            browser_type="chromium",
            headless=True,
            verbose=False,
            extra_args=[
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-notifications",
                "--disable-popup-blocking",
            ],
        )

        self.run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            page_timeout=REQUEST_TIMEOUT_MS,
            wait_until="domcontentloaded",
            remove_overlay_elements=True,
            scan_full_page=False,
            verbose=False,
        )

        self.crawler: AsyncWebCrawler | None = None

    async def __aenter__(self) -> "GKTodayScraper":
        self.crawler = AsyncWebCrawler(
            config=self.browser_config
        )
        await self.crawler.start()
        return self

    async def __aexit__(
        self,
        exc_type: Any,
        exc: BaseException | None,
        traceback: Any,
    ) -> None:
        if self.crawler:
            await self.crawler.close()

    async def fetch_html(self, url: str) -> str:
        if self.crawler is None:
            raise RuntimeError(
                "Scraper must be used as an async context manager."
            )

        last_error = "Unknown crawl error"

        async with self.semaphore:
            for attempt in range(1, self.max_retries + 1):
                try:
                    logger.info(
                        "Fetching %s, attempt %d/%d",
                        url,
                        attempt,
                        self.max_retries,
                    )

                    result = await self.crawler.arun(
                        url=url,
                        config=self.run_config,
                    )

                    if result.success and result.html:
                        return result.html

                    last_error = (
                        result.error_message
                        or "Crawler returned no HTML."
                    )

                except Exception as exc:
                    last_error = str(exc)
                    logger.exception(
                        "Error fetching %s on attempt %d",
                        url,
                        attempt,
                    )

                if attempt < self.max_retries:
                    delay = (2 ** (attempt - 1)) + random.uniform(
                        0.2,
                        0.8,
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"Unable to fetch {url}: {last_error}"
        )

    async def collect_listing_articles(
        self,
        start_url: str = START_URL,
        max_pages: int = MAX_LISTING_PAGES,
    ) -> list[ListingArticle]:
        current_url: str | None = normalize_url(start_url)
        seen_listing_pages: set[str] = set()
        articles_by_url: dict[str, ListingArticle] = {}

        for page_number in range(1, max_pages + 1):
            if (
                current_url is None
                or current_url in seen_listing_pages
            ):
                break

            seen_listing_pages.add(current_url)

            logger.info(
                "Crawling listing page %d: %s",
                page_number,
                current_url,
            )

            html = await self.fetch_html(current_url)
            page_articles, next_page_url = parse_listing_page(
                html,
                current_url,
            )

            for article in page_articles:
                articles_by_url.setdefault(article.url, article)

            logger.info(
                "Listing page %d contained %d articles",
                page_number,
                len(page_articles),
            )

            current_url = next_page_url

        return list(articles_by_url.values())

    async def scrape_article(
        self,
        listing_article: ListingArticle,
    ) -> Article | None:
        try:
            html = await self.fetch_html(listing_article.url)

            article = parse_article_page(
                html,
                listing_article.url,
                listing_article,
            )

            if not article.title:
                raise ValueError("Article title was not found.")

            if not article.content:
                logger.warning(
                    "No article content extracted from %s",
                    article.url,
                )

            return article

        except Exception:
            logger.exception(
                "Failed to scrape article: %s",
                listing_article.url,
            )
            return None

    async def scrape(
        self,
        *,
        start_url: str = START_URL,
        max_pages: int = MAX_LISTING_PAGES,
    ) -> list[Article]:
        listing_articles = await self.collect_listing_articles(
            start_url=start_url,
            max_pages=max_pages,
        )

        logger.info(
            "Found %d unique article URLs",
            len(listing_articles),
        )

        tasks = [
            asyncio.create_task(self.scrape_article(article))
            for article in listing_articles
        ]

        results = await asyncio.gather(*tasks)

        return [
            article
            for article in results
            if article is not None
        ]


def write_json(
    articles: list[Article],
    output_file: Path,
) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)

    temporary_file = output_file.with_suffix(
        output_file.suffix + ".tmp"
    )

    payload = [asdict(article) for article in articles]

    temporary_file.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    # Atomic replacement prevents a partially written output file.
    temporary_file.replace(output_file)


async def main() -> None:
    async with GKTodayScraper(
        concurrency=ARTICLE_CONCURRENCY,
        max_retries=MAX_RETRIES,
    ) as scraper:
        articles = await scraper.scrape(
            start_url=START_URL,
            max_pages=MAX_LISTING_PAGES,
        )

    write_json(articles, OUTPUT_FILE)

    logger.info(
        "Saved %d articles to %s",
        len(articles),
        OUTPUT_FILE.resolve(),
    )


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s | %(levelname)s | "
            "%(name)s | %(message)s"
        ),
    )

    asyncio.run(main())
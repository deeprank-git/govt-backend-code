"""
Scraper for Drishti IAS daily current affairs pages.
URL: https://www.drishtiias.com/current-affairs-news-analysis-editorials/news-analysis/{DD-MM-YYYY}

Verified HTML structure per article:
  <div class="article-detail">
    <h1 id="dynamic-title"><a href="...">Title</a></h1>
    <div class="tags-new"><ul>Tags: <li><a>Tag</a></li>...</ul></div>
    <p>Source: XYZ</p>   ← first <p> in the div
    <p>...</p>           ← body paragraphs
    <ul>...</ul>
    ...
  </div>
"""

import re
import json
import requests
from datetime import date, datetime
from bs4 import BeautifulSoup, NavigableString


BASE_URL = (
    "https://www.drishtiias.com"
    "/current-affairs-news-analysis-editorials/news-analysis/{}"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Elements whose text counts as article body content
BODY_TAGS = {"p", "ul", "ol", "h2", "h3", "h4", "table", "dl", "blockquote"}

# Elements to skip entirely (navigation / decorations)
SKIP_CLASSES = {"next-post", "starRating", "tags-new", "social-shares", "banner-static"}


def fetch_page(date_str: str) -> BeautifulSoup:
    url = BASE_URL.format(date_str)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def _extract_title(card: BeautifulSoup) -> tuple[str, str]:
    h1 = card.find("h1", id="dynamic-title")
    if not h1:
        h1 = card.find("h1")
    if not h1:
        return "", ""
    a = h1.find("a")
    if a:
        title = a.get_text(strip=True)
        href = a.get("href", "")
        url = href if href.startswith("http") else "https://www.drishtiias.com" + href
    else:
        title = h1.get_text(strip=True)
        url = ""
    return title, url


def _extract_page_date(soup: BeautifulSoup) -> str:
    span = soup.find("span", class_="article-meta-date")
    if not span:
        return ""
    for icon in span.find_all("i"):
        icon.decompose()
    return span.get_text(strip=True)


def _extract_tags(card: BeautifulSoup) -> list[str]:
    tags_div = card.find("div", class_="tags-new")
    if not tags_div:
        return []
    return [a.get_text(strip=True) for a in tags_div.find_all("a") if a.get_text(strip=True)]


def _extract_source(card: BeautifulSoup) -> dict:
    for el in card.children:
        if isinstance(el, NavigableString):
            continue
        if el.name == "p":
            text = el.get_text(" ", strip=True)
            m = re.match(r"Source[:\s]+(.+)", text, re.IGNORECASE)
            if m:
                name = m.group(1).strip()
                a = el.find("a", href=True)
                href = a["href"] if a else ""
                link = href if href.startswith("http") else ""
                return {"name": name, "link": link}
    return {"name": "", "link": ""}


def _extract_content(card: BeautifulSoup) -> str:
    source_seen = False
    parts = []

    for el in card.children:
        if isinstance(el, NavigableString):
            continue
        cls = set(el.get("class", []))
        if cls & SKIP_CLASSES:
            continue
        if el.name == "h1":
            continue

        # Skip the very first <p> that is the source line
        if el.name == "p" and not source_seen:
            text = el.get_text(" ", strip=True)
            if re.match(r"Source[:\s]+", text, re.IGNORECASE):
                source_seen = True
                continue  # skip source line from body text

        if el.name in BODY_TAGS or el.name == "div":
            text = el.get_text("\n", strip=True)
            if text:
                parts.append(text)

    raw = "\n\n".join(parts)
    return re.sub(r"\n{3,}", "\n\n", raw).strip()


def parse_articles(soup: BeautifulSoup) -> list[dict]:
    page_date = _extract_page_date(soup)
    cards = soup.find_all("div", class_="article-detail")
    articles = []
    for card in cards:
        title, url = _extract_title(card)
        if not title:
            continue
        source = _extract_source(card)
        articles.append(
            {
                "title": title,
                "url": url,
                "date": page_date,
                "tags": _extract_tags(card),
                "source": source["name"],
                "source_link": source["link"],
                "content": _extract_content(card),
            }
        )
    return articles


def scrape(target_date: date | None = None) -> list[dict]:
    """
    Scrape Drishti IAS current affairs for the given date (defaults to today).

    Returns:
        List of dicts with keys: title, url, tags, source, content.
    """
    if target_date is None:
        target_date = date.today()
    soup = fetch_page(target_date.strftime("%d-%m-%Y"))
    return parse_articles(soup)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Scrape Drishti IAS daily current affairs"
    )
    parser.add_argument("--date", default=None, help="Date in DD-MM-YYYY (default: today)")
    parser.add_argument("--output", default="drishti_articles.json", help="Output JSON file")
    args = parser.parse_args()

    target = (
        datetime.strptime(args.date, "%d-%m-%Y").date() if args.date else date.today()
    )

    print(f"Scraping current affairs for {target.strftime('%d %b %Y')} ...")
    articles = scrape(target)
    print(f"Found {len(articles)} articles.\n")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
    print(f"Saved to {args.output}\n")

    for i, art in enumerate(articles, 1):
        print(f"[{i}] {art['title']}")
        print(f"     Source : {art['source']}  {art['source_link']}")
        print(f"     Tags   : {', '.join(art['tags'])}")
        print()


if __name__ == "__main__":
    main()

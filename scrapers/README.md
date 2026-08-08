# Current Affairs Scrapers

Two scrapers for Indian current affairs content: one for **Drishti IAS** and one for **GKToday**.

## Setup

```bash
pip install -r requirements.txt
crawl4ai-setup   # one-time browser setup required by the GKToday scraper
```

---

## Drishti IAS Scraper

Scrapes daily current affairs from `drishtiias.com`.

**Run (today's articles):**
```bash
python drishti_ias_scraper.py
```

**Run for a specific date:**
```bash
python drishti_ias_scraper.py --date 28-07-2026
```

**Save to a custom file:**
```bash
python drishti_ias_scraper.py --date 28-07-2026 --output my_articles.json
```

| Argument | Default | Description |
|---|---|---|
| `--date` | today | Date in `DD-MM-YYYY` format |
| `--output` | `drishti_articles.json` | Output JSON file path |

**Output fields:** `title`, `url`, `date`, `tags`, `source`, `source_link`, `content`

---

## GKToday Scraper

Scrapes current affairs articles from `gktoday.in` using a headless Chromium browser via Crawl4AI.

**Run:**
```bash
python gktoday_scraper.py
```

Output is saved to `gktoday_articles.json` in the current directory.

To change the number of listing pages scraped, edit these constants at the top of the file:

| Constant | Default | Description |
|---|---|---|
| `MAX_LISTING_PAGES` | `3` | Number of listing pages to crawl |
| `ARTICLE_CONCURRENCY` | `4` | Parallel article fetches |
| `OUTPUT_FILE` | `gktoday_articles.json` | Output JSON file path |

**Output fields:** `title`, `url`, `date`, `category`, `category_link`, `source`, `source_link`, `content`, `tags`, `image_link`

---

## Pipeline Entry Points

`gktoday_entry.py` and `drishti_entry.py` run the full scrape → MongoDB dump pipeline in one command. These are intended for use with cron.

**Run manually:**
```bash
python gktoday_entry.py
python drishti_entry.py
```

Each entry file scrapes today's articles, saves them to the intermediate JSON file in the respective subdirectory, then dumps them into MongoDB. The standalone scraper and dump scripts remain independently usable.

---

## Cron Setup (Linux)

Logs are written to `/var/log/govt_prep/scrapers/`.

Add the following jobs via `crontab -e`:

```
0 12 * * * cd /root/govt-prep/govt-backend-code/scrapers && /root/govt-prep/govt-backend-code/scrapers/.venv/bin/python gktoday_entry.py >> /var/log/govt_prep/scrapers/gktoday.log 2>&1

0 16 * * * cd /root/govt-prep/govt-backend-code/scrapers && /root/govt-prep/govt-backend-code/scrapers/.venv/bin/python drishti_entry.py >> /var/log/govt_prep/scrapers/drishti.log 2>&1
```

- GKToday runs daily at **12:00 PM**
- Drishti IAS runs daily at **4:00 PM**

Ensure the cron daemon is running:
```bash
systemctl status cron
systemctl start cron   # if not running
```

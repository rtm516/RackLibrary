"""Regenerates src/catalog/visiocafe.json from the VisioCafe vendor pages.

    python scripts/scrape-visiocafe.py

Only collects metadata (names, descriptions, download links); nothing is
re-hosted. Index zips and commented-out sections are skipped.
"""
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

BASE = "https://www.visiocafe.com/"
OUT = Path(__file__).resolve().parent.parent / "src" / "catalog" / "visiocafe.json"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "RackLibrary catalog builder"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def text(fragment: str) -> str:
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


ROW = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>.*?<a href=\"(?P<href>[^\"]+\.zip)\"[^>]*>(?P<name>.*?)</a>\s*</td>"
    r"\s*<td[^>]*>(?P<desc>.*?)</td>\s*<td[^>]*>(?P<size>.*?)</td>\s*<td[^>]*>(?P<date>.*?)</td>",
    re.S | re.I,
)
COLLECTION = re.compile(r"<td colspan=\"4\" height=\"22\">(?P<title>.*?)</td>", re.S | re.I)
VENDOR_LINK = re.compile(r'<a href="([a-z0-9-]+\.htm)" style="text-decoration: none">([^<]+)</a>')
# Archived vendors are not linked from the index, so their names come from here.
NAME_OVERRIDES = {
    "hpe.htm": "HPE",
    "alcatel.htm": "Alcatel-Lucent Enterprise",
    "aerohive.htm": "Aerohive",
    "avere.htm": "Avere Systems",
    "checkpoint.htm": "Check Point",
    "coho.htm": "Coho Data",
    "coraid.htm": "Coraid",
    "datagravity.htm": "DataGravity",
    "emc.htm": "Dell EMC",
    "emcor.htm": "EMCOR",
    "endace.htm": "Endace",
    "enlogic.htm": "Enlogic",
    "exagrid.htm": "ExaGrid",
    "falconstor.htm": "FalconStor",
    "fusion-io.htm": "Fusion-io",
    "gridstore.htm": "Gridstore",
    "indigovision.htm": "IndigoVision",
    "intel.htm": "Intel",
    "mellanox.htm": "Mellanox",
    "minkels.htm": "Minkels",
    "mitel.htm": "Mitel",
    "nexgen.htm": "NexGen Storage",
    "pluribus.htm": "Pluribus Networks",
    "sgi.htm": "SGI",
    "thales.htm": "Thales",
    "virtualinstruments.htm": "Virtual Instruments",
    "x-io.htm": "X-IO",
}


def parse_size(size: str) -> int | None:
    m = re.search(r"([\d,]+)\s*KB", size, re.I)
    return int(m.group(1).replace(",", "")) * 1000 if m else None


def scrape_vendor(page: str) -> list[dict]:
    raw = fetch(BASE + page)
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)

    # Map each row to the collection header that precedes it.
    headers = [(m.start(), text(m.group("title"))) for m in COLLECTION.finditer(raw)]
    packs = []
    for m in ROW.finditer(raw):
        href = m.group("href")
        name = text(m.group("name"))
        if "index" in href.lower() or "index" in name.lower():
            continue
        # "Recent"/"Previous" packs repeat shapes that are already in the main packs.
        if re.search(r"-(Recent|Previous)([_-]|$)", name, re.I):
            continue
        collection = ""
        for pos, title in headers:
            if pos < m.start():
                collection = title
        collection = re.sub(r"\(Created by.*?\)", "", collection)
        collection = re.sub(r"\s+-\s+\S*Index.*$", "", collection)
        collection = re.sub(r"\s*-\s*$", "", collection).strip(" - ")
        url = href if href.startswith("http") else BASE + href.lstrip("/")
        packs.append(
            {
                "name": name.removesuffix(".zip"),
                "description": text(m.group("desc")),
                "collection": collection,
                "url": url,
                "sizeBytes": parse_size(m.group("size")),
                "updated": text(m.group("date")),
            }
        )
    return packs


def main() -> None:
    index = fetch(BASE + "index.htm")
    pages = sorted(set(re.findall(r'href="([a-z0-9-]+\.htm)"', index)))
    names = {}
    for page, name in VENDOR_LINK.findall(index):
        names.setdefault(page, text(name))
    # various.htm is a grab-bag of community contributions with a different layout.
    skip = {"index.htm", "indexnews.htm", "privacypolicy.htm", "vsdfx.htm", "various.htm"}
    vendors = []
    for page in pages:
        if page in skip:
            continue
        try:
            packs = scrape_vendor(page)
            vendor = NAME_OVERRIDES.get(page) or names.get(page) or page.removesuffix(".htm")
        except Exception as exc:  # noqa: BLE001 - keep going on a broken page
            print(f"! {page}: {exc}", file=sys.stderr)
            continue
        if packs:
            vendors.append({"vendor": vendor, "page": BASE + page, "packs": packs})
            print(f"{page}: {vendor} ({len(packs)} packs)", file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(vendors, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({sum(len(v['packs']) for v in vendors)} packs)", file=sys.stderr)


if __name__ == "__main__":
    main()

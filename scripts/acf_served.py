"""Children and families actually served by CCDF, from ACF's published tables.

The population page compares the model's eligible population with the
number of children each state actually funded. ACF publishes that figure in
Table 1 of the annual CCDF data tables (average monthly adjusted number of
families and children served, from ACF-801 records). The table is transcribed
here rather than fetched because acf.gov blocks automated requests; update
it by hand when a new fiscal year is published and bump SOURCE accordingly.

Output: public/data/acf_served.json

Usage:
    python acf_served.py
"""

import json
import os

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "acf_served.json")

SOURCE = {
    "title": "FY 2023 Preliminary Data Table 1 - Average Monthly Adjusted Number of "
    "Families and Children Served",
    "href": "https://acf.gov/occ/data/fy-2023-preliminary-data-table-1",
    "publisher": "Office of Child Care, Administration for Children and Families",
    "fiscal_year": 2023,
    "publication_date": "2026-01-21",
    "data_as_of": "2024-11-23",
    "notes": [
        "Adjusted counts: the number funded through CCDF only (federal discretionary, "
        "mandatory and matching funds, TANF transfers to CCDF, and state matching and "
        "maintenance-of-effort funds), i.e. the raw count times the state's pooling factor.",
        "Average of the twelve monthly counts in the fiscal year; rounded to the nearest 100.",
        "The national total published by ACF (994,000 families, 1,623,000 children) also "
        "includes Guam, the Northern Mariana Islands and Puerto Rico.",
    ],
}

# (state code, average monthly families, average monthly children), as published.
TABLE = [
    ("AL", 23_400, 41_100),
    ("AK", 1_500, 2_200),
    ("AZ", 18_300, 27_800),
    ("AR", 11_100, 16_600),
    ("CA", 143_800, 232_500),
    ("CO", 10_600, 16_800),
    ("CT", 13_700, 19_100),
    ("DE", 4_300, 6_800),
    ("DC", 800, 1_100),
    ("FL", 76_200, 112_900),
    ("GA", 41_900, 73_400),
    ("HI", 2_500, 3_500),
    ("ID", 3_600, 6_400),
    ("IL", 34_600, 59_200),
    ("IN", 24_700, 44_000),
    ("IA", 6_500, 11_400),
    ("KS", 7_300, 12_400),
    ("KY", 14_100, 24_100),
    ("LA", 12_300, 18_300),
    ("ME", 3_000, 4_700),
    ("MD", 16_700, 25_800),
    ("MA", 14_500, 20_700),
    ("MI", 22_200, 37_800),
    ("MN", 10_600, 20_600),
    ("MS", 15_000, 25_900),
    ("MO", 15_700, 22_700),
    ("MT", 2_200, 3_200),
    ("NE", 4_800, 8_800),
    ("NV", 4_100, 6_800),
    ("NH", 1_900, 2_700),
    ("NJ", 24_100, 37_100),
    ("NM", 9_800, 15_500),
    ("NY", 53_100, 90_800),
    ("NC", 26_200, 39_400),
    ("ND", 2_700, 4_400),
    ("OH", 26_100, 50_500),
    ("OK", 18_000, 29_100),
    ("OR", 10_100, 16_500),
    ("PA", 50_700, 85_700),
    ("RI", 3_300, 5_400),
    ("SC", 15_400, 22_400),
    ("SD", 2_000, 3_000),
    ("TN", 15_900, 22_100),
    ("TX", 92_100, 158_700),
    ("UT", 7_800, 14_700),
    ("VT", 1_600, 2_200),
    ("VA", 21_100, 33_500),
    ("WA", 15_100, 24_500),
    ("WV", 6_500, 10_900),
    ("WI", 16_200, 27_800),
    ("WY", 1_600, 2_500),
]

# Territories are published in the same table but are outside this tool.
TERRITORIES = [
    ("GU", 1_500, 2_400),
    ("MP", 500, 800),
    ("PR", 10_700, 13_800),
]

PUBLISHED_NATIONAL = {"families": 994_000, "children": 1_623_000}


def build():
    states = {
        code: {"families": families, "children": children}
        for code, families, children in TABLE
    }
    states_total = {
        "families": sum(row[1] for row in TABLE),
        "children": sum(row[2] for row in TABLE),
    }
    return {
        "source": SOURCE,
        "states": states,
        "states_total": states_total,
        "published_national_total": PUBLISHED_NATIONAL,
    }


def main():
    path = os.path.abspath(OUTPUT_PATH)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(build(), handle, indent=1)
        handle.write("\n")
    data = build()
    print(f"wrote {path}: {len(data['states'])} states, "
          f"{data['states_total']['children']:,} children served (50 states + DC)")


if __name__ == "__main__":
    main()

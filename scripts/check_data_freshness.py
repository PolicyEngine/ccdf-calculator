"""Report whether the committed data lags the latest policyengine-us release.

The grid in public/data/ is generated against one policyengine-us version
(recorded in metadata.json). State child care rules change often, so this
script compares that version with the newest release on PyPI and, when run
under GitHub Actions, emits a warning (or an error with --fail-if-stale).

Usage:
    python scripts/check_data_freshness.py                 # print and warn
    python scripts/check_data_freshness.py --fail-if-stale # exit 1 when behind
    python scripts/check_data_freshness.py --max-behind 5  # tolerate 5 releases
"""

import argparse
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "public", "data")
PYPI_URL = "https://pypi.org/pypi/policyengine-us/json"


def parse_version(text):
    match = re.match(r"^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?", text or "")
    if not match:
        return None
    return tuple(int(part or 0) for part in match.groups())


def annotate(level, message):
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::{level}::{message}")
    else:
        print(f"{level.upper()}: {message}")


def step_summary(lines):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def read_json(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def latest_release():
    with urllib.request.urlopen(PYPI_URL, timeout=30) as response:
        return json.load(response)["info"]["version"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fail-if-stale", action="store_true")
    parser.add_argument(
        "--max-behind",
        type=int,
        default=0,
        help="minor releases the grid may lag before it counts as stale",
    )
    args = parser.parse_args()

    metadata = read_json("metadata.json")
    if metadata is None:
        annotate("error", "public/data/metadata.json is missing")
        return 1
    grid_version = metadata["policyengine_us_version"]
    impact = read_json("impact.json")
    impact_version = impact.get("policyengine_us_version") if impact else None

    try:
        latest = latest_release()
    except Exception as error:  # network failure must not fail CI
        annotate("warning", f"Could not reach PyPI to check freshness: {error}")
        return 0

    grid = parse_version(grid_version)
    newest = parse_version(latest)
    behind = 0
    if grid and newest and grid[0] == newest[0]:
        behind = newest[1] - grid[1]
    stale = bool(grid and newest and grid < newest and behind > args.max_behind)

    lines = [
        "### Data freshness",
        "",
        f"| | policyengine-us |",
        f"|---|---|",
        f"| Precomputed grid | `{grid_version}` |",
        f"| Population impact | `{impact_version or 'not computed'}` |",
        f"| Latest release | `{latest}` |",
        "",
    ]
    print("\n".join(lines))
    step_summary(lines)

    exit_code = 0
    if impact_version and impact_version != grid_version:
        annotate(
            "warning",
            f"impact.json was built with policyengine-us {impact_version}; the grid uses {grid_version}. "
            "Rerun scripts/microsim.py.",
        )
    if stale:
        message = (
            f"The grid uses policyengine-us {grid_version}; {latest} is released "
            f"({behind} minor releases behind). Regenerate with scripts/precompute.py, "
            "scripts/policy_index.py and scripts/build_state_inputs.py."
        )
        if args.fail_if_stale:
            annotate("error", message)
            exit_code = 1
        else:
            annotate("warning", message)
    elif grid and newest and grid < newest:
        print(
            f"The grid ({grid_version}) is behind the latest release ({latest}) "
            f"by {behind} minor release(s), within the tolerance of {args.max_behind}."
        )
    else:
        print("The grid is current.")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

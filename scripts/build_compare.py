"""Re-slice the per-state grid into one small file per comparison cell.

The compare page shows every state for one reference structure at one
provider charge level. Reading that from the 51 per-state files means
downloading the whole grid (about 9 MB); this script writes the same numbers
grouped the way the page reads them, so it fetches ~100 KB per selection.

Input:  public/data/{ST}.json and metadata.json (from precompute.py)
Output: public/data/compare/{structure}_{chargeIndex}.json

    {
      "structure": "1_two", "charge_index": 1, "charge_level": 1500,
      "income_steps": [...],                       // same axis as metadata.json
      "states": {"AK": {"subsidy": [...], "copay": [...], "eligible": [...]}, ...}
    }

Usage:
    python build_compare.py        # after precompute.py
"""

import json
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
OUTPUT_DIR = os.path.join(DATA_DIR, "compare")


def load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as handle:
        return json.load(handle)


def build(metadata, state_files):
    keys = [
        f"{adults}_{child}"
        for adults in metadata["adults_range"]
        for child in metadata["child_structures"]
    ]
    files = {}
    for key in keys:
        for charge_index, charge_level in enumerate(metadata["charge_levels"]):
            states = {}
            for code, data in state_files.items():
                grid = data["structures"].get(key)
                if grid is None:
                    continue
                states[code] = {
                    "subsidy": grid["subsidy"][charge_index],
                    "copay": grid["copay"][charge_index],
                    "eligible": grid["eligible"][charge_index],
                }
            files[f"{key}_{charge_index}"] = {
                "structure": key,
                "charge_index": charge_index,
                "charge_level": charge_level,
                "policyengine_us_version": metadata["policyengine_us_version"],
                "income_steps": metadata["income_steps"],
                "states": states,
            }
    return files


def main():
    metadata = load("metadata.json")
    state_files = {s["code"]: load(f"{s['code']}.json") for s in metadata["states"]}
    files = build(metadata, state_files)
    if os.path.isdir(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)
    total = 0
    for name, payload in files.items():
        path = os.path.join(OUTPUT_DIR, f"{name}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        total += os.path.getsize(path)
    print(f"wrote {len(files)} files to {os.path.abspath(OUTPUT_DIR)} ({total / 1e6:.1f} MB total, "
          f"{total / len(files) / 1e3:.0f} KB each)")


if __name__ == "__main__":
    main()

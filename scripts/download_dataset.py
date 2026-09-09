"""Download the certified Microcosm dataset for a year and print its path.

Needs the `policyengine` package (`uv pip install "policyengine[us]"`). The
downloaded file can then be passed to microsim.py --dataset-path so the
population estimates run on certified data under the locally installed
policyengine-us (which may be newer than the package's pinned model).

Usage: python download_dataset.py [--year 2026] [--folder ../data]
"""

import argparse
import os


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--folder", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    args = parser.parse_args()

    import policyengine as pe

    datasets = pe.us.ensure_datasets(years=[args.year], data_folder=args.folder)
    for key, ds in datasets.items():
        print(key, type(ds).__name__)
    for root, _dirs, files in os.walk(args.folder):
        for f in files:
            path = os.path.join(root, f)
            print(path, f"{os.path.getsize(path) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

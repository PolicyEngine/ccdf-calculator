"""Shared fixtures: the committed generated data and the scripts on sys.path.

Nothing here imports policyengine-us, so the suite runs in seconds on a
plain Python install. It validates `scripts/state_config.py`, the situation
builder, and the committed `public/data/*.json` against docs/DATA_CONTRACT.md.
"""

import json
import os
import sys

import pytest

SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPTS_DIR, ".."))
DATA_DIR = os.path.join(ROOT_DIR, "public", "data")

if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)


def load_data(name):
    # Python's json accepts the bare Infinity tokens policy_index.json carries.
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="session")
def metadata():
    return load_data("metadata.json")


@pytest.fixture(scope="session")
def state_inputs():
    return load_data("state_inputs.json")


@pytest.fixture(scope="session")
def policy_index():
    return load_data("policy_index.json")


@pytest.fixture(scope="session")
def impact():
    return load_data("impact.json")


@pytest.fixture(scope="session")
def state_files(metadata):
    return {state["code"]: load_data(f"{state['code']}.json") for state in metadata["states"]}

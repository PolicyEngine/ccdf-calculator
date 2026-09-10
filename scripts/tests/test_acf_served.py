"""The transcribed ACF caseload table must be complete and sum to what ACF published."""

import acf_served
import state_config as cfg


def test_covers_every_state_once():
    codes = [row[0] for row in acf_served.TABLE]
    assert sorted(codes) == sorted(cfg.STATES)
    assert len(codes) == len(set(codes))


def test_states_plus_territories_reproduce_the_published_national_total():
    """Catches a transcription slip in any row: ACF's total is the sum of the rows."""
    families = sum(row[1] for row in acf_served.TABLE) + sum(row[1] for row in acf_served.TERRITORIES)
    children = sum(row[2] for row in acf_served.TABLE) + sum(row[2] for row in acf_served.TERRITORIES)
    assert families == acf_served.PUBLISHED_NATIONAL["families"]
    assert children == acf_served.PUBLISHED_NATIONAL["children"]


def test_rows_are_rounded_to_hundreds_and_children_exceed_families():
    for code, families, children in acf_served.TABLE + acf_served.TERRITORIES:
        assert families % 100 == 0 and children % 100 == 0, code
        assert children >= families, code


def test_source_is_documented():
    source = acf_served.SOURCE
    assert source["href"].startswith("https://acf.gov/")
    assert source["fiscal_year"] == 2023
    assert source["publication_date"] and source["data_as_of"]


def test_committed_file_matches_the_module(acf_served_file):
    assert acf_served_file == acf_served.build(), (
        "public/data/acf_served.json is stale; run `python scripts/acf_served.py`"
    )

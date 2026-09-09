"""Per-state contract for the CCDF calculator.

Every state child care subsidy program in policyengine-us exposes:
  main      the state's monthly subsidy variable (SPM unit, MONTH)
  copay     the family copay / parent fee variable (SPM unit, MONTH) and the
            factor that converts the variable's own unit to a monthly amount
  eligible  an SPM-unit boolean, or None when the model has no single flag
            (then eligibility is reported as subsidy > 0)
  county    the most populous county, used for the reference households in
            states whose rates or regions depend on county
  overrides inputs that must differ from the model default for a sensible
            reference household (e.g. Maryland's provider type defaults to
            NONE, which pays nothing)
"""

YEAR = 2026

STATE_NAMES = {
    "AK": "Alaska", "AL": "Alabama", "AR": "Arkansas", "AZ": "Arizona",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DC": "District of Columbia", "DE": "Delaware", "FL": "Florida",
    "GA": "Georgia", "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "KS": "Kansas", "KY": "Kentucky",
    "LA": "Louisiana", "MA": "Massachusetts", "MD": "Maryland", "ME": "Maine",
    "MI": "Michigan", "MN": "Minnesota", "MO": "Missouri", "MS": "Mississippi",
    "MT": "Montana", "NC": "North Carolina", "ND": "North Dakota",
    "NE": "Nebraska", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NV": "Nevada", "NY": "New York", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VA": "Virginia",
    "VT": "Vermont", "WA": "Washington", "WI": "Wisconsin",
    "WV": "West Virginia", "WY": "Wyoming",
}

# Program display names, from gov/hhs/ccdf/child_care_subsidy_programs.yaml.
PROGRAM_NAMES = {
    "AK": "Child Care Assistance Program (PASS)",
    "AL": "Child Care Subsidy Program",
    "AR": "School Readiness Assistance",
    "AZ": "Child Care Assistance Program",
    "CA": "CalWORKs child care and CAPP",
    "CO": "Colorado Child Care Assistance Program",
    "CT": "Care 4 Kids",
    "DC": "Child Care Subsidy Program",
    "DE": "Purchase of Care",
    "FL": "School Readiness Program",
    "GA": "Childcare and Parent Services (CAPS)",
    "HI": "Child Care Subsidy",
    "IA": "Child Care Assistance",
    "ID": "Idaho Child Care Program",
    "IL": "Child Care Assistance Program",
    "IN": "CCDF Voucher Program",
    "KS": "Child Care Assistance Program",
    "KY": "Child Care Assistance Program",
    "LA": "Child Care Assistance Program",
    "MA": "Child Care Financial Assistance",
    "MD": "Child Care Scholarship",
    "ME": "Child Care Affordability Program",
    "MI": "Child Development and Care",
    "MN": "Child Care Assistance Program",
    "MO": "Child Care Subsidy",
    "MS": "Child Care Payment Program",
    "MT": "Best Beginnings Child Care Scholarship",
    "NC": "Subsidized Child Care Assistance",
    "ND": "Child Care Assistance Program",
    "NE": "Child Care Subsidy",
    "NH": "Child Care Scholarship Program",
    "NJ": "Child Care Assistance Program",
    "NM": "Child Care Assistance Program",
    "NV": "Child Care and Development Program",
    "NY": "Child Care Assistance Program",
    "OH": "Publicly Funded Child Care",
    "OK": "Child Care Subsidy Program",
    "OR": "Employment Related Day Care",
    "PA": "Child Care Works",
    "RI": "Child Care Assistance Program",
    "SC": "Child Care Scholarship Program",
    "SD": "Child Care Assistance",
    "TN": "Child Care Certificate Program (Smart Steps)",
    "TX": "Child Care Services",
    "UT": "Child Care Assistance",
    "VA": "Child Care Subsidy Program",
    "VT": "Child Care Financial Assistance Program",
    "WA": "Working Connections Child Care",
    "WI": "Wisconsin Shares",
    "WV": "Child Care Assistance Program",
    "WY": "Child Care, Purchase of Service",
}

WEEKS_PER_MONTH = 52 / 12
PAY_PERIODS_PER_MONTH = 26 / 12
ATTENDING_DAYS_PER_MONTH = 22

# copay factor: multiply the variable's value by this to get a monthly copay.
# "days" means multiply by the child's attending days per month (and, for
# person-level daily copays, sum over eligible children).
_S = {
    "AK": ("ak_ccap", "ak_ccap_copay", 1, "ak_ccap_eligible", "ANCHORAGE_MUNICIPALITY_AK"),
    "AL": ("al_ccsp", "al_ccsp_weekly_copay_per_child", WEEKS_PER_MONTH, "al_ccsp_eligible", "JEFFERSON_COUNTY_AL"),
    "AR": ("ar_sra", "ar_sra_daily_copay", "days", "is_ar_sra_eligible", "PULASKI_COUNTY_AR"),
    "AZ": ("az_ccap", "az_ccap_copay", 1, "az_ccap_eligible", "MARICOPA_COUNTY_AZ"),
    "CA": ("ca_child_care_subsidies", "ca_child_care_family_fee", 1, None, "LOS_ANGELES_COUNTY_CA"),
    "CO": ("co_ccap_subsidy", "co_ccap_parent_fee", 1, "co_ccap_eligible", "DENVER_COUNTY_CO"),
    "CT": ("ct_c4k", "ct_c4k_family_fee", 1, "ct_c4k_eligible", "FAIRFIELD_COUNTY_CT"),
    "DC": ("dc_ccsp", "dc_ccsp_copay", 1, "dc_ccsp_eligible", "DISTRICT_OF_COLUMBIA_DC"),
    "DE": ("de_poc", "de_poc_copay", 1, "de_poc_eligible", "NEW_CASTLE_COUNTY_DE"),
    "FL": ("fl_sr", "fl_sr_copay", 1, "is_fl_sr_eligible", "MIAMI_DADE_COUNTY_FL"),
    "GA": ("ga_caps", "ga_caps_family_fee", 1, "ga_caps_eligible", "FULTON_COUNTY_GA"),
    "HI": ("hi_ccap", "hi_ccap_copay", 1, "hi_ccap_eligible", "HONOLULU_COUNTY_HI"),
    "IA": ("ia_cca", "ia_cca_copay", 1, "ia_cca_eligible", "POLK_COUNTY_IA"),
    "ID": ("id_iccp", "id_iccp_copay", 1, "id_iccp_eligible", "ADA_COUNTY_ID"),
    "IL": ("il_ccap", "il_ccap_copay", 1, "il_ccap_eligible", "COOK_COUNTY_IL"),
    "IN": ("in_ccdf", "in_ccdf_copay", 1, "in_ccdf_eligible", "MARION_COUNTY_IN"),
    "KS": ("ks_ccap", "ks_ccap_family_share", 1, "ks_ccap_eligible", "JOHNSON_COUNTY_KS"),
    "KY": ("ky_ccap", "ky_ccap_copay", 1, "ky_ccap_eligible", "JEFFERSON_COUNTY_KY"),
    "LA": ("la_ccap", "la_ccap_daily_copay", "days", "la_ccap_eligible", "EAST_BATON_ROUGE_PARISH_LA"),
    "MA": ("ma_ccfa", "ma_ccfa_total_copay", 1, "ma_ccfa_eligible", "MIDDLESEX_COUNTY_MA"),
    "MD": ("md_ccs", "md_ccs_weekly_copay", WEEKS_PER_MONTH, "md_ccs_eligible", "MONTGOMERY_COUNTY_MD"),
    "ME": ("me_ccap", "me_ccap_parent_fee", 1, "me_ccap_eligible", "CUMBERLAND_COUNTY_ME"),
    "MI": ("mi_ccap", "mi_ccap_family_contribution", PAY_PERIODS_PER_MONTH, "mi_ccap_eligible", "WAYNE_COUNTY_MI"),
    "MN": ("mn_ccap", "mn_ccap_copay", 1, "mn_ccap_eligible", "HENNEPIN_COUNTY_MN"),
    "MO": ("mo_ccs", "mo_ccs_copay", 1, "mo_ccs_eligible", "ST_LOUIS_COUNTY_MO"),
    "MS": ("ms_ccpp", "ms_ccpp_copay", 1, "ms_ccpp_eligible", "HINDS_COUNTY_MS"),
    "MT": ("mt_ccap", "mt_ccap_copay", 1, "mt_ccap_eligible", "YELLOWSTONE_COUNTY_MT"),
    "NC": ("nc_scca", "nc_scca_parent_fee", 1, "nc_scca_entry_eligible", "MECKLENBURG_COUNTY_NC"),
    "ND": ("nd_ccap", "nd_ccap_copay", 1, "nd_ccap_eligible", "CASS_COUNTY_ND"),
    "NE": ("ne_child_care_subsidy", "ne_child_care_subsidy_family_fee", 1, "ne_child_care_subsidy_eligible", "DOUGLAS_COUNTY_NE"),
    "NH": ("nh_ccap", "nh_ccap_cost_share", WEEKS_PER_MONTH, "nh_ccap_eligible", "HILLSBOROUGH_COUNTY_NH"),
    "NJ": ("nj_ccap", "nj_ccap_copay", 1, "nj_ccap_eligible", "BERGEN_COUNTY_NJ"),
    "NM": ("nm_ccap", "nm_ccap_copay", 1, "nm_ccap_eligible", "BERNALILLO_COUNTY_NM"),
    "NV": ("nv_ccdp", "nv_ccdp_copay", 1, "nv_ccdp_eligible", "CLARK_COUNTY_NV"),
    "NY": ("ny_ccap", "ny_ccap_family_share", 1, None, "KINGS_COUNTY_NY"),
    "OH": ("oh_ccap", "oh_ccap_copay", 1, "oh_ccap_eligible", "FRANKLIN_COUNTY_OH"),
    "OK": ("ok_ccs", "ok_ccs_copay", 1, "ok_ccs_eligible", "OKLAHOMA_COUNTY_OK"),
    "OR": ("or_erdc", "or_erdc_copay", 1, "or_erdc_eligible", "MULTNOMAH_COUNTY_OR"),
    "PA": ("pa_ccw", "pa_ccw_copay", 1, "pa_ccw_eligible", "PHILADELPHIA_COUNTY_PA"),
    "RI": ("ri_ccap", "ri_ccap_copay", 1, "ri_ccap_eligible", "PROVIDENCE_COUNTY_RI"),
    "SC": ("sc_ccap", "sc_ccap_copay", 1, "sc_ccap_eligible", "GREENVILLE_COUNTY_SC"),
    "SD": ("sd_cca", "sd_cca_copay", 1, "sd_cca_eligible", "MINNEHAHA_COUNTY_SD"),
    "TN": ("tn_ccap", "tn_ccap_copay", 1, "tn_ccap_eligible", "SHELBY_COUNTY_TN"),
    "TX": ("tx_ccs", "tx_ccs_copay", 1, "tx_ccs_eligible", "HARRIS_COUNTY_TX"),
    "UT": ("ut_ccap", "ut_ccap_copay", 1, "ut_ccap_eligible", "SALT_LAKE_COUNTY_UT"),
    "VA": ("va_ccsp", "va_ccsp_copay", 1, "va_ccsp_eligible", "FAIRFAX_COUNTY_VA"),
    "VT": ("vt_ccfap", "vt_ccfap_family_share", 1, "vt_ccfap_eligible", "CHITTENDEN_COUNTY_VT"),
    "WA": ("wa_wccc", "wa_wccc_copay", 1, "wa_wccc_eligible", "KING_COUNTY_WA"),
    "WI": ("wi_shares", "wi_shares_copay", 1, "wi_shares_eligible", "MILWAUKEE_COUNTY_WI"),
    "WV": ("wv_ccap", "wv_ccap_copay", 1, "wv_ccap_eligible", "KANAWHA_COUNTY_WV"),
    "WY": ("wy_ccap", "wy_ccap_copay", 1, "wy_ccap_eligible", "LARAMIE_COUNTY_WY"),
}

STATES = {
    code: {
        "code": code,
        "name": STATE_NAMES[code],
        "program": PROGRAM_NAMES[code],
        "main": main,
        "copay": copay,
        "copay_factor": factor,
        "eligible": eligible,
        "county": county,
    }
    for code, (main, copay, factor, eligible, county) in _S.items()
}

# Person-level inputs whose model default is not a sensible reference
# household. Keys are state codes; values map variable -> value (or a callable
# taking the child's age).
PERSON_OVERRIDES = {
    "MD": {"md_ccs_provider_type": "LICENSED_CENTER"},
    "MA": {
        "ma_ccfa_care_provider_type": lambda age: (
            "CENTER_BASED_CARE_EARLY_EDUCATION" if age < 5 else "CENTER_BASED_CARE_SCHOOL_AGE"
        )
    },
}

# Reference household structures for the precomputed grid.
CHILD_STRUCTURES = {
    "infant": [1],
    "preschool": [3],
    "school": [7],
    "two": [3, 7],
    "three": [1, 3, 7],
}
ADULTS_RANGE = [1, 2]

# Care schedule assumptions by child age.
FULL_TIME_HOURS_PER_DAY = 8
SCHOOL_AGE_HOURS_PER_DAY = 3
DAYS_PER_WEEK = 5
SCHOOL_AGE_CUTOFF = 5

# Provider charge levels for the reference grid, monthly per child. The
# subsidy is the lesser of the charge and the state maximum rate, less the
# copay, so the charge matters in states whose caps exceed it (and in states
# that pay the provider's charge outright). $1,500 is close to the national
# median for center-based care and is the calculator's default.
CHARGE_LEVELS = [1_000, 1_500, 2_000, 2_500, 3_000]
DEFAULT_CHARGE_INDEX = 1
ASSUMED_MONTHLY_CHARGE_PER_CHILD = CHARGE_LEVELS[DEFAULT_CHARGE_INDEX]

# Earned income axis (annual).
INCOME_STEP = 1_000
INCOME_MAX = 200_000
INCOME_COUNT = INCOME_MAX // INCOME_STEP + 1

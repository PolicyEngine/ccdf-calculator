"""Generate public/data/state_inputs.json: the per-state input catalog.

For each state, runs a traced simulation of a reference household and keeps
every *input* variable (one with no formula) the state's subsidy chain read
that is (a) an enum or boolean and (b) belongs to the state's child care
program (name starts with the program prefix, or is the shared
`childcare_provider_type_group`). These become the "provider details"
dropdowns and checkboxes in the calculator, with labels taken from the enum
values, and the live-API layer sends them verbatim.

Also records the contract from state_config (main / copay / eligible
variables, county, copay factor) so the frontend needs no Python.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from policyengine_us import CountryTaxBenefitSystem, Simulation

from calculator import create_situation, output_variables
from state_config import STATES, YEAR, CHILD_STRUCTURES

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data", "state_inputs.json")

# Inputs that are internal to other programs or are dollar overrides, never
# user-facing here.
EXCLUDE_SUBSTR = ("_ssp_", "_tanf_", "_tafdc_", "_tcap_", "_tfa_", "_tea_", "_owf_", "countable_income", "gross_income")


def program_prefix(state: str) -> str:
    main = STATES[state]["main"]
    # e.g. il_ccap -> il_ccap, ne_child_care_subsidy -> ne_child_care_subsidy,
    # ca_child_care_subsidies -> ca_ (California uses several prefixes)
    if state == "CA":
        return "ca_calworks_child_care"
    if state == "CO":
        return "co_"
    return main.replace("_subsidy", "").replace("_subsidies", "") if state != "NE" else main


def main():
    system = CountryTaxBenefitSystem()
    V = system.variables
    catalog = {}
    for state, cfg in sorted(STATES.items()):
        sim = Simulation(situation=create_situation(state, 1, CHILD_STRUCTURES["two"], 30_000))
        sim.trace = True
        sim.calculate("child_care_subsidies", YEAR)
        names = {k.split("<")[0] for k in sim.tracer.get_flat_trace()}
        prefix = program_prefix(state)
        inputs = []
        for n in sorted(names):
            var = V[n]
            if var.formulas:
                continue
            if any(s in n for s in EXCLUDE_SUBSTR):
                continue
            is_state_var = n.startswith(prefix) or n == "childcare_provider_type_group"
            if not is_state_var:
                continue
            vt = var.value_type.__name__
            if vt == "Enum":
                inputs.append(
                    {
                        "name": n,
                        "label": var.label,
                        "entity": var.entity.key,
                        "type": "enum",
                        "default": var.default_value.name,
                        "options": [{"value": e.name, "label": e.value} for e in var.possible_values],
                    }
                )
            elif vt == "bool":
                inputs.append(
                    {
                        "name": n,
                        "label": var.label,
                        "entity": var.entity.key,
                        "type": "bool",
                        "default": bool(var.default_value),
                    }
                )
            elif vt in ("int", "float") and "quality" in n:
                inputs.append(
                    {
                        "name": n,
                        "label": var.label,
                        "entity": var.entity.key,
                        "type": "number",
                        "default": float(var.default_value),
                    }
                )
        catalog[state] = {
            **cfg,
            "copay_entity": V[cfg["copay"]].entity.key,
            "copay_label": V[cfg["copay"]].label,
            "main_label": V[cfg["main"]].label,
            "outputs": output_variables(state),
            "inputs": inputs,
        }
        print(state, len(inputs), [i["name"] for i in inputs], flush=True)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"year": YEAR, "states": catalog}, f, indent=1, default=str)
    print("wrote", OUT)


if __name__ == "__main__":
    main()

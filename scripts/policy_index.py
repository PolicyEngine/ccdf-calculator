"""Build public/data/policy_index.json: program facts per state, as encoded.

Two sources:

1. Parameters. A traced simulation per state records which parameter nodes
   the subsidy chain reads. Every scalar parameter under the state's program
   root is listed with its label, value in force on 1 January and 1 July of
   the model year, unit, and reference links, straight from the YAML metadata.
   Bracket / breakdown parameters are summarized by name only.

2. Effective thresholds from the precomputed grid. For each reference
   household, the highest annual income at which the model still pays a
   positive subsidy, expressed in dollars, as a share of the federal poverty
   guideline, and as a share of state median income. This is the uniform,
   model-truthful comparison across states whose YAML use different shapes
   (entry vs exit limits, SMI vs FPL, monthly vs annual).

Usage: python policy_index.py  (run after precompute.py)
"""

import inspect
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from policyengine_us import CountryTaxBenefitSystem, Simulation
from policyengine_core.parameters import Parameter, ParameterNode, ParameterScale

from calculator import create_situation
from state_config import CHILD_STRUCTURES, DEFAULT_CHARGE_INDEX, INCOME_STEP, STATES, YEAR

DATA = os.path.join(os.path.dirname(__file__), "..", "public", "data")
OUT = os.path.join(DATA, "policy_index.json")
DATES = [f"{YEAR}-01-01", f"{YEAR}-07-01"]


def common_prefix(paths):
    parts = [p.split(".") for p in paths]
    prefix = parts[0]
    for p in parts[1:]:
        n = 0
        while n < min(len(prefix), len(p)) and prefix[n] == p[n]:
            n += 1
        prefix = prefix[:n]
    return ".".join(prefix)


# Subtrees with more leaves than this (county/provider rate tables) are
# summarized as one group entry instead of being listed leaf by leaf.
GROUP_LEAF_LIMIT = 24

# Variable-directory roots that are too broad or split across trees.
ROOT_OVERRIDES = {
    "CA": ["gov.states.ca.cdss.child_care", "gov.states.ca.cdss.tanf.child_care"],
}


def leaves(node):
    if isinstance(node, (Parameter, ParameterScale)):
        return [node]
    if isinstance(node, ParameterNode):
        out = []
        for child in node.children.values():
            out.extend(leaves(child))
        return out
    return []


def node_refs(node):
    meta = getattr(node, "metadata", None) or {}
    refs = meta.get("reference") or []
    if isinstance(refs, dict):
        refs = [refs]
    return [{"title": r.get("title"), "href": r.get("href")} for r in refs if isinstance(r, dict)]


def describe(node, out, depth=0):
    if isinstance(node, ParameterNode) and depth > 0:
        lv = leaves(node)
        if len(lv) > GROUP_LEAF_LIMIT:
            meta = node.metadata or {}
            sample = []
            for leaf in lv[:3]:
                try:
                    v = leaf(DATES[0]) if isinstance(leaf, Parameter) else None
                except Exception:
                    v = None
                sample.append({"path": leaf.name, "value": v})
            refs = node_refs(node) or node_refs(lv[0])
            out.append(
                {
                    "path": node.name,
                    "label": meta.get("label") or node.name.split(".")[-1].replace("_", " "),
                    "description": node.description,
                    "group": True,
                    "count": len(lv),
                    "sample": sample,
                    "references": refs,
                }
            )
            return
    if isinstance(node, Parameter):
        meta = node.metadata or {}
        refs = meta.get("reference") or []
        if isinstance(refs, dict):
            refs = [refs]
        values = {}
        for d in DATES:
            try:
                v = node(d)
            except Exception:
                v = None
            if isinstance(v, (list, tuple)):
                v = list(v)
                if len(v) > 12:
                    v = v[:12] + [f"... {len(v) - 12} more"]
            values[d] = v
        out.append(
            {
                "path": node.name,
                "label": meta.get("label") or node.name.split(".")[-1].replace("_", " "),
                "description": node.description,
                "unit": meta.get("unit"),
                "period": meta.get("period"),
                "values": values,
                "references": [
                    {"title": r.get("title"), "href": r.get("href")} for r in refs if isinstance(r, dict)
                ],
            }
        )
    elif isinstance(node, ParameterScale):
        meta = node.metadata or {}
        refs = meta.get("reference") or []
        if isinstance(refs, dict):
            refs = [refs]
        brackets = []
        for b in node.brackets:
            row = {}
            for key in ("threshold", "amount", "rate"):
                child = getattr(b, key, None)
                if child is not None:
                    try:
                        row[key] = child(DATES[0])
                    except Exception:
                        pass
            brackets.append(row)
        out.append(
            {
                "path": node.name,
                "label": meta.get("label") or node.name.split(".")[-1].replace("_", " "),
                "description": node.description,
                "unit": meta.get("rate_unit") or meta.get("amount_unit"),
                "scale": brackets,
                "references": [
                    {"title": r.get("title"), "href": r.get("href")} for r in refs if isinstance(r, dict)
                ],
            }
        )
    elif isinstance(node, ParameterNode):
        for child in node.children.values():
            describe(child, out, depth + 1)


def parameter_root(system, variable, params):
    """Parameter subtree matching the variable's source directory, e.g.
    variables/gov/states/il/dhs/ccap/il_ccap.py -> gov.states.il.dhs.ccap.
    Walks up until a parameter node exists (some states nest the formula one
    level deeper than the parameters)."""
    path = inspect.getfile(type(system.variables[variable]))
    rel = path.split("policyengine_us/variables/")[1]
    segs = os.path.dirname(rel).split("/")
    while segs:
        node = params
        try:
            for seg in segs:
                node = node.children[seg]
            if len(segs) >= 3:
                return ".".join(segs)
            return None
        except KeyError:
            segs = segs[:-1]
    return None


def finite(obj):
    """Replace +/-inf and NaN with None so the file is strict JSON (open-ended
    bracket thresholds appear as null and render as "no limit")."""
    if isinstance(obj, dict):
        return {k: finite(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [finite(v) for v in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def effective_thresholds(state):
    path = os.path.join(DATA, f"{state}.json")
    if not os.path.exists(path):
        return {}
    grid = json.load(open(path))
    out = {}
    for key, s in grid["structures"].items():
        subsidy = s["subsidy"][DEFAULT_CHARGE_INDEX]
        last_positive = max((i for i, v in enumerate(subsidy) if v > 0), default=None)
        if last_positive is None:
            out[key] = None
            continue
        income = last_positive * INCOME_STEP
        out[key] = {
            "income": income,
            "fpg_ratio": round(income / s["fpg"], 3) if s["fpg"] else None,
            "smi_ratio": round(income / s["smi"], 3) if s["smi"] else None,
            "max_subsidy": max(subsidy),
            "subsidy_at_zero_income": subsidy[0],
        }
    return out


def main():
    system = CountryTaxBenefitSystem()
    params = system.parameters
    index = {}
    for state, cfg in sorted(STATES.items()):
        sim = Simulation(situation=create_situation(state, 1, CHILD_STRUCTURES["two"], 30_000))
        sim.trace = True
        sim.calculate("child_care_subsidies", YEAR)
        used = set()
        for node in sim.tracer.get_flat_trace().values():
            for p in node.get("parameters", {}):
                if ".states." in p:
                    used.add(p.split("<")[0])
        used = sorted(used)
        roots = ROOT_OVERRIDES.get(state) or [parameter_root(system, cfg["main"], params)]
        root = roots[0]
        parameters = []
        for r in roots:
            if not r:
                continue
            node = params
            for seg in r.split("."):
                node = node.children[seg]
            describe(node, parameters)
        index[state] = {
            "code": state,
            "name": cfg["name"],
            "program": cfg["program"],
            "parameter_root": root,
            "parameters_used": used,
            "parameters": parameters,
            "thresholds": effective_thresholds(state),
        }
        print(state, root, len(parameters), flush=True)
    with open(OUT, "w") as f:
        json.dump(finite({"year": YEAR, "states": index}), f, indent=1, default=str, allow_nan=False)
    print("wrote", OUT)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the hub's data file from the master annotated CSV plus the
per-annotator validation file.

Every dataset record carries a LIST of annotations:
  - one "curated" baseline annotation from the master CSV
    (../Annotated_Data_Culture_Taxonomy_ENRICHED_curated.csv), and
  - one annotation per human/Claude annotator from the long-format
    validation export (../annotations_results/
    Cultural_NLP_Validation_185_annotated.xlsx), matched by paper title
    and labeled A1/A2/A3/Claude as in the paper appendix.

The build also precomputes the aggregates the site displays: per-value
annotator counts (mode, branch :: category pairs, protocol flags) so the
UI can render e.g. "Ideational :: Knowledge (2)". Accepted community
annotations are simply new rows in the validation file (or additional
label maps in ANNOTATOR_LABELS) followed by a re-run of this script.

Run after every accepted submission or re-annotation:
    python3 build_data.py
then commit the regenerated data/datasets.js.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

SOURCE_CSV = Path("../Annotated_Data_Culture_Taxonomy_ENRICHED_curated.csv")
VALIDATION_XLSX = Path("../annotations_results/Cultural_NLP_Validation_185_annotated.xlsx")
OUTPUT_JS = Path("data/datasets.js")

FLAG_KEYS = ["refusal", "agentic", "safety", "robustness"]

# Public labels for the core validation annotators (paper appendix naming).
# Any other annotator in the validation file — i.e. accepted community
# submissions — appears under their chosen name/alias as-is.
ANNOTATOR_LABELS = {"Eva": "A1", "yusser": "A2", "Christian": "A3", "Claude": "Claude"}
# Seed/test accounts, plus InitialAgent whose coding is already the
# "curated" baseline from the master CSV.
EXCLUDED_ANNOTATORS = {"InitialAgent", "AutoFilter", "CompleteFilter",
                       "Doofnase", "DummyBot", "Pupsnase", "TestNase", "Tiaotiao"}

MODE_LABELS = {"C": "C", "CL": "CL", "L": "L"}

# The Category column is multi-label and comma-separated, but one canonical
# category name itself contains commas — extract known names first (longest
# match wins), then keep whatever remains as-is.
CANONICAL_CATEGORIES = [
    "Styles, Registers, Genres", "Values - other perceptions",
    "Communicative Goals", "Norms and Morals", "Relationship",
    "Values - general", "Values - bias", "Values - hate", "Demographics",
    "Knowledge", "Artifacts", "Concepts", "Dialects", "Context",
]
CATEGORY_VARIANTS = {
    "(styles, registers, and genres)": "Styles, Registers, Genres",
    "[styles, registers, and genres]": "Styles, Registers, Genres",
    "styles, registers, and genres": "Styles, Registers, Genres",
}


def parse_categories(value: str) -> list[str]:
    rest = str(value).strip()
    for variant, canonical in CATEGORY_VARIANTS.items():
        idx = rest.lower().find(variant)
        if idx >= 0:
            rest = rest[:idx] + canonical + rest[idx + len(variant):]
    found = []
    for name in CANONICAL_CATEGORIES:
        idx = rest.lower().find(name.lower())
        if idx >= 0:
            found.append((idx, name))
            rest = rest[:idx] + rest[idx + len(name):]
    leftover_map = {"values-general": "Values - general", "demographic": "Demographics"}
    leftovers = []
    for part in rest.split(","):
        token = part.strip().strip("[]()., ")
        if token:
            leftovers.append((len(rest) + 1, leftover_map.get(token.lower(), token)))
    return [name for _, name in sorted(found + leftovers)]


def split_list(value: str, sep: str) -> list[str]:
    return [part.strip() for part in str(value).split(sep) if part.strip()]


def split_multi(value: str) -> list[str]:
    """Split on comma OR semicolon — annotator-supplied lists mix both."""
    return [part.strip() for part in re.split(r"[,;]", str(value)) if part.strip()]


def clean_year(value: str) -> int | None:
    match = re.match(r"(\d{4})", str(value))
    return int(match.group(1)) if match else None


def clean_flag(value: str) -> str:
    v = str(value).strip().capitalize()
    return v if v in ("Yes", "No") else ""


def norm_title(value: str) -> str:
    return " ".join(str(value).split()).casefold()


def baseline_pairs(branches: list[str], categories: list[str]) -> list[str]:
    """Branch :: category pairs for the curated baseline. The master CSV
    does not record which category belongs to which branch, so pairing is
    only exact for single-branch rows; multi-branch rows keep one combined
    tag (same rendering the site used before)."""
    if len(branches) == 1 and categories:
        return [f"{branches[0]} :: {c}" for c in categories]
    if branches and categories:
        return [f"{' · '.join(branches)} :: {', '.join(categories)}"]
    return branches or categories


def load_validation_annotations() -> dict[str, list[dict]]:
    """title (normalized) -> list of per-annotator annotations."""
    if not VALIDATION_XLSX.exists():
        print(f"NOTE: {VALIDATION_XLSX} not found — building with baseline annotations only")
        return {}
    vdf = pd.read_excel(VALIDATION_XLSX, sheet_name="Annotation", dtype=str).fillna("")

    titles = {}
    for _, row in vdf.iterrows():
        if row["Title"].strip() and row["ID"].strip():
            titles.setdefault(row["ID"].strip(), norm_title(row["Title"]))

    by_title: dict[str, list[dict]] = {}
    for _, row in vdf.iterrows():
        raw = row["Annotator"].strip()
        title = titles.get(row["ID"].strip())
        if not raw or raw in EXCLUDED_ANNOTATORS or not title:
            continue
        who = ANNOTATOR_LABELS.get(raw, raw)
        ann = {
            "who": who,
            "mode": row["Rep_Mode"].strip(),
            "pairs": split_list(row["Branch_Categories"], ";"),
            "flags": {k: clean_flag(row[k.capitalize()]) for k in FLAG_KEYS},
            "languages": split_multi(row["Languages"]),
            "regions": split_multi(row["Regions"]),
            "models": split_list(row["Models"], ";"),
        }
        if (ann["mode"] or ann["pairs"] or any(ann["flags"].values())
                or ann["languages"] or ann["regions"] or ann["models"]):
            by_title.setdefault(title, []).append(ann)

    # One annotation per annotator name/alias per paper: keep the last
    # occurrence (later rows are assumed to supersede earlier ones).
    for title, anns in by_title.items():
        seen: dict[str, dict] = {}
        for ann in anns:
            if ann["who"] in seen:
                print(f"NOTE: duplicate annotation by {ann['who']!r} on {title!r} — keeping the last")
            seen[ann["who"]] = ann
        by_title[title] = list(seen.values())
    return by_title


def aggregate(annotations: list[dict]) -> dict:
    """Per-value annotator counts across all of a record's annotations."""
    mode_counts: dict[str, int] = {}
    pair_counts: dict[str, int] = {}
    flag_values: dict[str, list[str]] = {}
    flag_yes: dict[str, int] = {}
    for ann in annotations:
        if ann["mode"]:
            mode_counts[ann["mode"]] = mode_counts.get(ann["mode"], 0) + 1
        for pair in ann["pairs"]:
            pair_counts[pair] = pair_counts.get(pair, 0) + 1
    for k in FLAG_KEYS:
        vals = [a["flags"][k] for a in annotations if a["flags"][k]]
        flag_values[k] = sorted(set(vals))
        flag_yes[k] = vals.count("Yes")
    return {
        "mode_counts": mode_counts,
        "pair_counts": pair_counts,
        "flag_values": flag_values,
        "flag_yes": flag_yes,
    }


def main() -> None:
    df = pd.read_csv(SOURCE_CSV, dtype=str).fillna("")
    validation = load_validation_annotations()

    records = []
    matched = 0
    for i, row in df.iterrows():
        branches = split_list(row["branch_set"], "|")
        categories = parse_categories(row["Category"])
        # Baseline languages/regions/models stay empty here — the site falls
        # back to the record-level values for the "curated" row, so the big
        # lists are not duplicated in the payload.
        baseline = {
            "who": "curated",
            "mode": MODE_LABELS.get(row["representational_mode"].strip(), ""),
            "pairs": baseline_pairs(branches, categories),
            "flags": {k: clean_flag(row[k]) for k in FLAG_KEYS},
            "languages": [], "regions": [], "models": [],
        }
        extra = validation.get(norm_title(row["Title"]), [])
        matched += bool(extra)
        annotations = [baseline] + extra

        # Facet unions across every annotation of the record.
        languages = split_list(row["Languages"], ",")
        regions = split_list(row["Geographical diversity (culture)"], ",")
        models = split_list(row["models_normalized"], ";")
        for ann in extra:
            for pair in ann["pairs"]:
                branch, _, category = (part.strip() for part in pair.partition("::"))
                if branch and branch not in branches:
                    branches.append(branch)
                if category and category not in categories:
                    categories.append(category)
            for target, values in ((languages, ann["languages"]),
                                   (regions, ann["regions"]),
                                   (models, ann["models"])):
                seen = {t.casefold() for t in target}
                for v in values:
                    if v.casefold() not in seen:
                        seen.add(v.casefold())
                        target.append(v)
        modes = sorted({a["mode"] for a in annotations if a["mode"]})

        agg = aggregate(annotations)
        records.append({
            "id": i,
            "dataset": row["Dataset"].strip(),
            "title": row["Title"].strip(),
            "paper": row["Paper link"].strip(),
            "data": row["Data link"].strip(),
            "year": clean_year(row["year"] or row["Date"]),
            "venue": row["Published venue"].strip(),
            "branches": branches,
            "categories": categories,
            "modes": modes,
            "mode": baseline["mode"] or (modes[0] if modes else ""),
            "languages": languages,
            "regions": regions,
            "task": row["Task type"].strip(),
            "format": row["Format"].strip(),
            "families": split_list(row["fam_list"], ";"),
            "models": models,
            "llm_eval": row["is_llm_eval_paper"].strip() == "Yes",
            "hf": row["in_huggingface"].strip().upper() == "YES",
            "citations": int(row["# citation"]) if str(row["# citation"]).strip().isdigit() else None,
            "example": row["Example"].strip()[:400],
            "mode_notes": row["notes for rep_mode"].strip()[:400],
            "annotations": annotations,
            **agg,
        })

    OUTPUT_JS.parent.mkdir(exist_ok=True)
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    OUTPUT_JS.write_text(
        "// Generated by build_data.py — do not edit by hand.\n"
        f"window.DATASETS = {payload};\n",
        encoding="utf-8",
    )
    n_modes = sum(1 for r in records if r["mode"])
    n_multi = sum(1 for r in records if len(r["annotations"]) > 1)
    print(f"Wrote {len(records)} datasets to {OUTPUT_JS} "
          f"({n_modes} with a representational mode, "
          f"{n_multi} with multiple annotations; "
          f"{matched} matched to the validation file)")


if __name__ == "__main__":
    main()

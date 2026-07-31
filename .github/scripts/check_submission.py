#!/usr/bin/env python3
"""Automatic verification of hub submissions, run by the GitHub workflow.

Reads the issue form body from the ISSUE_BODY env var and the mode from
CHECK_MODE ("dataset" or "annotation"), compares against data/datasets.js,
and prints a Markdown comment to stdout:

  dataset    — flag likely duplicates (matched by dataset name, paper
               title, or paper link) and point the submitter at the
               "+ annotate" flow instead.
  annotation — verify the target dataset exists and the alias is not
               already used on it.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote

DATA_JS = Path("data/datasets.js")


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def norm_link(value: str) -> str:
    v = str(value).strip().lower()
    v = re.sub(r"^https?://(www\.)?", "", v)
    return v.rstrip("/")


def similar(a: str, b: str) -> bool:
    """Normalized equality, or containment for strings of useful length —
    submitters use short names ("BLEnD") where the catalog stores long ones
    ("Benchmark for LLMs on ... (BLEnD)")."""
    if not a or not b:
        return False
    if a == b:
        return True
    return (len(a) >= 5 and a in b) or (len(b) >= 5 and b in a)


def parse_form(body: str) -> dict:
    """GitHub renders issue forms as '### Label\n\nvalue' sections."""
    fields = {}
    for match in re.finditer(r"### (.+?)\n+(.*?)(?=\n### |\Z)", body, re.S):
        label, value = match.group(1).strip(), match.group(2).strip()
        if value in ("_No response_", "None"):
            value = ""
        fields[label.lower()] = value
    return fields


def load_datasets() -> list[dict]:
    raw = DATA_JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("[") : raw.rindex(";")])


def check_dataset(fields: dict, datasets: list[dict]) -> str:
    name = norm(fields.get("dataset name", ""))
    title = norm(fields.get("paper title", ""))
    link = norm_link(fields.get("paper link", ""))

    hits = []
    for r in datasets:
        reasons = []
        if similar(name, norm(r["dataset"])) or similar(name, norm(r["title"])):
            reasons.append("dataset name")
        if similar(title, norm(r["title"])):
            reasons.append("paper title")
        if link and r["paper"] and link == norm_link(r["paper"]):
            reasons.append("paper link")
        if reasons:
            hits.append((r, reasons))

    if not hits:
        return ("**Automatic duplicate check: no match found** — this looks like a new "
                "dataset. A maintainer will now review the annotation. :hourglass:")

    lines = ["**Automatic duplicate check: this dataset appears to already be in the hub.**", ""]
    for r, reasons in hits:
        anchor = f"https://yusser96.github.io/cultural-nlp-hub/#q={quote(r['dataset'] or r['title'])}"
        lines.append(f"- **{r['dataset'] or r['title']}** ({r['year'] or 'n/a'}) — matched by "
                     f"{', '.join(reasons)} — [view in the hub]({anchor})")
    lines += ["",
              "If you meant to add **your annotation** of this dataset, please use the "
              "**+ annotate** link next to it on the hub (it opens the annotation form "
              "prefilled) and close this issue. If you believe this is genuinely a different "
              "dataset, say so below and a maintainer will take a look."]
    return "\n".join(lines)


def check_annotation(fields: dict, datasets: list[dict]) -> str:
    name = norm(fields.get("dataset name (as shown in the hub)", ""))
    title = norm(fields.get("paper title (as shown in the hub)", ""))
    alias = fields.get("annotator name or alias", "").strip()

    record = next((r for r in datasets
                   if similar(name, norm(r["dataset"])) or similar(name, norm(r["title"]))
                   or similar(title, norm(r["title"]))),
                  None)
    if record is None:
        return ("**Automatic check: dataset not found in the hub.** Please check the spelling "
                "against the [catalog](https://yusser96.github.io/cultural-nlp-hub/) — or, if the "
                "dataset is genuinely missing, submit it with the "
                "[new-dataset form](../issues/new?template=submit-dataset.yml) instead.")

    taken = {a["who"].lower() for a in record["annotations"]}
    if alias and alias.lower() in taken:
        return (f"**Automatic check: the alias `{alias}` already has an annotation on "
                f"**{record['dataset'] or record['title']}**.** One annotation per alias per "
                "dataset — if you want to revise your earlier annotation, ask here and a "
                "maintainer will update it; otherwise pick a different alias.")

    existing = ", ".join(a["who"] for a in record["annotations"])
    return (f"**Automatic check passed** — `{alias}` is free on "
            f"**{record['dataset'] or record['title']}** (existing annotations: {existing}). "
            "A maintainer will now review the annotation. :hourglass:")


def main() -> None:
    body = os.environ.get("ISSUE_BODY", "")
    mode = os.environ.get("CHECK_MODE", "dataset")
    fields = parse_form(body)
    datasets = load_datasets()
    if mode == "annotation":
        print(check_annotation(fields, datasets))
    else:
        print(check_dataset(fields, datasets))


if __name__ == "__main__":
    sys.exit(main())

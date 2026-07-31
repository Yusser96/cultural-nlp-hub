# Cultural-NLP Dataset Hub

A living, filterable catalog of cultural-NLP datasets, annotated with the coding
scheme from *"Measuring the Wrong Thing? A Meta-Analysis of 271 Cultural-NLP
Datasets"*: taxonomy branch :: category, representational mode (C / CL / L),
languages, cultural regions, evaluated models, and the four evaluation-protocol
flags (refusal, agentic, safety, robustness).

The site is fully static — one HTML page, no build step, no backend — so it runs
on GitHub Pages as-is. Combine any filters (e.g. *Category: Values-bias · mode C ·
languages EN ∨ ES ∨ DE*, or *model family: LLaMA · agentic: Yes*); the active
query is always readable in the call-line under the masthead, and the filtered
view can be exported as CSV.

## Deploy

1. Create a GitHub repository (e.g. `cultural-nlp-hub`) and push this folder's
   contents to its root.
2. Repository **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. Edit the `REPO` constant at the top of `assets/app.js` to point at your
   repository (this wires up the "Add a dataset" buttons), and put the real
   repo path in `.github/ISSUE_TEMPLATE/config.yml`.
4. The site is live at `https://<org>.github.io/cultural-nlp-hub/` a minute later.

## Updating the data

`data/datasets.js` is generated — never edit it by hand.

1. Add or correct rows in the master CSV
   (`Annotated_Data_Culture_Taxonomy_ENRICHED_curated.csv`; see `SOURCE_CSV` in
   `build_data.py` — adjust the path if you keep the CSV inside this repo).
2. Run `python3 build_data.py`.
3. Commit the regenerated `data/datasets.js` and push; Pages redeploys
   automatically.

## Multiple annotations per dataset

A dataset is not limited to one coding. Each record carries a **list of
annotations** — the "curated" baseline from the master CSV plus one per
additional annotator (the paper's validation annotators A1/A2/A3/Claude, and
any accepted community annotations). The site searches **across all
annotations** of a record (a filter matches if any annotation matches) and
displays aggregated values with annotator counts, e.g.
`Ideational :: Knowledge (2)` or `refusal (2)`; the expanded row lists every
annotation side by side with its annotator.

Annotator identity: each annotation is published under the submitter's chosen
**name or alias**. One annotation per alias per paper — the build script keeps
the most recent row if an alias appears twice on the same paper, and reviewers
check that a new submission's alias is not already taken on that paper.

## Community submissions

The hub is also the intake point for new datasets *and* additional annotations
of existing ones, through two separate forms:

- **New datasets**: the "Add a new dataset" button opens
  `.github/ISSUE_TEMPLATE/submit-dataset.yml`. On submission, a workflow runs
  an automatic duplicate check (`.github/scripts/check_submission.py`) against
  the catalog by dataset name, paper title, and paper link, and comments the
  result — pointing genuine duplicates to the annotation flow instead.
- **Additional annotations**: every dataset row on the site carries a
  "+ annotate" link that opens `.github/ISSUE_TEMPLATE/submit-annotation.yml`
  prefilled with that dataset's name and title. The same workflow verifies the
  dataset exists and that the submitter's alias does not already have an
  annotation on it.
- Both forms take branch :: category as a **multi-select of exact pairs** (42
  options), the translation test for the representational mode, and the four
  protocol flags.
- **Notification.** Every submission is labeled `dataset-submission` +
  `needs-review`. Maintainers get an email through GitHub's built-in
  notifications: on the repo page choose **Watch → Custom → Issues** (each
  maintainer does this once). Optionally, the
  `.github/workflows/submission-review.yml` workflow can additionally send a
  direct email to a shared inbox — set the repository variable
  `MAIL_ENABLED=true` and the secrets `MAIL_SERVER`, `MAIL_PORT`,
  `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_TO`.
- **Review.** A maintainer checks the submitted annotation against the coding
  manual (below), asks follow-ups in the issue thread if needed, then either
  accepts or declines with a reason. Accepting a **new dataset** means adding a
  row to the master CSV; accepting an **additional annotation** means adding a
  row to the validation file (`Cultural_NLP_Validation_185_annotated.xlsx`,
  Annotator = the submitter's alias). Either way, run `python3 build_data.py`,
  commit, and close the issue with a link. The workflow also posts an
  acknowledgement comment to the submitter automatically.

## Annotation schema

| Field | Values | Meaning |
|---|---|---|
| Branch | Ideational, Linguistic, Social | Top level of the cultural-element taxonomy (multi-label) |
| Category | 14 categories (Knowledge, Values-*, Norms and Morals, …) | Fine-grained taxonomy element |
| Representational mode | C / CL / L | Translation test: gold answer unchanged (C), altered (CL), or undefined (L) under faithful translation |
| Languages | free list | Languages the dataset covers |
| Regions | free list | Cultural regions the dataset targets |
| Models | free list | Models evaluated in the source paper; grouped into families for filtering |
| Refusal / Agentic / Safety / Robustness | Yes / No | Whether the paper's evaluation protocol covers the dimension |

## Repository layout

```
index.html                 the whole site (loads assets/ + data/)
assets/styles.css          specimen-catalog styling
assets/app.js              faceted filtering, query line, CSV export
data/datasets.js           generated data payload (window.DATASETS)
build_data.py              master CSV → data/datasets.js
.github/ISSUE_TEMPLATE/    structured submission form
.github/workflows/         submission acknowledgement + optional email
```

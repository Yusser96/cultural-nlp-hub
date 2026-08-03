# Errata

## 2026-08-03 — Two duplicate entries removed (corpus 271 → 269)

An audit of the released annotation table found two rows that duplicate a dataset
already present in the corpus. Both were removed from the release
(`Annotated_Data_Culture_Taxonomy_ENRICHED_curated_dedup269.csv`), which is the
file this catalog and every statistic in the paper are built from. The paper's
counts changed accordingly: 271 → **269** datasets overall, and 185 → **183**
datasets in the evaluation-protocol audit.

For provenance, the removed rows were:

| # | Dataset | Paper | Why removed | Kept row |
|---|---------|-------|-------------|----------|
| 1 | `exams` | EXAMS: A Multi-Subject High School Examinations Dataset for Cross-Lingual and Multilingual Question Answering (2020) | Accidental re-entry of the same dataset; the row's Branch field literally reads "Already in our dataset." and it carried no branch or representational-mode coding. | The original `EXAMS` row (Ideational :: Knowledge, mode C). |
| 2 | `CultureLLM (name of the framework)` | CultureLLM: Incorporating Cultural Differences into Large Language Models (2024) | The dataset was entered twice with identical coding except for the representational mode (C vs. CL). | The mode-C row, following the codebook's conservative rule that ambiguous cases are coded toward C (which keeps the form-bearing count a lower bound). |

Corresponding duplicate entries in the human-validation layer (annotation schema
IDs 161 and 116) were merged into their canonical items (36 and 115): annotations
attached to a duplicate ID were reassigned to the canonical ID where the annotator
had not already annotated it, and second opinions by the same annotator were
dropped. The pre-deduplication files are preserved alongside the release for full
reproducibility.

Datasets that share a source paper (e.g. the KLEJ, ParsiNLU, XGLUE, NADI, and
X-CSQA/X-CODAH families) are **not** duplicates: the unit of analysis is the
dataset, and each sub-resource keeps its own row.

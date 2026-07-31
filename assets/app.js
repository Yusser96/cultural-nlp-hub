/* Cultural-NLP Dataset Hub — faceted catalog over window.DATASETS.
   Filter semantics: OR within a facet, AND across facets. */

"use strict";

/* ------------------------------------------------------------------ config */

// Set once after creating the GitHub repository. The submission link points
// at the structured issue form in .github/ISSUE_TEMPLATE/submit-dataset.yml.
const REPO = "Yusser96/cultural-nlp-hub";
const SUBMIT_URL = `https://github.com/${REPO}/issues/new?template=submit-dataset.yml`;
const PAPER_URL = `https://github.com/${REPO}#paper`;

// Annotation form for one existing dataset, prefilled via issue-form
// query parameters (keyed by the form fields' ids).
function annotateURL(r) {
  const name = r.dataset || r.title;
  return `https://github.com/${REPO}/issues/new?template=submit-annotation.yml` +
    `&title=${encodeURIComponent("[Annotation] " + name)}` +
    `&dataset=${encodeURIComponent(name)}` +
    `&paper-title=${encodeURIComponent(r.title)}`;
}

/* ------------------------------------------------------------------ facets */

const FLAG_KEYS = ["refusal", "agentic", "safety", "robustness"];

const FACETS = [
  { key: "mode", label: "Representational mode",
    values: r => (r.modes.length ? r.modes : ["uncoded"]), open: true },
  { key: "branches", label: "Taxonomy branch",
    values: r => r.branches, open: true },
  { key: "categories", label: "Category",
    values: r => r.categories, open: true, searchable: true, top: 14 },
  { key: "languages", label: "Languages",
    values: r => r.languages, open: true, searchable: true, top: 12 },
  { key: "regions", label: "Regions",
    values: r => r.regions, searchable: true, top: 12 },
  { key: "families", label: "Evaluated model family",
    values: r => r.families, searchable: true, top: 12 },
  { key: "task", label: "Task type",
    values: r => (r.task ? [r.task] : []), searchable: true, top: 10 },
  ...FLAG_KEYS.map(k => ({
    key: k, label: k[0].toUpperCase() + k.slice(1) + " evaluated",
    values: r => r.flag_values[k],
  })),
  { key: "year", label: "Year",
    values: r => (r.year ? [String(r.year)] : []), top: 8 },
];

const MODE_LABELS = { C: "C — culture-isolating", CL: "CL — entangled", L: "L — linguistic form", uncoded: "uncoded" };

/* ------------------------------------------------------------------- state */

const state = {
  search: "",
  selected: new Map(FACETS.map(f => [f.key, new Set()])),
  sort: "year-desc",
  facetSearch: new Map(),
  facetExpanded: new Map(),
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* --------------------------------------------------------------- filtering */

function matchesFacet(record, facet) {
  const sel = state.selected.get(facet.key);
  if (!sel.size) return true;
  return facet.values(record).some(v => sel.has(v));
}

function matchesSearch(record) {
  if (!state.search) return true;
  const q = state.search.toLowerCase();
  return (record.dataset + " " + record.title).toLowerCase().includes(q);
}

function filtered(excludeFacetKey) {
  return window.DATASETS.filter(r =>
    matchesSearch(r) &&
    FACETS.every(f => f.key === excludeFacetKey || matchesFacet(r, f)));
}

/* ----------------------------------------------------------------- sorting */

const SORTS = {
  "year-desc": (a, b) => (b.year || 0) - (a.year || 0) || a.dataset.localeCompare(b.dataset),
  "year-asc":  (a, b) => (a.year || 9999) - (b.year || 9999) || a.dataset.localeCompare(b.dataset),
  "citations": (a, b) => (b.citations || 0) - (a.citations || 0),
  "name":      (a, b) => a.dataset.localeCompare(b.dataset),
};

/* -------------------------------------------------------------- query line */

function renderQueryLine(results) {
  const line = $("#query-line");
  const parts = [
    `<span class="query-count">${results.length} of ${window.DATASETS.length} datasets</span>`,
  ];
  if (state.search) {
    parts.push(chipHTML("search", state.search, `“${esc(state.search)}”`));
  }
  for (const facet of FACETS) {
    const sel = [...state.selected.get(facet.key)];
    if (!sel.length) continue;
    const joined = sel.map(v =>
      chipHTML(facet.key, v, esc(facet.key === "mode" ? v : v))).join('<span> ∨ </span>');
    parts.push(`<span>· ${esc(shortLabel(facet))}: </span>${joined}`);
  }
  line.innerHTML = parts.join(" ");
  line.querySelectorAll(".query-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (chip.dataset.facet === "search") {
        state.search = "";
        $("#search").value = "";
      } else {
        state.selected.get(chip.dataset.facet).delete(chip.dataset.value);
      }
      render();
    });
  });
  $("#clear-all").hidden = !hasAnyFilter();
}

function chipHTML(facetKey, value, label) {
  return `<button class="query-chip" data-facet="${esc(facetKey)}" data-value="${esc(value)}"
    title="Remove this filter">${label}<span class="x">×</span></button>`;
}

function shortLabel(facet) {
  return { branches: "branch", categories: "category", mode: "mode",
    languages: "languages", regions: "regions", families: "models",
    task: "task", year: "year" }[facet.key] || facet.key;
}

function hasAnyFilter() {
  return Boolean(state.search) || FACETS.some(f => state.selected.get(f.key).size);
}

/* ------------------------------------------------------------------ facets */

function renderFacets() {
  const host = $("#facets");
  host.querySelectorAll(".facet").forEach(el => el.remove());

  for (const facet of FACETS) {
    // Proper faceted counts: apply every other facet, not this one.
    const pool = filtered(facet.key);
    const counts = new Map();
    for (const r of pool) {
      for (const v of facet.values(r)) counts.set(v, (counts.get(v) || 0) + 1);
    }
    const sel = state.selected.get(facet.key);
    for (const v of sel) if (!counts.has(v)) counts.set(v, 0);

    let options = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    if (facet.key === "year") options.sort((a, b) => Number(b[0]) - Number(a[0]));
    if (facet.key === "mode") {
      const order = ["C", "CL", "L", "uncoded"];
      options.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    }

    const q = (state.facetSearch.get(facet.key) || "").toLowerCase();
    if (q) options = options.filter(([v]) => v.toLowerCase().includes(q));

    const expanded = state.facetExpanded.get(facet.key);
    const limit = facet.top && !expanded && !q ? facet.top : Infinity;
    const hidden = Math.max(0, options.length - limit);
    const shown = options.slice(0, limit);

    const details = document.createElement("details");
    details.className = "facet";
    details.open = facet.open || sel.size > 0;
    details.innerHTML = `
      <summary>${esc(facet.label)}
        ${sel.size ? `<span class="facet-active-count">${sel.size}</span>` : ""}
      </summary>
      <div class="facet-body">
        ${facet.searchable ? `<input class="facet-search" type="search"
            placeholder="Filter ${esc(facet.label.toLowerCase())}&hellip;"
            value="${esc(state.facetSearch.get(facet.key) || "")}"
            aria-label="Search within ${esc(facet.label)}">` : ""}
        ${shown.map(([v, n]) => `
          <label class="facet-option${n === 0 ? " zero" : ""}">
            <input type="checkbox" value="${esc(v)}" ${sel.has(v) ? "checked" : ""}>
            <span>${esc(facet.key === "mode" ? MODE_LABELS[v] || v : v)}</span>
            <span class="n">${n}</span>
          </label>`).join("")}
        ${hidden > 0 ? `<button class="facet-more">Show ${hidden} more</button>` : ""}
        ${expanded && facet.top ? `<button class="facet-more">Show fewer</button>` : ""}
      </div>`;

    details.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        cb.checked ? sel.add(cb.value) : sel.delete(cb.value);
        render();
      });
    });
    const fs = details.querySelector(".facet-search");
    if (fs) fs.addEventListener("input", () => {
      state.facetSearch.set(facet.key, fs.value);
      renderFacets();
      const again = host.querySelector(`details[data-key="${facet.key}"] .facet-search`);
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    details.querySelectorAll(".facet-more").forEach(btn =>
      btn.addEventListener("click", () => {
        state.facetExpanded.set(facet.key, !expanded);
        renderFacets();
      }));
    details.dataset.key = facet.key;
    host.appendChild(details);
  }
}

/* -------------------------------------------------------------------- rows */

// "(n)" suffix for a value shared by n of the record's annotations —
// only meaningful once a record has more than one annotation.
function countSuffix(r, n) {
  return r.annotations.length > 1 && n > 0 ? ` (${n})` : "";
}

function rowHTML(r) {
  const mode = r.mode || "none";
  const langs = r.languages.slice(0, 4).join(", ") +
    (r.languages.length > 4 ? ` +${r.languages.length - 4}` : "");

  // One tag per distinct branch :: category pair across all annotations.
  const pairTags = Object.entries(r.pair_counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([pair, n]) => `<span class="tag">${esc(pair)}${countSuffix(r, n)}</span>`);

  // When annotators disagree on the mode, surface the distribution.
  const modeTag = Object.keys(r.mode_counts).length > 1
    ? `<span class="tag">mode: ${Object.entries(r.mode_counts)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `${esc(m)}(${n})`).join(" ∨ ")}</span>`
    : "";

  const flagTags = FLAG_KEYS
    .filter(k => r.flag_yes[k] > 0)
    .map(k => `<span class="tag flag-yes">${esc(k)}${countSuffix(r, r.flag_yes[k])}</span>`);

  const tags = [
    ...pairTags,
    modeTag,
    r.languages.length ? `<span class="tag">${esc(langs)}</span>` : "",
    ...r.families.slice(0, 3).map(f => `<span class="tag">${esc(f)}</span>`),
    ...flagTags,
  ].filter(Boolean).join("");

  return `<li><details class="row mode-${mode}">
    <summary>
      <span class="mode mode-${mode}">${mode === "none" ? "—" : esc(r.mode)}</span>
      <span class="row-name">${esc(r.dataset || r.title)}<span class="row-year">${r.year || ""}</span></span>
      <span class="row-open-hint"><a class="row-annotate" href="${esc(annotateURL(r))}"
        title="Add your own annotation of this dataset">+ annotate</a> · details</span>
      <span class="row-title">${esc(r.title)}</span>
      <span class="row-tags">${tags}</span>
    </summary>
    <dl class="row-detail">
      <div class="links" style="grid-column:1/-1">
        ${r.paper ? `<a href="${esc(r.paper)}" target="_blank" rel="noopener">Paper ↗</a>` : ""}
        ${r.data ? `<a href="${esc(r.data)}" target="_blank" rel="noopener">Data ↗</a>` : ""}
        ${r.hf ? `<span class="tag">on HuggingFace</span>` : ""}
        ${r.venue ? `<span class="tag">${esc(r.venue)}</span>` : ""}
        ${r.citations != null ? `<span class="tag">${r.citations} citations</span>` : ""}
      </div>
      ${dd("Languages", r.languages.join(", "))}
      ${dd("Regions", r.regions.join(", "))}
      ${dd("Task · format", [r.task, r.format].filter(Boolean).join(" · "))}
      ${dd("Evaluated models", r.models.join("; "))}
      ${r.mode_notes ? dd("Mode rationale", r.mode_notes) : ""}
      ${r.example ? `<div style="grid-column:1/-1"><dt>Example</dt><dd class="example">${esc(r.example)}</dd></div>` : ""}
      <div style="grid-column:1/-1">
        <dt>Annotations (${r.annotations.length}) —
          <a class="row-annotate" href="${esc(annotateURL(r))}">add yours ↗</a></dt>
        <dd><table class="ann-table">
          <tr><th>Annotator</th><th>Mode</th><th>Branch :: category</th><th>Flags</th></tr>
          ${r.annotations.map(a => `<tr>
            <td>${esc(a.who)}</td>
            <td>${a.mode ? `<span class="mode mode-${esc(a.mode)}">${esc(a.mode)}</span>` : "—"}</td>
            <td>${a.pairs.length ? esc(a.pairs.join("; ")) : "—"}</td>
            <td>${FLAG_KEYS.filter(k => a.flags[k] === "Yes").map(esc).join(", ") ||
                 (FLAG_KEYS.some(k => a.flags[k]) ? "none" : "—")}</td>
          </tr>`).join("")}
        </table></dd>
      </div>
    </dl>
  </details></li>`;
}

function dd(label, value) {
  return value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : "";
}

/* ------------------------------------------------------------------ export */

function exportCSV(results) {
  const cols = ["dataset", "title", "year", "venue", "branches", "categories", "modes",
    "branch_categories", "languages", "regions", "task", "format", "families", "models",
    "refusal", "agentic", "safety", "robustness", "annotators", "paper", "data", "citations"];
  const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  for (const r of results) {
    lines.push(cols.map(c => {
      if (FLAG_KEYS.includes(c)) {
        const n = r.annotations.length;
        return cell(n > 1 ? `${r.flag_yes[c]}/${n} Yes` : (r.flag_values[c][0] || ""));
      }
      if (c === "branch_categories") {
        return cell(Object.entries(r.pair_counts).map(([p, n]) => `${p} (${n})`).join("; "));
      }
      if (c === "annotators") return cell(r.annotations.map(a => a.who).join("; "));
      const v = r[c];
      return cell(Array.isArray(v) ? v.join("; ") : v);
    }).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cultural_nlp_datasets_filtered.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* --------------------------------------------------------------- URL state
   Filters serialize into the hash so any filtered view is a shareable link,
   e.g. #mode=C&categories=Values - bias&languages=English|Spanish|German */

function writeHash() {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search);
  for (const facet of FACETS) {
    const sel = [...state.selected.get(facet.key)];
    if (sel.length) params.set(facet.key, sel.join("|"));
  }
  const hash = params.toString();
  history.replaceState(null, "", hash ? "#" + hash : location.pathname);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.search = params.get("q") || "";
  $("#search").value = state.search;
  for (const facet of FACETS) {
    const raw = params.get(facet.key);
    state.selected.set(facet.key, new Set(raw ? raw.split("|") : []));
  }
}

/* ------------------------------------------------------------------ render */

function render() {
  const results = filtered(null).sort(SORTS[state.sort]);
  writeHash();
  renderQueryLine(results);
  renderFacets();
  $("#rows").innerHTML = results.map(rowHTML).join("");
  $("#empty").hidden = results.length > 0;
}

/* -------------------------------------------------------------------- init */

function init() {
  for (const el of ["#submit-link", "#footer-submit", "#empty-submit"]) {
    $(el).href = SUBMIT_URL;
  }
  $("#paper-link").href = PAPER_URL;

  $("#search").addEventListener("input", e => {
    state.search = e.target.value.trim();
    render();
  });
  $("#sort").addEventListener("change", e => {
    state.sort = e.target.value;
    render();
  });
  $("#export").addEventListener("click", () => exportCSV(filtered(null).sort(SORTS[state.sort])));
  window.addEventListener("hashchange", () => { readHash(); render(); });

  // "+ annotate" links sit inside <summary>; open them without toggling the row.
  $("#rows").addEventListener("click", e => {
    const link = e.target.closest(".row-annotate");
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      window.open(link.href, "_blank", "noopener");
    }
  });
  $("#clear-all").addEventListener("click", () => {
    state.search = "";
    $("#search").value = "";
    state.selected.forEach(s => s.clear());
    state.facetSearch.clear();
    render();
  });

  readHash();
  render();
}

document.addEventListener("DOMContentLoaded", init);

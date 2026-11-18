const state = {
  facets: { regions: [], datacenters: [], memorySizes: [], cores: [], threads: [] },
  selectedDatacenters: new Set(),
  selectedMemorySizes: new Set(),
  selectedCores: new Set(),
  selectedThreads: new Set(),
  watchlist: [],
  page: 1,
  pageSize: 50,
  sort: { key: null, dir: "asc" },
};

const els = {
  q: document.getElementById("f-q"),
  region: document.getElementById("f-region"),
  availability: document.getElementById("f-availability"),
  storage: document.getElementById("f-storage"),
  memToggle: document.getElementById("mem-toggle"),
  memList: document.getElementById("mem-list"),
  coresToggle: document.getElementById("cores-toggle"),
  coresList: document.getElementById("cores-list"),
  threadsToggle: document.getElementById("threads-toggle"),
  threadsList: document.getElementById("threads-list"),
  dcToggle: document.getElementById("dc-toggle"),
  dcList: document.getElementById("dc-list"),
  reset: document.getElementById("f-reset"),
  priceHeader: document.getElementById("price-header"),
  meta: document.getElementById("catalog-meta"),
  rows: document.getElementById("catalog-rows"),
  pagination: document.getElementById("pagination-controls"),
  watchRows: document.getElementById("watchlist-rows"),
  webhookForm: document.getElementById("webhook-form"),
  webhookUrl: document.getElementById("wh-url"),
  webhookSecret: document.getElementById("wh-secret"),
  webhookList: document.getElementById("webhook-list"),
};

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function buildCheckboxList(container, values, selectedSet, toggleLabelFn, onChange) {
  container.innerHTML = "";
  for (const value of values) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = selectedSet.has(value);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedSet.add(value);
      else selectedSet.delete(value);
      toggleLabelFn();
      onChange();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(String(value)));
    container.appendChild(label);
  }
}

async function loadFacets() {
  const res = await fetch("/api/catalog/facets");
  const data = await res.json();
  state.facets = data.facets;

  buildCheckboxList(els.dcList, state.facets.datacenters, state.selectedDatacenters, updateDcToggleLabel, loadCatalog);
  buildCheckboxList(els.memList, state.facets.memorySizes, state.selectedMemorySizes, updateMemToggleLabel, loadCatalog);
  buildCheckboxList(els.coresList, state.facets.cores, state.selectedCores, updateCoresToggleLabel, loadCatalog);
  buildCheckboxList(els.threadsList, state.facets.threads, state.selectedThreads, updateThreadsToggleLabel, loadCatalog);
}

function updateCoresToggleLabel() {
  const n = state.selectedCores.size;
  els.coresToggle.textContent = n > 0 ? `Cores (${n}) ▾` : "Cores ▾";
}

function updateThreadsToggleLabel() {
  const n = state.selectedThreads.size;
  els.threadsToggle.textContent = n > 0 ? `Threads (${n}) ▾` : "Threads ▾";
}

function updateDcToggleLabel() {
  const n = state.selectedDatacenters.size;
  els.dcToggle.textContent = n > 0 ? `Datacenters (${n}) ▾` : "Datacenters ▾";
}

function updateMemToggleLabel() {
  const n = state.selectedMemorySizes.size;
  els.memToggle.textContent = n > 0 ? `Memory (${n}) ▾` : "Memory ▾";
}

function buildFilterQuery() {
  const params = new URLSearchParams();
  if (els.q.value.trim()) params.set("q", els.q.value.trim());
  if (els.region.value) params.set("region", els.region.value);
  if (els.availability.value) params.set("availability", els.availability.value);
  if (els.storage.value.trim()) params.set("storage", els.storage.value.trim());
  if (state.selectedDatacenters.size) params.set("datacenter", [...state.selectedDatacenters].join(","));
  if (state.selectedMemorySizes.size) params.set("memory", [...state.selectedMemorySizes].join(","));
  if (state.selectedCores.size) params.set("cores", [...state.selectedCores].join(","));
  if (state.selectedThreads.size) params.set("threads", [...state.selectedThreads].join(","));
  if (state.sort.key) {
    params.set("sort", state.sort.key);
    params.set("dir", state.sort.dir);
  }
  return params.toString();
}

function buildQuery() {
  const params = new URLSearchParams(buildFilterQuery());
  if (state.page > 1) params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params.toString();
}

function restoreFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  els.q.value = params.get("q") ?? "";
  els.region.value = params.get("region") ?? "";
  els.availability.value = params.get("availability") ?? "available";
  els.storage.value = params.get("storage") ?? "";

  const dc = params.get("datacenter");
  if (dc) for (const d of dc.split(",")) state.selectedDatacenters.add(d);

  const mem = params.get("memory");
  if (mem) {
    for (const m of mem.split(",")) {
      const n = Number.parseInt(m, 10);
      if (Number.isFinite(n)) state.selectedMemorySizes.add(n);
    }
  }

  for (const [key, set] of [["cores", state.selectedCores], ["threads", state.selectedThreads]]) {
    const raw = params.get(key);
    if (!raw) continue;
    for (const v of raw.split(",")) {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) set.add(n);
    }
  }

  const page = Number.parseInt(params.get("page") ?? "1", 10);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;

  const sortKey = params.get("sort");
  if (sortKey === "price") {
    state.sort.key = "price";
    state.sort.dir = params.get("dir") === "desc" ? "desc" : "asc";
  }
}

function updatePriceHeaderIndicator() {
  if (state.sort.key === "price") {
    els.priceHeader.textContent = `Price / mo ${state.sort.dir === "asc" ? "▲" : "▼"}`;
  } else {
    els.priceHeader.textContent = "Price / mo";
  }
}

function updateUrlFromFilters() {
  const qs = buildQuery();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", url);
}

function isWatched(entry) {
  return state.watchlist.some(
    (w) => w.region === entry.region && w.fqn === entry.fqn && w.datacenter === entry.datacenter,
  );
}

let catalogRequestSeq = 0;

let lastFilterQuery = null;

async function loadCatalog() {
  const filterQuery = buildFilterQuery();
  if (lastFilterQuery !== null && filterQuery !== lastFilterQuery) state.page = 1;
  lastFilterQuery = filterQuery;
  updateUrlFromFilters();
  updatePriceHeaderIndicator();
  const requestSeq = ++catalogRequestSeq;
  const res = await fetch(`/api/catalog?${buildQuery()}`);
  const data = await res.json();
  if (requestSeq !== catalogRequestSeq) return; // a newer request has since been issued; discard this stale response
  els.rows.innerHTML = "";

  const totalPages = Math.max(1, Math.ceil(data.total / state.pageSize));
  if (state.page > totalPages) {
    state.page = totalPages;
    return loadCatalog();
  }
  const from = data.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const to = (state.page - 1) * state.pageSize + data.entries.length;
  const countText = `${data.total} result(s), showing ${from}–${to}`;

  if (data.degradedRegions?.length) {
    els.meta.textContent = `${countText} — warning: ${data.degradedRegions.join(", ")} region data may be stale (upstream fetch failed)`;
  } else {
    els.meta.textContent = countText;
  }

  for (const entry of data.entries) {
    const tr = document.createElement("tr");
    const watched = isWatched(entry);
    tr.innerHTML = `
      <td>${entry.region.toUpperCase()}</td>
      <td>${entry.planCode}</td>
      <td>${entry.server}</td>
      <td>${entry.datacenter}</td>
      <td>${entry.cpu?.model ?? "–"}</td>
      <td>${entry.cpu?.cores ?? "–"}</td>
      <td>${entry.cpu?.threads ?? "–"}</td>
      <td>${entry.memory ?? "–"}</td>
      <td>${entry.storage ?? "–"}</td>
      <td>${entry.price ? entry.price.formatted : "–"}</td>
      <td><span class="badge ${entry.classification}">${entry.rawAvailability}</span></td>
      <td></td>
    `;
    const cell = tr.querySelector("td:last-child");
    const btn = document.createElement("button");
    btn.className = watched ? "unwatch" : "watch";
    btn.textContent = watched ? "Watching" : "Watch";
    btn.disabled = watched;
    btn.addEventListener("click", () => addToWatchlist(entry));
    cell.appendChild(btn);
    els.rows.appendChild(tr);
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = els.pagination;
  container.innerHTML = "";
  if (totalPages <= 1) return;
  const mk = (label, page, disabled) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "secondary";
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", () => {
      state.page = page;
      loadCatalog();
      els.rows.closest(".table-wrap")?.scrollIntoView({ block: "start" });
    });
    return b;
  };
  const info = document.createElement("span");
  info.textContent = ` Page ${state.page} of ${totalPages} `;
  info.style.margin = "0 0.75rem";
  container.append(mk("‹ Prev", state.page - 1, state.page <= 1), info, mk("Next ›", state.page + 1, state.page >= totalPages));
}

async function addToWatchlist(entry) {
  await fetch("/api/watchlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  await loadWatchlist();
  await loadCatalog();
}

async function removeFromWatchlist(id) {
  await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
  await loadWatchlist();
  await loadCatalog();
}

async function loadWatchlist() {
  const res = await fetch("/api/watchlist");
  const data = await res.json();
  state.watchlist = data.items;
  els.watchRows.innerHTML = "";
  for (const item of data.items) {
    const tr = document.createElement("tr");
    const status = item.lastStatus ?? "pending";
    tr.innerHTML = `
      <td>${item.region.toUpperCase()}</td>
      <td>${item.planCode}</td>
      <td>${item.datacenter}</td>
      <td><span class="badge ${status === "available" ? "available" : "not_available"}">${status}</span></td>
      <td>${item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString() : "never"}</td>
      <td></td>
    `;
    const cell = tr.querySelector("td:last-child");
    const btn = document.createElement("button");
    btn.className = "unwatch";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => removeFromWatchlist(item.id));
    cell.appendChild(btn);
    els.watchRows.appendChild(tr);
  }
}

async function loadWebhooks() {
  const res = await fetch("/api/webhooks");
  const data = await res.json();
  els.webhookList.innerHTML = "";
  for (const hook of data.items) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${hook.url}${hook.hasSecret ? " 🔒" : ""}</span>`;

    const status = document.createElement("span");
    status.className = "webhook-test-status";
    li.appendChild(status);

    const testBtn = document.createElement("button");
    testBtn.textContent = "Test";
    testBtn.className = "test";
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      status.textContent = "Sending…";
      status.className = "webhook-test-status";
      try {
        const res = await fetch(`/api/webhooks/${hook.id}/test`, { method: "POST" });
        const result = await res.json();
        if (result.ok) {
          status.textContent = `✓ ${result.statusCode}`;
          status.className = "webhook-test-status ok";
        } else {
          status.textContent = `✗ ${result.error ?? result.statusCode ?? "failed"}`;
          status.className = "webhook-test-status fail";
        }
      } catch {
        status.textContent = "✗ request failed";
        status.className = "webhook-test-status fail";
      } finally {
        testBtn.disabled = false;
      }
    });
    li.appendChild(testBtn);

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.addEventListener("click", async () => {
      await fetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
      await loadWebhooks();
    });
    li.appendChild(btn);
    els.webhookList.appendChild(li);
  }
}

els.webhookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = els.webhookUrl.value.trim();
  if (!url) return;
  const secret = els.webhookSecret.value.trim();
  const res = await fetch("/api/webhooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret: secret || undefined }),
  });
  if (res.ok) {
    els.webhookUrl.value = "";
    els.webhookSecret.value = "";
    await loadWebhooks();
  } else {
    const body = await res.json().catch(() => ({}));
    alert(body.error ?? "Could not add webhook");
  }
});

for (const [toggle, list] of [
  [els.dcToggle, els.dcList],
  [els.memToggle, els.memList],
  [els.coresToggle, els.coresList],
  [els.threadsToggle, els.threadsList],
]) {
  toggle.addEventListener("click", () => list.classList.toggle("hidden"));
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dc-filter")) {
    els.dcList.classList.add("hidden");
    els.memList.classList.add("hidden");
    els.coresList.classList.add("hidden");
    els.threadsList.classList.add("hidden");
  }
});

els.reset.addEventListener("click", () => {
  els.q.value = "";
  els.region.value = "";
  els.availability.value = "all";
  els.storage.value = "";
  state.selectedDatacenters.clear();
  state.selectedMemorySizes.clear();
  state.selectedCores.clear();
  state.selectedThreads.clear();
  state.sort.key = null;
  state.sort.dir = "asc";
  updateDcToggleLabel();
  updateMemToggleLabel();
  updateCoresToggleLabel();
  updateThreadsToggleLabel();
  for (const cb of [...els.coresList.querySelectorAll("input"), ...els.threadsList.querySelectorAll("input")]) cb.checked = false;
  for (const cb of els.dcList.querySelectorAll("input")) cb.checked = false;
  for (const cb of els.memList.querySelectorAll("input")) cb.checked = false;
  loadCatalog();
});

els.priceHeader.addEventListener("click", () => {
  if (state.sort.key === "price") {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = "price";
    state.sort.dir = "asc";
  }
  loadCatalog();
});

const debouncedLoadCatalog = debounce(loadCatalog, 250);
for (const el of [els.q, els.storage]) el.addEventListener("input", debouncedLoadCatalog);
for (const el of [els.region, els.availability]) {
  el.addEventListener("change", loadCatalog);
}

async function init() {
  restoreFiltersFromUrl();
  await loadFacets();
  updateDcToggleLabel();
  updateMemToggleLabel();
  updateCoresToggleLabel();
  updateThreadsToggleLabel();
  await loadWatchlist();
  await loadCatalog();
  await loadWebhooks();
  setInterval(loadWatchlist, 30000);
}

init();

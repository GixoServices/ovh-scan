const state = {
  facets: { regions: [], datacenters: [], memorySizes: [] },
  selectedDatacenters: new Set(),
  selectedMemorySizes: new Set(),
  watchlist: [],
  sort: { key: null, dir: "asc" },
};

const els = {
  q: document.getElementById("f-q"),
  region: document.getElementById("f-region"),
  availability: document.getElementById("f-availability"),
  storage: document.getElementById("f-storage"),
  memToggle: document.getElementById("mem-toggle"),
  memList: document.getElementById("mem-list"),
  dcToggle: document.getElementById("dc-toggle"),
  dcList: document.getElementById("dc-list"),
  reset: document.getElementById("f-reset"),
  priceHeader: document.getElementById("price-header"),
  meta: document.getElementById("catalog-meta"),
  rows: document.getElementById("catalog-rows"),
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
}

function updateDcToggleLabel() {
  const n = state.selectedDatacenters.size;
  els.dcToggle.textContent = n > 0 ? `Datacenters (${n}) ▾` : "Datacenters ▾";
}

function updateMemToggleLabel() {
  const n = state.selectedMemorySizes.size;
  els.memToggle.textContent = n > 0 ? `Memory (${n}) ▾` : "Memory ▾";
}

function buildQuery() {
  const params = new URLSearchParams();
  if (els.q.value.trim()) params.set("q", els.q.value.trim());
  if (els.region.value) params.set("region", els.region.value);
  if (els.availability.value) params.set("availability", els.availability.value);
  if (els.storage.value.trim()) params.set("storage", els.storage.value.trim());
  if (state.selectedDatacenters.size) params.set("datacenter", [...state.selectedDatacenters].join(","));
  if (state.selectedMemorySizes.size) params.set("memory", [...state.selectedMemorySizes].join(","));
  if (state.sort.key) {
    params.set("sort", state.sort.key);
    params.set("dir", state.sort.dir);
  }
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

function sortEntries(entries) {
  if (state.sort.key !== "price") return entries;
  const dir = state.sort.dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.price === null && b.price === null) return 0;
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return (a.price.amount - b.price.amount) * dir;
  });
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

async function loadCatalog() {
  updateUrlFromFilters();
  updatePriceHeaderIndicator();
  const requestSeq = ++catalogRequestSeq;
  const res = await fetch(`/api/catalog?${buildQuery()}`);
  const data = await res.json();
  if (requestSeq !== catalogRequestSeq) return; // a newer request has since been issued; discard this stale response
  els.rows.innerHTML = "";

  if (data.degradedRegions?.length) {
    els.meta.textContent = `${data.entries.length} result(s) — warning: ${data.degradedRegions.join(", ")} region data may be stale (upstream fetch failed)`;
  } else {
    els.meta.textContent = `${data.entries.length} result(s)`;
  }

  for (const entry of sortEntries(data.entries)) {
    const tr = document.createElement("tr");
    const watched = isWatched(entry);
    tr.innerHTML = `
      <td>${entry.region.toUpperCase()}</td>
      <td>${entry.planCode}</td>
      <td>${entry.server}</td>
      <td>${entry.datacenter}</td>
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
]) {
  toggle.addEventListener("click", () => list.classList.toggle("hidden"));
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dc-filter")) {
    els.dcList.classList.add("hidden");
    els.memList.classList.add("hidden");
  }
});

els.reset.addEventListener("click", () => {
  els.q.value = "";
  els.region.value = "";
  els.availability.value = "all";
  els.storage.value = "";
  state.selectedDatacenters.clear();
  state.selectedMemorySizes.clear();
  state.sort.key = null;
  state.sort.dir = "asc";
  updateDcToggleLabel();
  updateMemToggleLabel();
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
  await loadWatchlist();
  await loadCatalog();
  await loadWebhooks();
  setInterval(loadWatchlist, 30000);
}

init();

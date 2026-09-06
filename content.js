(() => {
  const RESERVED_ROOTS = new Set([
    "explore", "reels", "reel", "p", "stories", "direct", "accounts",
    "about", "developer", "legal", "privacy", "tv", "challenge", ""
  ]);

  const COUNT_OPTIONS = [25, 50, 100, 200, 500, 1000, 2000, "all"];
  const SORT_MODES = [
    { key: "date", label: "Date (newest)" },
    { key: "likes", label: "Likes" },
    { key: "views", label: "Views" },
    { key: "comments", label: "Comments" },
    { key: "engagement", label: "Engagement" },
  ];

  let currentUsername = null;
  let items = [];              // fetched posts for the current run
  let sortMode = "date";
  let followerCount = 0;
  let indexing = false;
  let dateFrom = null;          // ms epoch, inclusive
  let dateTo = null;            // ms epoch, inclusive

  const PROFILE_SUBPATHS = new Set(["reels", "tagged", "saved", "channel"]);

  function getUsernameFromPath() {
    const segs = location.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    const first = segs[0].toLowerCase();
    if (RESERVED_ROOTS.has(first)) return null;
    if (segs.length === 1) return segs[0];
    if (segs.length === 2 && PROFILE_SUBPATHS.has(segs[1].toLowerCase())) return segs[0];
    return null;
  }



  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  function buildUI() {
    if (document.getElementById("fnd-root")) return;

    const root = el("div", { id: "fnd-root" });
    const toggle = el("button", { id: "fnd-toggle", title: "Findeed — sort & search this profile" });
    toggle.textContent = "🔎";

    const panel = el("div", { id: "fnd-panel" });

    const header = el("div", { id: "fnd-header" });
    header.appendChild(el("div", { id: "fnd-title", text: "Findeed" }));

    const countRow = el("div", { id: "fnd-count-row" });
    countRow.appendChild(el("span", { class: "fnd-label", text: "Posts to scan" }));
    const countSelect = el("select", { id: "fnd-count" });
    COUNT_OPTIONS.forEach((c) => {
      const opt = el("option", { value: String(c), text: c === "all" ? "All items" : `Latest ${c}` });
      if (c === "all") opt.setAttribute("selected", "selected");
      countSelect.appendChild(opt);
    });
    countRow.appendChild(countSelect);
    header.appendChild(countRow);

    const sortRow = el("div", { id: "fnd-sort-row" });
    SORT_MODES.forEach((s) => {
      const btn = el("button", { class: "fnd-sort-btn", "data-sort": s.key, text: s.label });
      if (s.key === sortMode) btn.classList.add("fnd-sort-active");
      btn.addEventListener("click", () => {
        sortMode = s.key;
        document.querySelectorAll(".fnd-sort-btn").forEach((b) => b.classList.remove("fnd-sort-active"));
        btn.classList.add("fnd-sort-active");
        renderResults(search.value);
      });
      sortRow.appendChild(btn);
    });
    header.appendChild(sortRow);

    const dateRow = el("div", { id: "fnd-date-row" });
    dateRow.appendChild(el("span", { class: "fnd-label", text: "Date range" }));
    const dateFromInput = el("input", { id: "fnd-date-from", type: "date" });
    const dateToInput = el("input", { id: "fnd-date-to", type: "date" });
    const dateReset = el("button", { id: "fnd-date-reset", text: "Reset", type: "button" });
    dateRow.appendChild(dateFromInput);
    dateRow.appendChild(el("span", { class: "fnd-date-sep", text: "–" }));
    dateRow.appendChild(dateToInput);
    dateRow.appendChild(dateReset);
    header.appendChild(dateRow);

    dateFromInput.addEventListener("change", () => {
      dateFrom = dateFromInput.value ? new Date(dateFromInput.value + "T00:00:00").getTime() : null;
      renderResults(search.value);
    });
    dateToInput.addEventListener("change", () => {
      dateTo = dateToInput.value ? new Date(dateToInput.value + "T23:59:59").getTime() : null;
      renderResults(search.value);
    });
    dateReset.addEventListener("click", () => {
      dateFrom = null;
      dateTo = null;
      dateFromInput.value = window.fndFullRangeFrom || "";
      dateToInput.value = window.fndFullRangeTo || "";
      renderResults(search.value);
    });

    window.fndDateFromEl = dateFromInput;
    window.fndDateToEl = dateToInput;

    const runBtn = el("button", { id: "fnd-run-btn", text: "Fetch & sort" });
    header.appendChild(runBtn);

    const search = el("input", {
      id: "fnd-search",
      type: "text",
      placeholder: "Search captions in this list…",
      autocomplete: "off",
    });
    header.appendChild(search);

    const status = el("div", { id: "fnd-status", text: "Pick a count, then \"Fetch & sort\"." });
    header.appendChild(status);

    const results = el("div", { id: "fnd-results" });

    panel.appendChild(header);
    panel.appendChild(results);
    root.appendChild(toggle);
    root.appendChild(panel);
    document.body.appendChild(root);

    toggle.addEventListener("click", () => panel.classList.toggle("fnd-open"));
    search.addEventListener("input", () => renderResults(search.value));
    runBtn.addEventListener("click", () => {
      if (!indexing) startIndexing(countSelect.value);
    });

    window.fndSetStatus = (text) => { status.textContent = text; };
    window.fndSetRunEnabled = (enabled, label) => {
      runBtn.disabled = !enabled;
      if (label) runBtn.textContent = label;
    };
    window.fndResultsEl = results;
    window.fndSearchEl = search;
    window.fndCountSelectEl = countSelect;
  }

  function formatCount(n) {
    n = n || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function engagementRate(item) {
    const denom = followerCount || item.viewCount || 1;
    return ((item.likeCount + item.commentCount) / denom) * 100;
  }

  function inDateRange(item) {
    if (!item.timestamp) return true; // don't hide undated items if extraction failed
    if (dateFrom && item.timestamp < dateFrom) return false;
    if (dateTo && item.timestamp > dateTo) return false;
    return true;
  }

  function sortedItems() {
    const arr = items.filter(inDateRange);
    switch (sortMode) {
      case "likes": return arr.sort((a, b) => b.likeCount - a.likeCount);
      case "views": return arr.sort((a, b) => b.viewCount - a.viewCount);
      case "comments": return arr.sort((a, b) => b.commentCount - a.commentCount);
      case "engagement": return arr.sort((a, b) => engagementRate(b) - engagementRate(a));
      case "date":
      default: return arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  }

  function renderResults(query) {
    const results = window.fndResultsEl;
    if (!results) return;
    results.innerHTML = "";

    const q = (query || "").trim().toLowerCase();
    let list = sortedItems();
    if (q) list = list.filter((it) => it.caption.toLowerCase().includes(q));

    if (list.length === 0) {
      results.appendChild(el("div", { id: "fnd-empty", text: items.length ? "No matching captions." : "No results yet." }));
      return;
    }

    list.forEach((item) => {
      const a = el("a", { class: "fnd-result", href: item.href, target: "_blank", rel: "noopener" });
      const img = el("img", { src: item.thumb || "", alt: "" });
      const wrap = el("div", { class: "fnd-result-text-wrap" });
      const metricParts = [];
      if (item.timestamp) metricParts.push(new Date(item.timestamp).toLocaleDateString());
      if (item.isVideo) metricParts.push(`${formatCount(item.viewCount)} views`);
      metricParts.push(`${formatCount(item.likeCount)} likes`);
      metricParts.push(`${formatCount(item.commentCount)} comments`);
      if (followerCount) metricParts.push(`${engagementRate(item).toFixed(1)}% eng.`);
      wrap.appendChild(el("div", { class: "fnd-result-metric", text: metricParts.join(" · ") }));
      if (q) {
        const textEl = el("div", { class: "fnd-result-text" });
        textEl.innerHTML = highlight(item.caption, q);
        wrap.appendChild(textEl);
      }
      a.appendChild(img);
      a.appendChild(wrap);
      results.appendChild(a);
    });
  }

  function escapeHtml(text) {
    return (text || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function highlight(text, q) {
    const escaped = escapeHtml(text);
    const idx = escaped.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escaped;
    return escaped.slice(0, idx) + "<mark>" + escaped.slice(idx, idx + q.length) + "</mark>" + escaped.slice(idx + q.length);
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function readFollowerCount() {
    const link = document.querySelector('a[href$="/followers/"], a[href*="/followers/"]');
    if (link) {
      const t = link.getAttribute("title") || link.textContent || "";
      const n = parseLooseCount(t.replace(/[^\d.,KkMm]/g, ""));
      if (n) return n;
    }
    const meta = document.querySelector('meta[property="og:description"]');
    if (meta) {
      const m = meta.getAttribute("content").match(/([\d,.]+[KMk]?)\s+Followers/i);
      if (m) return parseLooseCount(m[1]);
    }
    return 0;
  }

  function parseLooseCount(str) {
    if (!str) return 0;
    str = String(str).replace(/,/g, "").trim();
    const mult = /[Kk]$/.test(str) ? 1000 : /[Mm]$/.test(str) ? 1000000 : 1;
    const num = parseFloat(str);
    return Math.round((isNaN(num) ? 0 : num) * mult);
  }

  async function autoScrollUntil(targetCount, maxRounds = 4000) {
    const collected = new Map(); // href -> thumb, accumulated across rounds (Instagram virtualizes the grid, unmounting older posts as you scroll)

    function scanCurrentPosts() {
      document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach((a) => {
        const href = a.getAttribute("href");
        if (!href) return;
        const clean = new URL(href, location.origin).href.split("?")[0];
        if (!collected.has(clean)) {
          const img = a.querySelector("img");
          collected.set(clean, img && img.src ? img.src : "");
        }
      });
    }

    scanCurrentPosts();
    let stableRounds = 0;
    let lastCount = collected.size;

    for (let i = 0; i < maxRounds && stableRounds < 6; i++) {
      if (targetCount !== Infinity && collected.size >= targetCount) break;

      const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
      const lastAnchor = anchors[anchors.length - 1];
      if (lastAnchor) lastAnchor.scrollIntoView({ behavior: "instant", block: "end" });
      window.scrollBy(0, 1200);
      document.documentElement.scrollTop = document.documentElement.scrollHeight;
      document.body.scrollTop = document.body.scrollHeight;

      await sleep(900);
      scanCurrentPosts();
      if (collected.size === lastCount) stableRounds++; else stableRounds = 0;
      lastCount = collected.size;
      window.fndSetStatus && window.fndSetStatus(`Scrolling… found ${collected.size} posts`);
    }
    return collected; // Map href -> thumb
  }

  function decodeEntities(str) {
    return str
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  function extractPostData(html) {
    const data = { caption: "", isVideo: false, viewCount: 0, likeCount: 0, commentCount: 0, timestamp: 0 };

    // Legacy embedded JSON — Instagram mostly no longer serves this in the
    // plain fetched HTML, but keep it as a first try in case it reappears.
    const tsMatch = html.match(/"taken_at_timestamp":(\d+)/) || html.match(/"taken_at":(\d+)/);
    if (tsMatch) data.timestamp = parseInt(tsMatch[1], 10) * 1000;

    const viewMatch = html.match(/"video_view_count":(\d+)/) || html.match(/"play_count":(\d+)/);
    if (viewMatch) { data.isVideo = true; data.viewCount = parseInt(viewMatch[1], 10); }
    else if (/"is_video":true/.test(html) || /"__typename":"(?:XDT)?GraphVideo"/.test(html)) data.isVideo = true;

    const likeJsonMatch = html.match(/"edge_media_preview_like":\{"count":(\d+)/) || html.match(/"edge_liked_by":\{"count":(\d+)/);
    if (likeJsonMatch) data.likeCount = parseInt(likeJsonMatch[1], 10);

    const commentJsonMatch = html.match(/"edge_media_to_comment":\{"count":(\d+)/) || html.match(/"edge_media_to_parent_comment":\{"count":(\d+)/);
    if (commentJsonMatch) data.commentCount = parseInt(commentJsonMatch[1], 10);

    // Primary source: og:description. Current format is typically
    // "N likes, N comments - username on Month DD, YYYY: "caption""
    // (caption part is omitted entirely when the post has no caption).
    const metaMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
    if (metaMatch) {
      const content = decodeEntities(metaMatch[1]);

      if (!data.likeCount) {
        const m = content.match(/^([\d,.]+[KMk]?)\s+likes?/);
        if (m) data.likeCount = parseLooseCount(m[1]);
      }
      if (!data.commentCount) {
        const m = content.match(/,\s*([\d,.]+[KMk]?)\s+comments?/);
        if (m) data.commentCount = parseLooseCount(m[1]);
      }
      if (!data.viewCount) {
        const m = content.match(/^([\d,.]+[KMk]?)\s+views?/);
        if (m) { data.isVideo = true; data.viewCount = parseLooseCount(m[1]); }
      }
      if (!data.timestamp) {
        const m = content.match(/on ([A-Za-z]+ \d{1,2}, \d{4})/);
        if (m) {
          const parsed = Date.parse(m[1]);
          if (!isNaN(parsed)) data.timestamp = parsed;
        }
      }

      // Caption is whatever's inside the final quoted section, if present.
      const capMatch = content.match(/:\s*"([\s\S]*)"\s*$/);
      data.caption = capMatch ? capMatch[1] : "";
    }

    // Fallback: <time datetime="..."> tag, in case it's ever present.
    if (!data.timestamp) {
      const timeTagMatch = html.match(/<time[^>]+datetime="([^"]+)"/);
      if (timeTagMatch) {
        const parsed = Date.parse(timeTagMatch[1]);
        if (!isNaN(parsed)) data.timestamp = parsed;
      }
    }

    return data;
  }

  async function fetchPostData(href) {
    try {
      const res = await fetch(href, { credentials: "include" });
      if (!res.ok) return { caption: "", isVideo: false, viewCount: 0, likeCount: 0, commentCount: 0, timestamp: 0 };
      const html = await res.text();
      return extractPostData(html);
    } catch (e) {
      return { caption: "", isVideo: false, viewCount: 0, likeCount: 0, commentCount: 0, timestamp: 0 };
    }
  }

  async function startIndexing(countValue) {
    const username = currentUsername;
    if (!username) return;
    const target = countValue === "all" ? Infinity : parseInt(countValue, 10);
    indexing = true;
    window.fndSetRunEnabled && window.fndSetRunEnabled(false, "Working…");

    followerCount = readFollowerCount();
    window.fndSetStatus && window.fndSetStatus("Scrolling to load posts…");
    const collected = await autoScrollUntil(target); // Map href -> thumb, in-memory only
    const allLinks = Array.from(collected.keys());
    const capped = target === Infinity ? allLinks : allLinks.slice(0, target);

    const fetched = [];
    const concurrency = 4;
    let done = 0;
    for (let i = 0; i < capped.length; i += concurrency) {
      const batch = capped.slice(i, i + concurrency);
      const dataList = await Promise.all(batch.map((href) => fetchPostData(href)));
      batch.forEach((href, j) => {
        fetched.push({ href, thumb: collected.get(href) || "", ...dataList[j] });
      });
      done += batch.length;
      window.fndSetStatus && window.fndSetStatus(`Fetching post data… ${done}/${capped.length}`);
      await sleep(250);
    }

    // Held only in this JS variable — nothing written to disk, nothing
    // persisted. Reload the page or navigate away and it's gone.
    items = fetched;
    finishIndexing();
  }

  function toDateInputValue(ms) {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }

  function finishIndexing() {
    const dated = items.filter((it) => it.timestamp);
    if (dated.length) {
      const minTs = Math.min(...dated.map((it) => it.timestamp));
      const maxTs = Math.max(...dated.map((it) => it.timestamp));
      window.fndFullRangeFrom = toDateInputValue(minTs);
      window.fndFullRangeTo = toDateInputValue(maxTs);
      if (window.fndDateFromEl) {
        window.fndDateFromEl.min = window.fndFullRangeFrom;
        window.fndDateFromEl.max = window.fndFullRangeTo;
        window.fndDateFromEl.value = window.fndFullRangeFrom;
      }
      if (window.fndDateToEl) {
        window.fndDateToEl.min = window.fndFullRangeFrom;
        window.fndDateToEl.max = window.fndFullRangeTo;
        window.fndDateToEl.value = window.fndFullRangeTo;
      }
      dateFrom = minTs;
      dateTo = maxTs;
    }
    window.fndSetStatus && window.fndSetStatus(`${items.length} posts loaded${followerCount ? ` · ${formatCount(followerCount)} followers` : ""}`);
    window.fndSetRunEnabled && window.fndSetRunEnabled(true, "Re-fetch & sort");
    indexing = false;
    renderResults(window.fndSearchEl ? window.fndSearchEl.value : "");
  }

  async function initForCurrentPage() {
    const username = getUsernameFromPath();
    if (!username) {
      const existing = document.getElementById("fnd-root");
      if (existing) existing.remove();
      currentUsername = null;
      return;
    }
    if (username === currentUsername) return;

    currentUsername = username;
    items = [];
    sortMode = "date";
    followerCount = 0;
    dateFrom = null;
    dateTo = null;
    buildUI();
    document.querySelectorAll(".fnd-sort-btn").forEach((b) => {
      b.classList.toggle("fnd-sort-active", b.getAttribute("data-sort") === "date");
    });
    window.fndSetStatus && window.fndSetStatus("Pick a count, then \"Fetch & sort\".");
    window.fndSetRunEnabled && window.fndSetRunEnabled(true, "Fetch & sort");
    if (window.fndResultsEl) window.fndResultsEl.innerHTML = "";
  }

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      initForCurrentPage();
    }
  }, 800);

  initForCurrentPage();
})();

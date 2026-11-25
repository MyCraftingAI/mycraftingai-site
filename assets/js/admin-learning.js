/*
 * Admin panel - Repair learning view.
 *
 * Anonymised error-and-fix patterns sent by the desktop app after a repair whose
 * next build or check passed. Browse them by project type and Minecraft version,
 * read each lesson (and its individual reports), download a type / version /
 * selection / everything as JSON or Markdown for the AI agent, delete, and pause
 * or resume collection.
 *
 * Loaded after admin.js, which provides MCA.adminKit and calls
 * MCA.adminLearning.load() when the view opens.
 */
(function () {
  "use strict";
  var MCA = window.MCA, esc = MCA.escapeHtml, L = MCA.api.admin.learning;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function kit() { return MCA.adminKit; }

  var TYPE_LABEL = { forge: "Forge", neoforge: "NeoForge", fabric: "Fabric", quilt: "Quilt", plugins: "Plugins", datapacks: "Datapacks" };
  var st = { type: "", version: "", query: "", sort: "repeats", page: 1, open: {}, selected: {}, tree: null };

  function label(type) { return TYPE_LABEL[type] || type; }
  function kpi(k, v, s, warn) {
    return '<div class="ad-card ad-kpi' + (warn ? " warn" : "") + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s) + "</div></div>";
  }
  function fail(e) { kit().toast((e && e.message) || "Something went wrong.", true); }

  /* ------------------------------------------------------------- overview */
  function overview() {
    return L.overview().then(function (t) {
      st.tree = t;
      var badge = $("[data-rl-badge]");
      if (badge) badge.hidden = !!t.enabled;
      $("[data-rl-switch]").innerHTML =
        '<div class="ad-inline" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
        '<div style="max-width:70ch"><h3>Collection</h3><p class="ad-sub" style="margin:4px 0 0">' +
        (t.enabled
          ? "<b>On.</b> After a repair builds or passes its check, the app sends a short anonymised record: type, Minecraft version, error, cause, changes and a diff of at most 15 lines. Chats, prompts, paths, names and accounts are never sent."
          : "<b>Paused.</b> The app sends nothing and spends no Coins on summaries; the server ignores records. Stored lessons stay until you delete them.") +
        "</p></div>" +
        '<div class="ad-row-actions"><span class="ad-tag ' + (t.enabled ? "good" : "warn") + '">' + (t.enabled ? "Collecting" : "Paused") + "</span>" +
        '<button class="btn btn-sm ' + (t.enabled ? "btn-danger" : "btn-primary") + '" data-rl-toggle="' + (t.enabled ? "pause" : "resume") + '">' +
        (t.enabled ? "Pause collection" : "Resume collection") + "</button></div></div>";
      var versions = t.types.reduce(function (n, x) { return n + x.versions.length; }, 0);
      var top = t.types.slice().sort(function (a, b) { return b.repeats - a.repeats; })[0];
      $("[data-rl-kpis]").innerHTML = [
        kpi("Lessons", kit().num(t.lessons), "distinct error patterns"),
        kpi("Reports", kit().num(t.repeats), "successful repairs counted"),
        kpi("Buckets", kit().num(versions), t.types.length + " project type" + (t.types.length === 1 ? "" : "s")),
        kpi("Most repairs", top ? label(top.type) : "-",
          top ? kit().num(top.repeats) + " report" + (top.repeats === 1 ? "" : "s") : "nothing collected yet")
      ].join("");
      renderTree();
      renderActions();
    });
  }

  function renderTree() {
    var t = st.tree;
    if (!t) return;
    var all = '<button class="ad-chip' + (!st.type ? " on" : "") + '" data-rl-pick="" style="width:100%;justify-content:space-between;display:flex">' +
      "<span>All types</span><b>" + kit().num(t.lessons) + "</b></button>";
    var rows = t.types.map(function (x) {
      var open = st.open[x.type] || st.type === x.type;
      var head = '<div class="ad-inline" style="gap:6px;margin-top:8px">' +
        '<button class="btn btn-ghost btn-sm" data-rl-fold="' + esc(x.type) + '" aria-label="Show versions" style="padding:2px 8px">' + (open ? "&#9662;" : "&#9656;") + "</button>" +
        '<button class="ad-chip' + (st.type === x.type && !st.version ? " on" : "") + '" data-rl-pick="' + esc(x.type) + '" style="flex:1;display:flex;justify-content:space-between">' +
        "<span>" + esc(label(x.type)) + "</span><b title=\"" + kit().num(x.lessons) + " lesson" + (x.lessons === 1 ? "" : "s") + " &middot; " +
        kit().num(x.repeats) + " report" + (x.repeats === 1 ? "" : "s") + '">' + kit().num(x.lessons) + "</b></button></div>";
      var versions = open ? x.versions.map(function (v) {
        var on = st.type === x.type && st.version === v.mc_version;
        return '<button class="ad-chip' + (on ? " on" : "") + '" data-rl-pick="' + esc(x.type) + '" data-rl-version="' + esc(v.mc_version) + '" ' +
          'style="display:flex;justify-content:space-between;width:calc(100% - 36px);margin:6px 0 0 36px">' +
          "<span>" + esc(v.mc_version) + '</span><span class="ad-muted" style="font-family:var(--mono);font-size:12px">' +
          kit().num(v.lessons) + " &middot; " + kit().num(v.repeats) + "x</span></button>";
      }).join("") : "";
      return head + versions;
    }).join("");
    $("[data-rl-tree]").innerHTML = "<h3>Type / Minecraft version</h3>" +
      '<p class="ad-sub" style="margin:4px 0 12px">Lessons &middot; reports per bucket</p>' + all +
      (rows || '<p class="ad-muted" style="margin-top:12px">Nothing collected yet.</p>');
  }

  function scopeName() {
    if (!st.type) return "everything";
    return label(st.type) + (st.version ? " " + st.version : "");
  }

  function renderActions() {
    var chosen = Object.keys(st.selected).length;
    $("[data-rl-actions]").innerHTML =
      '<span class="ad-muted" style="font-size:13px">Showing <b>' + esc(scopeName()) + "</b></span><span class=\"ad-grow\"></span>" +
      '<button class="btn btn-sm" data-rl-download="json">Download JSON</button>' +
      '<button class="btn btn-sm btn-ghost" data-rl-download="md">Markdown for the agent</button>' +
      (chosen ? '<button class="btn btn-sm btn-primary" data-rl-download-selected>Download ' + chosen + " selected</button>" : "") +
      '<button class="btn btn-sm btn-danger" data-rl-clear>' + (st.type ? "Delete " + esc(scopeName()) : "Delete everything") + "</button>";
  }

  /* --------------------------------------------------------------- list */
  function list() {
    var host = $("[data-rl-list]");
    return L.lessons({ type: st.type, version: st.version, query: st.query, sort: st.sort, page: st.page }).then(function (d) {
      if (!d.lessons.length) {
        host.innerHTML = '<div class="ad-card ad-empty">' + (st.query ? "No lesson matches that search." : "No lessons here yet.") + "</div>";
        return;
      }
      var more = d.page * d.perPage < d.total;
      host.innerHTML = d.lessons.map(card).join("") +
        '<div class="ad-pager"><button class="btn btn-ghost btn-sm" data-rl-page="-1"' + (st.page <= 1 ? " disabled" : "") + ">Previous</button>" +
        "<span>Page " + st.page + " &middot; " + kit().num(d.total) + ' lessons</span><span class="ad-grow"></span>' +
        '<button class="btn btn-ghost btn-sm" data-rl-page="1"' + (more ? "" : " disabled") + ">Next</button></div>";
    });
  }

  function diffBlock(text) {
    if (!text) return "";
    var lines = text.split("\n").map(function (line) {
      var color = line.charAt(0) === "+" ? "#3dd68c" : line.charAt(0) === "-" ? "#ff6b6b" : "inherit";
      return '<span style="color:' + color + '">' + esc(line) + "</span>";
    }).join("\n");
    return '<pre style="margin:10px 0 0;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.28);overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre">' + lines + "</pre>";
  }

  function changesList(items) {
    return '<ul style="margin:6px 0 0 18px;padding:0">' + (items || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>";
  }

  function card(x) {
    var checked = st.selected[x.id] ? " checked" : "";
    return '<div class="ad-card" style="margin-bottom:10px" data-rl-card="' + esc(x.id) + '">' +
      '<div class="ad-inline" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
      '<label class="ad-inline" style="gap:10px;align-items:flex-start;cursor:pointer;min-width:0">' +
      '<input type="checkbox" data-rl-select="' + esc(x.id) + '"' + checked + ' style="margin-top:4px">' +
      '<div style="min-width:0"><b style="word-break:break-word">' + esc(x.error_title) + "</b><div class=\"ad-muted\" style=\"font-size:12px;margin-top:3px\">" +
      '<span class="ad-tag info">' + esc(label(x.type)) + "</span> " +
      '<span class="ad-tag plan">MC ' + esc(x.mc_version) + "</span> " +
      '<span class="ad-tag ' + (x.source === "healer" ? "good" : "info") + '">' + (x.source === "healer" ? "Auto-Healer" : "AI") + "</span> " +
      " &middot; seen <b>" + kit().num(x.repeat_count) + "x</b> &middot; last " + esc(kit().since(x.updated_at)) + "</div></div></label>" +
      '<div class="ad-row-actions" style="flex-shrink:0">' +
      '<button class="btn btn-sm btn-ghost" data-rl-open="' + esc(x.id) + '">Reports</button>' +
      '<button class="btn btn-sm btn-ghost" data-rl-one="' + esc(x.id) + '">Download</button>' +
      '<button class="btn btn-sm btn-danger" data-rl-del="' + esc(x.id) + '">Delete</button></div></div>' +
      '<div style="margin-top:10px"><div class="ad-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">What was wrong</div>' +
      "<div>" + esc(x.what_was_wrong) + "</div></div>" +
      '<div style="margin-top:10px"><div class="ad-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">What changed</div>' +
      changesList(x.what_changed) + "</div>" + diffBlock(x.code_diff_snippet) +
      '<div data-rl-reports="' + esc(x.id) + '"></div></div>';
  }

  function openReports(id, btn) {
    var host = $('[data-rl-reports="' + id + '"]');
    if (!host) return;
    if (host.innerHTML) { host.innerHTML = ""; return; }
    kit().run(btn, L.lesson(id), "", "Loading").then(function (d) {
      host.innerHTML = '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">' +
        '<div class="ad-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">' +
        d.occurrences.length + " individual report" + (d.occurrences.length === 1 ? "" : "s") + " (newest first, up to 25 kept)</div>" +
        d.occurrences.map(function (o) {
          return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
            '<div class="ad-inline" style="justify-content:space-between;gap:10px"><span class="ad-muted" style="font-size:12px">' +
            esc(kit().when(o.created_at)) + (o.app_version ? " &middot; app " + esc(o.app_version) : "") + " &middot; " +
            (o.source === "healer" ? "Auto-Healer" : "AI") + "</span>" +
            '<button class="btn btn-sm btn-ghost" data-rl-del-entry="' + esc(o.id) + '" data-rl-lesson="' + esc(id) + '">Delete report</button></div>' +
            "<div style=\"margin-top:4px\"><b>" + esc(o.error_title) + "</b></div><div>" + esc(o.what_was_wrong) + "</div>" +
            changesList(o.what_changed) + diffBlock(o.code_diff_snippet) + "</div>";
        }).join("") + "</div>";
    });
  }

  /* ------------------------------------------------------------ actions */
  function stamp() { return new Date().toISOString().slice(0, 10); }
  function fileName(fmt, what) {
    return "mycraftingai-repair-lessons-" + (what || "all").toLowerCase().replace(/[^a-z0-9.]+/g, "-") + "-" + stamp() + "." + (fmt === "md" ? "md" : "json");
  }

  function download(btn, fmt) {
    kit().run(btn, L.download({ type: st.type, version: st.version, format: fmt }), "Download ready", "Preparing").then(function (blob) {
      kit().downloadBlob(blob, fileName(fmt, st.type ? scopeName() : "all"));
    });
  }

  function downloadIds(btn, ids, what) {
    kit().run(btn, L.download({ format: "json" }, ids), "Download ready", "Preparing").then(function (blob) {
      kit().downloadBlob(blob, fileName("json", what));
    });
  }

  function toggle(btn) {
    var resume = btn.dataset.rlToggle === "resume";
    kit().ask({
      title: resume ? "Resume repair learning?" : "Pause repair learning?",
      text: resume ? "The app starts sending anonymised fix patterns again after successful repairs."
        : "The app stops sending records and spends no Coins on summaries. The server ignores anything that still arrives. Stored lessons are kept.",
      ok: resume ? "Resume" : "Pause", danger: !resume
    }).then(function (v) {
      if (!v) return;
      kit().run(btn, L.setEnabled(resume), resume ? "Collection resumed." : "Collection paused.").then(function () { load(); });
    });
  }

  function clearScope(btn) {
    var expected = st.type ? (st.type + (st.version ? " " + st.version : "")) : "DELETE ALL";
    kit().ask({
      title: st.type ? "Delete " + scopeName() + "?" : "Delete every lesson?",
      text: (st.type ? "Every lesson and report in " + scopeName() + " is deleted." : "Every lesson of every type and version is deleted.") +
        " This can't be undone - download them first if you may need them. Type " + expected + " to confirm.",
      fields: [{ name: "confirm", label: "Confirmation", placeholder: expected }],
      confirmText: expected, ok: "Delete", danger: true
    }).then(function (v) {
      if (!v) return;
      kit().run(btn, L.removeBucket(st.type, st.version, v.confirm), "Deleted.").then(function (r) {
        st.selected = {};
        if (st.type && !(r.types || []).some(function (x) { return x.type === st.type; })) { st.type = ""; st.version = ""; }
        load();
      });
    });
  }

  function removeLesson(btn, id) {
    kit().ask({ title: "Delete this lesson?", text: "The lesson and all its individual reports are deleted. This can't be undone.", ok: "Delete", danger: true })
      .then(function (v) {
        if (!v) return;
        kit().run(btn, L.removeLesson(id), "Lesson deleted.").then(function () { delete st.selected[id]; load(); });
      });
  }

  function removeEntry(btn, id, lesson) {
    kit().ask({ title: "Delete this report?", text: "Only this one report is deleted; the lesson's count goes down by one.", ok: "Delete", danger: true })
      .then(function (v) {
        if (!v) return;
        kit().run(btn, L.removeEntry(id), "Report deleted.").then(function (r) {
          if (r.lessonDeleted) delete st.selected[lesson];
          load();
        });
      });
  }

  /* -------------------------------------------------------------- wiring */
  var searchTimer = 0;
  document.addEventListener("input", function (e) {
    if (!e.target.matches("[data-rl-query]")) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { st.query = e.target.value.trim(); st.page = 1; list().catch(fail); }, 300);
  });
  document.addEventListener("change", function (e) {
    var sel = e.target.closest("[data-rl-select]");
    if (!sel) return;
    if (sel.checked) st.selected[sel.dataset.rlSelect] = true; else delete st.selected[sel.dataset.rlSelect];
    renderActions();
  });
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest || !t.closest('[data-view="learning"]')) return;
    if (t.closest("[data-rl-refresh]")) return load();
    var tg = t.closest("[data-rl-toggle]"); if (tg) return toggle(tg);
    var fold = t.closest("[data-rl-fold]");
    if (fold) { st.open[fold.dataset.rlFold] = !st.open[fold.dataset.rlFold]; return renderTree(); }
    var pick = t.closest("[data-rl-pick]");
    if (pick) {
      st.type = pick.dataset.rlPick || ""; st.version = pick.dataset.rlVersion || ""; st.page = 1;
      if (st.type) st.open[st.type] = true;
      renderTree(); renderActions(); return list().catch(fail);
    }
    var sort = t.closest("[data-rl-sort] button");
    if (sort) {
      st.sort = sort.dataset.sort; st.page = 1;
      $$("[data-rl-sort] button").forEach(function (b) { b.classList.toggle("on", b === sort); });
      return list().catch(fail);
    }
    var pg = t.closest("[data-rl-page]"); if (pg) { st.page = Math.max(1, st.page + Number(pg.dataset.rlPage)); return list().catch(fail); }
    var dl = t.closest("[data-rl-download]"); if (dl) return download(dl, dl.dataset.rlDownload);
    var ds = t.closest("[data-rl-download-selected]"); if (ds) return downloadIds(ds, Object.keys(st.selected), "selected");
    var one = t.closest("[data-rl-one]"); if (one) return downloadIds(one, [one.dataset.rlOne], "lesson");
    var op = t.closest("[data-rl-open]"); if (op) return openReports(op.dataset.rlOpen, op);
    var del = t.closest("[data-rl-del]"); if (del) return removeLesson(del, del.dataset.rlDel);
    var de = t.closest("[data-rl-del-entry]"); if (de) return removeEntry(de, de.dataset.rlDelEntry, de.dataset.rlLesson);
    if (t.closest("[data-rl-clear]")) return clearScope(t.closest("[data-rl-clear]"));
  });

  /** quiet = the 15-second live refresh: keep open report panels and the scroll position. */
  function load(quiet) {
    if (quiet && $("[data-rl-reports]:not(:empty)")) return overview().catch(function () {});
    var work = Promise.all([overview(), list()]);
    return quiet ? work.catch(function () {}) : work.catch(fail);
  }

  /* Narrow screens: the type tree goes above the list. */
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 860px)") : null;
  function layout() {
    var grid = $(".ad-rl-layout");
    if (grid) grid.style.gridTemplateColumns = narrow && narrow.matches ? "minmax(0,1fr)" : "minmax(220px,280px) minmax(0,1fr)";
  }
  if (narrow) { layout(); if (narrow.addEventListener) narrow.addEventListener("change", layout); }

  MCA.adminLearning = { load: load };
})();

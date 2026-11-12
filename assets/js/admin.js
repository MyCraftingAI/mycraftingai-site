/*
 * MyCraftingAI admin console.
 *
 * Uses the signed-in session cookie. The server answers 404 to anyone who
 * isn't an admin, so this page only ever shows data to admins. Every change
 * made here is written to the server's activity log.
 */
(function () {
  "use strict";
  var api = window.MCA.api, esc = window.MCA.escapeHtml, fmt = window.MCA.formatTokens;
  var A = api.admin;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var PLAN_ORDER = ["free", "builder", "pro", "studio", "enterprise"];
  var PLAN_COLOR = { free: "#6e6e7a", builder: "#8aa0ff", pro: "#4f63f5", studio: "#3dd68c", enterprise: "#f5b74a" };
  var STATUS_CHIPS = [
    ["", "Everyone"], ["paid", "Paying"], ["ai_paused", "AI paused"], ["disabled", "Disabled"],
    ["unverified", "Unverified"], ["2fa", "2-step on"], ["custom_limit", "Custom limit"],
    ["google", "Google sign-in"], ["noted", "Has note"], ["admin", "Admins"]
  ];
  var ACTION_COLOR = {
    pause_ai: "#f5b74a", resume_ai: "#3dd68c", email: "#8aa0ff", broadcast: "#8aa0ff", delete_user: "#f2555a",
    set_active: "#f2555a", set_plan: "#4f63f5", bonus_tokens: "#3dd68c", bonus_removed: "#f5b74a", daily_limit: "#4f63f5"
  };
  var TEMPLATES = {
    welcome: ["Welcome to MyCraftingAI, {name}",
      "Hi {name},\n\nThanks for joining MyCraftingAI! You're on the {plan} plan.\n\nOpen the app, create a project and describe the mod you want - the AI writes the code, textures and everything in between. Your projects stay in normal folders on your PC.\n\nIf you get stuck, just reply to this email.\n\nHappy building!\nThe MyCraftingAI team"],
    feature: ["New in MyCraftingAI: ",
      "Hi {name},\n\nWe just shipped something new: \n\nUpdate the app (it updates itself on the next start) and give it a try.\n\nAs always, tell us what you think - just reply.\n\nThe MyCraftingAI team"],
    maintenance: ["Scheduled maintenance on ",
      "Hi {name},\n\nWe'll be doing planned maintenance on [date] from [time] to [time] UTC. During this window, AI requests and sign-in may be unavailable for a few minutes.\n\nYour projects are stored on your PC and aren't affected.\n\nThanks for your patience,\nThe MyCraftingAI team"],
    upgrade: ["More tokens for your builds, {name}",
      "Hi {name},\n\nYou've been building a lot on the {plan} plan - nice work!\n\nIf you're running into the daily limit, Builder, Pro and Studio give you far more tokens every day. Compare plans at https://mycraftingai.com/#pricing\n\nThe MyCraftingAI team"],
    support: ["Re: your MyCraftingAI question",
      "Hi {name},\n\nThanks for reaching out.\n\n\n\nIf anything else comes up, just reply to this email.\n\nBest,\nMyCraftingAI Support"]
  };

  var state = {
    view: "dashboard", me: null, days: 30, senders: [],
    users: { page: 1, pages: 1, query: "", plan: "", status: "", sort: "new", rows: [] },
    selected: {}, ev: { page: 1, pages: 1, action: "" },
    msg: { mode: "direct" }, user: null, tab: "overview"
  };

  /* -------------------------------------------------------------- helpers */
  function num(n) { return n == null ? "-" : Number(n).toLocaleString("en-US"); }
  function money(n, cents) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: cents === false ? 0 : 2, maximumFractionDigits: cents === false ? 0 : 2 }); }
  function tokens(n) { return n == null ? "Unlimited" : fmt(n); }
  function since(iso) {
    if (!iso) return "never";
    var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    var d = Math.floor(s / 86400);
    if (d < 30) return d + "d ago";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function when(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function initial(u) { return esc(((u.username || u.email || "?").charAt(0) || "?").toUpperCase()); }
  function errText(e) { return (e && e.message) || "Something went wrong."; }
  function toast(msg, isErr) {
    var t = $("[data-toast]");
    t.textContent = msg; t.className = "ad-toast show" + (isErr ? " err" : "");
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = "ad-toast"; }, isErr ? 4200 : 2600);
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.idle = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + esc(label || "Working"); }
    else { btn.disabled = false; if (btn.dataset.idle) btn.innerHTML = btn.dataset.idle; }
  }
  /** Run an API call from a button: spinner, toast, error message. */
  function run(btn, promise, okMsg, label) {
    busy(btn, true, label);
    return promise.then(function (r) { busy(btn, false); if (okMsg) toast(okMsg); return r; },
      function (e) { busy(btn, false); toast(errText(e), true); return new Promise(function () {}); });
  }

  /**
   * Confirmation dialog. fields: [{name, label, type, value, placeholder, options}]
   * Resolves with the values, or null when cancelled.
   */
  function ask(o) {
    return new Promise(function (resolve) {
      var m = $("[data-modal]"), form = $("[data-modal-form]"), ok = $("[data-modal-ok]");
      $("[data-modal-title]").textContent = o.title;
      $("[data-modal-text]").textContent = o.text || "";
      $("[data-modal-text]").hidden = !o.text;
      form.innerHTML = (o.fields || []).map(function (f) {
        if (f.type === "select") {
          return '<label>' + esc(f.label) + '<select name="' + f.name + '">' + f.options.map(function (op) {
            return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(f.value || "") ? " selected" : "") + ">" + esc(op[1]) + "</option>";
          }).join("") + "</select></label>";
        }
        if (f.type === "checkbox") {
          return '<label class="ad-check"><input type="checkbox" name="' + f.name + '"' + (f.value ? " checked" : "") + "> " + esc(f.label) + "</label>";
        }
        if (f.type === "textarea") {
          return '<label>' + esc(f.label) + '<textarea name="' + f.name + '" placeholder="' + esc(f.placeholder || "") + '">' + esc(f.value || "") + "</textarea></label>";
        }
        return '<label>' + esc(f.label) + '<input class="input" name="' + f.name + '" type="' + (f.type || "text") + '" value="' + esc(f.value == null ? "" : f.value) + '" placeholder="' + esc(f.placeholder || "") + '"></label>';
      }).join("");
      form.hidden = !(o.fields && o.fields.length);
      ok.textContent = o.ok || "Confirm";
      ok.className = "btn " + (o.danger ? "btn-danger" : "btn-primary");
      m.hidden = false;
      var first = $("input, textarea, select", form); if (first) setTimeout(function () { first.focus(); }, 30);
      function values() {
        var out = {};
        $$("[name]", form).forEach(function (el) { out[el.name] = el.type === "checkbox" ? el.checked : el.value; });
        return out;
      }
      function close(result) {
        m.hidden = true; ok.onclick = null; $("[data-modal-cancel]").onclick = null; m.onclick = null; document.removeEventListener("keydown", key);
        resolve(result);
      }
      function key(e) { if (e.key === "Escape") close(null); if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); submit(); } }
      function submit() {
        var v = values();
        if (o.confirmText && v.confirm !== o.confirmText) { toast('Type "' + o.confirmText + '" to confirm.', true); return; }
        close(v);
      }
      ok.onclick = submit;
      $("[data-modal-cancel]").onclick = function () { close(null); };
      m.onclick = function (e) { if (e.target === m) close(null); };
      document.addEventListener("keydown", key);
    });
  }

  /* ------------------------------------------------------------- routing */
  function go(view, push) {
    state.view = view;
    $$("[data-nav]").forEach(function (b) { b.classList.toggle("on", b.dataset.nav === view); });
    $$("[data-view]").forEach(function (s) { s.hidden = s.dataset.view !== view; });
    $("[data-side]").classList.remove("open");
    if (push !== false && location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    if (view === "dashboard") loadDashboard();
    if (view === "insights") loadInsights();
    if (view === "ads") loadAds();
    if (view === "revenue") loadRevenue();
    if (view === "settings") loadSettings();
    if (view === "users") loadUsers();
    if (view === "messages") loadMessages();
    if (view === "activity") loadEvents();
    if (view === "system") loadSystem();
    window.scrollTo(0, 0);
  }

  /* ----------------------------------------------------------- dashboard */
  function kpi(k, v, s, warn) {
    return '<div class="ad-card ad-kpi' + (warn ? " warn" : "") + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + "</div></div>";
  }

  function loadDashboard() {
    $("[data-today]").textContent = "Live numbers · " + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + " · day resets 00:00 UTC";
    A.overview().then(function (o) {
      var u = o.users, t = o.tokens, keys = o.providerKeys || {};
      $("[data-count-users]").textContent = num(u.total);
      $("[data-kpis]").innerHTML = [
        kpi("Users", num(u.total), num(u.verified) + " verified · " + num(u.activeLast7d) + " active 7d"),
        kpi("New sign-ups", num(u.new7d), num(u.newToday) + " today · last 7 days"),
        kpi("Paying", num(u.paying), u.total ? Math.round(u.paying / u.total * 100) + "% of all users" : "-"),
        kpi("Tokens today", fmt(t.today), num(t.requestsToday) + " requests · " + num(t.aiUsersToday) + " users"),
        kpi("Tokens 7 days", fmt(t.last7d), num(t.requests7d) + " requests · " + fmt(t.allTime) + " all-time"),
        kpi("AI keys", num(keys.active || 0) + " active", num(keys.degraded || 0) + " need attention · " + num(keys.disabled || 0) + " off", (keys.degraded || 0) > 0 || !(keys.active > 0))
      ].join("");
      var total = 0; PLAN_ORDER.forEach(function (p) { total += o.plans[p] || 0; });
      $("[data-planbar]").innerHTML = PLAN_ORDER.map(function (p) {
        var c = o.plans[p] || 0; return c ? '<i style="width:' + (c / Math.max(1, total) * 100) + "%;background:" + PLAN_COLOR[p] + '" title="' + p + ": " + c + '"></i>' : "";
      }).join("");
      $("[data-planlist]").innerHTML = PLAN_ORDER.filter(function (p) { return o.plans[p] != null; }).map(function (p) {
        return '<div><span class="ad-dot" style="background:' + PLAN_COLOR[p] + '"></span><span style="text-transform:capitalize">' + p + "</span><span>" + num(o.plans[p]) + "</span></div>";
      }).join("");
      var attn = [
        ["ai_paused", "AI paused", u.aiPaused], ["disabled", "Disabled accounts", u.disabled],
        ["unverified", "Unverified emails", u.total - u.verified], ["2fa", "Using 2-step verification", u.twoFactor],
        ["admin", "Admins", u.admins]
      ];
      $("[data-attn]").innerHTML = attn.map(function (a) {
        return '<button data-goto-status="' + a[0] + '">' + esc(a[1]) + "<b>" + num(a[2]) + "</b></button>";
      }).join("");
      fillPlanFilter(o.plans);
    }, function (e) { toast(errText(e), true); });
    loadCharts();
    loadGlance();
  }

  /** Second KPI row: downloads, app users, ad unlocks, revenue and switches. */
  function loadGlance() {
    var host = $("[data-kpis2]");
    Promise.all([A.insights(7), A.rewards(7), A.revenue(), A.config()]).then(function (r) {
      var ins = r[0], rw = r[1], rev = r[2], cfg = r[3].values;
      var today = ins.days[ins.days.length - 1] || {};
      var granted = rw.funnel.build.granted + rw.funnel.textures.granted;
      var off = [];
      if (cfg.ai_global_pause) off.push("AI paused");
      if (!cfg.signups_open) off.push("sign-ups closed");
      if (!cfg.rewards_enabled) off.push("ad unlocks off");
      host.innerHTML = [
        kpi("Downloads 7d", num(ins.downloads.started), num(today.downloads || 0) + " today · " + num(ins.github.total) + " on GitHub"),
        kpi("App users today", num(ins.active.dau), num(ins.active.wau) + " this week · " + num(ins.active.mau) + " this month"),
        kpi("Ad unlocks 7d", num(granted), (rw.completion == null ? "-" : rw.completion + "% completed") + " · " + num(rw.live.textures) + " live now"),
        kpi("MRR", money(rev.mrr), num(rev.counts.active) + " active · " + num(rev.counts.cancelling) + " cancelling"),
        kpi("AI requests 7d", num(ins.days.reduce(function (s, d) { return s + d.aiRequests; }, 0)), num(ins.thinking.none) + " in None mode"),
        kpi("Service", off.length ? "Attention" : "All on", off.length ? off.join(" · ") : "AI, sign-ups and ad unlocks running", !!off.length)
      ].join("");
      updateSwitchBadge(cfg);
    }, function () { host.innerHTML = ""; });
  }

  function updateSwitchBadge(cfg) {
    var badge = $("[data-switch-badge]");
    if (badge) badge.hidden = !(cfg.ai_global_pause || !cfg.signups_open || !cfg.rewards_enabled);
  }

  /** Horizontal bar list: rows = [[label, value, color, title]]. */
  function bars(rows, suffix) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return rows.map(function (r) {
      return '<div class="ad-bar" title="' + esc(r[3] || "") + '"><span>' + esc(r[0]) + '</span><div class="track"><i style="width:' +
        (r[1] / max * 100).toFixed(1) + "%;background:" + (r[2] || "#4f63f5") + '"></i></div><b>' + num(r[1]) + (suffix || "") + "</b></div>";
    }).join("") || '<div class="ad-empty">No data yet.</div>';
  }

  function userCell(u) {
    return '<div class="ad-user-cell"><b>' + esc(u.username || "-") + "</b><span>" + esc(u.email || "") + "</span></div>";
  }

  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ------------------------------------------------------------ insights */
  var THINK_COLOR = { none: "#6e6e7a", low: "#8aa0ff", normal: "#4f63f5", high: "#3dd68c" };
  function loadInsights() {
    state.insDays = state.insDays || 30;
    $$("[data-ins-range] button").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.days) === state.insDays); });
    $("[data-ins-kpis]").innerHTML = '<div class="ad-skel"></div>';
    A.insights(state.insDays).then(function (d) {
      var dl = d.downloads, act = d.active;
      var signups = d.days.reduce(function (s, x) { return s + x.signups; }, 0);
      var ai = d.days.reduce(function (s, x) { return s + x.aiRequests; }, 0);
      $("[data-ins-kpis]").innerHTML = [
        kpi("Downloads", num(dl.started), num(dl.views) + " page views · " + (dl.conversion == null ? "-" : dl.conversion + "% started")),
        kpi("Left during countdown", num(dl.paused), "visitors who switched away at least once"),
        kpi("New accounts", num(signups), d.range + " days"),
        kpi("Daily active", num(act.dau), "today in the desktop app"),
        kpi("Weekly / monthly", num(act.wau) + " / " + num(act.mau), "active app accounts"),
        kpi("AI requests", num(ai), num(d.features.textures) + " from Texture Studio")
      ].join("");
      chart($("[data-ins-dl]"), d.days, "downloads", "downloadViews", function (x) {
        return "<b>" + x.day + "</b><br>" + num(x.downloads) + " downloads · " + num(x.downloadViews) + " page views<br>" + num(x.signups) + " new accounts";
      }, "#3dd68c", "#8aa0ff");
      chart($("[data-ins-active]"), act.daily, "active", null, function (x) { return "<b>" + x.day + "</b><br>" + num(x.active) + " active accounts"; }, "#8aa0ff");
      $("[data-ins-versions]").innerHTML = bars(act.versions.map(function (v, i) { return ["v" + v.version, v.users, i === 0 ? "#3dd68c" : "#4f63f5"]; }), " users");
      var tTotal = 0; Object.keys(d.thinking).forEach(function (k) { tTotal += d.thinking[k]; });
      $("[data-ins-thinking]").innerHTML = bars(["none", "low", "normal", "high"].map(function (k) {
        return [k.charAt(0).toUpperCase() + k.slice(1), d.thinking[k], THINK_COLOR[k], tTotal ? Math.round(d.thinking[k] / tTotal * 100) + "%" : ""];
      }));
      $("[data-ins-features]").innerHTML =
        '<div class="r"><span>Mod Assistant requests</span><b>' + num(d.features.code) + "</b></div>" +
        '<div class="r"><span>Texture Studio requests</span><b>' + num(d.features.textures) + "</b></div>";
      $("[data-ins-top]").innerHTML = d.topUsers.length ? d.topUsers.map(function (u) {
        return '<div class="r link" data-open-user="' + esc(u.id) + '">' + userCell(u) + '<span><b>' + fmt(u.tokens) + '</b><br><span class="ad-muted" style="font-size:12px">' + num(u.requests) + " req · " + esc(u.plan) + "</span></span></div>";
      }).join("") : '<div class="ad-empty">No AI use in the last 7 days.</div>';
      renderGithub(d.github);
    }, function (e) { toast(errText(e), true); });
  }

  function renderGithub(g) {
    $("[data-gh-sub]").textContent = g.error ? g.error : num(g.total) + " installer downloads in total · " + (g.repo || "");
    $("[data-gh-list]").innerHTML = (g.releases || []).length ? g.releases.slice(0, 8).map(function (r) {
      return '<div class="r"><span><b style="color:var(--text)">' + esc(r.name || r.tag) + '</b> <span style="font-size:12px">' + (r.published ? since(r.published) : "") + "</span></span><b class=\"ad-mono\">" + num(r.downloads) + "</b></div>";
    }).join("") : '<div class="ad-empty">' + esc(g.error || "No releases yet.") + "</div>";
  }

  /* ----------------------------------------------------------- ads & unlocks */
  var EVENT_TEXT = { requested: "asked for", started: "started watching for", granted: "unlocked", spent: "used", limit: "hit the daily limit for", admin: "was given" };
  function loadAds() {
    state.adsDays = state.adsDays || 30;
    $$("[data-ads-range] button").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.days) === state.adsDays); });
    A.rewards(state.adsDays).then(function (d) {
      var f = d.funnel, granted = f.build.granted + f.textures.granted, requested = f.build.requested + f.textures.requested;
      $("[data-ads-kpis]").innerHTML = [
        kpi("Unlocks granted", num(granted), num(f.build.granted) + " Build & Run · " + num(f.textures.granted) + " Texture"),
        kpi("Requested in app", num(requested), (d.completion == null ? "-" : d.completion + "%") + " completed"),
        kpi("Google ads vs ours", num(d.sources.google) + " / " + num(d.sources.house), "rewarded ads / MyCraftingAI message"),
        kpi("Build & Runs used", num(f.build.spent), num(d.live.creditsWaiting) + " unlocked but not used yet"),
        kpi("Live right now", num(d.live.textures + d.live.build), num(d.live.textures) + " Texture · " + num(d.live.build) + " Build passes"),
        kpi("Daily limit reached", num(f.build.limit + f.textures.limit), "times someone wanted more", f.build.limit + f.textures.limit > 0)
      ].join("");
      d.daily.forEach(function (x) { x.granted = x.buildGranted + x.texturesGranted; });
      chart($("[data-ads-chart]"), d.daily, "granted", "requested", function (x) {
        return "<b>" + x.day + "</b><br>" + num(x.buildGranted) + " Build & Run · " + num(x.texturesGranted) + " Texture<br>" + num(x.requested) + " requested · " + num(x.pageViews) + " page views";
      });
      function stage(label, value, top, color) {
        return '<div class="step"><span class="lbl">' + esc(label) + '</span><span class="val">' + num(value) + (top ? " · " + Math.round(value / top * 100) + "%" : "") +
          '</span><div class="track"><i style="width:' + (top ? Math.min(100, value / top * 100) : 0) + "%;background:" + color + '"></i></div></div>';
      }
      $("[data-ads-funnel]").innerHTML = '<div class="ad-funnel">' + ["build", "textures"].map(function (k) {
        var x = f[k], top = Math.max(1, x.requested);
        return "<h4>" + (k === "build" ? "Build & Run" : "Texture Studio") + "</h4>" +
          stage("Asked in the app", x.requested, top, "#8aa0ff") + stage("Started watching", x.started, top, "#4f63f5") +
          stage("Unlocked", x.granted, top, "#3dd68c") + (k === "build" ? stage("Used to build", x.spent, top, "#f5b74a") : "");
      }).join("") + "</div>";
      $("[data-ads-top]").innerHTML = d.topUsers.length ? d.topUsers.map(function (u) {
        return '<tr data-open-user="' + esc(u.id) + '" style="cursor:pointer"><td>' + userCell(u) + "</td><td>" + num(u.build) + "</td><td>" + num(u.textures) + '</td><td class="ad-muted">' + since(u.last) + "</td></tr>";
      }).join("") : '<tr><td colspan="4"><div class="ad-empty">No unlocks in this period.</div></td></tr>';
      $("[data-ads-feed]").innerHTML = d.recent.length ? d.recent.map(function (ev) {
        var color = ev.event === "granted" ? "#3dd68c" : ev.event === "limit" ? "#f5b74a" : ev.event === "admin" ? "#8a5cf6" : "#4f63f5";
        var what = ev.kind === "build" ? "Build & Run" : "Texture Studio";
        return '<div class="ad-ev"><i style="background:' + color + '"></i><div><div><a href="#users/' + esc(ev.userId) + '" data-open-user="' + esc(ev.userId) + '">' + esc(ev.username || ev.email) + "</a> " +
          esc(EVENT_TEXT[ev.event] || ev.event) + " " + what + (ev.source ? ' <span class="ad-tag info">' + esc(ev.source === "house" ? "our message" : ev.source) + "</span>" : "") +
          '</div></div><time title="' + esc(when(ev.at)) + '">' + since(ev.at) + "</time></div>";
      }).join("") : '<div class="ad-empty">Nothing yet.</div>';
    }, function (e) { toast(errText(e), true); });
  }

  /* -------------------------------------------------------------- revenue */
  var SUB_TAG = { active: "good", on_trial: "info", past_due: "warn", cancelled: "bad", expired: "bad", paused: "warn", unpaid: "bad" };
  function loadRevenue() {
    A.revenue().then(function (r) {
      var c = r.counts;
      $("[data-rev-kpis]").innerHTML = [
        kpi("MRR", money(r.mrr), "monthly recurring revenue"),
        kpi("ARR", money(r.arr, false), "MRR × 12"),
        kpi("Paying subscribers", num(c.active + c.pastDue + c.trial), num(c.trial) + " on trial"),
        kpi("Avg. per subscriber", money(r.arpu), "per month"),
        kpi("This month", "+" + num(r.newThisMonth), num(r.cancelledThisMonth) + " cancelled"),
        kpi("Needs attention", num(c.pastDue), "payments failing (past due)", c.pastDue > 0)
      ].join("");
      $("[data-rev-plans]").innerHTML = bars(r.byPlan.map(function (p) { return [p.name + " (" + p.subscribers + ")", Math.round(p.mrr), PLAN_COLOR[p.plan]]; })).replace(/<b>([\d,]+)<\/b>/g, "<b>$$$1</b>");
      $("[data-rev-health]").innerHTML =
        '<div class="r"><span>Active</span><b>' + num(c.active) + "</b></div>" +
        '<div class="r"><span>On trial</span><b>' + num(c.trial) + "</b></div>" +
        '<div class="r"><span>Past due (payment failing)</span><b>' + num(c.pastDue) + "</b></div>" +
        '<div class="r"><span>Cancelled, running to period end</span><b>' + num(c.cancelling) + "</b></div>" +
        '<div class="r"><span>Ended</span><b>' + num(c.ended) + "</b></div>" +
        '<div class="r"><span>Paid plans given by admins (no subscription)</span><b>' + num(r.complimentary) + "</b></div>";
      $("[data-rev-subs]").innerHTML = r.subscriptions.length ? r.subscriptions.map(function (s) {
        return '<tr data-open-user="' + esc(s.userId) + '" style="cursor:pointer"><td>' + userCell(s) + '</td><td><span class="ad-tag paid">' + esc(s.planName) + "</span></td>" +
          '<td><span class="ad-tag ' + (SUB_TAG[s.status] || "plan") + '">' + esc(s.status.replace("_", " ")) + "</span></td>" +
          "<td>" + (s.price == null ? "-" : "$" + Number(s.price).toFixed(2)) + "</td>" +
          "<td>" + (s.status === "cancelled" ? "ends " + when(s.endsAt) : when(s.renewsAt)) + '</td><td class="ad-muted">' + since(s.created) + "</td></tr>";
      }).join("") : '<tr><td colspan="6"><div class="ad-empty">No subscriptions yet. They appear here as soon as Lemon Squeezy reports a checkout.</div></td></tr>';
    }, function (e) { toast(errText(e), true); });
  }

  /* -------------------------------------------------------- live settings */
  var REWARD_FIELDS = [
    ["reward_texture_minutes", "Texture Studio time per ad", "minutes"],
    ["reward_build_pass_minutes", "Build pass per ad (launch + fixes)", "minutes"],
    ["reward_min_seconds", "Visible watching required", "seconds"],
    ["reward_build_daily", "Build & Run unlocks per account per day", "per day"],
    ["reward_texture_daily", "Texture unlocks per account per day", "per day"]
  ];
  function toggleRow(name, title, sub, on, danger) {
    return '<div class="r"><span><b style="color:var(--text);display:block">' + esc(title) + '</b><span style="font-size:12.5px">' + esc(sub) + "</span></span>" +
      '<label class="ad-toggle' + (danger ? " danger" : "") + '"><input type="checkbox" data-cfg-bool="' + name + '"' + (on ? " checked" : "") + '><i></i></label></div>';
  }
  function loadSettings() {
    A.config().then(renderSettings, function (e) { toast(errText(e), true); });
  }
  function renderSettings(c) {
    var v = c.values, f = c.fields;
    state.cfg = c;
    updateSwitchBadge(v);
    $("[data-cfg-switches]").innerHTML =
      toggleRow("ai_global_pause", "Maintenance: pause AI for everyone", v.ai_global_pause ? "ON - AI requests are refused (admins still work)" : "Off", v.ai_global_pause, true) +
      toggleRow("signups_open", "Allow new sign-ups", v.signups_open ? "Open - email and Google sign-ups work" : "Closed - existing users can still sign in", v.signups_open) +
      toggleRow("rewards_enabled", "Ad unlocks for Free accounts", v.rewards_enabled ? "On - Build & Run and Texture Studio can be unlocked" : "Off - Free accounts see the upgrade option only", v.rewards_enabled);
    $("[data-cfg-text=ai_pause_message]").value = v.ai_pause_message || "";
    $("[data-cfg-rewards]").innerHTML = REWARD_FIELDS.map(function (r) {
      var meta = f[r[0]] || {};
      var isDefault = v[r[0]] === meta.default;
      return '<div class="ad-num"><span>' + esc(r[1]) + "<small>" + esc(r[2]) + " · " + meta.min + "-" + meta.max + (isDefault ? " · default" : " · default " + meta.default) + "</small></span>" +
        '<input class="input" type="number" min="' + meta.min + '" max="' + meta.max + '" value="' + esc(v[r[0]]) + '" data-cfg-num="' + r[0] + '">' +
        '<span class="ad-row-actions"><button class="btn btn-sm" data-cfg-save-num="' + r[0] + '">Save</button>' +
        (isDefault ? "" : '<button class="btn btn-ghost btn-sm" data-cfg-reset="' + r[0] + '">Default</button>') + "</span></div>";
    }).join("");
    renderLook(v, f);
    var a = v.announcement || {};
    var where = a.where || ["site", "app"];
    $("[data-cfg-ann]").innerHTML =
      (v.announcement ? '<div class="ad-status on"><span class="ic">●</span><div><b>Live now</b><span>Shown on ' + esc(where.join(" and ").replace("site", "the website").replace("app", "the app")) + (a.until ? " until " + when(a.until) : "") + "</span></div></div>" : "") +
      '<label>Text<input class="input" data-ann-text maxlength="300" value="' + esc(a.text || "") + '" placeholder="e.g. New: thinking modes are here - pick None, Low, Normal or High under the message box."></label>' +
      '<div class="ad-inline" style="gap:10px;flex-wrap:wrap"><label style="flex:1;min-width:150px">Style<select data-ann-level>' +
        [["info", "Information (blue)"], ["success", "Good news (green)"], ["warning", "Warning (amber)"]].map(function (o) { return '<option value="' + o[0] + '"' + (a.level === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
      '</select></label><label style="flex:1;min-width:150px">Show until (optional)<input class="input" type="datetime-local" data-ann-until value="' + esc((a.until || "").slice(0, 16)) + '"></label></div>' +
      '<div class="ad-inline" style="gap:10px;flex-wrap:wrap"><label style="flex:2;min-width:200px">Link (optional)<input class="input" data-ann-link value="' + esc(a.link || "") + '" placeholder="https://… or /index.html#pricing"></label>' +
      '<label style="flex:1;min-width:120px">Link text<input class="input" data-ann-linktext maxlength="40" value="' + esc(a.linkText || "") + '" placeholder="Learn more"></label></div>' +
      '<div class="ad-inline" style="gap:18px"><label class="ad-check"><input type="checkbox" data-ann-where="site"' + (where.indexOf("site") >= 0 ? " checked" : "") + "> Website banner</label>" +
      '<label class="ad-check"><input type="checkbox" data-ann-where="app"' + (where.indexOf("app") >= 0 ? " checked" : "") + "> Message in the app</label></div>" +
      '<div class="ad-hint" style="margin-bottom:0">Preview</div><div class="ad-ann-preview" data-ann-preview></div>' +
      '<div class="ad-row-actions"><button class="btn btn-primary" data-ann-publish>' + (v.announcement ? "Update announcement" : "Publish announcement") + "</button>" +
      (v.announcement ? '<button class="btn btn-ghost" data-ann-remove>Remove</button>' : "") + "</div>";
    annPreview();
  }
  /* ---------------------------------------------------- theme & promotion */
  var THEME_LOOK = {
    classic: ["◆", "#4f63f5", "#8aa0ff"], halloween: ["🎃", "#ff7a1a", "#9b5cf6"],
    black_friday: ["🏷️", "#e8b92f", "#111111"], cyber_monday: ["⚡", "#14c8e0", "#ec4899"],
    autumn: ["🍂", "#d9622b", "#f5b74a"], christmas: ["🎄", "#d93a3a", "#2fae66"],
    winter: ["❄️", "#4da3e8", "#dcebff"], new_year: ["🎆", "#9b5cf6", "#e8b92f"],
    valentines: ["💖", "#e64a86", "#ffa0be"], spring: ["🌸", "#3fbf7f", "#f48fb1"],
    easter: ["🐣", "#a78bfa", "#fde047"], summer: ["☀️", "#f5a524", "#14b8a6"]
  };
  var PROMO_LABEL = { black_friday: "Black Friday", cyber_monday: "Cyber Monday", christmas: "Christmas sale", new_year: "New Year sale",
    halloween: "Halloween sale", summer: "Summer sale", valentines: "Valentine's offer", easter: "Easter offer", spring: "Spring sale", autumn: "Autumn sale", winter: "Winter sale" };

  function renderLook(v, f) {
    var options = (f.theme && f.theme.options) || [];
    $("[data-cfg-themes]").innerHTML = options.map(function (o) {
      var look = THEME_LOOK[o.id] || THEME_LOOK.classic;
      return '<button type="button" class="ad-theme' + (v.theme === o.id ? " on" : "") + '" data-theme-pick="' + esc(o.id) + '" style="--sw:' + look[1] + ";--sw2:" + look[2] + '">' +
        '<span class="sw">' + look[0] + "</span>" + esc(o.label) + '<span class="ck">●</span></button>';
    }).join("");
    $("[data-theme-preview]").href = "index.html?theme=" + encodeURIComponent(v.theme || "classic");
    $("[data-cfg-theme-switches]").innerHTML =
      toggleRow("theme_effects", "Seasonal decorations on the website", v.theme_effects ? "On - snow, leaves, bats... drift gently (hidden for people who prefer less motion)" : "Off - colours only", v.theme_effects) +
      toggleRow("theme_app", "Use the theme in the desktop app", v.theme_app ? "On - accent colours and a title-bar badge follow the theme" : "Off - the app keeps its classic look", v.theme_app);

    var p = v.promotion, on = state.promoMode != null ? state.promoMode : !!p;
    state.promoMode = on;
    var plans = (f.promotion && f.promotion.plans) || ["builder", "pro", "studio"];
    var chosen = p ? p.plans : ["builder", "pro", "studio"];
    var html = '<div class="ad-promo-mode">' +
      '<button type="button" data-promo-mode="0" class="' + (on ? "" : "on") + '"><b>Same prices</b>Normal prices everywhere, no code.</button>' +
      '<button type="button" data-promo-mode="1" class="' + (on ? "on" : "") + '"><b>Run a promotion</b>Sale prices on the website, code added at checkout.</button></div>';
    if (on) {
      html +=
        (p ? '<div class="ad-status on"><span class="ic">●</span><div><b>Live: ' + esc(p.label) + " - " + p.percent + "% off</b><span>Code " + esc(p.code) + " · " + esc(p.plans.join(", ")) + (p.until ? " · until " + when(p.until) : "") + "</span></div></div>" : "") +
        '<div class="ad-inline" style="gap:10px;flex-wrap:wrap">' +
          '<label style="flex:2;min-width:180px">Name shown to people<input class="input" data-promo-label maxlength="60" value="' + esc(p ? p.label : (PROMO_LABEL[v.theme] || "")) + '" placeholder="e.g. Black Friday"></label>' +
          '<label style="flex:1;min-width:110px">Discount %<input class="input" type="number" min="1" max="90" data-promo-percent value="' + esc(p ? p.percent : 30) + '"></label>' +
          '<label style="flex:1;min-width:140px">Lemon Squeezy code<input class="input" data-promo-code maxlength="40" value="' + esc(p ? p.code : "") + '" placeholder="e.g. BF30" style="text-transform:uppercase"></label></div>' +
        '<div><div class="ad-hint" style="margin-bottom:6px">Plans on sale</div><div class="ad-inline" style="gap:16px">' + plans.map(function (id) {
          return '<label class="ad-check"><input type="checkbox" data-promo-plan="' + id + '"' + (chosen.indexOf(id) >= 0 ? " checked" : "") + "> " + id.charAt(0).toUpperCase() + id.slice(1) + "</label>";
        }).join("") + "</div></div>" +
        '<div class="ad-inline" style="gap:10px;flex-wrap:wrap"><label style="flex:2;min-width:200px">Terms (optional)<input class="input" data-promo-terms maxlength="160" value="' + esc(p ? p.terms : "") + '" placeholder="e.g. First 3 months, new subscriptions only"></label>' +
          '<label style="flex:1;min-width:170px">Ends (optional)<input class="input" type="datetime-local" data-promo-until value="' + esc(p && p.until ? p.until.slice(0, 16) : "") + '"></label></div>' +
        '<div class="ad-promo-preview" data-promo-preview></div>' +
        '<div class="ad-hint">Create the same code in Lemon Squeezy first (Store → Discounts), with the same percentage and duration - Lemon Squeezy is what actually charges the discounted price.</div>' +
        '<div class="ad-row-actions"><button class="btn btn-primary" data-promo-save>' + (p ? "Update promotion" : "Start promotion") + "</button>" +
        (p ? '<button class="btn btn-ghost" data-promo-stop>End promotion</button>' : "") + "</div>";
    } else if (p) {
      html += '<div class="ad-row-actions"><button class="btn" data-promo-stop>End the running promotion (' + esc(p.label) + ")</button></div>";
    }
    $("[data-cfg-promo]").innerHTML = html;
    promoPreview();
  }

  function promoPreview() {
    var box = $("[data-promo-preview]"); if (!box) return;
    var pct = Math.max(0, Math.min(90, Number(($("[data-promo-percent]") || {}).value) || 0));
    var plans = (window.MCA_PLANS && window.MCA_PLANS.plans) || [];
    box.innerHTML = $$("[data-promo-plan]").filter(function (c) { return c.checked; }).map(function (c) {
      var plan = plans.filter(function (x) { return x.id === c.dataset.promoPlan; })[0];
      if (!plan || !plan.price) return "";
      return "<div>" + esc(plan.name) + "<b><s>$" + plan.price.toFixed(2) + "</s>$" + (Math.round(plan.price * (100 - pct)) / 100).toFixed(2) + "</b>per month</div>";
    }).join("");
  }

  function annPreview() {
    var box = $("[data-ann-preview]"); if (!box) return;
    var text = $("[data-ann-text]").value.trim(), lt = $("[data-ann-linktext]").value.trim(), link = $("[data-ann-link]").value.trim();
    box.className = "ad-ann-preview " + $("[data-ann-level]").value;
    box.innerHTML = text ? esc(text) + (link ? ' <u><b>' + esc(lt || "Learn more") + " →</b></u>" : "") : '<span style="opacity:.6">Your announcement appears here.</span>';
  }
  function saveConfig(btn, changes, msg) {
    return run(btn, A.setConfig(changes), msg, "Saving").then(function (c) { renderSettings(c); });
  }

  function tabUnlocks(u) {
    var r = u.rewards;
    if (!r) return '<div class="ad-card"><p class="ad-muted">Unlock data is not available.</p></div>';
    var s = r.status, b = s.build, t = s.textures, cb = r.counts.build || {}, ct = r.counts.textures || {};
    function left(sec) { return sec > 0 ? Math.floor(sec / 60) + "m " + ("0" + sec % 60).slice(-2) + "s left" : "none"; }
    return '<div class="ad-card"><h3>Ad unlocks</h3><p class="ad-sub">' + (r.eligible ? "Free account - can unlock Build & Run and Texture Studio with a short ad." : "Paid plan - includes these tools, no ads needed.") + "</p>" +
      '<div class="ad-mini">' +
        "<div><small>Build & Run credits</small><b>" + num(b.credits) + "</b></div>" +
        "<div><small>Build pass</small><b>" + left(b.secondsLeft) + "</b></div>" +
        "<div><small>Texture Studio</small><b>" + left(t.secondsLeft) + "</b></div>" +
        "<div><small>Used today</small><b>" + num(b.usedToday) + " / " + num(t.usedToday) + '</b><span class="ad-muted" style="font-size:12px">build / texture</span></div>' +
      "</div></div>" +
      '<div class="ad-card"><h3>All-time</h3><div class="ad-rows">' +
        '<div class="r"><span>Build & Run: asked / unlocked / used</span><b>' + num(cb.requested || 0) + " / " + num(cb.granted || 0) + " / " + num(cb.spent || 0) + "</b></div>" +
        '<div class="r"><span>Texture Studio: asked / unlocked</span><b>' + num(ct.requested || 0) + " / " + num(ct.granted || 0) + "</b></div>" +
        '<div class="r"><span>Daily limit reached</span><b>' + num((cb.limit || 0) + (ct.limit || 0)) + "</b></div>" +
        '<div class="r"><span>Given by admins</span><b>' + num((cb.admin || 0) + (ct.admin || 0)) + "</b></div></div></div>" +
      '<div class="ad-card"><h3>Give or remove</h3><p class="ad-sub">For support cases - logged in the activity log.</p>' +
        '<div class="ad-inline" style="flex-wrap:wrap;gap:8px">' +
        '<button class="btn btn-sm" data-rw="grant" data-rw-kind="build" data-rw-amount="1">+1 Build & Run</button>' +
        '<button class="btn btn-sm" data-rw="grant" data-rw-kind="build" data-rw-amount="3">+3 Build & Runs</button>' +
        '<button class="btn btn-sm" data-rw="grant" data-rw-kind="textures" data-rw-amount="5">+5 min Texture Studio</button>' +
        '<button class="btn btn-sm" data-rw="grant" data-rw-kind="textures" data-rw-amount="30">+30 min Texture Studio</button>' +
        '<button class="btn btn-sm" data-rw="reset_today">Reset today\'s limit</button>' +
        '<button class="btn btn-warn btn-sm" data-rw="end_passes">End unlocks now</button></div></div>' +
      '<div class="ad-card"><h3>Recent</h3>' + (r.recent.length ? '<div class="ad-timeline">' + r.recent.map(function (e) {
        return '<div class="ad-ev"><i style="background:' + (e.event === "granted" ? "#3dd68c" : "#4f63f5") + '"></i><div><div>' + esc((EVENT_TEXT[e.event] || e.event).replace(/^./, function (c) { return c.toUpperCase(); })) + " " +
          (e.kind === "build" ? "Build & Run" : "Texture Studio") + (e.source ? " · " + esc(e.source) : "") + '</div></div><time title="' + esc(when(e.at)) + '">' + since(e.at) + "</time></div>";
      }).join("") + "</div>" : '<p class="ad-muted" style="margin:8px 0 0">No unlocks yet.</p>') + "</div>";
  }

  /* -------------------------------------------------------------- health */
  function loadHealth() {
    A.health().then(function (h) {
      var up = h.uptimeSeconds, upText = up > 86400 ? Math.floor(up / 86400) + "d " + Math.floor(up % 86400 / 3600) + "h" : Math.floor(up / 3600) + "h " + Math.floor(up % 3600 / 60) + "m";
      $("[data-health]").innerHTML = [
        kpi("API", "v" + h.version, h.environment + " · Python " + h.python),
        kpi("Uptime", upText, "since the last restart"),
        kpi("Database", h.database.ms + " ms", h.database.ok ? "responding" : "problem", !h.database.ok),
        kpi("Redis", h.redis.ms + " ms", h.redis.ok ? "responding" : "problem", !h.redis.ok),
        kpi("Server time", new Date(h.serverTime).toISOString().slice(11, 16) + " UTC", new Date(h.serverTime).toISOString().slice(0, 10)),
        kpi("Switches", h.switches.aiPaused ? "AI paused" : "Normal", (h.switches.signupsOpen ? "sign-ups open" : "sign-ups closed") + " · " + (h.switches.rewardsEnabled ? "unlocks on" : "unlocks off"), h.switches.aiPaused || !h.switches.signupsOpen)
      ].join("");
      var i = h.integrations;
      function row(name, ok, okText, badText) { return '<div class="r"><span>' + esc(name) + '</span><span class="ad-tag ' + (ok ? "good" : "warn") + '">' + esc(ok ? okText : badText) + "</span></div>"; }
      $("[data-integrations]").innerHTML =
        row("Google sign-in", i.googleSignIn, "configured", "not set up") +
        row("Lemon Squeezy webhooks", i.lemonSqueezyWebhooks, "configured", "no signing secret") +
        row("Lemon Squeezy API (cancel / resume)", i.lemonSqueezyApi, "configured", "LEMONSQUEEZY_API_KEY missing") +
        row("Outgoing email", i.email, "configured", "SMTP not set up");
    }, function (e) { toast(errText(e), true); });
  }

  function loadCharts() {
    $$("[data-range] button").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.days) === state.days); });
    A.stats(state.days).then(function (s) {
      chart($("[data-chart-tokens]"), s.days, "tokens", "aiUsers", function (d) {
        return "<b>" + d.day + "</b><br>" + num(d.tokens) + " tokens · " + num(d.requests) + " requests<br>" + num(d.aiUsers) + " users used AI";
      });
      chart($("[data-chart-signups]"), s.days, "signups", null, function (d) { return "<b>" + d.day + "</b><br>" + num(d.signups) + " new accounts"; }, "#8a5cf6");
    }, function () {});
  }

  /** Bars (+ optional line) in SVG with an HTML tooltip. */
  function chart(host, days, barKey, lineKey, tip, color, lineColor) {
    var W = 600, H = 180, n = days.length, gap = n > 60 ? 1 : 3;
    var bw = (W - gap * (n - 1)) / n;
    var maxB = Math.max.apply(null, days.map(function (d) { return d[barKey]; })) || 1;
    var maxL = lineKey ? (Math.max.apply(null, days.map(function (d) { return d[lineKey]; })) || 1) : 1;
    var bars = days.map(function (d, i) {
      var h = Math.max(d[barKey] ? 3 : 1, d[barKey] / maxB * (H - 12));
      return '<rect x="' + (i * (bw + gap)).toFixed(2) + '" y="' + (H - h).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) + '" rx="2" fill="' + (color || "#4f63f5") + '" opacity="' + (d[barKey] ? .9 : .25) + '"/>';
    }).join("");
    var line = "";
    if (lineKey) {
      var pts = days.map(function (d, i) { return (i * (bw + gap) + bw / 2).toFixed(1) + "," + (H - d[lineKey] / maxL * (H - 20) - 4).toFixed(1); });
      line = '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + (lineColor || "#3dd68c") + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
    }
    host.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
      '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="#262630" vector-effect="non-scaling-stroke"/>' + bars + line + "</svg><div class=\"tip\"></div>";
    var svg = $("svg", host), tipEl = $(".tip", host);
    svg.addEventListener("mousemove", function (e) {
      var box = svg.getBoundingClientRect(), i = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - box.left) / box.width * n)));
      tipEl.innerHTML = tip(days[i]);
      tipEl.style.left = ((i + .5) / n * box.width) + "px"; tipEl.style.top = "10px";
      tipEl.classList.add("show");
    });
    svg.addEventListener("mouseleave", function () { tipEl.classList.remove("show"); });
  }

  function fillPlanFilter(plans) {
    var sel = $("[data-plan-filter]");
    if (sel.options.length > 1) return;
    PLAN_ORDER.forEach(function (p) {
      if (plans[p] == null) return;
      var op = document.createElement("option"); op.value = p; op.textContent = p.charAt(0).toUpperCase() + p.slice(1); sel.appendChild(op);
    });
  }

  /* --------------------------------------------------------------- users */
  function renderChips() {
    $("[data-status-chips]").innerHTML = STATUS_CHIPS.map(function (c) {
      return '<button class="ad-chip' + (state.users.status === c[0] ? " on" : "") + '" data-status="' + c[0] + '">' + esc(c[1]) + "</button>";
    }).join("");
  }

  function planTag(u) { return '<span class="ad-tag ' + (u.plan === "free" ? "plan" : "paid") + '">' + esc(u.planName || u.plan) + "</span>"; }
  function statusTags(u) {
    var t = [];
    if (!u.active) t.push('<span class="ad-tag bad">disabled</span>');
    if (u.admin) t.push('<span class="ad-tag good">admin</span>');
    if (!u.verified) t.push('<span class="ad-tag warn">unverified</span>');
    if (u.twoFactor) t.push('<span class="ad-tag info">2-step</span>');
    if (u.dailyLimitOverride != null) t.push('<span class="ad-tag info">custom limit</span>');
    if (u.hasNote) t.push('<span class="ad-tag plan">note</span>');
    return t.join("") || '<span class="ad-muted">active</span>';
  }
  function usage(u) {
    if (u.dailyLimit == null) return '<span class="ad-mono">' + fmt(u.usedToday) + '</span> <span class="ad-muted">/ ∞</span>';
    var pct = Math.min(100, u.usedToday / Math.max(1, u.dailyLimit) * 100);
    var col = pct >= 100 ? "var(--ruby)" : pct > 80 ? "var(--amber)" : "var(--accent)";
    return '<span class="ad-mono">' + fmt(u.usedToday) + '</span> <span class="ad-muted">/ ' + fmt(u.dailyLimit) + "</span>" +
      '<div class="ad-meter"><i style="width:' + Math.max(1, pct) + "%;background:" + col + '"></i></div>';
  }

  function loadUsers() {
    renderChips();
    var s = state.users;
    $("[data-rows]").innerHTML = '<tr><td colspan="8"><div class="ad-skel" style="margin:10px 0"></div><div class="ad-skel" style="margin:10px 0;width:70%"></div></td></tr>';
    return A.users({ query: s.query, page: s.page, plan: s.plan, status: s.status, sort: s.sort }).then(function (d) {
      s.page = d.page; s.pages = d.pages; s.rows = d.users;
      $("[data-rows]").innerHTML = d.users.length ? d.users.map(function (u) {
        return '<tr data-id="' + esc(u.id) + '"' + (state.selected[u.id] ? ' class="sel"' : "") + ">" +
          '<td class="ck"><input type="checkbox" data-pick="' + esc(u.id) + '"' + (state.selected[u.id] ? " checked" : "") + ' aria-label="Select"></td>' +
          '<td><div class="ad-user"><span class="ad-avatar">' + initial(u) + "</span><div><b>" + esc(u.username) + "</b><span>" + esc(u.email) + "</span></div></div></td>" +
          "<td>" + planTag(u) + "</td><td>" + usage(u) + "</td>" +
          "<td>" + (u.aiEnabled ? '<span class="ad-tag good">on</span>' : '<span class="ad-tag warn" title="' + esc(u.aiReason || "") + '">paused</span>') + "</td>" +
          "<td>" + statusTags(u) + "</td>" +
          '<td class="ad-muted">' + since(u.lastLogin) + '</td><td class="ad-muted">' + since(u.created) + "</td></tr>";
      }).join("") : '<tr><td colspan="8"><div class="ad-empty">No users match these filters.</div></td></tr>';
      $("[data-page-info]").textContent = "Page " + d.page + " of " + d.pages;
      $("[data-total]").textContent = num(d.total) + " user" + (d.total === 1 ? "" : "s");
      $("[data-prev]").disabled = d.page <= 1;
      $("[data-next]").disabled = d.page >= d.pages;
      $("[data-check-all]").checked = d.users.length > 0 && d.users.every(function (u) { return state.selected[u.id]; });
      updateBulk();
    }, function (e) { toast(errText(e), true); });
  }

  function selectedIds() { return Object.keys(state.selected).filter(function (k) { return state.selected[k]; }); }
  function updateBulk() {
    var ids = selectedIds();
    $("[data-bulk]").hidden = !ids.length;
    $("[data-bulk-count]").textContent = ids.length + " selected";
  }

  function bulkAction(action) {
    var ids = selectedIds();
    if (!ids.length) return;
    if (action === "email") {
      var emails = ids.map(function (id) { return state.selected[id]; }).filter(Boolean);
      go("messages");
      setMode("direct");
      $("[data-msg-to]").value = emails.join(", ");
      renderPreview();
      return;
    }
    var o = {
      pause_ai: { title: "Pause AI for " + ids.length + " user(s)?", text: "They can still sign in and use every other feature.", ok: "Pause AI", fields: [{ name: "value", label: "Reason (shown to them)", placeholder: "e.g. Unusual activity - we're looking into it" }] },
      resume_ai: { title: "Resume AI for " + ids.length + " user(s)?", ok: "Resume AI" },
      set_plan: { title: "Change plan for " + ids.length + " user(s)", ok: "Change plan", fields: [{ name: "value", label: "New plan", type: "select", value: "free", options: PLAN_ORDER.map(function (p) { return [p, p]; }) }] },
      sign_out: { title: "Sign " + ids.length + " user(s) out everywhere?", text: "Every browser and app session ends. They can sign in again.", ok: "Sign out", danger: true }
    }[action];
    ask(o).then(function (v) {
      if (!v) return;
      A.bulk(ids, action, v.value).then(function (r) {
        toast(r.updated + " user(s) updated"); state.selected = {}; loadUsers();
      }, function (e) { toast(errText(e), true); });
    });
  }

  function exportCsv(btn) {
    var s = state.users;
    run(btn, A.exportCsv({ query: s.query, plan: s.plan, status: s.status }), "Export ready", "Exporting").then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mycraftingai-users-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  /* --------------------------------------------------------- user panel */
  var TABS = [["overview", "Overview"], ["ai", "AI & limits"], ["unlocks", "Unlocks"], ["plan", "Plan"], ["security", "Security"],
    ["messages", "Email"], ["notes", "Notes"], ["activity", "Activity"], ["danger", "Danger zone"]];

  function openUser(id, tab) {
    state.tab = tab || "overview";
    var p = $("[data-panel]");
    p.innerHTML = '<div class="ad-panel-body"><div class="ad-skel" style="width:40%;height:22px"></div><div class="ad-skel" style="margin-top:14px"></div><div class="ad-skel" style="margin-top:10px;width:80%"></div></div>';
    p.classList.add("show"); $("[data-panel-back]").classList.add("show");
    history.replaceState(null, "", "#users/" + id);
    A.user(id).then(renderPanel, function (e) {
      p.innerHTML = '<div class="ad-panel-body"><button class="ad-x" data-close>✕</button><div class="ad-empty">' + esc(errText(e)) + "</div></div>";
    });
  }
  function closePanel() {
    $("[data-panel]").classList.remove("show"); $("[data-panel-back]").classList.remove("show");
    state.user = null;
    if (/^#users\//.test(location.hash)) history.replaceState(null, "", "#" + state.view);
  }
  function reloadUser() { if (state.user) return A.user(state.user.id).then(renderPanel); }
  /** After a change: show the fresh account and refresh the list behind it. */
  function applied(detail, msg) {
    if (msg) toast(msg);
    if (detail && detail.id) renderPanel(detail); else reloadUser();
    if (state.view === "users") loadUsers();
  }

  function renderPanel(u) {
    state.user = u;
    var self = state.me && state.me.id === u.id;
    var p = $("[data-panel]");
    p.innerHTML =
      '<div class="ad-panel-head">' +
        '<div class="ad-panel-top"><span class="ad-avatar lg">' + initial(u) + '</span><div class="ad-grow">' +
          "<h2>" + esc(u.username) + " " + planTag(u) + (u.admin ? '<span class="ad-tag good">admin</span>' : "") +
          (u.active ? "" : '<span class="ad-tag bad">disabled</span>') + (u.aiEnabled ? "" : '<span class="ad-tag warn">AI paused</span>') + "</h2>" +
          '<div class="em">' + esc(u.email) + " · joined " + since(u.created) + " · last active " + since(u.lastLogin) + "</div></div>" +
          '<button class="ad-x" data-close aria-label="Close">✕</button></div>' +
        '<div class="ad-quick">' +
          '<button class="btn btn-sm" data-q="email">✉ Email</button>' +
          (u.aiEnabled ? '<button class="btn btn-warn btn-sm" data-q="pause">Pause AI</button>' : '<button class="btn btn-ok btn-sm" data-q="resume">Resume AI</button>') +
          '<button class="btn btn-sm" data-q="bonus">+ Tokens</button>' +
          '<button class="btn btn-sm" data-q="signout">Sign out everywhere</button>' +
          '<button class="btn btn-ghost btn-sm" data-q="copy">Copy ID</button>' +
        "</div>" +
        '<div class="ad-tabs">' + TABS.map(function (t) {
          return '<button class="ad-tab' + (state.tab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
        }).join("") + "</div>" +
      "</div>" +
      '<div class="ad-panel-body" data-tab-body></div>';
    renderTab(u, self);
  }

  function renderTab(u, self) {
    var body = $("[data-tab-body]");
    var html = ({ overview: tabOverview, ai: tabAi, unlocks: tabUnlocks, plan: tabPlan, security: tabSecurity, messages: tabMessages,
      notes: tabNotes, activity: tabActivity, danger: tabDanger })[state.tab](u, self);
    body.innerHTML = html;
    body.scrollTop = 0;
    if (state.tab === "overview") miniChart(u);
    if (state.tab === "messages") wireUserMail(u);
  }

  function tabOverview(u) {
    var left = u.remainingToday == null ? "Unlimited" : fmt(u.remainingToday);
    return '<div class="ad-mini">' +
      "<div><small>Today</small><b>" + fmt(u.usedToday) + '</b><span class="ad-muted" style="font-size:12px">of ' + tokens(u.dailyLimit) + "</span></div>" +
      "<div><small>Left today</small><b>" + left + "</b></div>" +
      "<div><small>All-time tokens</small><b>" + fmt(u.allTime.tokens) + "</b></div>" +
      "<div><small>AI requests</small><b>" + num(u.allTime.requests) + "</b></div>" +
      "</div>" +
      '<div class="ad-card" style="margin-top:14px"><h3>Last 30 days</h3><p class="ad-sub">Billable tokens per day</p><div class="ad-chart" data-user-chart style="height:120px"></div></div>' +
      '<div class="ad-card"><div class="ad-inline" style="justify-content:space-between"><h3>Profile</h3><button class="btn btn-ghost btn-sm" data-edit-profile>Edit</button></div><div class="ad-rows">' +
        '<div class="r"><span>Username</span><b>' + esc(u.username) + "</b></div>" +
        '<div class="r"><span>Email</span><span>' + esc(u.email) + (u.verified ? ' <span class="ad-tag good">verified</span>' : ' <span class="ad-tag warn">unverified</span>') + "</span></div>" +
        '<div class="r"><span>Sign-in method</span><span>' + (u.provider === "google" ? "Google" : "Email + password") + "</span></div>" +
        '<div class="r"><span>AI</span><span>' + (u.aiEnabled ? '<span class="ad-tag good">on</span>' : '<span class="ad-tag warn">paused</span> ' + esc(u.aiReason || "")) + "</span></div>" +
        '<div class="r"><span>2-step verification</span><span>' + (u.twoFactor ? "on" : "off") + "</span></div>" +
        '<div class="r"><span>Active sessions</span><span>' + u.sessions.length + "</span></div>" +
        '<div class="r"><span>Joined</span><span>' + when(u.created) + "</span></div>" +
        '<div class="r"><span>Last sign-in</span><span>' + when(u.lastLogin) + "</span></div>" +
        '<div class="r"><span>User ID</span><span class="ad-mono">' + esc(u.id) + "</span></div>" +
      "</div></div>" +
      (u.note ? '<div class="ad-card"><h3>Private note</h3><p style="white-space:pre-wrap;margin:8px 0 0;color:var(--muted)">' + esc(u.note) + "</p></div>" : "");
  }

  function miniChart(u) {
    var host = $("[data-user-chart]"); if (!host) return;
    var byDay = {}; (u.usageHistory || []).forEach(function (h) { byDay[h.day] = h; });
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      var h = byDay[d] || {};
      days.push({ day: d, tokens: h.billable || 0, requests: h.requests || 0, cached: h.cached || 0 });
    }
    chart(host, days, "tokens", null, function (d) { return "<b>" + d.day + "</b><br>" + num(d.tokens) + " tokens · " + num(d.requests) + " requests"; });
  }

  function tabAi(u) {
    var status = u.aiEnabled
      ? '<div class="ad-status on"><span class="ic">✓</span><div><b>AI is on</b><span>This account can send AI requests.</span></div></div>'
      : '<div class="ad-status off"><span class="ic">⏸</span><div><b>AI is paused' + (u.aiPausedUntil ? " until " + when(u.aiPausedUntil) : "") + "</b><span>" +
        (u.aiReason ? "Reason: " + esc(u.aiReason) + " · " : "") + "They can still sign in, create projects, use textures and every non-AI feature.</span></div></div>";
    var aiForm = u.aiEnabled
      ? '<div class="ad-form">' +
          '<label>Reason (shown to the user in the app)<input class="input" data-ai-reason maxlength="300" placeholder="e.g. Unusual activity - we\'re looking into it"></label>' +
          '<label>For<select data-ai-hours><option value="">Until I resume it</option><option value="1">1 hour</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></label>' +
          '<label class="ad-check"><input type="checkbox" data-ai-notify checked> Email the user from support@</label>' +
          '<div><button class="btn btn-warn" data-ai-pause>Pause AI</button></div></div>'
      : '<div class="ad-form"><label class="ad-check"><input type="checkbox" data-ai-notify checked> Email the user that AI is back</label><div><button class="btn btn-ok" data-ai-resume>Resume AI now</button></div></div>';
    return '<div class="ad-card"><h3>AI access</h3><p class="ad-sub">Pause only the AI - the rest of MyCraftingAI keeps working for them.</p>' + status + aiForm + "</div>" +
      '<div class="ad-card"><h3>Daily token limit</h3><p class="ad-sub">Applies every day until removed. Refills at 00:00 UTC.</p><div class="ad-rows">' +
        '<div class="r"><span>Plan default (' + esc(u.planName) + ")</span><span>" + tokens(u.planDailyLimit) + "</span></div>" +
        '<div class="r"><span>Custom limit</span><span>' + (u.dailyLimitOverride == null ? '<span class="ad-muted">none</span>' : "<b>" + num(u.dailyLimitOverride) + "</b>") + "</span></div>" +
        '<div class="r"><span>Bonus today</span><span>' + (u.bonusToday ? "+" + num(u.bonusToday) : '<span class="ad-muted">none</span>') + "</span></div>" +
        '<div class="r"><span>Effective today</span><b>' + tokens(u.dailyLimit) + "</b></div>" +
        '<div class="r"><span>Used today</span><span>' + num(u.usedToday) + "</span></div></div>" +
        '<div class="ad-inline" style="margin-top:12px"><input class="input" type="number" min="0" step="1000" data-limit placeholder="Custom tokens per day, e.g. 500000"><button class="btn" data-limit-save>Set limit</button>' +
        (u.dailyLimitOverride != null ? '<button class="btn btn-ghost" data-limit-clear>Use plan default</button>' : "") + "</div></div>" +
      '<div class="ad-card"><div class="ad-inline" style="justify-content:space-between;align-items:flex-start"><div><h3>Bonus tokens for today</h3><p class="ad-sub">One-off extra allowance; disappears at the next reset. Open apps update within seconds.</p></div>' +
        '<div style="text-align:right"><div class="ad-muted" style="font-size:12px">Bonus today</div><b style="font:700 20px var(--display);color:' + (u.bonusToday ? "var(--mint)" : "var(--muted)") + '">' + (u.bonusToday ? "+" + num(u.bonusToday) : "0") + "</b></div></div>" +
        '<div class="ad-chips" style="margin-bottom:10px">' + [1000, 5000, 10000, 50000, 250000, 1000000].map(function (n) { return '<button class="ad-chip" data-bonus-pick="' + n + '">' + fmt(n) + "</button>"; }).join("") + "</div>" +
        '<div class="ad-inline" style="flex-wrap:wrap;gap:8px"><input class="input" type="number" min="1" step="1000" data-bonus placeholder="Tokens, e.g. 5000" style="flex:1;min-width:150px">' +
          '<button class="btn btn-primary" data-bonus-give>+ Add</button>' +
          '<button class="btn btn-warn" data-bonus-remove' + (u.bonusToday ? "" : " disabled title=\"No bonus to remove today\"") + '>&minus; Remove</button>' +
          (u.bonusToday ? '<button class="btn btn-ghost" data-bonus-clear>Remove all bonus</button>' : "") + "</div>" +
        '<label class="ad-check" style="margin-top:10px"><input type="checkbox" data-bonus-notify> Tell the user by email</label>' +
        '<div class="ad-hint" style="margin-top:6px">Remove takes back bonus tokens given today (never more than the bonus). To lower their allowance further, set a custom daily limit above.</div></div>' +
      '<div class="ad-card"><h3>Today\'s usage</h3><p class="ad-sub">Set today\'s counter back to zero (e.g. after a bug or a failed request).</p><button class="btn" data-reset-usage>Reset today\'s usage</button></div>';
  }

  function tabPlan(u) {
    var sub = u.subscription;
    return '<div class="ad-card"><h3>Plan</h3><p class="ad-sub">Changes apply immediately. Paid plans normally come from checkout - use this for support, gifts and partners.</p>' +
      '<div class="ad-form"><label>Plan<select data-plan-pick>' + PLAN_ORDER.map(function (p) {
        return '<option value="' + p + '"' + (p === u.plan ? " selected" : "") + ">" + p.charAt(0).toUpperCase() + p.slice(1) + "</option>";
      }).join("") + "</select></label>" +
      '<label>Ends on (optional - moves back to Free after this date)<input class="input" type="date" data-plan-end value="' + (u.planExpiresAt ? u.planExpiresAt.slice(0, 10) : "") + '"></label>' +
      '<label class="ad-check"><input type="checkbox" data-plan-notify> Email the user from billing@</label>' +
      '<div class="ad-row-actions"><button class="btn btn-primary" data-plan-save>Save plan</button>' + (u.planExpiresAt ? '<button class="btn btn-ghost" data-plan-noend>Remove end date</button>' : "") + "</div></div></div>" +
      '<div class="ad-card"><h3>Billing</h3><div class="ad-rows">' +
        '<div class="r"><span>Picked at sign-up</span><span>' + esc(u.intendedPlan || "-") + "</span></div>" +
        '<div class="r"><span>Plan ends</span><span>' + (u.planExpiresAt ? when(u.planExpiresAt) : "no end date") + "</span></div>" +
        (sub ? '<div class="r"><span>Subscription</span><span>' + esc(sub.plan) + " · " + esc(sub.status) + "</span></div>" +
          '<div class="r"><span>Renews</span><span>' + when(sub.renewsAt) + "</span></div>" +
          '<div class="r"><span>Ends</span><span>' + when(sub.endsAt) + "</span></div>" +
          (sub.portalUrl ? '<div class="r"><span>Customer portal</span><a href="' + esc(sub.portalUrl) + '" target="_blank" rel="noopener">Open ↗</a></div>' : "")
          : '<div class="r"><span>Subscription</span><span class="ad-muted">none</span></div>') +
      "</div></div>";
  }

  function tabSecurity(u, self) {
    var locked = u.lockedSeconds > 0;
    function row(title, sub, btn) {
      return '<div class="r"><span><b style="color:var(--text);display:block">' + title + '</b><span style="font-size:12.5px">' + sub + "</span></span>" + (btn || "") + "</div>";
    }
    return '<div class="ad-card"><h3>Sign-in & security</h3><div class="ad-rows">' +
      row("Email", u.verified ? "Verified" : "Not verified yet",
        u.verified ? "" : '<span class="ad-row-actions"><button class="btn btn-sm" data-sec="resend-verification">Resend code</button><button class="btn btn-sm" data-mark-verified>Mark verified</button></span>') +
      row("Password", "Email them a reset code (they choose a new password)", '<button class="btn btn-sm" data-sec="password-reset">Send reset email</button>') +
      row("2-step verification", u.twoFactor ? "On - only the user can turn it on" : "Off", u.twoFactor ? '<button class="btn btn-sm" data-2fa-off>Turn off</button>' : "") +
      row("Sign-in lock", locked ? "Locked after failed attempts - " + Math.ceil(u.lockedSeconds / 60) + " min left" : "Not locked", locked ? '<button class="btn btn-sm" data-sec="unlock">Unlock now</button>' : "") +
      (self ? "" : row("Admin access", u.admin ? "Can open this panel" : "Regular user", '<button class="btn btn-sm" data-admin-toggle>' + (u.admin ? "Remove admin" : "Make admin") + "</button>")) +
      "</div></div>" +
      '<div class="ad-card"><h3>Email preferences</h3><div class="ad-form" style="gap:8px">' +
        '<label class="ad-check"><input type="checkbox" data-pref="emailNotifications"' + (u.emailNotifications ? " checked" : "") + "> Product news &amp; announcements</label>" +
        '<label class="ad-check"><input type="checkbox" data-pref="billingEmails"' + (u.billingEmails !== false ? " checked" : "") + "> Plan &amp; billing updates</label>" +
        '<label class="ad-check"><input type="checkbox" data-pref="securityAlerts"' + (u.securityAlerts ? " checked" : "") + "> New sign-in alerts</label>" +
        '<span class="ad-hint">Codes and critical security mail are always sent.</span></div></div>' +
      '<div class="ad-card"><div class="ad-inline" style="justify-content:space-between"><h3>Active sessions (' + u.sessions.length + ")</h3>" +
        (u.sessions.length ? '<button class="btn btn-sm" data-q="signout">End all</button>' : "") + "</div>" +
        (u.sessions.length ? '<div class="ad-rows">' + u.sessions.map(function (s) {
          return '<div class="r"><span><b style="color:var(--text);display:block">' + esc(s.device || s.kind) + '</b><span style="font-size:12.5px">' + esc(s.kind) + " · " + esc(s.ip || "") + " · last seen " + since(s.lastSeen) + "</span></span>" +
            '<button class="btn btn-ghost btn-sm" data-end-session="' + esc(s.id) + '">End</button></div>';
        }).join("") + "</div>" : '<p class="ad-muted" style="margin:8px 0 0">Not signed in anywhere.</p>') + "</div>";
  }

  function senderOptions(selected) {
    return state.senders.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === selected ? " selected" : "") + (s.ready ? "" : " disabled") + ">" +
        esc(s.display) + " <" + esc(s.address) + ">" + (s.ready ? "" : " (not set up)") + "</option>";
    }).join("");
  }

  function tabMessages(u) {
    var sent = (u.activity || []).filter(function (e) { return e.action === "email"; });
    return '<div class="ad-card"><h3>Write to ' + esc(u.username) + "</h3><p class=\"ad-sub\">Sent to " + esc(u.email) + " and saved in the activity log.</p>" +
      '<div class="ad-form"><label>From<select data-um-from>' + senderOptions("support") + "</select></label>" +
      '<label>Template<select data-um-template><option value="">- start from scratch -</option><option value="support">Support reply</option><option value="welcome">Welcome</option><option value="upgrade">Upgrade offer</option><option value="feature">New feature</option></select></label>' +
      '<label>Subject<input class="input" data-um-subject maxlength="200"></label>' +
      '<label>Message<textarea data-um-body maxlength="20000" placeholder="Hi {name},"></textarea></label>' +
      '<div class="ad-hint">Placeholders: <code>{name}</code> <code>{email}</code> <code>{plan}</code></div>' +
      '<div><button class="btn btn-primary" data-um-send>Send email</button></div></div></div>' +
      '<div class="ad-card"><h3>Sent from the panel (' + sent.length + ")</h3>" +
      (sent.length ? '<div class="ad-timeline">' + sent.map(eventHtml).join("") + "</div>" : '<p class="ad-muted" style="margin:8px 0 0">No emails yet.</p>') + "</div>";
  }

  function wireUserMail(u) {
    var tpl = $("[data-um-template]");
    if (!state.senders.length) loadSenders().then(function () { $("[data-um-from]").innerHTML = senderOptions("support"); });
    tpl.addEventListener("change", function () {
      var t = TEMPLATES[tpl.value]; if (!t) return;
      $("[data-um-subject]").value = t[0]; $("[data-um-body]").value = t[1];
    });
  }

  function tabNotes(u) {
    return '<div class="ad-card"><h3>Private note</h3><p class="ad-sub">Only admins can see this. Use it for context: deals, support history, warnings.</p>' +
      '<div class="ad-form"><textarea data-note maxlength="5000" placeholder="e.g. Streamer - 3 months of Pro gifted, renew in March.">' + esc(u.note || "") + "</textarea>" +
      '<div><button class="btn btn-primary" data-note-save>Save note</button></div></div></div>';
  }

  function eventHtml(e) {
    var d = e.details || {}, extra = "";
    if (e.action === "email" || e.action === "broadcast") {
      extra = "<details><summary>Show message</summary><pre>" + esc((d.sender ? "From: " + d.sender + "@mycraftingai.com\n" : "") +
        (d.to ? "To: " + d.to + "\n" : "") + "Subject: " + (d.subject || "") + "\n\n" + (d.body || "")) + "</pre></details>";
    }
    return '<div class="ad-ev"><i style="background:' + (ACTION_COLOR[e.action] || "#4f63f5") + '"></i><div><div>' + esc(e.summary) + "</div>" +
      '<div class="who">by ' + esc(e.admin || "system") + (e.target && state.view === "activity" ? " · " + (e.targetId ? '<a href="#users/' + esc(e.targetId) + '" data-open-user="' + esc(e.targetId) + '">' + esc(e.target) + "</a>" : esc(e.target)) : "") + "</div>" + extra + "</div>" +
      '<time title="' + esc(when(e.at)) + '">' + since(e.at) + "</time></div>";
  }

  function tabActivity(u) {
    var ev = u.activity || [];
    return '<div class="ad-card"><h3>Admin activity on this account</h3>' +
      (ev.length ? '<div class="ad-timeline">' + ev.map(eventHtml).join("") + "</div>" : '<p class="ad-muted" style="margin:8px 0 0">Nothing yet.</p>') + "</div>";
  }

  function tabDanger(u, self) {
    if (self) return '<div class="ad-card"><h3>Danger zone</h3><p class="ad-muted">You can\'t disable or delete your own account from the panel.</p></div>';
    return '<div class="ad-card"><h3>' + (u.active ? "Disable account" : "Enable account") + "</h3><p class=\"ad-sub\">" +
      (u.active ? "Blocks sign-in everywhere and ends every session. Nothing is deleted - you can enable it again." : "Lets them sign in again.") + "</p>" +
      '<button class="btn ' + (u.active ? "btn-warn" : "btn-ok") + '" data-toggle-active>' + (u.active ? "Disable account" : "Enable account") + "</button></div>" +
      '<div class="ad-card" style="border-color:rgba(242,85,90,.35)"><h3>Delete account</h3><p class="ad-sub">Removes the account, sessions and usage history permanently. Cancel paid subscriptions in Lemon Squeezy first.</p>' +
      '<button class="btn btn-danger" data-delete>Delete permanently</button></div>';
  }

  /** Every button inside the panel. */
  function panelClick(e) {
    var u = state.user; if (!u) return;
    var t = e.target.closest("button, a"); if (!t) return;
    var self = state.me && state.me.id === u.id;
    if (t.matches("[data-close]")) return closePanel();
    if (t.dataset.tab) { state.tab = t.dataset.tab; $$(".ad-tab").forEach(function (b) { b.classList.toggle("on", b === t); }); return renderTab(u, self); }

    if (t.dataset.rw) {
      var rw = { action: t.dataset.rw, kind: t.dataset.rwKind || "build", amount: t.dataset.rwAmount ? Number(t.dataset.rwAmount) : null };
      var apply = function () {
        run(t, A.userRewards(u.id, rw), "Done - saved to the activity log", "Saving").then(function (r) { u.rewards = r; renderTab(u, self); });
      };
      if (rw.action === "end_passes") {
        return ask({ title: "End " + u.username + "'s unlocks now?", text: "Running Build & Run and Texture Studio unlocks stop and saved Build & Run credits are removed.", ok: "End unlocks", danger: true }).then(function (v) { if (v) apply(); });
      }
      return apply();
    }

    var q = t.dataset.q;
    if (q === "email") { state.tab = "messages"; return renderPanel(u); }
    if (q === "copy") { navigator.clipboard && navigator.clipboard.writeText(u.id); return toast("User ID copied"); }
    if (q === "pause") { state.tab = "ai"; return renderPanel(u); }
    if (q === "resume") return run(t, A.update(u.id, { aiPaused: false, notifyUser: true }), null, "Resuming").then(function (d) { applied(d, "AI resumed - user notified"); });
    if (q === "bonus") { state.tab = "ai"; renderPanel(u); var b = $("[data-bonus]"); if (b) b.focus(); return; }
    if (q === "signout") {
      return ask({ title: "Sign " + u.username + " out everywhere?", text: "Every browser and app session ends now.", ok: "Sign out", danger: true }).then(function (v) {
        if (v) run(t, A.revokeSessions(u.id), null, "Signing out").then(function (r) { applied(null, r.revoked + " session(s) ended"); });
      });
    }

    if (t.matches("[data-ai-pause]")) {
      var hours = $("[data-ai-hours]").value;
      var body = { aiPaused: true, aiReason: $("[data-ai-reason]").value.trim(), notifyUser: $("[data-ai-notify]").checked };
      if (hours) body.aiPauseHours = Number(hours);
      return run(t, A.update(u.id, body), null, "Pausing").then(function (d) { applied(d, "AI paused" + (body.notifyUser ? " - user notified" : "")); });
    }
    if (t.matches("[data-ai-resume]")) return run(t, A.update(u.id, { aiPaused: false, notifyUser: $("[data-ai-notify]").checked }), null, "Resuming").then(function (d) { applied(d, "AI resumed"); });
    if (t.matches("[data-limit-save]")) {
      var lim = $("[data-limit]").value.trim();
      if (lim === "" || isNaN(Number(lim)) || Number(lim) < 0) return toast("Enter a number of tokens.", true);
      return run(t, A.update(u.id, { dailyLimit: Math.round(Number(lim)) }), null, "Saving").then(function (d) { applied(d, "Daily limit set"); });
    }
    if (t.matches("[data-limit-clear]")) return run(t, A.update(u.id, { clearDailyLimit: true }), null, "Saving").then(function (d) { applied(d, "Back to the plan's limit"); });
    if (t.dataset.bonusPick) { $("[data-bonus]").value = t.dataset.bonusPick; return; }
    if (t.matches("[data-bonus-give]")) {
      var n = Math.round(Number($("[data-bonus]").value));
      if (!(n > 0)) return toast("Enter how many tokens to add.", true);
      return run(t, A.bonus(u.id, n, $("[data-bonus-notify]").checked), null, "Adding").then(function (d) { applied(d, "+" + fmt(n) + " tokens for today"); });
    }
    if (t.matches("[data-bonus-remove], [data-bonus-clear]")) {
      var all = t.matches("[data-bonus-clear]");
      var want = all ? null : Math.round(Number($("[data-bonus]").value));
      if (!all && !(want > 0)) return toast("Enter how many tokens to remove.", true);
      var take = all ? u.bonusToday : Math.min(want, u.bonusToday || 0);
      return ask({
        title: "Remove " + num(take) + " bonus tokens from " + u.username + "?",
        text: ((all ? "All of today's bonus is taken back. " : (want > (u.bonusToday || 0)
          ? "They only have +" + num(u.bonusToday) + " bonus today, so that much is removed. "
          : "")) + "Their allowance today becomes " + tokens(u.dailyLimit == null ? null : u.dailyLimit - take) + ".").trim(),
        ok: "Remove tokens", danger: true
      }).then(function (v) {
        if (!v) return;
        run(t, A.removeBonus(u.id, all ? null : want, $("[data-bonus-notify]").checked), null, "Removing").then(function (d) {
          applied(d, "-" + fmt(d.bonusRemoved) + " bonus tokens · bonus now " + (d.bonusToday ? "+" + fmt(d.bonusToday) : "0"));
        });
      });
    }
    if (t.matches("[data-reset-usage]")) {
      return ask({ title: "Reset today's usage?", text: u.username + " has used " + num(u.usedToday) + " tokens today. This sets it back to 0.", ok: "Reset" }).then(function (v) {
        if (v) run(t, A.update(u.id, { resetUsageToday: true }), null, "Resetting").then(function (d) { applied(d, "Usage reset"); });
      });
    }
    if (t.matches("[data-plan-save]")) {
      var plan = $("[data-plan-pick]").value, end = $("[data-plan-end]").value;
      var change = { notifyUser: $("[data-plan-notify]").checked };
      if (plan !== u.plan) change.plan = plan;
      if (end) change.planExpiresAt = end + "T23:59:59Z";
      if (!change.plan && !change.planExpiresAt) return toast("Nothing changed.");
      // A plan change clears the end date, so send the date in a second step.
      var first = change.plan ? A.update(u.id, { plan: change.plan, notifyUser: change.notifyUser }) : Promise.resolve(null);
      return run(t, first.then(function (d) { return change.planExpiresAt ? A.update(u.id, { planExpiresAt: change.planExpiresAt }) : d; }), null, "Saving")
        .then(function (d) { applied(d, "Plan saved"); });
    }
    if (t.matches("[data-plan-noend]")) return run(t, A.update(u.id, { clearPlanExpiry: true }), null, "Saving").then(function (d) { applied(d, "End date removed"); });
    if (t.dataset.sec) {
      var labels = { "password-reset": "Reset email sent", "resend-verification": "Verification code sent", unlock: "Sign-in unlocked" };
      return run(t, A.action(u.id, t.dataset.sec), null, "Working").then(function () { applied(null, labels[t.dataset.sec]); });
    }
    if (t.matches("[data-mark-verified]")) return run(t, A.update(u.id, { emailVerified: true }), null, "Saving").then(function (d) { applied(d, "Email marked as verified"); });
    if (t.matches("[data-2fa-off]")) {
      return ask({ title: "Turn off 2-step verification?", text: "Only do this after confirming it's really them (e.g. they lost access to their email). They get a security email.", ok: "Turn off", danger: true }).then(function (v) {
        if (v) run(t, A.update(u.id, { twoFactor: false }), null, "Saving").then(function (d) { applied(d, "2-step verification turned off"); });
      });
    }
    if (t.matches("[data-admin-toggle]")) {
      return ask({ title: u.admin ? "Remove admin access?" : "Make " + u.username + " an admin?", text: u.admin ? "" : "Admins can see every account and change anything in this panel.", ok: u.admin ? "Remove" : "Make admin", danger: !u.admin }).then(function (v) {
        if (v) run(t, A.update(u.id, { admin: !u.admin }), null, "Saving").then(function (d) { applied(d, u.admin ? "Admin removed" : "Admin granted"); });
      });
    }
    if (t.dataset.endSession) return run(t, A.endSession(u.id, t.dataset.endSession), null, "Ending").then(function () { applied(null, "Session ended"); });
    if (t.matches("[data-um-send]")) {
      var msg = { sender: $("[data-um-from]").value, subject: $("[data-um-subject]").value.trim(), body: $("[data-um-body]").value.trim() };
      if (!msg.subject || !msg.body) return toast("Write a subject and a message.", true);
      return run(t, A.emailUser(u.id, msg), null, "Sending").then(function () { applied(null, "Email sent to " + u.email); });
    }
    if (t.matches("[data-note-save]")) return run(t, A.update(u.id, { note: $("[data-note]").value }), null, "Saving").then(function (d) { applied(d, "Note saved"); });
    if (t.matches("[data-edit-profile]")) {
      return ask({ title: "Edit profile", ok: "Save", fields: [{ name: "username", label: "Username", value: u.username }, { name: "email", label: "Email", type: "email", value: u.email }] }).then(function (v) {
        if (!v) return;
        var ch = {};
        if (v.username.trim() && v.username.trim() !== u.username) ch.username = v.username.trim();
        if (v.email.trim() && v.email.trim().toLowerCase() !== u.email) ch.email = v.email.trim();
        if (!Object.keys(ch).length) return;
        A.update(u.id, ch).then(function (d) { applied(d, "Profile updated"); }, function (er) { toast(errText(er), true); });
      });
    }
    if (t.matches("[data-toggle-active]")) {
      return ask({
        title: u.active ? "Disable " + u.username + "?" : "Enable " + u.username + "?",
        text: u.active ? "They're signed out everywhere and can't sign in until you enable the account again." : "",
        ok: u.active ? "Disable" : "Enable", danger: u.active,
        fields: u.active ? [{ name: "reason", label: "Reason (for the activity log)" }] : []
      }).then(function (v) {
        if (v) run(t, A.update(u.id, { active: !u.active, reason: v.reason || "" }), null, "Saving").then(function (d) { applied(d, u.active ? "Account disabled" : "Account enabled"); });
      });
    }
    if (t.matches("[data-delete]")) {
      return ask({ title: "Delete " + u.username + " permanently?", text: "This can't be undone. Type the username to confirm.", ok: "Delete forever", danger: true, confirmText: u.username,
        fields: [{ name: "confirm", label: "Username", placeholder: u.username }] }).then(function (v) {
        if (v) run(t, A.remove(u.id), null, "Deleting").then(function () { toast("Account deleted"); closePanel(); loadUsers(); });
      });
    }
  }

  function panelChange(e) {
    var u = state.user; if (!u) return;
    var el = e.target;
    if (el.dataset.pref) {
      var ch = {}; ch[el.dataset.pref] = el.checked;
      A.update(u.id, ch).then(function (d) { state.user = d; toast("Preference saved"); }, function (er) { el.checked = !el.checked; toast(errText(er), true); });
    }
  }

  /* ------------------------------------------------------------ messages */
  function loadSenders() {
    return A.system().then(function (s) { state.senders = s.senders; return s; });
  }

  function setMode(mode) {
    state.msg.mode = mode;
    $$("[data-msg-mode] button").forEach(function (b) { b.classList.toggle("on", b.dataset.mode === mode); });
    $$("[data-direct-only]").forEach(function (el) { el.hidden = mode !== "direct"; });
    $$("[data-broadcast-only]").forEach(function (el) { el.hidden = mode !== "broadcast"; });
    $("[data-msg-preview]").hidden = mode !== "broadcast";
    $("[data-msg-send]").textContent = mode === "broadcast" ? "Send broadcast…" : "Send";
    $("[data-msg-info]").textContent = "";
  }

  function loadMessages() {
    var from = $("[data-msg-from]");
    var fill = function () { if (!from.options.length) from.innerHTML = senderOptions("support"); renderPreview(); };
    state.senders.length ? fill() : loadSenders().then(fill, function (e) { toast(errText(e), true); });
    var plans = $("[data-aud-plans]");
    if (!plans.children.length) {
      plans.innerHTML = PLAN_ORDER.map(function (p) { return '<button class="ad-chip" data-aud-plan="' + p + '" style="text-transform:capitalize">' + p + "</button>"; }).join("");
    }
    Promise.all([A.events(1, "email"), A.events(1, "broadcast")]).then(function (r) {
      var all = r[0].events.concat(r[1].events).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 15);
      $("[data-sent-list]").innerHTML = all.length ? all.map(eventHtml).join("") : '<p class="ad-muted" style="margin:0">Nothing sent yet.</p>';
    }, function () { $("[data-sent-list]").innerHTML = ""; });
  }

  function renderPreview() {
    var box = state.senders.filter(function (s) { return s.id === $("[data-msg-from]").value; })[0] || { display: "MyCraftingAI", address: "support@mycraftingai.com" };
    var sample = { name: "Steve", email: "steve@example.com", plan: "Free" };
    function fill(t) { return t.replace(/\{name\}/g, sample.name).replace(/\{email\}/g, sample.email).replace(/\{plan\}/g, sample.plan); }
    var subject = fill($("[data-msg-subject]").value || "Subject");
    var paras = fill($("[data-msg-body]").value || "Your message appears here.").split(/\n\s*\n/).filter(Boolean);
    $("[data-mail-preview]").innerHTML = '<div class="bar"><b>' + esc(box.display) + "</b> &lt;" + esc(box.address) + "&gt;<br>Subject: " + esc(subject) + "</div>" +
      '<div class="body"><div class="brandline">MyCraftingAI</div><h4>' + esc(subject) + "</h4>" + paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      '<p style="color:#888;font-size:12px;margin-top:16px">https://mycraftingai.com</p></div>';
  }

  function segment() {
    return {
      plans: $$("[data-aud-plan].on").map(function (b) { return b.dataset.audPlan; }),
      status: $("[data-aud-status]").value,
      verifiedOnly: $("[data-aud-verified]").checked,
      activeDays: Number($("[data-aud-active]").value) || 0
    };
  }

  function message() {
    return { sender: $("[data-msg-from]").value, subject: $("[data-msg-subject]").value.trim(), body: $("[data-msg-body]").value.trim() };
  }

  function previewAudience(btn) {
    var m = message();
    var body = { sender: m.sender, subject: m.subject || "-", body: m.body || "-", segment: segment(), serviceNotice: $("[data-aud-service]").checked, dryRun: true };
    return run(btn, A.broadcast(body), null, "Counting").then(function (r) {
      $("[data-msg-info]").textContent = num(r.recipients) + " recipient(s)" + (r.sample.length ? " · e.g. " + r.sample.slice(0, 3).join(", ") : "");
      return r;
    });
  }

  function send(btn) {
    var m = message();
    if (!m.subject || !m.body) return toast("Write a subject and a message.", true);
    if (state.msg.mode === "direct") {
      var to = $("[data-msg-to]").value.split(/[\s,;]+/).filter(function (x) { return x.indexOf("@") > 0; });
      if (!to.length) return toast("Add at least one email address.", true);
      return ask({ title: "Send to " + to.length + " address(es)?", text: "From " + m.sender + "@mycraftingai.com: “" + m.subject + "”", ok: "Send" }).then(function (v) {
        if (!v) return;
        run(btn, A.email({ sender: m.sender, to: to, subject: m.subject, body: m.body }), null, "Sending").then(function (r) {
          toast("Sent to " + r.count + " address(es)"); $("[data-msg-to]").value = ""; loadMessages();
        });
      });
    }
    previewAudience(btn).then(function (r) {
      if (!r.recipients) return toast("No one matches this audience.", true);
      ask({
        title: "Send to " + num(r.recipients) + " people?", ok: "Send broadcast", danger: true, confirmText: String(r.recipients),
        text: "Each person gets their own copy from " + m.sender + "@mycraftingai.com. This can't be undone. Type " + r.recipients + " to confirm.",
        fields: [{ name: "confirm", label: "Number of recipients" }]
      }).then(function (v) {
        if (!v) return;
        var body = { sender: m.sender, subject: m.subject, body: m.body, segment: segment(), serviceNotice: $("[data-aud-service]").checked, dryRun: false };
        run(btn, A.broadcast(body), null, "Starting").then(function (res) {
          toast("Broadcast started - " + num(res.recipients) + " emails are going out"); loadMessages();
        });
      });
    });
  }

  /* ------------------------------------------------------------ activity */
  function loadEvents() {
    var ev = state.ev;
    $("[data-events]").innerHTML = '<div class="ad-skel"></div>';
    A.events(ev.page, ev.action).then(function (d) {
      ev.pages = d.pages;
      $("[data-events]").innerHTML = d.events.length ? d.events.map(eventHtml).join("") : '<div class="ad-empty">No activity yet.</div>';
      $("[data-ev-page]").textContent = "Page " + d.page + " of " + d.pages + " · " + num(d.total) + " events";
      $("[data-ev-prev]").disabled = d.page <= 1; $("[data-ev-next]").disabled = d.page >= d.pages;
    }, function (e) { toast(errText(e), true); });
  }

  /* -------------------------------------------------------------- system */
  function loadSystem() {
    loadHealth();
    loadSenders().then(function (s) {
      $("[data-keys]").innerHTML = s.keys.length ? s.keys.map(function (k) {
        var tag = k.status === "active" ? "good" : k.status === "degraded" ? "warn" : "bad";
        return "<tr><td><b>" + esc(k.label) + '</b><div class="ad-muted" style="font-size:12px">added ' + since(k.added) + "</div></td><td>" + esc(k.pool) +
          '</td><td><span class="ad-tag ' + tag + '">' + esc(k.status) + "</span></td><td>" + num(k.users) + (k.maxUsers ? " / " + num(k.maxUsers) : "") +
          '</td><td class="ad-muted" style="font-size:13px">' + esc(k.lastError || "-") + (k.lastErrorAt ? "<br>" + since(k.lastErrorAt) : "") + "</td>" +
          '<td><button class="btn btn-sm ' + (k.status === "active" ? "" : "btn-ok") + '" data-key="' + esc(k.id) + '" data-key-on="' + (k.status === "active" ? "0" : "1") + '">' +
          (k.status === "active" ? "Disable" : "Enable") + "</button></td></tr>";
      }).join("") : '<tr><td colspan="6"><div class="ad-empty">No keys. Add one on the server: docker compose exec -T api python -m app.cli add-key</div></td></tr>';
      $("[data-mailboxes]").innerHTML = s.senders.map(function (m) {
        return '<div class="r"><span><b style="color:var(--text);display:block">' + esc(m.address) + '</b><span style="font-size:12.5px">' + esc(m.purpose) + "</span></span>" +
          '<span data-mb="' + esc(m.address) + '">' + (m.ready ? '<span class="ad-tag good">configured</span>' : '<span class="ad-tag bad">no password</span>') + "</span></div>";
      }).join("");
      $("[data-plans-table]").innerHTML = s.plans.map(function (p) {
        return '<div class="r"><span><span class="ad-dot" style="display:inline-block;margin-right:8px;background:' + (PLAN_COLOR[p.id] || "#888") + '"></span>' + esc(p.name) + "</span><span class=\"ad-mono\">" + tokens(p.dailyTokens) + " / day</span></div>";
      }).join("");
    }, function (e) { toast(errText(e), true); });
  }

  /* ---------------------------------------------------------------- boot */
  function gate(title, sub, label, href) {
    $("[data-gate]").hidden = false; $("[data-shell]").hidden = true;
    $("[data-gate-title]").textContent = title; $("[data-gate-sub]").textContent = sub || "";
    var a = $("[data-gate-action]");
    if (label) { a.textContent = label; a.href = href; a.hidden = false; } else a.hidden = true;
  }

  function route() {
    var h = location.hash.replace(/^#/, "");
    var m = h.match(/^users\/([0-9a-f-]{36})$/i);
    if (m) { if (state.view !== "users") go("users", false); openUser(m[1]); return; }
    var view = ["dashboard", "insights", "ads", "revenue", "settings", "users", "messages", "activity", "system"].indexOf(h) >= 0 ? h : "dashboard";
    if (view !== state.view || !state.booted) go(view, false);
    state.booted = true;
  }

  function start() {
    if (api.mode === "offline") return gate("Admin", "The account server isn't reachable from here.");
    api.me().then(function (me) {
      if (!me.user.isAdmin) return gate("Not authorised", "You're signed in as " + me.user.email + ", which isn't an admin account.", "Back to site", "index.html");
      $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
      $("[data-me-name]").textContent = me.user.name || "Admin";
      $("[data-me-email]").textContent = me.user.email;
      $("[data-me-avatar]").textContent = (me.user.name || me.user.email).charAt(0).toUpperCase();
      state.me = { id: null, email: me.user.email };
      A.users({ query: me.user.email }).then(function (r) {
        var mine = r.users.filter(function (u) { return u.email === me.user.email; })[0];
        if (mine) state.me.id = mine.id;
      });
      loadSenders();
      route();
    }, function (err) {
      if (err.code === "unauthorized" || err.status === 401) return gate("Sign in required", "Sign in with your admin account to continue.", "Sign in", "login.html?next=" + encodeURIComponent("admin.html"));
      gate("Couldn't load", errText(err), "Retry", "admin.html");
    });
  }

  /* -------------------------------------------------------------- events */
  var searchTimer;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches("[data-search]")) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { state.users.query = t.value.trim(); state.users.page = 1; loadUsers(); }, 250);
    }
    if (t.matches("[data-msg-subject], [data-msg-body]")) renderPreview();
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("[data-plan-filter]")) { state.users.plan = t.value; state.users.page = 1; loadUsers(); }
    if (t.matches("[data-sort]")) { state.users.sort = t.value; state.users.page = 1; loadUsers(); }
    if (t.matches("[data-ev-filter]")) { state.ev.action = t.value; state.ev.page = 1; loadEvents(); }
    if (t.matches("[data-msg-from]")) renderPreview();
    if (t.matches("[data-msg-template]")) {
      var tp = TEMPLATES[t.value]; if (tp) { $("[data-msg-subject]").value = tp[0]; $("[data-msg-body]").value = tp[1]; renderPreview(); }
    }
    if (t.matches("[data-pick]")) {
      var row = state.users.rows.filter(function (r) { return r.id === t.dataset.pick; })[0];
      if (t.checked) state.selected[t.dataset.pick] = row ? row.email : true; else delete state.selected[t.dataset.pick];
      t.closest("tr").classList.toggle("sel", t.checked);
      updateBulk();
    }
    if (t.matches("[data-check-all]")) {
      state.users.rows.forEach(function (r) { if (t.checked) state.selected[r.id] = r.email; else delete state.selected[r.id]; });
      loadUsers();
    }
  });
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-panel]")) return panelClick(e);
    var nav = t.closest("[data-nav]"); if (nav) return go(nav.dataset.nav);
    if (t.closest("[data-menu]")) return $("[data-side]").classList.toggle("open");
    if (t.matches("[data-panel-back]")) return closePanel();
    if (t.closest("[data-pick], [data-check-all]") || t.closest("td.ck")) return;
    var row = t.closest("[data-rows] tr[data-id]"); if (row) return openUser(row.dataset.id);
    var openU = t.closest("[data-open-user]"); if (openU) { e.preventDefault(); return openUser(openU.dataset.openUser); }
    var st = t.closest("[data-status]"); if (st) { state.users.status = st.dataset.status; state.users.page = 1; return loadUsers(); }
    var gs = t.closest("[data-goto-status]"); if (gs) { state.users.status = gs.dataset.gotoStatus; state.users.page = 1; return go("users"); }
    var rg = t.closest("[data-range] button"); if (rg) { state.days = Number(rg.dataset.days); return loadCharts(); }
    if (t.closest("[data-refresh]")) return loadDashboard();
    if (t.matches("[data-prev]") && state.users.page > 1) { state.users.page--; return loadUsers(); }
    if (t.matches("[data-next]") && state.users.page < state.users.pages) { state.users.page++; return loadUsers(); }
    if (t.closest("[data-export]")) return exportCsv(t.closest("[data-export]"));
    var ba = t.closest("[data-bulk-act]"); if (ba) return bulkAction(ba.dataset.bulkAct);
    if (t.closest("[data-bulk-clear]")) { state.selected = {}; return loadUsers(); }
    var mm = t.closest("[data-msg-mode] button"); if (mm) return setMode(mm.dataset.mode);
    var ap = t.closest("[data-aud-plan]"); if (ap) { ap.classList.toggle("on"); $("[data-msg-info]").textContent = ""; return; }
    if (t.closest("[data-msg-preview]")) return previewAudience(t.closest("[data-msg-preview]"));
    if (t.closest("[data-msg-send]")) return send(t.closest("[data-msg-send]"));
    if (t.matches("[data-ev-prev]") && state.ev.page > 1) { state.ev.page--; return loadEvents(); }
    if (t.matches("[data-ev-next]") && state.ev.page < state.ev.pages) { state.ev.page++; return loadEvents(); }
    var key = t.closest("[data-key]");
    if (key) {
      var on = key.dataset.keyOn === "1";
      return ask({ title: (on ? "Enable" : "Disable") + " this AI key?", text: on ? "It will be used for requests again." : "Users on it move to another active key.", ok: on ? "Enable" : "Disable", danger: !on }).then(function (v) {
        if (v) run(key, A.keyStatus(key.dataset.key, on), on ? "Key enabled" : "Key disabled", "Saving").then(loadSystem);
      });
    }
    if (t.closest("[data-check-mail]")) {
      var b = t.closest("[data-check-mail]");
      return run(b, A.checkEmail(), null, "Testing").then(function (r) {
        r.mailboxes.forEach(function (m) {
          var cell = $('[data-mb="' + m.address + '"]');
          if (cell) cell.innerHTML = m.ok ? '<span class="ad-tag good">login ok</span>' : '<span class="ad-tag bad" title="' + esc(m.detail) + '">' + esc(m.detail) + "</span>";
        });
        var bad = r.mailboxes.filter(function (m) { return !m.ok; }).length;
        toast(bad ? bad + " mailbox(es) need attention" : "All mailboxes sign in fine", !!bad);
      });
    }
    if (t.closest("[data-signout]")) api.logout().then(function () { location.href = "login.html"; });

    // Insights / Ads / Settings
    var ir = t.closest("[data-ins-range] button"); if (ir) { state.insDays = Number(ir.dataset.days); return loadInsights(); }
    var ar = t.closest("[data-ads-range] button"); if (ar) { state.adsDays = Number(ar.dataset.days); return loadAds(); }
    var jump = t.closest("[data-nav-jump]"); if (jump) return go(jump.dataset.navJump);
    if (t.closest("[data-gh-refresh]")) {
      return run(t.closest("[data-gh-refresh]"), A.githubRefresh(), "Download counts refreshed", "Refreshing").then(renderGithub);
    }
    if (t.closest("[data-export-metrics]")) {
      return run(t.closest("[data-export-metrics]"), A.exportMetrics(365), "Export ready", "Exporting").then(function (b) { downloadBlob(b, "mycraftingai-metrics.csv"); });
    }
    var sn = t.closest("[data-cfg-save-num]");
    if (sn) {
      var field = sn.dataset.cfgSaveNum, input = $('[data-cfg-num="' + field + '"]'), change = {};
      change[field] = Number(input.value);
      return saveConfig(sn, change, "Saved - live now");
    }
    var rs = t.closest("[data-cfg-reset]");
    if (rs) return run(rs, A.resetConfig(rs.dataset.cfgReset), "Back to the default", "Resetting").then(renderSettings);
    var st2 = t.closest("[data-cfg-save-text]");
    if (st2) {
      var tf = {}; tf[st2.dataset.cfgSaveText] = $('[data-cfg-text="' + st2.dataset.cfgSaveText + '"]').value;
      return saveConfig(st2, tf, "Message saved");
    }
    var tp = t.closest("[data-theme-pick]");
    if (tp) {
      var themeId = tp.dataset.themePick, label = tp.textContent.replace("●", "").trim();
      if (state.cfg && state.cfg.values.theme === themeId) return;
      return ask({ title: "Switch to " + label + "?", text: "The website and every open app change within seconds.", ok: "Switch theme" }).then(function (v) {
        if (v) saveConfig(tp, { theme: themeId }, label + " theme is live");
      });
    }
    var pm = t.closest("[data-promo-mode]");
    if (pm) {
      state.promoMode = pm.dataset.promoMode === "1";
      return renderLook(state.cfg.values, state.cfg.fields);
    }
    if (t.closest("[data-promo-save]")) {
      var untilP = $("[data-promo-until]").value;
      var promo = {
        label: $("[data-promo-label]").value.trim(), percent: Number($("[data-promo-percent]").value),
        code: $("[data-promo-code]").value.trim().toUpperCase(), terms: $("[data-promo-terms]").value.trim(),
        plans: $$("[data-promo-plan]").filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.promoPlan; }),
        until: untilP ? new Date(untilP).toISOString() : null
      };
      var btnP = t.closest("[data-promo-save]");
      return ask({ title: "Start " + (promo.label || "the promotion") + "?", text: promo.percent + "% off " + promo.plans.join(", ") + " with code " + promo.code + ". The website shows the sale prices right away.", ok: "Go live" }).then(function (v) {
        if (v) saveConfig(btnP, { promotion: promo }, "Promotion is live");
      });
    }
    if (t.closest("[data-promo-stop]")) {
      var btnS = t.closest("[data-promo-stop]");
      return ask({ title: "End the promotion?", text: "Prices go back to normal everywhere.", ok: "End promotion", danger: true }).then(function (v) {
        if (v) { state.promoMode = false; saveConfig(btnS, { promotion: null }, "Prices are back to normal"); }
      });
    }
    if (t.closest("[data-ann-publish]")) {
      var where = $$("[data-ann-where]").filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.annWhere; });
      var until = $("[data-ann-until]").value;
      var ann = {
        id: "a" + Date.now().toString(36), text: $("[data-ann-text]").value.trim(), level: $("[data-ann-level]").value,
        link: $("[data-ann-link]").value.trim(), linkText: $("[data-ann-linktext]").value.trim(), where: where,
        until: until ? new Date(until).toISOString() : null
      };
      return saveConfig(t.closest("[data-ann-publish]"), { announcement: ann }, "Announcement is live");
    }
    if (t.closest("[data-ann-remove]")) {
      return ask({ title: "Remove the announcement?", text: "It disappears from the website and the app.", ok: "Remove", danger: true }).then(function (v) {
        if (v) saveConfig(t.closest("[data-ann-remove]"), { announcement: null }, "Announcement removed");
      });
    }
  });
  document.addEventListener("change", function (e) {
    var box = e.target.closest && e.target.closest("[data-cfg-bool]");
    if (!box) return;
    var name = box.dataset.cfgBool, on = box.checked, change = {};
    change[name] = on;
    var risky = (name === "ai_global_pause" && on) || (name === "signups_open" && !on) || (name === "rewards_enabled" && !on);
    var titles = { ai_global_pause: on ? "Pause AI for everyone?" : "Turn AI back on?", signups_open: on ? "Open sign-ups?" : "Close new sign-ups?",
      rewards_enabled: on ? "Turn ad unlocks on?" : "Turn ad unlocks off?",
      theme_effects: on ? "Show seasonal decorations?" : "Hide seasonal decorations?",
      theme_app: on ? "Use the theme in the desktop app?" : "Keep the app on its classic look?" };
    var texts = { ai_global_pause: on ? "Every AI request is refused with the maintenance message until you switch it off. Admins can still use AI." : "AI requests work again for everyone.",
      signups_open: on ? "New accounts can be created again." : "Nobody can create an account (email or Google). Existing users can still sign in.",
      rewards_enabled: on ? "Free accounts can unlock Build & Run and Texture Studio with an ad again." : "Free accounts can't unlock with ads; running unlocks finish normally.",
      theme_effects: on ? "Snow, leaves and other seasonal touches drift gently on the website." : "The website keeps the theme colours without moving decorations.",
      theme_app: on ? "Open apps switch to the theme colours within seconds." : "Open apps switch back to the classic colours within seconds." };
    box.checked = !on;  // until confirmed
    ask({ title: titles[name], text: texts[name], ok: "Confirm", danger: risky }).then(function (v) {
      if (!v) return;
      box.checked = on;
      A.setConfig(change).then(function (c) { renderSettings(c); toast("Saved - live now"); }, function (err) { box.checked = !on; toast(errText(err), true); });
    });
  });
  document.addEventListener("input", function (e) {
    if (e.target.matches && e.target.matches("[data-ann-text], [data-ann-link], [data-ann-linktext]")) annPreview();
    if (e.target.matches && e.target.matches("[data-promo-percent]")) promoPreview();
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches("[data-promo-plan]")) promoPreview();
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches("[data-ann-level]")) annPreview();
  });
  document.addEventListener("change", function (e) { if (e.target.closest("[data-panel]")) panelChange(e); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("[data-modal]").hidden) closePanel(); });
  window.addEventListener("hashchange", function () { if (!/^#users\//.test(location.hash) && state.user) closePanel(); route(); });

  start();
})();

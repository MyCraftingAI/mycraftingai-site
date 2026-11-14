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
    if (view === "server") loadServer();
    if (view === "pricing") loadPricing();
    if (view === "gifts") loadGifts();
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
    var bal = A.balance(false).catch(function () { return null; });
    Promise.all([A.insights(7), A.rewards(7), A.revenue(), A.config(), bal]).then(function (r) {
      var ins = r[0], rw = r[1], rev = r[2], cfg = r[3].values, b = r[4];
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
        kpi("AI provider balance", b ? balanceText(b) : "-", b ? (b.low ? "running low - top up soon" : "remaining credit · " + num(ins.days.reduce(function (s, d) { return s + d.aiRequests; }, 0)) + " AI requests 7d") : "couldn't check", !!(b && b.low)),
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
        '<div class="r"><span>Texture Studio requests</span><b>' + num(d.features.textures) + "</b></div>" +
        '<div class="r"><span>3D Studio requests</span><b>' + num(d.features.models || 0) + "</b></div>" +
        '<div class="r"><span>Version Converter requests</span><b>' + num(d.features.convert || 0) + "</b></div>";
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
    loadLegal();
  }

  /* ------------------------------------------------- Terms & Privacy version */
  function loadLegal() {
    A.legal().then(renderLegal, function (e) {
      var box = $("[data-cfg-legal]");
      if (box) box.innerHTML = '<p class="ad-muted">' + esc(errText(e)) + "</p>";
    });
  }
  function renderLegal(d) {
    var box = $("[data-cfg-legal]");
    if (!box) return;
    var l = d.legal || {};
    var share = d.users ? Math.round(d.accepted / d.users * 100) : 100;
    box.innerHTML =
      '<div class="ad-status on"><span class="ic">●</span><div><b>Current version: ' + esc(l.version || "-") + "</b><span>" +
        (l.publishedAt ? "Published " + when(l.publishedAt) : "Original version") + " · " + num(d.accepted) + " of " + num(d.users) +
        " accounts agreed (" + share + "%)" + (d.pending ? " · " + num(d.pending) + " will be asked next time they sign in or open the app" : "") + "</span></div></div>" +
      (l.summary ? '<div class="ad-hint" style="white-space:pre-line">Last “what changed” note: ' + esc(l.summary) + "</div>" : "") +
      '<label>What changed (shown to everyone in the agreement prompt)<textarea class="input" rows="3" maxlength="600" style="min-height:90px" data-legal-summary placeholder="e.g. We clarified who owns AI-generated mods and how long usage logs are kept."></textarea></label>' +
      '<label class="ad-check"><input type="checkbox" data-legal-notify> Also email every verified account about the update (recommended for important changes)</label>' +
      '<div class="ad-row-actions"><button class="btn btn-primary" data-legal-publish>Publish new version</button></div>';
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
    var per = promoPlans(p);
    var html = '<div class="ad-promo-mode">' +
      '<button type="button" data-promo-mode="0" class="' + (on ? "" : "on") + '"><b>Same prices</b>Normal prices everywhere, no code.</button>' +
      '<button type="button" data-promo-mode="1" class="' + (on ? "on" : "") + '"><b>Run a promotion</b>Sale prices on the website, codes added at checkout.</button></div>';
    if (on) {
      var live = p ? Object.keys(per).map(function (id) { return cap(id) + " " + per[id].percent + "% (" + per[id].code + ")"; }).join(" · ") : "";
      html +=
        (p ? '<div class="ad-status on"><span class="ic">●</span><div><b>Live: ' + esc(p.label) + "</b><span>" + esc(live) + (p.until ? " · until " + when(p.until) : "") + "</span></div></div>" : "") +
        '<div class="ad-inline" style="gap:10px;flex-wrap:wrap">' +
          '<label style="flex:2;min-width:180px">Name shown to people<input class="input" data-promo-label maxlength="60" value="' + esc(p ? p.label : (PROMO_LABEL[v.theme] || "")) + '" placeholder="e.g. Black Friday"></label>' +
          '<label style="flex:1;min-width:170px">Ends (optional)<input class="input" type="datetime-local" data-promo-until value="' + esc(p && p.until ? p.until.slice(0, 16) : "") + '"></label></div>' +
        '<div class="ad-promo-table"><div class="ad-promo-row head"><span>Plan</span><span>Discount</span><span>Lemon Squeezy code</span><span>Price</span></div>' +
        plans.map(function (id) {
          var spec = per[id], enabled = p ? !!spec : true;
          return '<div class="ad-promo-row' + (enabled ? "" : " off") + '" data-promo-row="' + id + '">' +
            '<label class="ad-check"><input type="checkbox" data-promo-plan="' + id + '"' + (enabled ? " checked" : "") + "> <b>" + cap(id) + "</b></label>" +
            '<span class="ad-pct"><input class="input" type="number" min="1" max="90" data-promo-pct="' + id + '" value="' + esc(spec ? spec.percent : 30) + '"><i>%</i></span>' +
            '<input class="input" data-promo-code="' + id + '" maxlength="40" value="' + esc(spec ? spec.code : "") + '" placeholder="e.g. ' + id.toUpperCase().slice(0, 3) + '30" style="text-transform:uppercase">' +
            '<span class="ad-promo-price" data-promo-price="' + id + '"></span></div>';
        }).join("") + "</div>" +
        '<div class="ad-row-actions" style="margin-top:-4px"><button class="btn btn-ghost btn-sm" data-promo-same>Use the first plan\'s discount and code for all</button></div>' +
        '<label>Terms (optional)<input class="input" data-promo-terms maxlength="160" value="' + esc(p ? p.terms : "") + '" placeholder="e.g. First 3 months, new subscriptions only"></label>' +
        '<div class="ad-hint">Create each code in Lemon Squeezy first (Store → Discounts) with the same percentage, limited to that plan - Lemon Squeezy is what actually charges the discounted price.</div>' +
        '<div class="ad-row-actions"><button class="btn btn-primary" data-promo-save>' + (p ? "Update promotion" : "Start promotion") + "</button>" +
        (p ? '<button class="btn btn-ghost" data-promo-stop>End promotion</button>' : "") + "</div>";
    } else if (p) {
      html += '<div class="ad-row-actions"><button class="btn" data-promo-stop>End the running promotion (' + esc(p.label) + ")</button></div>";
    }
    $("[data-cfg-promo]").innerHTML = html;
    promoPreview();
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /** {plan: {percent, code}} from a stored promotion (old or new shape). */
  function promoPlans(p) {
    if (!p) return {};
    if (!Array.isArray(p.plans)) return p.plans || {};
    var out = {};
    p.plans.forEach(function (id) { out[id] = { percent: p.percent, code: p.code }; });
    return out;
  }

  function promoPreview() {
    var plans = (window.MCA_PLANS && window.MCA_PLANS.plans) || [];
    $$("[data-promo-row]").forEach(function (row) {
      var id = row.dataset.promoRow, on = $('[data-promo-plan="' + id + '"]', row).checked;
      var pct = Math.max(0, Math.min(90, Number($('[data-promo-pct="' + id + '"]', row).value) || 0));
      var plan = plans.filter(function (x) { return x.id === id; })[0];
      row.classList.toggle("off", !on);
      $$("input.input", row).forEach(function (input) { input.disabled = !on; });
      var cell = $('[data-promo-price="' + id + '"]', row);
      if (!plan || !plan.price) { cell.textContent = ""; return; }
      cell.innerHTML = on && pct ? "<s>$" + plan.price.toFixed(2) + "</s> <b>$" + (Math.round(plan.price * (100 - pct)) / 100).toFixed(2) + "</b>"
        : "<b>$" + plan.price.toFixed(2) + "</b> <span class=\"ad-muted\">normal</span>";
    });
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

  /* ---------------------------------------------------------- token gifts */
  function giftWhat(g) {
    return g.mode === "daily" ? "+" + num(g.amount) + " tokens every day" : num(g.amount) + " tokens, once";
  }
  function giftState(g) {
    var tag = g.state === "active" ? "good" : g.state === "expired" ? "warn" : "plan";
    var text = g.state === "active" ? (g.endsAt ? "until " + when(g.endsAt) : "no end") : g.state === "expired" ? "finished " + since(g.endsAt) : "ended " + since(g.endedAt);
    return '<span class="ad-tag ' + tag + '">' + esc(g.state) + '</span> <span class="ad-muted" style="font-size:12.5px">' + esc(text) + "</span>";
  }

  function loadGifts() {
    renderGiftForm();
    A.gifts().then(function (d) {
      var list = d.gifts || [], active = list.filter(function (g) { return g.state === "active"; });
      var used = list.reduce(function (s, g) { return s + g.used; }, 0);
      var reach = active.reduce(function (s, g) { return s + g.recipients; }, 0);
      $("[data-gift-kpis]").innerHTML = [
        kpi("Active gifts", num(active.length), num(list.length) + " in total"),
        kpi("People with an active gift", num(reach), "counted once per gift"),
        kpi("Gift tokens used", fmt(used), "across every gift"),
        kpi("People who used gifts", num(list.reduce(function (s, g) { return s + g.usersUsed; }, 0)), "across every gift")
      ].join("");
      $("[data-gift-list]").innerHTML = list.length ? list.map(function (g) {
        var pct = g.given ? Math.min(100, Math.round(g.used / g.given * 100)) : null;
        return '<div class="ad-card ad-gift" data-gift="' + esc(g.id) + '">' +
          '<div class="ad-inline" style="justify-content:space-between;align-items:flex-start"><div><h3>' + esc(g.name) + "</h3>" +
          '<div class="ad-muted" style="font-size:13px">' + esc(giftWhat(g)) + " · " + esc(g.audience) + " · " + num(g.recipients) + " people</div></div>" +
          "<div>" + giftState(g) + "</div></div>" +
          '<div class="ad-gift-use"><div><small>Used</small><b>' + fmt(g.used) + "</b>" + (pct != null ? '<span class="ad-muted"> of ' + fmt(g.given) + "</span>" : '<span class="ad-muted"> so far</span>') + "</div>" +
          "<div><small>People who used it</small><b>" + num(g.usersUsed) + '</b><span class="ad-muted"> of ' + num(g.recipients) + "</span></div>" +
          "<div><small>Created</small><b style=\"font-size:14px\">" + since(g.created) + '</b><span class="ad-muted"> by ' + esc(g.createdBy) + "</span></div></div>" +
          (pct != null ? '<div class="get-bar" style="margin:10px 0 0"><i style="width:' + pct + '%"></i></div>' : "") +
          '<div class="ad-row-actions" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-gift-open="' + esc(g.id) + '">Who used it</button>' +
          (g.state === "active" ? '<button class="btn btn-warn btn-sm" data-gift-end="' + esc(g.id) + '">End now</button>' : "") +
          '<button class="btn btn-ghost btn-sm" data-gift-delete="' + esc(g.id) + '">Remove</button></div>' +
          '<div data-gift-people="' + esc(g.id) + '"></div></div>';
      }).join("") : '<div class="ad-card"><div class="ad-empty">No gifts yet. Create one on the left.</div></div>';
    }, function (e) { toast(errText(e), true); });
  }

  function renderGiftForm() {
    var host = $("[data-gift-form]");
    if (host.dataset.ready) return;
    host.dataset.ready = "1";
    var prefill = state.giftPrefill || [];
    state.giftPrefill = null;
    host.innerHTML =
      '<label>Name (shown to people)<input class="input" data-gift-name maxlength="80" placeholder="e.g. Christmas gift"></label>' +
      '<div><div class="ad-hint" style="margin-bottom:6px">Type</div><div class="ad-seg" data-gift-mode><button type="button" data-mode="pack" class="on">One-off pack</button><button type="button" data-mode="daily">Extra every day</button></div>' +
        '<div class="ad-hint" data-gift-mode-hint style="margin-top:6px">A pack is used once their normal daily allowance runs out, until it is spent or the gift ends.</div></div>' +
      '<label>Tokens<input class="input" type="number" min="1" step="1000" data-gift-amount placeholder="e.g. 50000"></label>' +
      '<div class="ad-chips" style="margin:-4px 0 0">' + [10000, 25000, 50000, 100000, 500000].map(function (n) { return '<button type="button" class="ad-chip" data-gift-pick="' + n + '">' + fmt(n) + "</button>"; }).join("") + "</div>" +
      '<div><div class="ad-hint" style="margin-bottom:6px">Who gets it</div><div class="ad-seg" data-gift-aud><button type="button" data-aud="all"' + (prefill.length ? "" : ' class="on"') + '>Everyone</button><button type="button" data-aud="plans">Plans</button><button type="button" data-aud="users"' + (prefill.length ? ' class="on"' : "") + '>Chosen people</button></div></div>' +
      '<div class="ad-inline" data-gift-plans style="gap:16px" hidden>' + PLAN_ORDER.map(function (p) { return '<label class="ad-check"><input type="checkbox" data-gift-plan="' + p + '"> ' + cap(p) + "</label>"; }).join("") + "</div>" +
      '<label data-gift-users' + (prefill.length ? "" : " hidden") + '>Emails or user IDs (one per line or comma separated)<textarea data-gift-userlist placeholder="alex@example.com&#10;steve@example.com">' + esc(prefill.join("\n")) + "</textarea></label>" +
      '<div><div class="ad-hint" style="margin-bottom:6px">How long</div><div class="ad-seg" data-gift-len><button type="button" data-len="none" class="on">No end</button><button type="button" data-len="7">7 days</button><button type="button" data-len="30">30 days</button><button type="button" data-len="custom">Until…</button></div></div>' +
      '<label data-gift-until hidden>Ends<input class="input" type="datetime-local" data-gift-until-input></label>' +
      '<label class="ad-check"><input type="checkbox" data-gift-notify checked> Email everyone who gets it (from noreply@)</label>' +
      '<label data-gift-msg>Personal note in the email (optional)<textarea data-gift-message maxlength="2000" placeholder="e.g. Merry Christmas and thanks for building with us!"></textarea></label>' +
      '<div class="ad-row-actions"><button class="btn btn-ghost" data-gift-count>Count people</button><button class="btn btn-primary" data-gift-create>Give tokens</button><span class="ad-muted" data-gift-info style="font-size:13px"></span></div>';
    if (prefill.length) { $("[data-gift-users]").hidden = false; }
  }

  function giftAudience() {
    var aud = ($("[data-gift-aud] .on") || {}).dataset ? $("[data-gift-aud] .on").dataset.aud : "all";
    if (aud === "plans") return { type: "plans", plans: $$("[data-gift-plan]").filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.giftPlan; }) };
    if (aud === "users") return { type: "users", users: $("[data-gift-userlist]").value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean) };
    return { type: "all" };
  }
  function giftEnds() {
    var len = $("[data-gift-len] .on").dataset.len;
    if (len === "none") return null;
    if (len === "custom") { var v = $("[data-gift-until-input]").value; return v ? new Date(v).toISOString() : ""; }
    return new Date(Date.now() + Number(len) * 864e5).toISOString();
  }

  function showGiftPeople(id) {
    var box = $('[data-gift-people="' + id + '"]');
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="ad-skel" style="margin-top:10px"></div>';
    A.gift(id).then(function (d) {
      var people = d.gift.people || [];
      box.innerHTML = '<div class="ad-rows" style="margin-top:10px">' + (people.length ? people.map(function (p) {
        return '<div class="r link" data-open-user="' + esc(p.id) + '">' + userCell(p) + "<b>" + fmt(p.used) + " used</b></div>";
      }).join("") : '<div class="ad-empty">Nobody has used it yet.</div>') + "</div>";
    }, function (e) { box.innerHTML = ""; toast(errText(e), true); });
  }

  /* -------------------------------------------------------------- balance */
  function money2(n, cur) {
    var sym = cur === "USD" ? "$" : cur === "CNY" ? "¥" : "";
    return sym + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (sym ? "" : " " + cur);
  }
  function balanceText(b) {
    var cur = Object.keys(b.totals || {});
    return cur.length ? cur.map(function (c) { return money2(b.totals[c], c); }).join(" + ") : "-";
  }
  function loadBalance(refresh, btn) {
    var p = A.balance(refresh);
    (btn ? run(btn, p, "Balance refreshed", "Checking") : p).then(function (b) {
      $("[data-balance-total]").textContent = balanceText(b);
      $("[data-balance-sub]").textContent = (b.low ? "Running low - top up soon. " : "Remaining credit on your AI provider account. ") + "Checked " + since(b.checkedAt) + ".";
      $("[data-balance-keys]").innerHTML = (b.keys || []).map(function (k) {
        var bal = k.balances && k.balances.length ? k.balances.map(function (x) { return money2(x.total, x.currency) + (x.granted ? ' <span class="ad-muted" style="font-size:12px">(' + money2(x.granted, x.currency) + " granted)</span>" : ""); }).join(", ") : "";
        return '<div class="r"><span><b style="color:var(--text)">' + esc(k.label) + '</b> <span class="ad-tag ' + (k.status === "active" ? "good" : "warn") + '">' + esc(k.status) + "</span></span>" +
          "<span>" + (k.error ? '<span class="ad-tag bad">' + esc(k.error) + "</span>" : bal || "-") + "</span></div>";
      }).join("") || '<div class="ad-empty">No AI keys on the server yet.</div>';
    }, function () { $("[data-balance-total]").textContent = "Unavailable"; });
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
    if (action === "gift") {
      state.giftPrefill = ids.map(function (id) { return typeof state.selected[id] === "string" ? state.selected[id] : id; });
      var form = $("[data-gift-form]"); if (form) form.dataset.ready = "";
      return go("gifts");
    }
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
        '<div class="r"><span>Terms &amp; Privacy</span><span>' + (u.termsVersion
          ? "Agreed to " + esc(u.termsVersion) + (u.termsAcceptedAt ? " · " + when(u.termsAcceptedAt) : "")
          : '<span class="ad-tag warn">not agreed yet</span>') + "</span></div>" +
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
    var monthly = u.period === "month", span = monthly ? "this billing month" : "today", usage = u.usage || {};
    var periodLine = monthly
      ? "Billing month from " + when(u.cycleStartedAt) + " · renews " + when(u.periodEndsAt) + (u.firstMonth ? " · first month" : "")
      : "Applies every day until removed. Refills at 00:00 UTC.";
    return '<div class="ad-card"><h3>AI access</h3><p class="ad-sub">Pause only the AI - the rest of MyCraftingAI keeps working for them.</p>' + status + aiForm + "</div>" +
      '<div class="ad-card"><h3>' + (monthly ? "Monthly token allowance" : "Daily token limit") + '</h3><p class="ad-sub">' + esc(periodLine) + '</p><div class="ad-rows">' +
        '<div class="r"><span>Plan default (' + esc(u.planName) + ")</span><span>" + tokens(u.planDailyLimit) + (monthly ? " / month" : " / day") + "</span></div>" +
        '<div class="r"><span>Custom allowance</span><span>' + (u.dailyLimitOverride == null ? '<span class="ad-muted">none</span>' : "<b>" + num(u.dailyLimitOverride) + "</b>") + "</span></div>" +
        '<div class="r"><span>Bonus ' + span + "</span><span>" + (u.bonusToday ? "+" + num(u.bonusToday) : '<span class="ad-muted">none</span>') + "</span></div>" +
        '<div class="r"><span>Top-up tokens left</span><span>' + (usage.topupLeft ? num(usage.topupLeft) : '<span class="ad-muted">none</span>') + "</span></div>" +
        '<div class="r"><span>Available ' + span + "</span><b>" + tokens(u.dailyLimit) + "</b></div>" +
        '<div class="r"><span>Used ' + span + "</span><span>" + num(u.usedToday) + "</span></div></div>" +
        '<div class="ad-inline" style="margin-top:12px"><input class="input" type="number" min="0" step="1000" data-limit placeholder="' + (monthly ? "Custom tokens per billing month, e.g. 5000000" : "Custom tokens per day, e.g. 500000") + '"><button class="btn" data-limit-save>Set allowance</button>' +
        (u.dailyLimitOverride != null ? '<button class="btn btn-ghost" data-limit-clear>Use plan default</button>' : "") + "</div></div>" +
      ((u.gifts || []).length ? '<div class="ad-card"><h3>Token gifts</h3><p class="ad-sub">Active gifts on this account (manage them in Token gifts).</p><div class="ad-rows">' + u.gifts.map(function (g) {
        return '<div class="r"><span><b style="color:var(--text);display:block">' + esc(g.name) + '</b><span style="font-size:12.5px">' + esc(giftWhat(g)) + (g.endsAt ? " · until " + when(g.endsAt) : " · no end") + "</span></span>" +
          "<span>" + fmt(g.used) + " used<br><span class=\"ad-muted\" style=\"font-size:12px\">" + fmt(g.left) + " left today</span></span></div>";
      }).join("") + "</div></div>" : "") +
      topupCardHtml(u) +
      '<div class="ad-card"><div class="ad-inline" style="justify-content:space-between;align-items:flex-start"><div><h3>Bonus tokens for ' + span + '</h3><p class="ad-sub">One-off extra allowance; disappears when the allowance ' + (monthly ? "renews" : "resets") + '. Open apps update within seconds.</p></div>' +
        '<div style="text-align:right"><div class="ad-muted" style="font-size:12px">Bonus ' + span + '</div><b style="font:700 20px var(--display);color:' + (u.bonusToday ? "var(--mint)" : "var(--muted)") + '">' + (u.bonusToday ? "+" + num(u.bonusToday) : "0") + "</b></div></div>" +
        '<div class="ad-chips" style="margin-bottom:10px">' + [1000, 5000, 10000, 50000, 250000, 1000000].map(function (n) { return '<button class="ad-chip" data-bonus-pick="' + n + '">' + fmt(n) + "</button>"; }).join("") + "</div>" +
        '<div class="ad-inline" style="flex-wrap:wrap;gap:8px"><input class="input" type="number" min="1" step="1000" data-bonus placeholder="Tokens, e.g. 5000" style="flex:1;min-width:150px">' +
          '<button class="btn btn-primary" data-bonus-give>+ Add</button>' +
          '<button class="btn btn-warn" data-bonus-remove' + (u.bonusToday ? "" : " disabled title=\"No bonus to remove today\"") + '>&minus; Remove</button>' +
          (u.bonusToday ? '<button class="btn btn-ghost" data-bonus-clear>Remove all bonus</button>' : "") + "</div>" +
        '<label class="ad-check" style="margin-top:10px"><input type="checkbox" data-bonus-notify> Tell the user by email</label>' +
        '<div class="ad-hint" style="margin-top:6px">Remove takes back bonus tokens (never more than the bonus). To lower their allowance further, set a custom allowance above.</div></div>' +
      '<div class="ad-card"><h3>' + (monthly ? "This month's usage" : "Today's usage") + '</h3><p class="ad-sub">Set the counter for ' + span + ' back to zero (e.g. after a bug or a failed request). Top-ups already used are not given back.</p><button class="btn" data-reset-usage>Reset usage for ' + span + "</button></div>";
  }

  /** Top-up tokens on one account: what's left, history, add / remove by hand. */
  function topupCardHtml(u) {
    var list = u.topups || [], left = (u.usage || {}).topupLeft || 0;
    var STATUS = { active: "active", refunded: "refunded", revoked: "removed", expired: "expired" };
    return '<div class="ad-card"><div class="ad-inline" style="justify-content:space-between;align-items:flex-start"><div><h3>Top-up tokens</h3>' +
      '<p class="ad-sub">Bought (or given by support) on top of the plan. Used after the allowance; they don\'t expire with the billing month.</p></div>' +
      '<div style="text-align:right"><div class="ad-muted" style="font-size:12px">Left</div><b style="font:700 20px var(--display);color:' + (left ? "var(--mint)" : "var(--muted)") + '">' + num(left) + "</b></div></div>" +
      (list.length ? '<div class="ad-rows">' + list.map(function (t) {
        return '<div class="r"><span><b style="color:var(--text);display:block">' + num(t.tokens) + " tokens · " + (t.source === "admin" ? "added by support" : "bought") + "</b>" +
          '<span style="font-size:12.5px">' + when(t.created) + (t.priceCents ? " · " + usd(t.priceCents) + " + " + usd(t.feeCents) + " fee" : "") +
          (t.note ? " · " + esc(t.note) : "") + " · until " + when(t.expiresAt) + "</span></span>" +
          "<span>" + num(t.left) + ' left<br><span class="ad-tag ' + (t.status === "active" ? "good" : "plan") + '">' + esc(STATUS[t.status] || t.status) + "</span>" +
          (t.status === "active" && t.left ? ' <button class="btn btn-ghost btn-sm" data-topup-revoke="' + esc(t.id) + '" data-topup-left="' + t.left + '">Remove</button>' : "") +
          "</span></div>";
      }).join("") + "</div>" : '<div class="ad-empty" style="padding:10px 0">No top-ups on this account.</div>') +
      '<div class="ad-inline" style="flex-wrap:wrap;gap:8px;margin-top:12px"><input class="input" type="number" min="1000" step="1000" data-topup-amount placeholder="Tokens, e.g. 1000000" style="flex:1;min-width:150px">' +
      '<input class="input" data-topup-note maxlength="200" placeholder="Note (optional)" style="flex:1;min-width:150px">' +
      '<button class="btn btn-primary" data-topup-give>+ Add top-up tokens</button></div>' +
      '<label class="ad-check" style="margin-top:10px"><input type="checkbox" data-topup-notify> Tell the user by email</label></div>';
  }
  function usd(cents) { return "$" + (Number(cents || 0) / 100).toFixed(2); }

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
    if (t.matches("[data-topup-give]")) {
      var amount = Math.round(Number($("[data-topup-amount]").value));
      if (!(amount >= 1000)) return toast("Enter at least 1,000 tokens.", true);
      return run(t, A.grantTopup(u.id, { tokens: amount, note: $("[data-topup-note]").value.trim(), notify: $("[data-topup-notify]").checked }), null, "Adding")
        .then(function (d) { applied(d, "+" + fmt(amount) + " top-up tokens"); });
    }
    if (t.dataset.topupRevoke) {
      var leftOver = Number(t.dataset.topupLeft || 0);
      return ask({ title: "Remove " + num(leftOver) + " unused top-up tokens?", text: "The tokens already used stay used. This doesn't refund any payment - refunds are made in Lemon Squeezy (a refunded order removes its tokens by itself).", ok: "Remove tokens", danger: true }).then(function (v) {
        if (v) run(t, A.revokeTopup(t.dataset.topupRevoke), null, "Removing").then(function () { openUser(u.id, "ai"); toast(num(leftOver) + " top-up tokens removed"); });
      });
    }
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
      var spanText = u.period === "month" ? "this billing month" : "today";
      return ask({ title: "Reset usage for " + spanText + "?", text: u.username + " has used " + num(u.usedToday) + " tokens " + spanText + ". This gives them their whole allowance back.", ok: "Reset" }).then(function (v) {
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
    var box = state.senders.filter(function (s) { return s.id === $("[data-msg-from]").value; })[0] || { id: "support", display: "MyCraftingAI", address: "support@mycraftingai.com" };
    var TEAMS = { support: "Support", noreply: "News & updates", billing: "Billing", security: "Security", contact: "Team" };
    var sample = { name: "Steve", email: "steve@example.com", plan: "Free" };
    function fill(t) { return t.replace(/\{name\}/g, sample.name).replace(/\{email\}/g, sample.email).replace(/\{plan\}/g, sample.plan); }
    var subject = fill($("[data-msg-subject]").value || "Subject");
    var paras = fill($("[data-msg-body]").value || "Your message appears here.").split(/\n\s*\n/).filter(Boolean);
    $("[data-mail-preview]").innerHTML = '<div class="bar"><b>' + esc(box.display) + "</b> &lt;" + esc(box.address) + "&gt;<br>Subject: " + esc(subject) + "</div>" +
      '<div class="body"><div class="brandline" style="display:flex;align-items:center;gap:10px">' +
      '<img src="assets/img/mail/' + esc(box.id || "support") + '.png" alt="" width="36" height="36" style="border-radius:50%">' +
      '<span>MyCraftingAI<span style="display:block;font-weight:400;font-size:12px;color:#777">' + esc(TEAMS[box.id] || "Team") + "</span></span></div><h4>" + esc(subject) + "</h4>" + paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
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
  /* When the website, the desktop app and the server were last updated. */
  function loadUpdates(refresh) {
    var box = $("[data-updates]");
    if (!box) return Promise.resolve();
    if (!box.innerHTML) box.innerHTML = '<div class="ad-card"><p class="ad-muted">Checking...</p></div>';
    return A.updates(refresh).then(function (d) {
      function ago(iso) { return iso ? since(iso) : "-"; }
      function card(title, value, lines, err) {
        return '<div class="ad-card ad-kpi' + (err ? " warn" : "") + '"><div class="k">' + esc(title) + '</div><div class="v">' + esc(value) + "</div>" +
          lines.filter(Boolean).map(function (l) { return '<div class="s">' + l + "</div>"; }).join("") +
          (err ? '<span class="ad-tag warn" style="margin-top:8px;display:inline-block">' + esc(err) + "</span>" : "") + "</div>";
      }
      var w = d.website || {}, a = d.app || {}, s = d.server || {};
      var hours = Math.floor((s.uptimeSeconds || 0) / 3600), mins = Math.floor((s.uptimeSeconds || 0) % 3600 / 60);
      box.innerHTML =
        card("Website", ago(w.updatedAt), [
          w.updatedAt ? esc(when(w.updatedAt)) : "",
          w.commit ? 'Commit <span class="ad-mono">' + esc(w.commit) + "</span>" + (w.message ? " · " + esc(w.message) : "") : "",
          '<a href="' + esc(w.url || "index.html") + '" target="_blank" rel="noopener">Open website ↗</a>'
        ], w.error) +
        card("Desktop app", a.version ? "v" + a.version : "-", [
          a.publishedAt ? "Released " + esc(when(a.publishedAt)) + " (" + esc(ago(a.publishedAt)) + ")" : "",
          a.downloads != null ? num(a.downloads) + " downloads of this version" : "",
          a.size ? (a.size / 1048576).toFixed(0) + " MB installer" : "",
          '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">Releases ↗</a>'
        ], a.error) +
        card("Server", ago(s.startedAt), [
          s.startedAt ? "Last restart / deploy " + esc(when(s.startedAt)) : "",
          "Up " + hours + "h " + ("0" + mins).slice(-2) + "m",
          d.checkedAt ? "Checked " + esc(ago(d.checkedAt)) : ""
        ], "");
    }, function (e) { box.innerHTML = '<div class="ad-card"><p class="ad-muted">' + esc(errText(e)) + "</p></div>"; });
  }

  /* Live AI queue: calls running / waiting, the adaptive limit and push-backs. */
  function renderQueue(q) {
    var box = $("[data-ai-queue]");
    if (!box) return;
    if (!q || q.enabled === undefined) { box.innerHTML = '<div class="ad-card"><p class="ad-muted">Queue status unavailable.</p></div>'; return; }
    var c = q.counters || {}, pushbacks = 0;
    Object.keys(c).forEach(function (k) { if (k.indexOf("pushback.") === 0) pushbacks += c[k]; });
    function kpi(k, v, s, warn) {
      return '<div class="ad-card ad-kpi' + (warn ? " warn" : "") + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + s + "</div></div>";
    }
    box.innerHTML = !q.enabled ? kpi("Queue", "Off", "AI_QUEUE_ENABLED=false - calls go straight to the provider", true) :
      kpi("Running now", num(q.running) + " / " + num(q.limit), q.limit < q.maxLimit ? "Limit lowered after provider push-back (max " + num(q.maxLimit) + ")" : "Concurrent provider calls (adaptive limit)", q.limit < q.maxLimit) +
      kpi("Waiting in line", num(q.waiting), q.pausedSeconds ? "New calls paused " + q.pausedSeconds + " s after a push-back" : "Ordered by plan head start", q.waiting > 0) +
      kpi("Average call", (q.avgCallSeconds || 0) + " s", num(c.started || 0) + " started · " + num(c.queued || 0) + " waited in line", false) +
      kpi("Push-backs", num(pushbacks), num(c.retries || 0) + " retries · " + num(c.timeouts || 0) + " timed out · " + num(c.rejected || 0) + " line full", (c.timeouts || 0) > 0);
  }

  /* A provider error in plain words, with what to do about it. */
  function keyError(k) {
    var e = String(k.lastError || "");
    if (!e) return "-";
    if (e === "HTTP 402") return k.status === "degraded"
      ? "Out of balance - top up the provider account. It is re-tried every 2 minutes and comes back by itself."
      : "Was out of balance";
    if (e === "HTTP 401" || e === "HTTP 403") return "Key rejected (" + e + ") - replace it, then press Enable";
    return e;
  }

  /* ------------------------------------------------------ AI provider keys */
  var STATUS_TEXT = { active: "On", disabled: "Off", degraded: "Needs attention" };
  function balanceLine(b) {
    return (b || []).map(function (x) { return money2(x.total, x.currency); }).join(" + ");
  }
  /** One provider check in plain words: {cls, tag, text, good}. */
  function checkInfo(c) {
    var bal = balanceLine(c.balances);
    if (c.ok && c.available === false) return { cls: "warn", tag: "no credit left", text: (bal ? bal + " · " : "") + "top up the provider account", good: false };
    if (c.ok) return { cls: "good", tag: "works", text: bal ? bal + " left" : "", good: true };
    return { cls: c.ok === false ? "bad" : "warn", tag: c.ok === false ? "rejected" : "not checked", text: c.error || "check failed", good: false };
  }
  function checkToast(name, c) {
    var i = checkInfo(c);
    toast(name + ": " + i.tag + (i.text ? " · " + i.text : ""), !i.good);
  }
  function renderKeys(s) {
    state.sys = s;
    var keys = s.keys || [], active = keys.filter(function (k) { return k.status === "active"; });
    var checks = state.keyChecks || (state.keyChecks = {});
    $("[data-provider]").innerHTML =
      "<span>Provider address</span><code>" + esc((s.provider && s.provider.baseUrl) || "-") + "</code>" +
      '<button class="btn btn-ghost btn-sm" data-goto-setting="deepseek_base_url">Change</button>' +
      (keys.length && !active.length ? '<span class="ad-tag bad">No key is on - AI requests fail for everyone</span>'
        : active.length ? '<span class="ad-tag good">' + active.length + " of " + keys.length + " key" + (keys.length === 1 ? "" : "s") + " on</span>" : "");
    $("[data-keys]").innerHTML = keys.length ? keys.map(function (k) {
      var on = k.status === "active", tag = on ? "good" : k.status === "degraded" ? "warn" : "plan";
      var check = checks[k.id], last;
      if (check) {
        var ci = checkInfo(check);
        last = '<span class="ad-tag ' + ci.cls + '">' + esc(ci.tag) + "</span> " + esc(ci.text) +
          '<div class="ad-muted" style="font-size:12px">checked just now</div>';
      } else {
        last = '<span class="ad-muted" style="font-size:13px">' + esc(keyError(k)) + (k.lastErrorAt ? "<br>" + since(k.lastErrorAt) : "") + "</span>";
      }
      var others = keys.filter(function (o) { return o.id !== k.id && o.status !== "disabled"; }).length;
      return '<tr data-key-row="' + esc(k.id) + '"><td><b>' + esc(k.label) + "</b>" +
        '<div class="hint">' + esc(k.hint || "") + ' <span class="ad-muted" style="font:12px var(--font)">· added ' + since(k.added) + "</span></div></td>" +
        '<td><span class="ad-tag ' + (k.pool === "priority" ? "paid" : "plan") + '">' + esc(k.pool) + "</span></td>" +
        '<td><label class="ad-toggle" title="' + (on ? "Switch this key off" : "Switch this key on") + '"><input type="checkbox" data-key-toggle="' + esc(k.id) + '"' + (on ? " checked" : "") + "><i></i></label> " +
          '<span class="ad-tag ' + tag + '">' + esc(STATUS_TEXT[k.status] || k.status) + "</span></td>" +
        "<td>" + num(k.users) + (k.maxUsers ? " / " + num(k.maxUsers) : "") + "</td>" +
        "<td>" + last + "</td>" +
        '<td><div class="acts">' +
          '<button class="btn btn-ghost btn-sm" data-key-act="test" data-id="' + esc(k.id) + '">Test</button>' +
          '<button class="btn btn-ghost btn-sm" data-key-act="edit" data-id="' + esc(k.id) + '">Edit</button>' +
          (others || !on ? '<button class="btn btn-sm" data-key-act="only" data-id="' + esc(k.id) + '">Use only this</button>' : "") +
          '<button class="btn btn-ghost btn-sm" data-key-act="remove" data-id="' + esc(k.id) + '">Remove</button>' +
        "</div></td></tr>";
    }).join("") : '<tr><td colspan="6"><div class="ad-empty">No AI keys yet. Press “+ Add key” and paste the API key from your provider account.</div></td></tr>';
  }
  function keyById(id) { return ((state.sys && state.sys.keys) || []).filter(function (k) { return k.id === id; })[0] || {}; }

  function addKeyDialog(btn) {
    return ask({
      title: "Add an AI provider key",
      text: "Paste the API key from your provider account. It is sent once over HTTPS, stored encrypted and never shown again - the panel only shows its last four characters.",
      ok: "Add key",
      fields: [
        { name: "label", label: "Name", placeholder: "e.g. Main account, Backup account" },
        { name: "secret", label: "API key", type: "password", placeholder: "sk-…" },
        { name: "pool", label: "Pool", type: "select", value: "standard", options: [["standard", "Standard - used for every plan"], ["priority", "Priority - plans with priority access use it first"]] },
        { name: "maxUsers", label: "Most accounts on this key (0 = no limit)", type: "number", value: 0 },
        { name: "verify", label: "Check the key with the provider before adding it", type: "checkbox", value: true },
        { name: "exclusive", label: "Switch to this key now - turn every other key off", type: "checkbox", value: false }
      ]
    }).then(function (v) {
      if (!v) return;
      var secret = (v.secret || "").trim();
      if (!secret) return toast("Paste the API key first.", true);
      run(btn, A.addKey({ secret: secret, label: (v.label || "").trim(), pool: v.pool, maxUsers: Math.max(0, Math.round(Number(v.maxUsers) || 0)),
        verify: !!v.verify, exclusive: !!v.exclusive }), null, "Adding").then(function (r) {
        var check = r.added.check || {};
        (state.keyChecks || (state.keyChecks = {}))[r.added.id] = check.ok === null && check.error === "not checked" ? undefined : check;
        renderKeys(r);
        var ai = check.error === "not checked" ? null : checkInfo(check);
        toast("“" + r.added.label + "” added" + (ai ? " · " + ai.tag + (ai.text ? " · " + ai.text : "") : " (not checked)") +
          (r.added.switchedOff ? " · " + r.added.switchedOff + " other key(s) switched off" : ""), !!ai && !ai.good);
        loadBalance(true);
      });
    });
  }

  function keyAction(act, id, btn) {
    var k = keyById(id), name = "“" + (k.label || "this key") + "”";
    if (act === "test") {
      return run(btn, A.testKey(id), null, "Testing").then(function (r) {
        (state.keyChecks || (state.keyChecks = {}))[id] = r.test;
        renderKeys(r);
        if (r.test.recovered) toast(name + " works again and is back on");
        else checkToast(name, r.test);
      });
    }
    if (act === "edit") {
      return ask({ title: "Edit " + name, ok: "Save", fields: [
        { name: "label", label: "Name", value: k.label },
        { name: "pool", label: "Pool", type: "select", value: k.pool, options: [["standard", "Standard - used for every plan"], ["priority", "Priority - plans with priority access use it first"]] },
        { name: "maxUsers", label: "Most accounts on this key (0 = no limit)", type: "number", value: k.maxUsers || 0 }
      ] }).then(function (v) {
        if (!v) return;
        run(btn, A.updateKey(id, { label: (v.label || "").trim(), pool: v.pool, maxUsers: Math.max(0, Math.round(Number(v.maxUsers) || 0)) }), "Key saved", "Saving").then(renderKeys);
      });
    }
    if (act === "only") {
      return ask({ title: "Use only " + name + "?", text: "This key is switched on and every other key is switched off. Accounts on the other keys move to this one with their next AI request - nothing is lost and nobody has to restart.", ok: "Use only this key" }).then(function (v) {
        if (v) run(btn, A.updateKey(id, { exclusive: true }), name + " is now the only active key", "Switching").then(renderKeys);
      });
    }
    if (act === "remove") {
      var label = k.label || "";
      return ask({ title: "Remove " + name + "?", danger: true, ok: "Remove key", confirmText: label,
        text: "The encrypted key is deleted from the server. " + (k.users ? num(k.users) + " account(s) on it move to another active key with their next request. " : "") + "Type " + label + " to confirm.",
        fields: [{ name: "confirm", label: "Key name" }] }).then(function (v) {
        if (v) run(btn, A.removeKey(id), name + " removed", "Removing").then(renderKeys);
      });
    }
  }

  function toggleKey(input) {
    var id = input.dataset.keyToggle, on = input.checked, k = keyById(id), name = "“" + (k.label || "this key") + "”";
    var activeOthers = ((state.sys && state.sys.keys) || []).filter(function (o) { return o.id !== id && o.status === "active"; }).length;
    input.checked = !on; // stays as it was until confirmed
    ask({
      title: (on ? "Switch on " : "Switch off ") + name + "?", danger: !on && !activeOthers, ok: on ? "Switch on" : "Switch off",
      text: on ? "New AI requests can use it straight away." : activeOthers ? "Accounts on it move to another active key with their next request." : "It is the last key that is on - AI requests will fail for everyone until a key is switched on."
    }).then(function (v) {
      if (!v) return;
      run(null, A.updateKey(id, { active: on }), name + (on ? " is on" : " is off"), "Saving").then(renderKeys);
    });
  }

  /* ------------------------------------------------------- server settings */
  var SRV = { data: null, section: "", filter: "", changed: false };
  function srvSpec(name) { return ((SRV.data && SRV.data.settings) || []).filter(function (s) { return s.name === name; })[0]; }
  function srvText(s, v) {
    if (v === null || v === undefined) return s.kind === "optional_int" ? "plan default (" + num(s.planDefault) + ")" : "-";
    if (s.kind === "bool") return v ? "On" : "Off";
    if (s.kind === "model_map") return Object.keys(v).length + " model names";
    if (s.kind === "plan_seconds") return (s.plans || []).map(function (p) { return cap(p) + " " + num(v[p] || 0) + " s"; }).join(" · ");
    if (s.kind === "int" || s.kind === "float" || s.kind === "optional_int") return num(v / (s.scale || 1)) + (s.unit ? " " + s.unit : "");
    return String(v);
  }
  function srvControl(s) {
    var v = s.value, scale = s.scale || 1;
    if (s.kind === "bool") {
      return '<div class="row"><label class="ad-toggle' + (s.danger ? " danger" : "") + '"><input type="checkbox" data-srv-input' + (v ? " checked" : "") + '><i></i></label><span class="ad-muted" style="font-size:13px" data-srv-boolText>' + (v ? "On" : "Off") + "</span></div>";
    }
    if (s.kind === "plan_seconds") {
      return '<div class="ad-plansec">' + (s.plans || []).map(function (p) {
        return "<label>" + esc(cap(p)) + '<input class="input" type="number" min="0" max="' + (s.max || 3600) + '" step="1" data-srv-plan="' + esc(p) + '" value="' + esc((v || {})[p] || 0) + '"></label>';
      }).join("") + "</div>";
    }
    if (s.kind === "model_map") {
      return '<textarea data-srv-input spellcheck="false" wrap="off">' + esc(Object.keys(v || {}).map(function (k) { return k + " = " + v[k]; }).join("\n")) + "</textarea>";
    }
    if (s.kind === "int" || s.kind === "float" || s.kind === "optional_int") {
      var shown = v === null || v === undefined ? "" : v / scale;
      return '<span class="ad-unit"><input class="input" type="number" data-srv-input step="' + (s.kind === "float" ? "any" : "1") + '"' +
        (s.min != null ? ' min="' + s.min / scale + '"' : "") + (s.max != null ? ' max="' + s.max / scale + '"' : "") +
        ' value="' + esc(shown) + '"' + (s.kind === "optional_int" ? ' placeholder="' + esc("Plan default: " + num(s.planDefault)) + '"' : "") + "><i>" + esc(s.unit || "") + "</i></span>";
    }
    return '<input class="input" data-srv-input spellcheck="false" value="' + esc(v || "") + '">';
  }
  function readSrv(row, s) {
    if (s.kind === "bool") return $("[data-srv-input]", row).checked;
    if (s.kind === "plan_seconds") {
      var o = {}; $$("[data-srv-plan]", row).forEach(function (i) { o[i.dataset.srvPlan] = Number(i.value || 0); }); return o;
    }
    if (s.kind === "model_map") {
      var m = {}, lines = $("[data-srv-input]", row).value.split(/\n/);
      lines.forEach(function (line, n) {
        if (!line.trim()) return;
        var parts = line.split(/\s*[=:]\s*/);
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) throw new Error("Line " + (n + 1) + ": write it as  app-name = provider-model");
        m[parts[0].trim().toLowerCase()] = parts[1].trim();
      });
      return m;
    }
    var raw = $("[data-srv-input]", row).value.trim();
    if (s.kind === "optional_int") return raw === "" ? null : Number(raw);
    if (s.kind === "int") return (s.scale || 1) > 1 ? Math.round(Number(raw) * s.scale) : Number(raw);
    if (s.kind === "float") return Number(raw);
    return raw;
  }
  function srvDirty(row) {
    var s = srvSpec(row.dataset.srvRow), dirty;
    try { dirty = JSON.stringify(readSrv(row, s)) !== JSON.stringify(s.value); } catch (e) { dirty = true; }
    row.classList.toggle("dirty", dirty);
    var save = $("[data-srv-save]", row); if (save) save.disabled = !dirty;
  }
  function loadServer() {
    if (!SRV.data) $("[data-srv]").innerHTML = '<div class="ad-skel"></div>';
    return A.serverSettings().then(renderServer, function (e) { $("[data-srv]").innerHTML = '<div class="ad-card"><p class="ad-muted">' + esc(errText(e)) + "</p></div>"; });
  }
  function renderServer(d) {
    if (d) SRV.data = d;
    d = SRV.data;
    if (!d) return;
    var changed = d.settings.filter(function (s) { return s.overridden; }).length, badge = $("[data-srv-badge]");
    if (badge) { badge.hidden = !changed; badge.textContent = changed; badge.title = changed + " setting(s) differ from the server defaults"; }
    $("[data-srv-sections]").innerHTML = [["", "All"]].concat(d.sections.map(function (s) { return [s.id, s.label]; })).map(function (s) {
      return '<button type="button" class="ad-chip' + (SRV.section === s[0] ? " on" : "") + '" data-srv-section="' + esc(s[0]) + '">' + esc(s[1]) + "</button>";
    }).join("");
    var words = SRV.filter.toLowerCase().split(/\s+/).filter(Boolean);
    var html = d.sections.map(function (sec) {
      if (SRV.section && SRV.section !== sec.id) return "";
      var rows = d.settings.filter(function (s) {
        if (s.section !== sec.id || (SRV.changed && !s.overridden)) return false;
        var hay = (s.label + " " + s.help + " " + s.name + " " + sec.label).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      });
      if (!rows.length) return "";
      return '<div class="ad-srv-section"><div class="ad-srv-head"><h2>' + esc(sec.label) + "</h2><p>" + esc(sec.help) + '</p></div><div class="ad-card">' +
        rows.map(function (s) {
          return '<div class="ad-set" data-srv-row="' + esc(s.name) + '"><div class="ad-set-l"><b>' + esc(s.label) + "</b>" + (s.help ? "<p>" + esc(s.help) + "</p>" : "") +
            '<div class="meta">' + (s.overridden ? '<span class="ad-tag info">changed</span> server default: ' + esc(srvText(s, s.default)) : '<span class="ad-tag plan">default</span>') +
            (s.danger ? ' <span class="ad-tag warn">affects everyone</span>' : "") + " <code>" + esc(s.name.toUpperCase()) + "</code></div></div>" +
            '<div class="ad-set-r">' + srvControl(s) +
            (s.kind === "bool" ? "" : '<div class="ad-set-acts">' + (s.overridden ? '<button class="btn btn-ghost btn-sm" data-srv-reset>Use default</button>' : "") +
              '<button class="btn btn-primary btn-sm" data-srv-save disabled>Save</button></div>') +
            (s.kind === "bool" && s.overridden ? '<div class="ad-set-acts"><button class="btn btn-ghost btn-sm" data-srv-reset>Use default</button></div>' : "") +
            "</div></div>";
        }).join("") + "</div></div>";
    }).join("");
    $("[data-srv]").innerHTML = html || '<div class="ad-card"><div class="ad-empty">No setting matches.</div></div>';
  }
  function saveServerSetting(row, value, btn) {
    var s = srvSpec(row.dataset.srvRow), change = {};
    change[s.name] = value;
    var apply = function () {
      return run(btn, A.setServerSettings(change), s.label + " saved - every server uses it within seconds", "Saving").then(function (d) {
        renderServer(d);
        if (s.name === "deepseek_base_url" && state.sys) loadSystem();
      });
    };
    if (!s.danger) return apply();
    return ask({ title: "Change “" + s.label + "”?", text: (s.help ? s.help + " " : "") + "New value: " + srvText(s, value) + ".", ok: "Apply change", danger: true }).then(function (v) {
      if (v) return apply();
      renderServer();
    });
  }

  /* ------------------------------------------------------- plans & pricing */
  var PR = { data: null, draft: null };
  var THINK_LABEL = { none: "None only", low: "Up to Low", normal: "Up to Normal", high: "All, up to High" };
  function prClone(o) { return JSON.parse(JSON.stringify(o)); }
  function prGet(path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, PR.draft); }
  function prSet(path, value) {
    var keys = path.split("."), last = keys.pop();
    var target = keys.reduce(function (o, k) { return o[k]; }, PR.draft);
    target[last] = value;
  }
  function prDirty() { return PR.data && JSON.stringify(PR.draft) !== JSON.stringify(PR.data.catalog); }
  function prQuote(tokens) {
    var t = PR.draft.topup, base = Math.round(tokens / 1e6 * Math.round(t.pricePerMillion * 100));
    var pack = (t.packs || []).filter(function (p) { return Number(p.tokens) === tokens; })[0];
    var price = pack ? Math.round(pack.price * 100) : base;
    var fee = Math.round(price * t.feePercent / 100) + Math.round(t.feeFixed * 100);
    return { base: base, price: price, fee: fee, total: price + fee, off: base && base > price ? Math.round((base - price) * 100 / base) : 0 };
  }
  function prNum(path, label, opts) {
    opts = opts || {};
    var v = prGet(path);
    return "<label>" + esc(label) + '<span class="ad-unit"><input class="input" type="number" data-pr="' + path + '" data-pr-type="' + (opts.money ? "money" : "int") + '"' +
      ' step="' + (opts.money ? "0.01" : (opts.step || 1)) + '" min="0" value="' + (v == null ? "" : esc(v)) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") +
      "><i>" + esc(opts.unit || "") + "</i></span>" + (opts.hint ? '<small class="ad-hint">' + esc(opts.hint) + "</small>" : "") + "</label>";
  }
  function prPlanCard(id) {
    var p = PR.draft.plans[id], base = "plans." + id, features = PR.data.features;
    var allowance;
    if (p.period === "day") allowance = prNum(base + ".dailyTokens", "Tokens per day", { unit: "tokens", step: 1000, hint: p.countsCached === false ? "Only new (uncached) tokens count on this plan." : "" });
    else if (p.period === "month") allowance = '<div class="ad-pr-two">' + prNum(base + ".firstMonthTokens", "First month", { unit: "tokens", step: 100000, hint: "Once per account" }) +
      prNum(base + ".monthlyTokens", "Every month after", { unit: "tokens", step: 100000 }) + "</div>";
    else allowance = '<p class="ad-hint">No plan allowance - set a custom allowance per account (Users → AI &amp; tokens).</p>';
    return '<div class="ad-card ad-pr-plan" data-pr-plan="' + id + '"><div class="ad-pr-top"><input class="input ad-pr-name" data-pr="' + base + '.name" data-pr-type="text" maxlength="40" value="' + esc(p.name) + '">' +
      '<span class="ad-tag plan">' + esc(id) + "</span>" + (p.period === "month" ? '<span class="ad-tag info">monthly</span>' : p.period === "day" ? '<span class="ad-tag plan">daily</span>' : "") + "</div>" +
      '<div class="ad-form">' +
      (id === "free" ? "" : prNum(base + ".price", id === "enterprise" ? "Price (blank = Custom)" : "Price per month", { money: true, unit: "USD", placeholder: id === "enterprise" ? "Custom" : "" })) +
      allowance +
      '<label>Thinking modes<select data-pr="' + base + '.maxThinking" data-pr-type="text">' + PR.data.thinking.map(function (l) {
        return '<option value="' + l + '"' + (p.maxThinking === l ? " selected" : "") + ">" + esc(THINK_LABEL[l] || l) + "</option>";
      }).join("") + "</select></label>" +
      '<fieldset class="ad-pr-feats"><legend>Included</legend>' + features.map(function (f) {
        var on = (p.features || []).indexOf(f.id) >= 0;
        return '<label class="ad-check"><input type="checkbox" data-pr-feature="' + id + '" value="' + f.id + '"' + (on ? " checked" : "") + (f.id === "assistant" ? " disabled" : "") + "> " + esc(f.label) + "</label>";
      }).join("") + "</fieldset>" +
      '<label>Tagline<input class="input" data-pr="' + base + '.tagline" data-pr-type="text" maxlength="120" value="' + esc(p.tagline || "") + '"></label>' +
      '<label>Card highlights <small class="ad-hint">one per line, max 10 - a line with "not included" is shown greyed out</small><textarea data-pr="' + base + '.highlights" data-pr-type="lines" rows="5">' + esc((p.highlights || []).join("\n")) + "</textarea></label>" +
      '<label class="ad-check"><input type="checkbox" data-pr="' + base + '.popular" data-pr-type="bool"' + (p.popular ? " checked" : "") + '> Show as "Most picked"</label>' +
      "</div></div>";
  }
  function prTopupCard() {
    var t = PR.draft.topup;
    var packs = (t.packs || []).map(function (p, i) {
      var q = prQuote(Number(p.tokens));
      var exactOff = q.base ? Math.round((q.base - q.price) * 1000 / q.base) / 10 : 0;
      return '<div class="ad-pr-pack"><span class="ad-unit"><input class="input" type="number" min="1000" step="100000" data-pr-pack="' + i + '" data-pr-field="tokens" value="' + esc(p.tokens) + '"><i>tokens</i></span>' +
        '<span class="ad-unit" title="Discount off the base rate - sets the price"><input class="input" type="number" min="0" max="95" step="0.5" data-pr-pack="' + i + '" data-pr-field="discount" value="' + esc(Math.max(0, exactOff)) + '"><i>% off</i></span>' +
        '<span class="ad-unit"><input class="input" type="number" min="0.01" step="0.01" data-pr-pack="' + i + '" data-pr-field="price" value="' + esc(p.price) + '"><i>USD</i></span>' +
        '<span class="ad-pr-q">' + (q.off ? '<span class="ad-tag good">shown as ' + q.off + "% off</span> " : '<span class="ad-tag plan">base rate</span> ') + "+" + usd(q.fee) + " fee = <b>" + usd(q.total) + "</b></span>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-pr-pack-remove="' + i + '" aria-label="Remove package">✕</button></div>';
    }).join("");
    var examples = [500000, 1000000, 3000000].map(function (n) {
      var q = prQuote(n);
      return '<div class="r"><span>' + num(n) + " tokens</span><span>" + usd(q.price) + " + " + usd(q.fee) + " fee = <b>" + usd(q.total) + "</b></span></div>";
    }).join("");
    return '<div class="ad-card ad-pr-topup"><div class="ad-inline" style="justify-content:space-between"><div><h3>Token top-ups</h3><p class="ad-sub" style="margin:0">One-off token purchases on any plan. Used after the plan allowance; valid for the days set below.</p></div>' +
      '<label class="ad-toggle"><input type="checkbox" data-pr="topup.enabled" data-pr-type="bool"' + (t.enabled ? " checked" : "") + "><i></i></label></div>" +
      '<div class="ad-form ad-pr-grid">' +
      prNum("topup.pricePerMillion", "Price per 1,000,000 tokens", { money: true, unit: "USD", hint: "Before the processing fee" }) +
      prNum("topup.feePercent", "Processing fee", { money: true, unit: "%", hint: "Percent of the price" }) +
      prNum("topup.feeFixed", "Fixed fee per payment", { money: true, unit: "USD" }) +
      prNum("topup.validityDays", "Valid for", { unit: "days" }) +
      prNum("topup.minTokens", "Smallest custom top-up", { unit: "tokens", step: 100000 }) +
      prNum("topup.maxTokens", "Largest custom top-up", { unit: "tokens", step: 1000000 }) +
      prNum("topup.stepTokens", "Custom amounts in steps of", { unit: "tokens", step: 100000 }) +
      "</div>" +
      '<h4 class="ad-pr-h4">Preset packages <small class="ad-hint">priced below the base rate = shown as a discount</small></h4>' +
      '<div class="ad-pr-packs">' + (packs || '<p class="ad-hint">No packages - only custom amounts.</p>') + "</div>" +
      '<button class="btn btn-sm" type="button" data-pr-pack-add' + ((t.packs || []).length >= 8 ? " disabled" : "") + ">+ Add package</button>" +
      '<h4 class="ad-pr-h4">Custom amount examples</h4><div class="ad-rows">' + examples + "</div></div>";
  }
  function renderPricing() {
    if (!PR.draft) return;
    var focus = document.activeElement, keep = focus && (focus.dataset.pr || (focus.dataset.prPack ? "pack" + focus.dataset.prPack + focus.dataset.prField : ""));
    var caret = focus && typeof focus.selectionStart === "number" ? focus.selectionStart : null;
    $("[data-pr]").innerHTML = '<div class="ad-pr-plans">' + PR.data.planIds.map(prPlanCard).join("") + "</div>" + prTopupCard();
    var dirty = prDirty();
    $("[data-pr-save]").disabled = !dirty;
    var badge = $("[data-pricing-badge]");
    if (badge) { badge.hidden = !dirty; badge.textContent = "•"; badge.title = "Unsaved changes"; }
    if (keep) {
      var again = keep.indexOf("pack") === 0 ? $('[data-pr-pack="' + keep.charAt(4) + '"][data-pr-field="' + keep.slice(5) + '"]') : $('[data-pr="' + keep + '"]');
      if (again) { again.focus(); try { if (caret != null) again.setSelectionRange(caret, caret); } catch (e) { /* number inputs */ } }
    }
  }
  function loadPricing() {
    if (!PR.data) $("[data-pr]").innerHTML = '<div class="ad-skel"></div>';
    loadTopupSales();
    return A.pricing().then(function (d) {
      if (PR.data && prDirty()) { PR.data = d; return renderPricing(); }  // keep unsaved edits
      PR.data = d; PR.draft = prClone(d.catalog); renderPricing();
    }, function (e) { $("[data-pr]").innerHTML = '<div class="ad-card"><p class="ad-muted">' + esc(errText(e)) + "</p></div>"; });
  }
  function loadTopupSales() {
    var host = $("[data-pr-sales-body]");
    A.topups().then(function (d) {
      var t = d.totals || {};
      host.innerHTML = '<div class="ad-grid ad-kpis" style="margin-bottom:14px">' + kpi("Orders", num(t.orders), "paid top-ups") + kpi("Tokens sold", fmt(t.tokens), fmt(t.used) + " used so far") +
        kpi("Revenue", usd(t.revenueCents), "before the processing fee") + kpi("Processing fees", usd(t.feeCents), "passed on to buyers") + "</div>" +
        ((d.topups || []).length ? '<div class="ad-tablewrap"><table class="ad-table ad-sales"><thead><tr><th>When</th><th>Account</th><th>Tokens</th><th>Left</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>' +
          d.topups.map(function (r) {
            return "<tr><td>" + when(r.created) + '</td><td><a href="#users/' + esc(r.userId) + '">' + esc(r.username || r.email) + '</a><br><span class="ad-muted" style="font-size:12px">' + esc(r.email) + "</span></td>" +
              "<td>" + num(r.tokens) + (r.source === "admin" ? ' <span class="ad-tag plan">support</span>' : "") + "</td><td>" + num(r.left) + "</td>" +
              "<td>" + (r.priceCents ? usd(r.priceCents) + ' <span class="ad-muted">+ ' + usd(r.feeCents) + "</span>" : '<span class="ad-muted">-</span>') + "</td>" +
              '<td><span class="ad-tag ' + (r.status === "active" ? "good" : "plan") + '">' + esc(r.status) + "</span></td>" +
              "<td>" + (r.status === "active" && r.left ? '<button class="btn btn-ghost btn-sm" data-sale-revoke="' + esc(r.id) + '" data-sale-left="' + r.left + '">Remove</button>' : "") + "</td></tr>";
          }).join("") + "</tbody></table></div>"
          : '<div class="ad-empty">No top-ups yet. They appear here as soon as Lemon Squeezy confirms a payment.</div>');
    }, function (e) { host.innerHTML = '<p class="ad-muted">' + esc(errText(e)) + "</p>"; });
  }
  function prRead(input) {
    var type = input.dataset.prType;
    if (type === "bool") return input.checked;
    if (type === "lines") return input.value.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (type === "text") return input.value;
    var raw = input.value.trim();
    if (raw === "") return null;
    return type === "money" ? Math.round(Number(raw) * 100) / 100 : Math.round(Number(raw));
  }
  function wirePricing() {
    var view = $('[data-view="pricing"]');
    if (!view) return;
    view.addEventListener("input", function (e) {
      var t = e.target;
      if (!PR.draft) return;
      if (t.dataset.pr) { prSet(t.dataset.pr, prRead(t)); }
      else if (t.dataset.prPack) {
        var pack = PR.draft.topup.packs[Number(t.dataset.prPack)];
        if (t.dataset.prField === "discount") {
          // "% off" sets the price from the base rate (price per million x tokens).
          var pct = Math.max(0, Math.min(95, Number(t.value) || 0));
          var base = pack.tokens / 1e6 * PR.draft.topup.pricePerMillion;
          pack.price = Math.max(0.01, Math.round(base * (100 - pct)) / 100);
        } else {
          pack[t.dataset.prField] = t.dataset.prField === "price" ? Math.round(Number(t.value) * 100) / 100 : Math.round(Number(t.value));
        }
      } else if (t.dataset.prFeature) {
        var plan = PR.draft.plans[t.dataset.prFeature], list = plan.features.slice();
        if (t.checked && list.indexOf(t.value) < 0) list.push(t.value);
        if (!t.checked) list = list.filter(function (f) { return f !== t.value; });
        plan.features = PR.data.features.map(function (f) { return f.id; }).filter(function (f) { return list.indexOf(f) >= 0; });
      } else return;
      // Text fields (and "% off", whose rounded value would jump while typing) re-render on
      // blur only; other numbers and toggles update the previews now.
      if (t.tagName === "TEXTAREA" || t.type === "text" || t.classList.contains("ad-pr-name") || t.dataset.prField === "discount") {
        $("[data-pr-save]").disabled = !prDirty();
        return;
      }
      renderPricing();
    });
    view.addEventListener("change", function (e) {
      if ((e.target.dataset.pr && /text|lines/.test(e.target.dataset.prType || "")) || e.target.dataset.prField === "discount") renderPricing();
    });
    view.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t || !PR.draft) return;
      if (t.matches("[data-pr-pack-add]")) {
        var packs = PR.draft.topup.packs, last = packs[packs.length - 1];
        packs.push({ tokens: last ? last.tokens * 2 : 1000000, price: last ? Math.round(last.price * 1.8 * 100) / 100 : PR.draft.topup.pricePerMillion });
        return renderPricing();
      }
      if (t.dataset.prPackRemove != null) { PR.draft.topup.packs.splice(Number(t.dataset.prPackRemove), 1); return renderPricing(); }
      if (t.matches("[data-pr-save]")) {
        return ask({ title: "Save plans & pricing?", text: "The website, the server and every open app use the new values within seconds. If you changed a monthly price, also change it in Lemon Squeezy.", ok: "Save changes" }).then(function (v) {
          if (!v) return;
          run(t, A.savePricing(PR.draft), null, "Saving").then(function (d) {
            PR.data = d; PR.draft = prClone(d.catalog); renderPricing();
            toast(d.changed && d.changed.length ? "Saved: " + d.changed.slice(0, 3).join("; ") + (d.changed.length > 3 ? " (+" + (d.changed.length - 3) + " more)" : "") : "Nothing changed");
          });
        });
      }
      if (t.matches("[data-pr-reset]")) {
        return ask({ title: "Reset plans & pricing?", text: "Every plan, allowance and top-up price goes back to the built-in values. The website and apps update within seconds.", ok: "Reset everything", danger: true, confirmText: "RESET", fields: [{ name: "confirm", label: "Type RESET to confirm" }] }).then(function (v) {
          if (!v) return;
          run(t, A.resetPricing(), "Plans & pricing are back to the built-in values", "Resetting").then(function (d) { PR.data = d; PR.draft = prClone(d.catalog); renderPricing(); });
        });
      }
      if (t.dataset.saleRevoke) {
        var left = Number(t.dataset.saleLeft || 0);
        return ask({ title: "Remove " + num(left) + " unused top-up tokens?", text: "This doesn't refund the payment - refunds are made in Lemon Squeezy (a refunded order removes its tokens by itself).", ok: "Remove tokens", danger: true }).then(function (v) {
          if (v) run(t, A.revokeTopup(t.dataset.saleRevoke), num(left) + " top-up tokens removed", "Removing").then(loadTopupSales);
        });
      }
    });
  }

  /* ------------------------------------------------------- search (Ctrl K) */
  var FIND = { items: [], sel: 0, users: [], userQuery: "", timer: null };
  var VIEW_WORDS = {
    dashboard: "overview kpi tokens today plans sign-ups attention", insights: "downloads active app versions thinking top users charts export csv",
    ads: "ads adsense unlock rewarded funnel", revenue: "subscriptions money revenue mrr lemon squeezy billing", gifts: "token gifts bonus free tokens",
    users: "accounts people search customers", messages: "email broadcast send newsletter mailbox", settings: "live maintenance pause sign-ups theme season promotion discount sale announcement banner terms privacy legal",
    server: "limits rate limit queue priority head start security sessions lockout model routing provider address timeout email",
    pricing: "plans prices price subscription builder pro studio enterprise allowance monthly first month tokens features 3d studio version converter thinking high top-up topup packages discount percent fee lemon squeezy sales",
    activity: "log audit history changes", system: "keys api key provider balance queue health mailboxes plans updates deepseek"
  };
  function findActions() {
    return [
      { group: "Actions", icon: "+", title: "Add an AI provider key", sub: "System · paste a new API key", words: "new second backup api key provider deepseek", run: function () { go("system"); setTimeout(function () { addKeyDialog($("[data-key-add]")); }, 60); } },
      { group: "Actions", icon: "⇄", title: "Switch AI provider key", sub: "System · turn keys on or off", words: "change main key primary turn off on", run: function () { go("system"); flashWhenReady("#ai-keys"); } },
      { group: "Actions", icon: "§", title: "Publish new Terms & Privacy version", sub: "Live settings · everyone agrees again", words: "legal terms privacy policy consent", run: function () { go("settings"); flashWhenReady("[data-cfg-legal]", true); } },
      { group: "Actions", icon: "!", title: "Pause AI for everyone (maintenance)", sub: "Live settings · service switches", words: "maintenance emergency stop", run: function () { go("settings"); flashWhenReady("[data-cfg-switches]", true); } },
      { group: "Actions", icon: "$", title: "Check AI provider balance", sub: "System · remaining credit", words: "balance credit top up money", run: function () { go("system"); flashWhenReady("[data-balance-keys]", true); loadBalance(true); } },
      { group: "Actions", icon: "★", title: "Give tokens", sub: "Token gifts · new gift", words: "gift bonus free tokens", run: function () { go("gifts"); } },
      { group: "Actions", icon: "$", title: "Change plan prices & allowances", sub: "Plans & pricing · prices, monthly tokens, features", words: "price plan builder pro studio monthly tokens features 3d thinking", run: function () { go("pricing"); } },
      { group: "Actions", icon: "+", title: "Edit token top-up prices", sub: "Plans & pricing · price per million, fee, packages", words: "top-up topup packs fee processing buy tokens", run: function () { go("pricing"); flashWhenReady(".ad-pr-topup"); } },
      { group: "Actions", icon: "✉", title: "Email users", sub: "Messages · direct or broadcast", words: "email send message broadcast", run: function () { go("messages"); } },
      { group: "Actions", icon: "↓", title: "Export users as CSV", sub: "Users · current filter", words: "export download csv", run: function () { go("users"); setTimeout(function () { exportCsv($("[data-export]")); }, 80); } }
    ];
  }
  function findIndex() {
    var items = findActions();
    $$("[data-nav]").forEach(function (b) {
      var view = b.dataset.nav, title = b.textContent.replace(/[\d–!-]+$/, "").trim();
      items.push({ group: "Pages", icon: title.charAt(0), title: title, sub: "Go to " + title, words: VIEW_WORDS[view] || "", run: function () { go(view); } });
      $$('[data-view="' + view + '"] .ad-card > h3, [data-view="' + view + '"] .ad-card > .ad-inline h3, [data-view="' + view + '"] .ad-section-title').forEach(function (h) {
        var text = h.textContent.trim(), card = h.closest(".ad-card") || h;
        if (!text || text === "-" || h.hasAttribute("data-balance-total")) return;
        var sub = card.querySelector(".ad-sub");
        items.push({ group: "Sections", icon: "#", title: text, sub: title + (sub ? " · " + sub.textContent.trim() : ""), words: "",
          run: function () { go(view); flash(card); } });
      });
    });
    REWARD_FIELDS.forEach(function (r) {
      items.push({ group: "Settings", icon: "⚙", title: r[1], sub: "Live settings · Ad unlocks", words: r[0] + " unlock reward", run: function () { go("settings"); flashWhenReady('[data-cfg-num="' + r[0] + '"]'); } });
    });
    ((SRV.data && SRV.data.settings) || []).forEach(function (s) {
      var sec = SRV.data.sections.filter(function (x) { return x.id === s.section; })[0] || {};
      items.push({ group: "Settings", icon: "⚙", title: s.label, sub: "Server settings · " + (sec.label || "") + " · " + srvText(s, s.value), words: s.help + " " + s.name,
        run: function () { openSetting(s.name); } });
    });
    ((state.sys && state.sys.keys) || []).forEach(function (k) {
      items.push({ group: "AI keys", icon: "⚿", title: k.label + " " + (k.hint || ""), sub: "AI key · " + (STATUS_TEXT[k.status] || k.status) + " · " + num(k.users) + " accounts · " + k.pool, words: "key provider api " + k.status,
        run: function () { go("system"); flashWhenReady('[data-key-row="' + k.id + '"]'); } });
    });
    return items;
  }
  function openSetting(name) {
    SRV.section = ""; SRV.filter = ""; SRV.changed = false;
    var f = $("[data-srv-filter]"); if (f) f.value = "";
    var c = $("[data-srv-changed]"); if (c) c.checked = false;
    go("server");
    flashWhenReady('[data-srv-row="' + name + '"]');
  }
  function flash(el) {
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("ad-flash"); void el.offsetWidth; el.classList.add("ad-flash");
    setTimeout(function () { el.classList.remove("ad-flash"); }, 2000);
    var input = el.matches("input, textarea, select") ? el : null;
    if (input) setTimeout(function () { input.focus(); }, 400);
  }
  function flashWhenReady(selector, card) {
    var tries = 0;
    (function look() {
      var el = $(selector);
      if (el && el.offsetParent !== null) return flash(card ? el.closest(".ad-card") || el : el);
      if (++tries < 40) setTimeout(look, 100);
    })();
  }
  function highlight(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      if (w.length < 2) return;
      out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
    });
    return out;
  }
  function findRender() {
    var input = $("[data-find-input]"), q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    var all = findIndex(), results = [];
    if (!words.length) {
      results = all.filter(function (i) { return i.group === "Actions" || i.group === "Pages"; });
    } else {
      all.forEach(function (i) {
        var title = i.title.toLowerCase(), hay = (i.title + " " + i.sub + " " + i.words + " " + i.group).toLowerCase();
        if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
        i.score = (title.indexOf(q) === 0 ? 0 : title.indexOf(q) >= 0 ? 1 : words.every(function (w) { return title.indexOf(w) >= 0; }) ? 2 : 3);
        results.push(i);
      });
      results.sort(function (a, b) { return a.score - b.score; });
      FIND.users.forEach(function (u) {
        results.push({ group: "Users", icon: (u.username || u.email || "?").charAt(0).toUpperCase(), title: u.username || u.email, sub: u.email + " · " + cap(u.plan || "free"), run: function () { openUser(u.id); } });
      });
    }
    var order = ["Actions", "Pages", "Settings", "AI keys", "Sections", "Users"], groups = {}, best = {};
    results.forEach(function (r) {
      (groups[r.group] = groups[r.group] || []).push(r);
      best[r.group] = Math.min(best[r.group] == null ? 9 : best[r.group], r.score == null ? 4 : r.score);
    });
    if (words.length) {
      // The group holding the closest match comes first; ties keep the usual order.
      order.sort(function (a, b) { return ((best[a] == null ? 9 : best[a]) - (best[b] == null ? 9 : best[b])) || 0; });
    }
    FIND.items = [];
    var html = order.map(function (g) {
      var list = (groups[g] || []).slice(0, g === "Pages" && !words.length ? 12 : 7);
      if (!list.length) return "";
      return '<div class="ad-find-group">' + g + "</div>" + list.map(function (r) {
        var i = FIND.items.push(r) - 1;
        return '<button type="button" class="ad-find-item' + (i === FIND.sel ? " on" : "") + '" role="option" data-find-pick="' + i + '"><span class="ic">' + esc(r.icon || "•") + '</span><span class="tx"><b>' +
          highlight(r.title, words) + "</b><small>" + highlight(r.sub || "", words) + '</small></span><span class="go">↵</span></button>';
      }).join("");
    }).join("");
    var pending = words.length && q.length >= 2 && FIND.userQuery !== q;
    $("[data-find-results]").innerHTML = html || (pending ? '<div class="ad-find-empty">Searching…</div>' : '<div class="ad-find-empty">Nothing found for “' + esc(input.value.trim()) + "”.</div>");
    if (FIND.sel >= FIND.items.length) FIND.sel = Math.max(0, FIND.items.length - 1);
  }
  function findUsers() {
    var q = $("[data-find-input]").value.trim();
    clearTimeout(FIND.timer);
    if (q.length < 2) { FIND.users = []; FIND.userQuery = q.toLowerCase(); return; }
    FIND.timer = setTimeout(function () {
      A.users({ query: q, page: 1 }).then(function (r) {
        if ($("[data-find-input]").value.trim() !== q) return;
        FIND.users = (r.users || []).slice(0, 6); FIND.userQuery = q.toLowerCase(); findRender();
      }, function () { FIND.users = []; FIND.userQuery = q.toLowerCase(); findRender(); });
    }, 220);
  }
  function findOpen() {
    var pop = $("[data-find]");
    if (!pop.hidden) return;
    pop.hidden = false; FIND.sel = 0; FIND.users = [];
    var input = $("[data-find-input]"); input.value = "";
    findRender();
    input.focus(); // right away, so fast typing after Ctrl+K isn't lost
    if (!SRV.data) A.serverSettings().then(function (d) { SRV.data = d; if (!pop.hidden) findRender(); }, function () {});
    if (!state.sys) A.system().then(function (s) { state.sys = s; if (!pop.hidden) findRender(); }, function () {});
  }
  function findClose() { $("[data-find]").hidden = true; }
  function findPick(i) {
    var item = FIND.items[i];
    if (!item) return;
    findClose();
    item.run();
  }
  function findMove(step) {
    if (!FIND.items.length) return;
    FIND.sel = (FIND.sel + step + FIND.items.length) % FIND.items.length;
    $$("[data-find-pick]").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.findPick) === FIND.sel); });
    var on = $('[data-find-pick="' + FIND.sel + '"]'); if (on) on.scrollIntoView({ block: "nearest" });
  }

  function loadSystem() {
    loadUpdates(false);
    loadHealth();
    loadBalance(false);
    loadSenders().then(function (s) {
      renderQueue(s.aiQueue);
      renderKeys(s);
      $("[data-mailboxes]").innerHTML = s.senders.map(function (m) {
        return '<div class="r"><span style="display:flex;align-items:center;gap:12px"><img src="assets/img/mail/' + esc(m.id) + '.png" alt="" width="34" height="34" style="border-radius:50%;flex:none">' +
          '<span><b style="color:var(--text);display:block">' + esc(m.address) + '</b><span style="font-size:12.5px">' + esc(m.purpose) + "</span></span></span>" +
          '<span data-mb="' + esc(m.address) + '">' + (m.ready ? '<span class="ad-tag good">configured</span>' : '<span class="ad-tag bad">no password</span>') + "</span></div>";
      }).join("");
      $("[data-plans-table]").innerHTML = s.plans.map(function (p) {
        var allowance = p.period === "month" ? fmt(p.firstMonthTokens) + " first month · " + fmt(p.monthlyTokens) + " / month" : p.period === "day" ? tokens(p.dailyTokens) + " / day" : "Custom";
        return '<div class="r"><span><span class="ad-dot" style="display:inline-block;margin-right:8px;background:' + (PLAN_COLOR[p.id] || "#888") + '"></span>' + esc(p.name) + "</span><span class=\"ad-mono\">" + allowance + "</span></div>";
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
    var view = ["dashboard", "insights", "ads", "revenue", "pricing", "gifts", "settings", "server", "users", "messages", "activity", "system"].indexOf(h) >= 0 ? h : "dashboard";
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
  document.addEventListener("keydown", function (e) {
    var pop = $("[data-find]"), open = pop && !pop.hidden;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      if ($("[data-shell]").hidden) return;
      e.preventDefault();
      return open ? findClose() : findOpen();
    }
    if (!open && e.key === "/" && !typing && !$("[data-shell]").hidden && $("[data-modal]").hidden) { e.preventDefault(); return findOpen(); }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); return findClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); return findMove(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); return findMove(-1); }
    if (e.key === "Enter") { e.preventDefault(); return findPick(FIND.sel); }
  });
  // A search button next to the menu button on phones (the sidebar is hidden there).
  $$("[data-menu]").forEach(function (m) {
    m.insertAdjacentHTML("afterend", '<button class="ad-find-mobile" type="button" data-find-open aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>');
  });

  var searchTimer;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches("[data-search]")) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { state.users.query = t.value.trim(); state.users.page = 1; loadUsers(); }, 250);
    }
    if (t.matches("[data-find-input]")) { FIND.sel = 0; findRender(); findUsers(); }
    if (t.matches("[data-srv-filter]")) { SRV.filter = t.value.trim(); renderServer(); }
    if (t.closest("[data-srv-row]") && t.matches("[data-srv-input], [data-srv-plan]") && t.type !== "checkbox") srvDirty(t.closest("[data-srv-row]"));
    if (t.matches("[data-msg-subject], [data-msg-body]")) renderPreview();
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("[data-plan-filter]")) { state.users.plan = t.value; state.users.page = 1; loadUsers(); }
    if (t.matches("[data-sort]")) { state.users.sort = t.value; state.users.page = 1; loadUsers(); }
    if (t.matches("[data-ev-filter]")) { state.ev.action = t.value; state.ev.page = 1; loadEvents(); }
    if (t.matches("[data-key-toggle]")) return toggleKey(t);
    if (t.matches("[data-srv-changed]")) { SRV.changed = t.checked; return renderServer(); }
    if (t.matches("[data-srv-input]") && t.type === "checkbox") {
      var brow = t.closest("[data-srv-row]"), want = t.checked;
      t.checked = !want; // stays until saved
      return saveServerSetting(brow, want, null);
    }
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
    // Search
    if (t.closest("[data-find-open]")) { e.preventDefault(); return findOpen(); }
    var fp = t.closest("[data-find-pick]"); if (fp) return findPick(Number(fp.dataset.findPick));
    if (t.matches("[data-find]")) return findClose();

    // AI provider keys
    if (t.closest("[data-key-add]")) return addKeyDialog(t.closest("[data-key-add]"));
    var ka = t.closest("[data-key-act]"); if (ka) return keyAction(ka.dataset.keyAct, ka.dataset.id, ka);
    if (t.closest("[data-keys-help]")) {
      return ask({ title: "How AI keys work", ok: "Got it",
        text: "Every account is pinned to one key that is on. Switch a key off, remove it or press “Use only this”, and the accounts on it move to another key that is on with their next AI request - nobody restarts and nothing is lost. " +
          "Add a second key as a backup: if one runs out of credit, the server moves requests to the other and re-tries the empty one every 2 minutes, switching it back on by itself after a top-up. " +
          "Priority keys are used first by plans with priority access. Keys are stored encrypted and never shown again." });
    }
    var gs2 = t.closest("[data-goto-setting]"); if (gs2) return openSetting(gs2.dataset.gotoSetting);

    // Server settings
    var sc = t.closest("[data-srv-section]"); if (sc) { SRV.section = sc.dataset.srvSection; return renderServer(); }
    if (t.closest("[data-srv-reload]")) return run(t.closest("[data-srv-reload]"), A.serverSettings(), "Reloaded", "Loading").then(renderServer);
    var ss = t.closest("[data-srv-save]");
    if (ss) {
      var srow = ss.closest("[data-srv-row]"), value;
      try { value = readSrv(srow, srvSpec(srow.dataset.srvRow)); } catch (err) { return toast(err.message, true); }
      return saveServerSetting(srow, value, ss);
    }
    var sr = t.closest("[data-srv-reset]");
    if (sr) {
      var rrow = sr.closest("[data-srv-row]"), rs2 = srvSpec(rrow.dataset.srvRow);
      return ask({ title: "Use the server default for “" + rs2.label + "”?", text: "Back to " + srvText(rs2, rs2.default) + " (from the server's .env).", ok: "Use default", danger: rs2.danger }).then(function (v) {
        if (v) run(sr, A.resetServerSetting(rs2.name), rs2.label + " is back to the default", "Resetting").then(renderServer);
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

    // Token gifts
    var gm = t.closest("[data-gift-mode] button");
    if (gm) {
      $$("[data-gift-mode] button").forEach(function (b) { b.classList.toggle("on", b === gm); });
      $("[data-gift-mode-hint]").textContent = gm.dataset.mode === "daily"
        ? "Added on top of their normal allowance every day while the gift runs."
        : "A pack is used once their normal daily allowance runs out, until it is spent or the gift ends.";
      return;
    }
    var ga = t.closest("[data-gift-aud] button");
    if (ga) {
      $$("[data-gift-aud] button").forEach(function (b) { b.classList.toggle("on", b === ga); });
      $("[data-gift-plans]").hidden = ga.dataset.aud !== "plans";
      $("[data-gift-users]").hidden = ga.dataset.aud !== "users";
      $("[data-gift-info]").textContent = "";
      return;
    }
    var gl = t.closest("[data-gift-len] button");
    if (gl) {
      $$("[data-gift-len] button").forEach(function (b) { b.classList.toggle("on", b === gl); });
      $("[data-gift-until]").hidden = gl.dataset.len !== "custom";
      return;
    }
    if (t.dataset.giftPick) { $("[data-gift-amount]").value = t.dataset.giftPick; return; }
    if (t.closest("[data-gift-count]")) {
      return run(t.closest("[data-gift-count]"), A.giftPreview(giftAudience()), null, "Counting").then(function (r) {
        $("[data-gift-info]").textContent = num(r.recipients) + " people" + (r.sample.length ? " (e.g. " + r.sample.slice(0, 3).join(", ") + ")" : "");
      });
    }
    if (t.closest("[data-gift-create]")) {
      var gbtn = t.closest("[data-gift-create]");
      var gift = {
        name: $("[data-gift-name]").value.trim(), mode: $("[data-gift-mode] .on").dataset.mode,
        amount: Math.round(Number($("[data-gift-amount]").value)), audience: giftAudience(), endsAt: giftEnds(),
        notify: $("[data-gift-notify]").checked, message: $("[data-gift-message]").value.trim()
      };
      if (!gift.name) return toast("Give the gift a name.", true);
      if (!(gift.amount > 0)) return toast("Enter how many tokens to give.", true);
      if (gift.endsAt === "") return toast("Pick when the gift ends.", true);
      return run(gbtn, A.giftPreview(gift.audience), null, "Checking").then(function (r) {
        return ask({
          title: "Give " + (gift.mode === "daily" ? "+" + num(gift.amount) + " tokens a day" : num(gift.amount) + " tokens") + " to " + num(r.recipients) + " people?",
          text: "'" + gift.name + "' " + (gift.endsAt ? "runs until " + when(gift.endsAt) : "has no end date") + "." + (gift.notify ? " Everyone gets an email." : " No email is sent."),
          ok: "Give tokens"
        });
      }).then(function (v) {
        if (!v) return;
        run(gbtn, A.createGift(gift), null, "Giving").then(function (res) {
          toast("Gift sent to " + num(res.gift.recipients) + " people" + (res.emailed ? " · emails on their way" : ""));
          $("[data-gift-form]").dataset.ready = ""; loadGifts();
        });
      });
    }
    var gopen = t.closest("[data-gift-open]"); if (gopen) return showGiftPeople(gopen.dataset.giftOpen);
    var gend = t.closest("[data-gift-end]");
    if (gend) {
      return ask({ title: "End this gift now?", text: "Unused tokens from it stop working right away. Its history stays here.", ok: "End gift", danger: true }).then(function (v) {
        if (v) run(gend, A.endGift(gend.dataset.giftEnd), "Gift ended", "Ending").then(loadGifts);
      });
    }
    var gdel = t.closest("[data-gift-delete]");
    if (gdel) {
      return ask({ title: "Remove this gift?", text: "It stops right away and its usage history is deleted. The activity log keeps a record.", ok: "Remove", danger: true }).then(function (v) {
        if (v) run(gdel, A.deleteGift(gdel.dataset.giftDelete), "Gift removed", "Removing").then(loadGifts);
      });
    }
    if (t.closest("[data-balance-refresh]")) return loadBalance(true, t.closest("[data-balance-refresh]"));

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
    if (t.closest("[data-promo-same]")) {
      var rows = $$("[data-promo-row]"), first = rows.filter(function (r) { return $("[data-promo-plan]", r).checked; })[0];
      if (!first) return toast("Turn on at least one plan first.", true);
      var fid = first.dataset.promoRow, fp = $('[data-promo-pct="' + fid + '"]').value, fc = $('[data-promo-code="' + fid + '"]').value;
      rows.forEach(function (r) { var id = r.dataset.promoRow; $('[data-promo-pct="' + id + '"]').value = fp; $('[data-promo-code="' + id + '"]').value = fc; });
      return promoPreview();
    }
    if (t.closest("[data-promo-save]")) {
      var untilP = $("[data-promo-until]").value, perPlan = {}, missing = "";
      $$("[data-promo-row]").forEach(function (r) {
        var id = r.dataset.promoRow;
        if (!$("[data-promo-plan]", r).checked) return;
        var code = $('[data-promo-code="' + id + '"]').value.trim().toUpperCase();
        if (!code && !missing) missing = cap(id);
        perPlan[id] = { percent: Number($('[data-promo-pct="' + id + '"]').value), code: code };
      });
      if (!Object.keys(perPlan).length) return toast("Turn on at least one plan.", true);
      if (missing) return toast(missing + " needs its Lemon Squeezy discount code.", true);
      var promo = { label: $("[data-promo-label]").value.trim(), terms: $("[data-promo-terms]").value.trim(),
        plans: perPlan, until: untilP ? new Date(untilP).toISOString() : null };
      var summary = Object.keys(perPlan).map(function (id) { return cap(id) + " " + perPlan[id].percent + "% (" + perPlan[id].code + ")"; }).join(", ");
      var btnP = t.closest("[data-promo-save]");
      return ask({ title: "Start " + (promo.label || "the promotion") + "?", text: summary + ". The website shows the sale prices right away.", ok: "Go live" }).then(function (v) {
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
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-updates-refresh]");
    if (!btn) return;
    busy(btn, true, "Checking");
    loadUpdates(true).then(function () { busy(btn, false); toast("Up to date"); });
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-legal-publish]");
    if (!btn) return;
    var summary = ($("[data-legal-summary]").value || "").trim();
    var notify = $("[data-legal-notify]").checked;
    if (!summary) { toast("Describe what changed - people see this note when they're asked to agree.", true); $("[data-legal-summary]").focus(); return; }
    ask({
      title: "Publish a new Terms & Privacy version?",
      text: "Everyone (including you) must agree again: the website shows a prompt and the app shows a pop-up, and AI requests wait until they accept." +
        (notify ? " An email about the update goes to every verified account." : ""),
      ok: "Publish", danger: true
    }).then(function (v) {
      if (!v) return;
      run(btn, A.publishLegal(summary, notify), notify ? "Published - emails are on their way" : "Published - live now", "Publishing").then(function (d) {
        renderLegal(d);
        // Admins agree like everyone else: the site prompt appears on the next account check.
        window.MCA.api.me();
      });
    });
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
    if (e.target.matches && e.target.matches("[data-promo-pct]")) promoPreview();
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
  window.addEventListener("beforeunload", function (e) {
    if (PR.draft && prDirty()) { e.preventDefault(); e.returnValue = ""; }  // unsaved plans & pricing
  });

  wirePricing();
  start();
})();

/*
 * Admin panel. Uses the signed-in session cookie; the server returns 404 for
 * anyone who isn't an admin, so this page only ever shows data to admins.
 */
(function () {
  "use strict";
  var api = window.MCA.api, esc = window.MCA.escapeHtml, fmt = window.MCA.formatTokens;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var state = { page: 1, query: "", plan: "", total: 0, pages: 1, me: null };

  function show(el, on) { el.hidden = !on; }
  function toast(msg, isErr) {
    var t = $("[data-toast]");
    t.textContent = msg; t.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = "toast"; }, 2600);
  }
  function errText(e) { return (e && e.message) || "Something went wrong."; }

  function gate(title, sub, label, href) {
    show($("[data-gate]"), true); show($("[data-panel]"), false);
    $("[data-gate-title]").textContent = title;
    $("[data-gate-sub]").textContent = sub || "";
    var a = $("[data-gate-action]");
    if (label) { a.textContent = label; a.href = href; show(a, true); } else { show(a, false); }
  }

  function num(n) { return (n == null ? "—" : Number(n).toLocaleString("en-US")); }
  function since(iso) {
    if (!iso) return "—";
    var d = new Date(iso); var days = Math.floor((Date.now() - d) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + "d ago";
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  // -- overview ------------------------------------------------------------
  function renderOverview(o) {
    var cards = [
      { k: "Users", v: num(o.users.total), s: num(o.users.verified) + " verified · " + num(o.users.activeLast7d) + " active 7d" },
      { k: "Tokens today", v: fmt(o.tokens.today), s: num(o.tokens.requestsToday) + " requests" },
      { k: "Tokens all-time", v: fmt(o.tokens.allTime), s: "billable (counted) tokens" },
      { k: "Provider keys", v: num((o.providerKeys.active || 0)), s: "active · " + num(o.providerKeys.degraded || 0) + " degraded" }
    ];
    $("[data-cards]").innerHTML = cards.map(function (c) {
      return '<div class="adm-card"><div class="k">' + esc(c.k) + '</div><div class="v">' + esc(c.v) +
        '</div><div class="s">' + esc(c.s) + "</div></div>";
    }).join("");

    var order = ["free", "builder", "pro", "studio", "enterprise"];
    var pills = order.filter(function (p) { return o.plans[p] != null; }).map(function (p) {
      return '<span class="adm-pill"><b>' + num(o.plans[p]) + "</b> " + esc(p) + "</span>";
    });
    $("[data-plans]").innerHTML = pills.join("");

    var sel = $("[data-plan-filter]");
    if (sel.options.length <= 1) {
      order.forEach(function (p) {
        if (o.plans[p] != null) { var op = document.createElement("option"); op.value = p; op.textContent = p; sel.appendChild(op); }
      });
    }
  }

  // -- user table ----------------------------------------------------------
  function planTag(u) {
    var cls = u.plan === "free" ? "free" : "paid";
    return '<span class="adm-tag ' + cls + '">' + esc(u.planName || u.plan) + "</span>";
  }
  function usedCell(u) {
    if (u.dailyLimit == null) return fmt(u.usedToday) + " <span class='muted'>/ ∞</span>";
    var pct = Math.min(100, Math.round(u.usedToday / u.dailyLimit * 100)) || 0;
    return fmt(u.usedToday) + " <span class='muted'>/ " + fmt(u.dailyLimit) + "</span>" +
      '<div class="adm-bar"><i style="width:' + pct + '%"></i></div>';
  }
  function statusCell(u) {
    var tags = [];
    if (!u.active) tags.push('<span class="adm-tag off">disabled</span>');
    if (u.admin) tags.push('<span class="adm-tag adm">admin</span>');
    if (!u.verified) tags.push('<span class="adm-tag off">unverified</span>');
    if (!tags.length) tags.push('<span class="muted">active</span>');
    return tags.join(" ");
  }

  function renderRows(data) {
    state.total = data.total; state.pages = data.pages; state.page = data.page;
    var body = $("[data-rows]");
    if (!data.users.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="adm-empty">No users match.</div></td></tr>';
    } else {
      body.innerHTML = data.users.map(function (u) {
        return '<tr data-id="' + esc(u.id) + '">' +
          '<td><div class="adm-u"><b>' + esc(u.username) + '</b><span class="em">' + esc(u.email) + "</span></div></td>" +
          "<td>" + planTag(u) + "</td>" +
          "<td>" + usedCell(u) + "</td>" +
          "<td>" + statusCell(u) + "</td>" +
          "<td>" + since(u.created) + "</td></tr>";
      }).join("");
    }
    $("[data-page-info]").textContent = "Page " + data.page + " of " + data.pages;
    $("[data-total]").textContent = num(data.total) + " user" + (data.total === 1 ? "" : "s");
    $("[data-prev]").disabled = data.page <= 1;
    $("[data-next]").disabled = data.page >= data.pages;
  }

  function loadUsers() {
    return api.admin.users({ query: state.query, page: state.page, plan: state.plan }).then(renderRows, function (e) {
      toast(errText(e), true);
    });
  }

  // -- detail drawer -------------------------------------------------------
  function closeDrawer() {
    $("[data-drawer]").classList.remove("show");
    $("[data-drawer-back]").classList.remove("show");
  }
  function spark(history) {
    if (!history || !history.length) return "";
    var days = history.slice().reverse();
    var max = Math.max.apply(null, days.map(function (d) { return d.billable; })) || 1;
    return '<div class="spark" title="last ' + days.length + ' days">' + days.map(function (d) {
      return '<i style="height:' + Math.round(d.billable / max * 100) + '%" title="' + d.day + ": " + fmt(d.billable) + '"></i>';
    }).join("") + "</div>";
  }

  function openUser(id) {
    var d = $("[data-drawer]");
    d.innerHTML = '<div class="adm-empty">Loading…</div>';
    d.classList.add("show"); $("[data-drawer-back]").classList.add("show");
    api.admin.user(id).then(function (u) { renderDrawer(u); }, function (e) {
      d.innerHTML = '<div class="adm-empty">' + esc(errText(e)) + "</div>";
    });
  }

  function planOptions(current) {
    return ["free", "builder", "pro", "studio", "enterprise"].map(function (p) {
      return '<option value="' + p + '"' + (p === current ? " selected" : "") + ">" + p + "</option>";
    }).join("");
  }

  function renderDrawer(u) {
    var d = $("[data-drawer]");
    var self = state.me && state.me.id === u.id;
    var sub = u.subscription;
    d.innerHTML =
      '<button class="btn btn-ghost" data-close style="float:right">Close</button>' +
      "<h3>" + esc(u.username) + (u.admin ? ' <span class="adm-tag adm">admin</span>' : "") + "</h3>" +
      '<div class="em">' + esc(u.email) + "</div>" +
      '<div class="block"><h4>Usage · last 30 days</h4>' + spark(u.usageHistory) +
        '<div class="row"><span>Today</span><b>' + fmt(u.usedToday) + (u.dailyLimit == null ? " / ∞" : " / " + fmt(u.dailyLimit)) + "</b></div></div>" +
      '<div class="block"><h4>Account</h4>' +
        '<div class="row"><span>Plan</span><b>' + esc(u.planName || u.plan) + (u.planExpiresAt ? " · ends " + since(u.planExpiresAt) : "") + "</b></div>" +
        '<div class="row"><span>Sign-in</span><b>' + esc(u.provider) + "</b></div>" +
        '<div class="row"><span>Verified</span><b>' + (u.verified ? "yes" : "no") + "</b></div>" +
        '<div class="row"><span>Joined</span><b>' + since(u.created) + "</b></div>" +
        '<div class="row"><span>Last login</span><b>' + since(u.lastLogin) + "</b></div>" +
        '<div class="row"><span>Active sessions</span><b>' + (u.sessions ? u.sessions.length : 0) + "</b></div>" +
        (sub ? '<div class="row"><span>Subscription</span><b>' + esc(sub.plan) + " · " + esc(sub.status) + "</b></div>" : "") +
      "</div>" +
      '<div class="block"><h4>Manage</h4>' +
        '<div class="field"><label>Plan</label><select class="input" data-set-plan style="width:150px">' + planOptions(u.plan) + "</select></div>" +
        '<div class="actions">' +
          '<button class="btn" data-reset>Reset today\'s usage</button>' +
          '<button class="btn" data-revoke>Sign out all sessions</button>' +
          (self ? "" :
            '<button class="btn" data-active>' + (u.active ? "Disable account" : "Enable account") + "</button>" +
            '<button class="btn" data-admintoggle>' + (u.admin ? "Remove admin" : "Make admin") + "</button>" +
            '<button class="btn btn-danger" data-delete>Delete account</button>') +
        "</div></div>";

    $("[data-close]", d).onclick = closeDrawer;
    $("[data-set-plan]", d).onchange = function () {
      act(u.id, { plan: this.value }, "Plan updated");
    };
    $("[data-reset]", d).onclick = function () { act(u.id, { resetUsageToday: true }, "Usage reset"); };
    $("[data-revoke]", d).onclick = function () {
      api.admin.revokeSessions(u.id).then(function (r) { toast(r.revoked + " session(s) ended"); openUser(u.id); }, function (e) { toast(errText(e), true); });
    };
    if (!self) {
      $("[data-active]", d).onclick = function () { act(u.id, { active: !u.active }, u.active ? "Account disabled" : "Account enabled"); };
      $("[data-admintoggle]", d).onclick = function () { act(u.id, { admin: !u.admin }, u.admin ? "Admin removed" : "Admin granted"); };
      $("[data-delete]", d).onclick = function () {
        if (!confirm("Delete " + u.username + "? This removes the account and all its data. This cannot be undone.")) return;
        api.admin.remove(u.id).then(function () { toast("Account deleted"); closeDrawer(); loadUsers(); refreshOverview(); }, function (e) { toast(errText(e), true); });
      };
    }
  }

  function act(id, changes, okMsg) {
    api.admin.update(id, changes).then(function (u) { toast(okMsg); renderDrawer(u); loadUsers(); refreshOverview(); }, function (e) { toast(errText(e), true); });
  }

  function refreshOverview() { return api.admin.overview().then(renderOverview, function () {}); }

  // -- boot ----------------------------------------------------------------
  function start() {
    if (api.mode === "offline") { gate("Admin", "The account server isn't reachable from here.", null); return; }
    api.me().then(function (me) {
      if (!me.user.isAdmin) {
        gate("Not authorised", "You're signed in as " + me.user.email + ", which isn't an admin account.", "Back to site", "index.html");
        return;
      }
      state.me = { id: null };
      show($("[data-gate]"), false); show($("[data-panel]"), true);
      show($("[data-who]"), true); $("[data-who-name]").textContent = me.user.name || me.user.email;
      // Find our own id so the drawer can forbid self-destructive actions.
      refreshOverview();
      loadUsers();
      api.admin.users({ query: me.user.email, page: 1 }).then(function (r) {
        var mine = r.users.filter(function (u) { return u.email === me.user.email; })[0];
        if (mine) state.me.id = mine.id;
      });
    }, function (err) {
      if (err.code === "unauthorized" || err.status === 401) {
        gate("Sign in required", "Sign in with your admin account to continue.", "Sign in", "login.html?next=" + encodeURIComponent("admin.html"));
      } else {
        gate("Couldn't load", errText(err), "Retry", "admin.html");
      }
    });
  }

  // events
  var searchTimer;
  document.addEventListener("input", function (e) {
    if (e.target.matches("[data-search]")) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { state.query = e.target.value.trim(); state.page = 1; loadUsers(); }, 220);
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-plan-filter]")) { state.plan = e.target.value; state.page = 1; loadUsers(); }
  });
  document.addEventListener("click", function (e) {
    var row = e.target.closest("[data-rows] tr[data-id]");
    if (row) { openUser(row.getAttribute("data-id")); return; }
    if (e.target.matches("[data-drawer-back]")) closeDrawer();
    if (e.target.matches("[data-prev]") && state.page > 1) { state.page--; loadUsers(); }
    if (e.target.matches("[data-next]") && state.page < state.pages) { state.page++; loadUsers(); }
    if (e.target.matches("[data-signout]")) { api.logout().then(function () { location.href = "login.html"; }); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  start();
})();

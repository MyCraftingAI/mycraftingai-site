/*
 * Admin panel - Community view (The Workshop).
 *
 * Reports queue, posts & comments, members (ban / mute / moderator) and spaces.
 * Loaded after admin.js, which provides the shared helpers (MCA.adminKit) and
 * calls MCA.adminCommunity.load() when the view opens.
 */
(function () {
  "use strict";
  var MCA = window.MCA, esc = MCA.escapeHtml, C = MCA.api.admin.community;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function kit() { return MCA.adminKit; }

  var REASON = { spam: "Spam", harassment: "Harassment", hate: "Hate", sexual: "Sexual", violence: "Violence",
    malware: "Malware", illegal: "Illegal", impersonation: "Impersonation", copyright: "Copyright", other: "Other" };
  var st = { tab: "reports", reports: { status: "open", page: 1 }, content: { kind: "posts", status: "", query: "", page: 1 },
    members: { status: "", query: "", page: 1 } };

  function kpi(k, v, s, warn) {
    return '<div class="ad-card ad-kpi' + (warn ? " warn" : "") + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s) + "</div></div>";
  }
  function mb(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + " MB"; }
  function body() { return $("[data-cm-body]"); }
  function pager(state, more, key) {
    return '<div class="ad-pager"><button class="btn btn-ghost btn-sm" data-cm-page="' + key + ':-1"' + (state.page <= 1 ? " disabled" : "") + '>Previous</button>' +
      "<span>Page " + state.page + '</span><span class="ad-grow"></span><button class="btn btn-ghost btn-sm" data-cm-page="' + key + ':1"' + (more ? "" : " disabled") + ">Next</button></div>";
  }
  function quiet(p) { return p.catch(function (e) { kit().toast((e && e.message) || "Something went wrong.", true); }); }

  function overview() {
    return C.overview().then(function (o) {
      $("[data-cm-kpis]").innerHTML = [
        kpi("Open reports", o.openReports, "waiting for review", o.openReports > 0),
        kpi("Posts", kit().num(o.posts), kit().num(o.postsToday) + " in the last 24 h"),
        kpi("Comments", kit().num(o.comments), kit().num(o.commentsToday) + " in the last 24 h"),
        kpi("Members", kit().num(o.members), kit().num(o.messagesToday) + " private messages in 24 h"),
        kpi("Restricted", kit().num(o.banned + o.muted), o.banned + " banned · " + o.muted + " muted · " + o.moderators + " moderators"),
        kpi("Uploads", kit().num(o.uploads), mb(o.storageBytes) + " stored · virus scan " + (o.scanner ? "on" : "off"), !o.scanner)
      ].join("");
      var badge = $("[data-cm-badge]");
      if (badge) { badge.textContent = o.openReports > 99 ? "99+" : String(o.openReports); badge.hidden = !o.openReports; }
    });
  }

  /* ----------------------------------------------------- Pioneer Access */
  function pioneer() {
    return C.poll().then(function (p) {
      var host = $("[data-cm-pioneer]");
      var on = !!p.pioneer;
      var colors = ["#4f63f5", "#3dd68c", "#f5b74a"];
      var bars = p.options.map(function (o, i) {
        return '<div style="margin-top:12px"><div class="ad-inline" style="justify-content:space-between;gap:12px">' +
          '<span style="font-size:14px">' + esc(o.label) + "</span>" +
          '<b style="font-family:var(--mono);font-size:13px;white-space:nowrap">' + kit().num(o.total) + " &middot; " + o.percent + "%</b></div>" +
          '<div style="height:8px;border-radius:5px;background:rgba(255,255,255,.06);margin-top:6px;overflow:hidden">' +
          '<div style="height:100%;width:' + o.percent + "%;background:" + colors[i % colors.length] + ';border-radius:5px"></div></div>' +
          '<div class="ad-muted" style="font-size:12px;margin-top:4px">' + kit().num(o.paid) + " paying &middot; " + kit().num(o.free) + " free</div></div>";
      }).join("");
      host.innerHTML =
        '<div class="ad-inline" style="justify-content:space-between;align-items:flex-start;gap:16px">' +
        "<div><h3>Pioneer Access</h3><p class=\"ad-sub\" style=\"margin:4px 0 0;max-width:62ch\">" +
        (on ? "The Workshop is <b>closed</b>: members see the closed-phase announcement and the poll, and can't post, comment, upload or message. The team can still post."
          : "The Workshop is <b>open</b> to every member.") +
        " The default comes from <code>COMMUNITY_PIONEER</code> in the server .env; this switch overrides it live.</p></div>" +
        '<div class="ad-row-actions"><span class="ad-tag ' + (on ? "warn" : "good") + '">' + (on ? "Closed" : "Open") + "</span>" +
        '<button class="btn btn-sm ' + (on ? "btn-primary" : "btn-danger") + '" data-cm-pioneer-toggle="' + (on ? "open" : "close") + '">' +
        (on ? "Open The Workshop" : "Close (Pioneer Access)") + "</button></div></div>" +
        '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">' +
        '<div class="ad-inline" style="justify-content:space-between"><b>' + esc(p.question) + "</b>" +
        '<span class="ad-muted" style="font-size:13px">' + kit().num(p.total) + " vote" + (p.total === 1 ? "" : "s") +
        (p.lastVoteAt ? " &middot; last " + esc(kit().since(p.lastVoteAt)) : "") + "</span></div>" + bars + "</div>";
    });
  }

  function togglePioneer(btn) {
    var open = btn.dataset.cmPioneerToggle === "open";
    kit().ask({
      title: open ? "Open The Workshop to everyone?" : "Close The Workshop (Pioneer Access)?",
      text: open ? "Members can post, comment, upload and message again. The poll stays in the results here."
        : "Members will see the closed-phase announcement and the poll instead of the feed, and can't post, comment, upload or message.",
      ok: open ? "Open it" : "Close it", danger: !open
    }).then(function (v) {
      if (!v) return;
      kit().run(btn, C.pioneer(!open), open ? "The Workshop is open." : "The Workshop is closed (Pioneer Access).").then(function () { load(); });
    });
  }

  /* ------------------------------------------------------------ reports */
  function reports() {
    var s = st.reports;
    return C.reports(s.status, s.page).then(function (d) {
      var head = '<div class="ad-inline" style="margin-bottom:12px">' + [["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]].map(function (o) {
        return '<button class="ad-chip' + (s.status === o[0] ? " on" : "") + '" data-cm-rstatus="' + o[0] + '">' + o[1] + "</button>";
      }).join("") + "</div>";
      if (!d.reports.length) return body().innerHTML = head + '<div class="ad-card ad-empty">' + (s.status === "open" ? "No open reports. All clear." : "Nothing here.") + "</div>";
      body().innerHTML = head + '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>Reported</th><th>Reason</th><th>Member</th><th>By</th><th>When</th><th></th></tr></thead><tbody>' +
        d.reports.map(function (r) {
          var t = r.target || {}, preview;
          if (!t.exists) preview = '<span class="ad-muted">(no longer exists)</span>';
          else if (r.targetType === "user") preview = "<b>Member profile</b>";
          else preview = (t.title ? "<b>" + esc(t.title) + "</b><br>" : "") + '<span class="ad-muted">' + esc(t.body || "") + "</span>" +
            (t.url ? '<br><a href="' + esc(t.url) + '" target="_blank" rel="noopener">Open in The Workshop &#8599;</a>' : "");
          var statusTag = t.status && t.status !== "visible" ? ' <span class="ad-tag bad">' + esc(t.status) + "</span>" : "";
          return "<tr><td style=\"max-width:420px\"><span class=\"ad-tag info\">" + esc(r.targetType) + "</span>" + statusTag +
            (r.openReports > 1 ? ' <span class="ad-tag warn">' + r.openReports + " reports</span>" : "") + "<br>" + preview +
            (r.details ? '<br><i class="ad-muted">&ldquo;' + esc(r.details) + "&rdquo;</i>" : "") + "</td>" +
            '<td><span class="ad-tag ' + (r.reason === "malware" || r.reason === "illegal" ? "bad" : "warn") + '">' + esc(REASON[r.reason] || r.reason) + "</span></td>" +
            "<td>" + (r.targetUser ? '<a href="#" data-cm-user="' + esc(r.targetUser.id) + '">' + esc(r.targetUser.username) + "</a>" : "-") + "</td>" +
            "<td>" + esc(r.reporter) + "</td><td title=\"" + esc(kit().when(r.createdAt)) + "\">" + esc(kit().since(r.createdAt)) + "</td>" +
            "<td>" + (r.status === "open"
              ? '<div class="ad-row-actions">' + (r.targetType !== "user" && t.exists && t.status === "visible"
                ? '<button class="btn btn-sm btn-danger" data-cm-report="' + esc(r.id) + '" data-act="remove">Remove</button>' : "") +
                '<button class="btn btn-sm" data-cm-report="' + esc(r.id) + '" data-act="resolve">Resolve</button>' +
                '<button class="btn btn-sm btn-ghost" data-cm-report="' + esc(r.id) + '" data-act="dismiss">Dismiss</button></div>'
              : '<span class="ad-tag ' + (r.status === "resolved" ? "good" : "plan") + '">' + esc(r.status) + "</span>" + (r.resolution ? '<br><span class="ad-muted">' + esc(r.resolution) + "</span>" : "")) +
            "</td></tr>";
        }).join("") + "</tbody></table></div>" + pager(s, d.hasMore, "reports");
    });
  }

  function resolveReport(btn) {
    var id = btn.dataset.cmReport, action = btn.dataset.act;
    var titles = { remove: "Remove the content", resolve: "Resolve the report", dismiss: "Dismiss the report" };
    kit().ask({
      title: titles[action],
      text: action === "remove" ? "Hides it from everyone, closes every report about it and tells the author why."
        : action === "dismiss" ? "Closes every open report about this without taking action." : "Marks the reports as handled.",
      ok: action === "remove" ? "Remove" : "Confirm", danger: action === "remove",
      fields: action === "dismiss" ? [{ name: "note", label: "Note (optional)" }] : [
        { name: "note", label: action === "remove" ? "Reason shown to the author" : "Note (optional)", placeholder: "e.g. Rule 3: no malware" },
        { name: "penalty", label: "Also restrict the member", type: "select", value: "", options: [["", "No"], ["24", "Mute 24 hours"], ["168", "Mute 7 days"], ["720", "Mute 30 days"], ["ban", "Ban from The Workshop"]] }
      ]
    }).then(function (v) {
      if (!v) return;
      var d = { action: action, note: v.note || "" };
      if (v.penalty === "ban") d.ban = true; else if (v.penalty) d.muteHours = Number(v.penalty);
      kit().run(btn, C.resolve(id, d), "Done.").then(function () { overview(); reports(); });
    });
  }

  /* ------------------------------------------------------------ content */
  function content() {
    var s = st.content;
    return C.content(s).then(function (d) {
      var head = '<div class="ad-inline" style="margin-bottom:12px"><div class="ad-seg"><button data-cm-kind="posts" class="' + (s.kind === "posts" ? "on" : "") + '">Posts</button><button data-cm-kind="comments" class="' + (s.kind === "comments" ? "on" : "") + '">Comments</button></div>' +
        [["", "All"], ["visible", "Visible"], ["removed", "Removed"], ["deleted", "Deleted"]].map(function (o) {
          return '<button class="ad-chip' + (s.status === o[0] ? " on" : "") + '" data-cm-cstatus="' + o[0] + '">' + o[1] + "</button>";
        }).join("") + '<form data-cm-csearch style="flex:1;min-width:200px;display:flex"><input class="input" name="q" placeholder="Search text" value="' + esc(s.query) + '"></form></div>';
      if (!d.items.length) return body().innerHTML = head + '<div class="ad-card ad-empty">Nothing found.</div>';
      body().innerHTML = head + '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>' + (s.kind === "posts" ? "Post" : "Comment") + "</th><th>Author</th><th>Score</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>" +
        d.items.map(function (i) {
          var kind = i.kind === "post" ? "posts" : "comments";
          var acts = '<div class="ad-row-actions">' + (i.status === "visible" ? '<button class="btn btn-sm btn-danger" data-cm-mod="' + kind + ":" + esc(i.id) + ':remove">Remove</button>' : "") +
            (i.status === "removed" ? '<button class="btn btn-sm" data-cm-mod="' + kind + ":" + esc(i.id) + ':restore">Restore</button>' : "") +
            (i.kind === "post" && i.status === "visible" ? '<button class="btn btn-sm btn-ghost" data-cm-mod="posts:' + esc(i.id) + ":" + (i.pinned ? "unpin" : "pin") + '">' + (i.pinned ? "Unpin" : "Pin") + "</button>" +
              '<button class="btn btn-sm btn-ghost" data-cm-mod="posts:' + esc(i.id) + ":" + (i.locked ? "unlock" : "lock") + '">' + (i.locked ? "Unlock" : "Lock") + "</button>" : "") + "</div>";
          return '<tr><td style="max-width:440px">' + (i.title ? "<b>" + esc(i.title) + "</b><br>" : "") + '<span class="ad-muted">' + esc(i.body) + "</span>" +
            '<br><a href="' + esc(i.url) + '" target="_blank" rel="noopener">Open &#8599;</a>' + (i.removedReason ? '<br><i class="ad-muted">Removed: ' + esc(i.removedReason) + "</i>" : "") + "</td>" +
            "<td>" + (i.author && i.author.id ? '<a href="#" data-cm-user="' + esc(i.author.id) + '">' + esc(i.author.username) + "</a>" : "[deleted]") + "</td>" +
            "<td>" + i.score + "</td><td>" + '<span class="ad-tag ' + (i.status === "visible" ? "good" : i.status === "removed" ? "bad" : "plan") + '">' + esc(i.status) + "</span>" +
            (i.pinned ? ' <span class="ad-tag warn">pinned</span>' : "") + (i.locked ? ' <span class="ad-tag plan">locked</span>' : "") + "</td>" +
            '<td title="' + esc(kit().when(i.createdAt)) + '">' + esc(kit().since(i.createdAt)) + "</td><td>" + acts + "</td></tr>";
        }).join("") + "</tbody></table></div>" + pager(s, d.hasMore, "content");
    });
  }

  function moderate(btn) {
    var parts = btn.dataset.cmMod.split(":"), kind = parts[0], id = parts[1], action = parts[2];
    var go = function (reason) { kit().run(btn, C.moderate(kind, id, { action: action, reason: reason || "" }), "Done.").then(function () { overview(); content(); }); };
    if (action !== "remove") return go("");
    kit().ask({ title: "Remove " + (kind === "posts" ? "post" : "comment"), text: "The author gets a notification with the reason.", ok: "Remove", danger: true,
      fields: [{ name: "reason", label: "Reason", placeholder: "e.g. Rule 2: not your work" }] }).then(function (v) { if (v) go(v.reason); });
  }

  /* ------------------------------------------------------------ members */
  function members() {
    var s = st.members;
    return C.members(s).then(function (d) {
      var head = '<div class="ad-inline" style="margin-bottom:12px">' + [["", "Everyone"], ["reported", "Reported"], ["muted", "Muted"], ["banned", "Banned"], ["moderators", "Moderators"]].map(function (o) {
        return '<button class="ad-chip' + (s.status === o[0] ? " on" : "") + '" data-cm-mstatus="' + o[0] + '">' + o[1] + "</button>";
      }).join("") + '<form data-cm-msearch style="flex:1;min-width:200px;display:flex"><input class="input" name="q" placeholder="Username or email" value="' + esc(s.query) + '"></form></div>';
      if (!d.members.length) return body().innerHTML = head + '<div class="ad-card ad-empty">No members found. Members appear here after their first visit to The Workshop.</div>';
      body().innerHTML = head + '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>Member</th><th>Plan</th><th>Karma</th><th>Posts</th><th>Open reports</th><th>Status</th><th></th></tr></thead><tbody>' +
        d.members.map(function (m) {
          var r = m.restriction, status = r ? (r.type === "banned" ? '<span class="ad-tag bad">banned</span>' : '<span class="ad-tag warn">muted until ' + esc(kit().when(r.until)) + "</span>") : '<span class="ad-tag good">active</span>';
          if (r && r.reason) status += '<br><span class="ad-muted">' + esc(r.reason) + "</span>";
          return '<tr><td><a href="#" data-cm-user="' + esc(m.id) + '"><b>' + esc(m.username) + "</b></a>" + (m.role === "team" ? ' <span class="ad-tag warn">team</span>' : m.moderator ? ' <span class="ad-tag good">mod</span>' : "") +
            '<br><span class="ad-muted">' + esc(m.email) + "</span></td><td><span class=\"ad-tag " + (m.plan === "free" ? "plan" : "paid") + '">' + esc(m.planName) + "</span></td>" +
            "<td>" + m.karma + "</td><td>" + m.posts + "</td><td>" + (m.openReports ? '<span class="ad-tag warn">' + m.openReports + "</span>" : "0") + "</td><td>" + status + "</td>" +
            '<td><div class="ad-row-actions">' +
            (r && r.type === "banned" ? '<button class="btn btn-sm" data-cm-member="' + esc(m.id) + ':unban">Unban</button>' : '<button class="btn btn-sm btn-danger" data-cm-member="' + esc(m.id) + ':ban">Ban</button>') +
            (r && r.type === "muted" ? '<button class="btn btn-sm" data-cm-member="' + esc(m.id) + ':unmute">Unmute</button>' : '<button class="btn btn-sm btn-ghost" data-cm-member="' + esc(m.id) + ':mute">Mute</button>') +
            (m.role !== "team" ? '<button class="btn btn-sm btn-ghost" data-cm-member="' + esc(m.id) + ":" + (m.moderator ? "remove_moderator" : "make_moderator") + '">' + (m.moderator ? "Remove mod" : "Make mod") + "</button>" : "") +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>" + pager(s, d.hasMore, "members");
    });
  }

  function memberAction(btn) {
    var parts = btn.dataset.cmMember.split(":"), id = parts[0], action = parts[1];
    var go = function (d) { kit().run(btn, C.member(id, d), "Saved.").then(function () { overview(); members(); }); };
    if (action === "ban") {
      return kit().ask({ title: "Ban from The Workshop", text: "They can still read and use the app, but can't post, comment, vote, upload or message.", ok: "Ban", danger: true,
        fields: [{ name: "reason", label: "Reason shown to the member", placeholder: "e.g. Uploaded malware" }] }).then(function (v) { if (v) go({ action: "ban", reason: v.reason }); });
    }
    if (action === "mute") {
      return kit().ask({ title: "Mute member", ok: "Mute",
        fields: [{ name: "hours", label: "For", type: "select", value: "24", options: [["1", "1 hour"], ["24", "24 hours"], ["72", "3 days"], ["168", "7 days"], ["720", "30 days"]] },
          { name: "reason", label: "Reason shown to the member", placeholder: "e.g. Spamming comments" }] }).then(function (v) {
        if (v) go({ action: "mute", hours: Number(v.hours), reason: v.reason });
      });
    }
    go({ action: action });
  }

  /* ------------------------------------------------------------- spaces */
  var ICONS = [["chat", "Chat"], ["star", "Star"], ["package", "Package"], ["lifebuoy", "Help"], ["palette", "Palette"], ["book", "Book"], ["bulb", "Idea"], ["megaphone", "Megaphone"]];
  function spaces() {
    return C.spaces().then(function (d) {
      body().innerHTML = '<div class="ad-inline" style="margin-bottom:12px"><button class="btn btn-primary btn-sm" data-cm-space="">New space</button></div>' +
        '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>Space</th><th>Address</th><th>Posts</th><th>Order</th><th>Status</th><th></th></tr></thead><tbody>' +
        d.spaces.map(function (s) {
          return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + esc(s.color) + ';margin-right:8px"></span><b>' + esc(s.name) + '</b><br><span class="ad-muted">' + esc(s.description) + "</span></td>" +
            "<td><code>" + esc(s.slug) + "</code></td><td>" + s.posts + "</td><td>" + s.position + "</td><td>" +
            (s.archived ? '<span class="ad-tag plan">archived</span>' : '<span class="ad-tag good">open</span>') + (s.locked ? ' <span class="ad-tag warn">team only</span>' : "") + "</td>" +
            '<td><button class="btn btn-sm" data-cm-space="' + esc(s.id) + '">Edit</button></td></tr>';
        }).join("") + "</tbody></table></div>";
      st.spaceList = d.spaces;
    });
  }

  function editSpace(btn) {
    var s = (st.spaceList || []).filter(function (x) { return x.id === btn.dataset.cmSpace; })[0] || { name: "", description: "", color: "#4F63F5", icon: "chat", position: 0 };
    kit().ask({ title: s.id ? "Edit " + s.name : "New space", ok: "Save", fields: [
      { name: "name", label: "Name", value: s.name },
      { name: "description", label: "Description", type: "textarea", value: s.description },
      { name: "color", label: "Colour (#RRGGBB)", value: s.color },
      { name: "icon", label: "Icon", type: "select", value: s.icon, options: ICONS },
      { name: "position", label: "Order (lower shows first)", type: "number", value: s.position },
      { name: "locked", label: "Only the team can start posts", type: "checkbox", value: s.locked },
      { name: "archived", label: "Archived (hidden, no new posts)", type: "checkbox", value: s.archived }
    ] }).then(function (v) {
      if (!v) return;
      v.position = Number(v.position) || 0;
      kit().run(btn, C.saveSpace(s.id, v), "Space saved.").then(spaces);
    });
  }

  /* ------------------------------------------------------------- wiring */
  function load(isQuiet) {
    var tabs = { reports: reports, content: content, members: members, spaces: spaces };
    $$("[data-cm-tab]").forEach(function (b) { b.classList.toggle("on", b.dataset.cmTab === st.tab); });
    var work = Promise.all([pioneer(), overview(), tabs[st.tab]()]);
    return isQuiet ? work.catch(function () {}) : quiet(work);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest || !t.closest('[data-view="community"]')) return;
    var b;
    if ((b = t.closest("[data-cm-tab]"))) { st.tab = b.dataset.cmTab; body().innerHTML = '<div class="ad-skel"></div>'; return load(); }
    if ((b = t.closest("[data-cm-rstatus]"))) { st.reports.status = b.dataset.cmRstatus; st.reports.page = 1; return quiet(reports()); }
    if ((b = t.closest("[data-cm-cstatus]"))) { st.content.status = b.dataset.cmCstatus; st.content.page = 1; return quiet(content()); }
    if ((b = t.closest("[data-cm-kind]"))) { st.content.kind = b.dataset.cmKind; st.content.page = 1; return quiet(content()); }
    if ((b = t.closest("[data-cm-mstatus]"))) { st.members.status = b.dataset.cmMstatus; st.members.page = 1; return quiet(members()); }
    if ((b = t.closest("[data-cm-page]"))) {
      var p = b.dataset.cmPage.split(":"); st[p[0]].page = Math.max(1, st[p[0]].page + Number(p[1]));
      return quiet({ reports: reports, content: content, members: members }[p[0]]());
    }
    if ((b = t.closest("[data-cm-pioneer-toggle]"))) return togglePioneer(b);
    if ((b = t.closest("[data-cm-report]"))) return resolveReport(b);
    if ((b = t.closest("[data-cm-mod]"))) return moderate(b);
    if ((b = t.closest("[data-cm-member]"))) return memberAction(b);
    if ((b = t.closest("[data-cm-space]"))) return editSpace(b);
    if ((b = t.closest("[data-cm-user]"))) { e.preventDefault(); return kit().openUser(b.dataset.cmUser); }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.matches("[data-cm-csearch]")) { e.preventDefault(); st.content.query = f.q.value.trim(); st.content.page = 1; quiet(content()); }
    if (f.matches("[data-cm-msearch]")) { e.preventDefault(); st.members.query = f.q.value.trim(); st.members.page = 1; quiet(members()); }
  });

  MCA.adminCommunity = { load: load };
})();

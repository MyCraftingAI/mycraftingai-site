/*
 * The Workshop - MyCraftingAI community hub (community.html).
 *
 * One page, hash routes:
 *   #/                 home feed          #/s/<space>        a space
 *   #/p/<id>           a post             #/new[/<space>]    write a post
 *   #/edit/<id>        edit a post        #/u/<username>     a member
 *   #/messages[/<id>]  private messages   #/notifications    notifications
 *   #/saved            saved posts        #/search/<words>   search
 *   #/settings         community profile, blocks, emails
 *
 * Safety: members write Markdown; it is escaped first and only a small set of
 * formatting is turned into HTML (links get rel="nofollow ugc noopener",
 * images only from our own media URLs). Uploads are sent as raw bytes and the
 * server decides their type. The server contract is in docs/SERVER_API.md.
 */
(function () {
  "use strict";

  var cfg = window.MCA_CONFIG || {};
  var MCA = window.MCA || {};
  var api = MCA.api;
  var base = String(cfg.apiBase || "").replace(/\/+$/, "");
  var MEDIA = base + "/v1/community/media/";
  var esc = MCA.escapeHtml || function (t) { return String(t); };

  var view, nav;
  var state = {
    session: null,       // /v1/me
    me: null,            // /v1/community/me
    spaces: [],
    feed: { posts: [], page: 1, hasMore: false, key: "" },
    sort: "hot", period: "week",
    unread: { notifications: 0, messages: 0 },
    timers: [],
    ready: null
  };

  /* --------------------------------------------------------------- icons */
  function svg(path, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + path + "</svg>";
  }
  var I = {
    up: svg('<path d="M12 5l7 8h-4.5v6h-5v-6H5z"/>'),
    down: svg('<path d="M12 19l-7-8h4.5V5h5v6H19z"/>'),
    comment: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    save: svg('<path d="M6 4h12v16l-6-4-6 4z"/>'),
    bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5h4"/>'),
    share: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M17 14v5H5V7h5"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    flag: svg('<path d="M5 21V4h11l-2 4 2 4H5"/>'),
    home: svg('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'),
    fire: svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),
    mail: svg('<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>'),
    star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    clip: svg('<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>'),
    send: svg('<path d="M4 12l16-8-6 16-2-6z"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
    at: svg('<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>'),
    shield: svg('<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/>'),
    megaphone: svg('<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M18 9a4 4 0 0 1 0 6"/>'),
    "package": svg('<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
    lifebuoy: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3"/>'),
    palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.4-1-2.4 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4.2-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>'),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/><path d="M12 14.5v2.5"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.2.2 3.8 1.6 4.4 4"/>'),
    server: svg('<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
  };

  /* ----------------------------------------------------------- helpers */
  function el(id) { return document.querySelector(id); }
  function ago(iso) {
    if (!iso) return "";
    var t = new Date(iso).getTime(), s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fullDate(iso) {
    try { return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return iso || ""; }
  }
  function size(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : "file"; }
  function hue(name) { var h = 0; for (var i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
  function signedIn() { return !!state.session; }
  function canPost() { return !!(state.me && state.me.canPost); }

  function avatar(a, cls) {
    var name = (a && a.username) || "?";
    var inner = a && a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="" loading="lazy">' : esc(name.charAt(0).toUpperCase());
    var style = a && a.avatarUrl ? "" : ' style="background:hsl(' + hue(name) + ',55%,42%)"';
    return '<span class="cm-avatar ' + (cls || "") + '"' + style + ">" + inner + "</span>";
  }
  function badges(a) {
    if (!a) return "";
    var out = "";
    if (a.role === "team") out += '<span class="cm-badge team" title="MyCraftingAI team">Team</span>';
    else if (a.role === "moderator") out += '<span class="cm-badge mod" title="Community moderator">Mod</span>';
    if (a.plan && a.plan !== "free") out += '<span class="cm-badge plan-' + esc(a.plan) + '" title="' + esc(a.planName) + ' plan">' + esc(a.planName) + "</span>";
    return out;
  }
  function who(a, big) {
    if (!a || !a.id) return '<span class="cm-who">' + avatar(null) + "[deleted]</span>";
    return '<a class="cm-who" href="#/u/' + encodeURIComponent(a.username) + '">' + avatar(a, big ? "md" : "") + esc(a.username) + "</a>" + badges(a);
  }
  function spaceChip(s) {
    if (!s) return "";
    return '<a class="cm-space-chip" style="--c:' + esc(s.color) + '" href="#/s/' + encodeURIComponent(s.slug) + '"><i></i>' + esc(s.name) + "</a>";
  }

  var toastTimer;
  function toast(text, error) {
    var t = el("[data-toast]");
    if (!t) return;
    t.textContent = text;
    t.className = "cm-toast show" + (error ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "cm-toast" + (error ? " error" : ""); }, 3600);
  }
  function oops(err) {
    if (err && err.status === 401) return askSignIn();
    toast((err && err.message) || "Something went wrong. Please try again.", true);
  }
  function askSignIn() {
    var next = "community.html" + location.hash;
    MCA.modal("Join The Workshop", "Sign in or create a free MyCraftingAI account to post, comment, vote and message other modders.", [
      { label: "Not now" },
      { label: "Create account", href: "signup.html?next=" + encodeURIComponent(next) },
      { label: "Sign in", primary: true, href: "login.html?next=" + encodeURIComponent(next) }
    ]);
  }
  function needMember() {
    if (!signedIn()) { askSignIn(); return false; }
    if (!canPost()) {
      var r = state.me && state.me.restriction;
      toast(r ? (r.type === "banned" ? "Your account can't post in The Workshop." : "You can't post until " + fullDate(r.until) + ".")
        : "Please accept the updated Terms of Service to take part.", true);
      return false;
    }
    return true;
  }

  /* --------------------------------------------------------------- HTTP */
  function req(method, path, body) {
    if (api.mode !== "live") return Promise.reject({ code: "not_live", message: "The Workshop needs the live account server.", status: 503 });
    var options = { method: method, credentials: "include", headers: { "Accept": "application/json" } };
    if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    return fetch(base + "/v1/community" + path, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok) return data;
        var e = (data && data.error) || {};
        throw { code: e.code || "error", message: e.message || "Something went wrong. Please try again.", status: r.status, data: e };
      });
    }, function () {
      throw { code: "network", message: "Can't reach MyCraftingAI right now. Check your connection.", status: 0 };
    });
  }

  /** Raw upload with progress: resolves to the server's upload record. */
  function upload(file, purpose, progress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open("POST", base + "/v1/community/uploads?filename=" + encodeURIComponent(file.name) + "&purpose=" + (purpose || "post"));
      x.withCredentials = true;
      x.setRequestHeader("Content-Type", "application/octet-stream");
      x.upload.onprogress = function (e) { if (e.lengthComputable && progress) progress(e.loaded / e.total); };
      x.onload = function () {
        var data = {};
        try { data = JSON.parse(x.responseText || "{}"); } catch (e) { /* ignore */ }
        if (x.status >= 200 && x.status < 300) resolve(data);
        else reject({ status: x.status, code: (data.error || {}).code, message: (data.error || {}).message || ("Upload failed (" + x.status + ").") });
      };
      x.onerror = function () { reject({ status: 0, message: "Upload failed - check your connection." }); };
      x.send(file);
    });
  }

  /* ----------------------------------------------------------- markdown */
  function isMedia(url) { return url.indexOf(MEDIA) === 0 && /^[0-9a-f-]{36}$/i.test(url.slice(MEDIA.length).split("?")[0]); }

  function inline(raw) {
    var keep = [];
    function stash(html) { keep.push(html); return "\u0001" + (keep.length - 1) + "\u0001"; }
    var s = esc(raw);
    s = s.replace(/`([^`\n]+)`/g, function (_, c) { return stash("<code>" + c + "</code>"); });
    s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, function (all, alt, url) {
      var real = url.replace(/&amp;/g, "&");
      if (isMedia(real)) return stash('<img src="' + url + '" alt="' + alt + '" loading="lazy">');
      return /^https?:\/\//i.test(real) ? stash('<a href="' + url + '" target="_blank" rel="nofollow ugc noopener noreferrer">' + (alt || url) + "</a>") : all;
    });
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (all, text, url) {
      var real = url.replace(/&amp;/g, "&");
      if (!/^https?:\/\//i.test(real)) return all;
      return stash('<a href="' + url + '" target="_blank" rel="nofollow ugc noopener noreferrer">' + text + "</a>");
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0001]+[^\s<\u0001.,;:!?)'"])/g, function (_, pre, url) {
      return pre + stash('<a href="' + url + '" target="_blank" rel="nofollow ugc noopener noreferrer">' + url + "</a>");
    });
    s = s.replace(/(^|[^\w@\/&;])@([A-Za-z0-9_.-]{3,32})/g, function (_, pre, name) {
      var clean = name.replace(/\.+$/, ""), rest = name.slice(clean.length);
      return pre + stash('<a class="mention" href="#/u/' + encodeURIComponent(clean) + '">@' + clean + "</a>") + rest;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return keep[+i]; });
  }

  function md(src) {
    var blocks = [];
    var text = String(src || "").replace(/\r\n?/g, "\n").replace(/[\u0000\u0001]/g, "");
    text = text.replace(/```[^\n`]*\n?([\s\S]*?)```/g, function (_, code) {
      blocks.push("<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>");
      return "\n\u0000" + (blocks.length - 1) + "\u0000\n";
    });
    var lines = text.split("\n"), out = [], para = [], i = 0;
    function flush() { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } }
    while (i < lines.length) {
      var line = lines[i], m;
      if ((m = /^\u0000(\d+)\u0000$/.exec(line))) { flush(); out.push(blocks[+m[1]]); i++; continue; }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flush(); var lv = Math.min(4, m[1].length + 1); out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); i++; continue; }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
      if (/^>\s?/.test(line)) {
        flush(); var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(inline(lines[i].replace(/^>\s?/, ""))); i++; }
        out.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue;
      }
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
        flush(); var ordered = /^\s*\d/.test(line), items = [];
        var re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        while (i < lines.length && re.test(lines[i])) { items.push("<li>" + inline(lines[i].replace(re, "")) + "</li>"); i++; }
        out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>")); continue;
      }
      para.push(line); i++;
    }
    flush();
    return '<div class="md">' + out.join("") + "</div>";
  }

  /* ----------------------------------------------------------- dialogs */
  function dialog(title, bodyHtml, actions) {
    var host = document.createElement("div");
    host.className = "modal open cm-dialog";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.innerHTML = '<div class="modal-card"><h3></h3><div class="cm-dialog-body"></div><div class="notice" role="status" style="margin-top:12px"></div><div class="actions"></div></div>';
    host.querySelector("h3").textContent = title;
    host.querySelector(".cm-dialog-body").innerHTML = bodyHtml;
    var row = host.querySelector(".actions");
    function close() { host.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    host.addEventListener("click", function (e) { if (e.target === host) close(); });
    actions.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (a.primary ? " btn-primary" : a.danger ? " btn-danger-solid" : " btn-ghost");
      b.textContent = a.label;
      b.addEventListener("click", function () {
        if (!a.onClick) return close();
        var note = host.querySelector(".notice");
        b.disabled = true;
        Promise.resolve(a.onClick(host)).then(function (keep) { if (keep !== true) close(); }, function (err) {
          b.disabled = false;
          note.className = "notice error show";
          note.textContent = (err && err.message) || "Something went wrong.";
        });
      });
      row.appendChild(b);
    });
    document.body.appendChild(host);
    var first = host.querySelector("select, textarea, input, .btn-primary");
    if (first) first.focus();
    return host;
  }

  function confirmBox(title, text, label, run) {
    dialog(title, '<p style="color:var(--muted);margin-top:10px">' + esc(text) + "</p>", [
      { label: "Cancel" }, { label: label, danger: true, onClick: run }
    ]);
  }

  var REASONS = [["spam", "Spam or advertising"], ["harassment", "Harassment or bullying"], ["hate", "Hate speech"],
    ["sexual", "Sexual content"], ["violence", "Violence or threats"], ["malware", "Malware or a harmful download"],
    ["illegal", "Illegal content"], ["impersonation", "Impersonation"], ["copyright", "Stolen work / copyright"], ["other", "Something else"]];

  function report(type, id, label) {
    if (!signedIn()) return askSignIn();
    dialog("Report " + label, '<p style="color:var(--muted);margin-top:10px">Reports go to the moderators. The person you report isn\'t told who reported them.</p>' +
      '<select class="input" data-reason>' + REASONS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("") + "</select>" +
      '<textarea class="input" data-details maxlength="1000" placeholder="Anything that helps the moderators (optional)"></textarea>', [
      { label: "Cancel" },
      { label: "Send report", primary: true, onClick: function (host) {
        return req("POST", "/reports", { targetType: type, targetId: id, reason: host.querySelector("[data-reason]").value,
          details: host.querySelector("[data-details]").value }).then(function (r) {
          toast(r.status === "already_reported" ? "You already reported this. Thanks!" : "Thanks - the moderators will take a look.");
        });
      } }
    ]);
  }

  function menu(anchor, items) {
    closeMenus();
    var box = document.createElement("div");
    box.className = "cm-menu";
    items.forEach(function (it) {
      if (it === "-") { box.appendChild(document.createElement("hr")); return; }
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = it.label;
      if (it.danger) b.className = "danger";
      b.addEventListener("click", function () { closeMenus(); it.run(); });
      box.appendChild(b);
    });
    document.body.appendChild(box);
    var r = anchor.getBoundingClientRect();
    var left = Math.min(window.scrollX + r.right - box.offsetWidth, window.scrollX + document.documentElement.clientWidth - box.offsetWidth - 8);
    box.style.left = Math.max(8, left) + "px";
    box.style.top = (window.scrollY + r.bottom + 6) + "px";
    setTimeout(function () { document.addEventListener("click", closeMenus, { once: true }); }, 0);
  }
  function closeMenus() { document.querySelectorAll(".cm-menu").forEach(function (m) { m.remove(); }); }

  function lightbox(src) {
    var box = el("[data-lightbox]");
    box.querySelector("img").src = src;
    box.classList.add("open");
  }

  /* --------------------------------------------------------------- nav */
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/").map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { name: parts[0] || "home", arg: parts[1] || "", rest: parts.slice(1).join("/") };
  }

  function renderNav() {
    if (closed()) { nav.innerHTML = ""; return; }
    var r = route();
    function item(href, icon, label, active, count) {
      return '<a href="' + href + '" class="' + (active ? "active" : "") + '"><span class="sw">' + icon + "</span>" + esc(label) +
        (count !== undefined ? '<span class="count">' + (count > 0 ? (count > 99 ? "99+" : count) : "") + "</span>" : "") + "</a>";
    }
    var html = item("#/", I.home, "Home", r.name === "home");
    if (signedIn()) {
      html += item("#/messages", I.mail, "Messages", r.name === "messages", state.unread.messages);
      html += item("#/notifications", I.bell, "Notifications", r.name === "notifications", state.unread.notifications);
      html += item("#/saved", I.save, "Saved", r.name === "saved");
    }
    html += "<h4>Spaces</h4>";
    state.spaces.forEach(function (s) {
      var icon = '<span style="color:' + esc(s.color) + ';display:grid">' + (I[s.icon] || I.chat) + "</span>";
      html += item("#/s/" + encodeURIComponent(s.slug), icon, s.name, r.name === "s" && r.arg === s.slug);
    });
    if (signedIn()) { html += "<h4>You</h4>" + item("#/settings", I.gear, "Profile & settings", r.name === "settings"); }
    nav.innerHTML = html;
    document.querySelectorAll(".cm-header-bell i").forEach(function (b) {
      var n = state.unread.notifications + state.unread.messages;
      b.textContent = n > 99 ? "99+" : n; b.hidden = !n;
    });
  }

  function aside(space) {
    var join = el("[data-join-card]"), card = el("[data-space-card]"), mine = el("[data-me-card]");
    if (join) join.hidden = signedIn() || api.mode !== "live";
    if (mine) {
      mine.hidden = !(signedIn() && state.me) || closed();
      if (!mine.hidden) {
        var m = state.me;
        mine.innerHTML = '<div class="cm-me">' + avatar(m, "md") + '<div><b>' + esc(m.username) + "</b> " + badges(m) +
          "<small>" + (m.karma || 0) + " karma</small></div></div>" +
          '<div class="cm-me-links">' +
          '<a href="#/messages">' + I.mail + "Messages" + (state.unread.messages ? "<em>" + state.unread.messages + "</em>" : "") + "</a>" +
          '<a href="#/notifications">' + I.bell + "Notifications" + (state.unread.notifications ? "<em>" + state.unread.notifications + "</em>" : "") + "</a>" +
          '<a href="#/u/' + encodeURIComponent(m.username) + '">' + I.star + "My profile</a>" +
          '<a href="#/settings">' + I.gear + "Profile &amp; settings</a></div>";
      }
    }
    if (!card) return;
    if (!space) { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = '<span class="cm-space-chip" style="--c:' + esc(space.color) + '"><i></i>' + esc(space.name) + "</span>" +
      "<p>" + esc(space.description) + "</p>" + '<p class="dim fine">' + (space.posts || 0) + " post" + (space.posts === 1 ? "" : "s") + "</p>" +
      (space.locked ? '<p class="dim fine">Only the MyCraftingAI team posts here. Everyone can comment.</p>'
        : '<a class="btn btn-primary btn-block" href="#/new/' + encodeURIComponent(space.slug) + '">New post in ' + esc(space.name) + "</a>");
  }

  function clearTimers() { state.timers.forEach(clearInterval); state.timers = []; }

  /* ------------------------------------------------- Pioneer Access (closed) */
  function closed() { return !!(state.status && state.status.pioneer && !state.status.bypass); }

  function showPioneer() {
    var s = state.status, poll = s.poll || {}, mine = poll.myVote;
    document.body.classList.add("cm-closed");
    var options = (poll.options || []).map(function (o, i) {
      return '<label class="cm-poll-opt' + (mine === o.id ? " on" : "") + '">' +
        '<input type="radio" name="cm-poll" value="' + esc(o.id) + '"' + (mine === o.id ? " checked" : "") + (signedIn() ? "" : " disabled") + ">" +
        '<span class="n">' + (i + 1) + "</span><span class=\"t\">" + esc(o.label) + "</span>" +
        '<span class="tick">' + I.check + "</span></label>";
    }).join("");
    var next = encodeURIComponent("community.html");
    var action = signedIn()
      ? '<button class="btn btn-primary" type="submit" data-poll-submit' + (mine ? "" : " disabled") + ">" + (mine ? "Update my vote" : "Submit vote") + "</button>" +
        '<span class="cm-poll-state" data-poll-state>' + (mine ? I.check + "Your vote is saved. You can change it any time." : "One vote per member - you can change it later.") + "</span>"
      : '<a class="btn btn-primary" href="login.html?next=' + next + '">Sign in to vote</a>' +
        '<a class="btn btn-ghost" href="signup.html?next=' + next + '">Create a free account</a>';
    view.innerHTML =
      '<section class="cm-pioneer">' +
      '<div class="cm-pioneer-card">' +
      '<span class="cm-pioneer-badge"><i></i>Pioneer Access &middot; closed phase</span>' +
      '<div class="cm-pioneer-icon">' + I.lock + "</div>" +
      "<h1>The Workshop</h1>" +
      '<p class="cm-pioneer-msg">' + esc(s.message) + "</p>" +
      '<div class="cm-pioneer-goals">' +
      '<div><span class="ic">' + I.users + "</span><b>First 1,000 subscribers</b><small>The community opens to everyone at this milestone.</small></div>" +
      '<div><span class="ic">' + I.server + "</span><b>Dedicated infrastructure</b><small>Fast, safe file hosting and moderation for every mod you share.</small></div>" +
      "</div></div>" +
      '<form class="cm-poll" data-poll>' +
      '<span class="cm-label" style="margin:0">Help us shape the launch</span>' +
      (signedIn()
        ? "<h2>" + esc(poll.question || "") + "</h2>" + '<div class="cm-poll-opts">' + options + "</div>"
        : "<h2>Have your say on how The Workshop opens</h2>" +
          '<p class="cm-poll-note">Members can vote in a one-question poll. Sign in with your MyCraftingAI account to take part.</p>') +
      '<div class="cm-poll-actions">' + action + "</div>" +
      "</form></section>";
    var form = view.querySelector("[data-poll]");
    form.addEventListener("change", function () {
      form.querySelectorAll(".cm-poll-opt").forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); });
      var btn = form.querySelector("[data-poll-submit]");
      if (btn) btn.disabled = false;
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var picked = form.querySelector("input[name=cm-poll]:checked");
      var btn = form.querySelector("[data-poll-submit]");
      if (!picked || !btn) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving';
      req("POST", "/poll", { option: picked.value }).then(function (fresh) {
        state.status = fresh;
        showPioneer();
        toast("Thanks - your vote is saved.");
      }, function (err) {
        btn.disabled = false;
        btn.textContent = mine ? "Update my vote" : "Submit vote";
        oops(err);
      });
    });
  }

  function pioneerBanner() {
    if (!(state.status && state.status.pioneer && state.status.bypass)) return "";
    return '<div class="cm-banner">' + I.lock + '<div><b>Pioneer Access is on.</b> Members see the closed-phase announcement and the poll; ' +
      'only the team can post. Open it to everyone in <a href="admin.html#community">Admin &rsaquo; Community</a>.</div></div>';
  }

  function banner() {
    var pioneer = pioneerBanner();
    var r = state.me && state.me.restriction;
    if (!r) return pioneer;
    if (r.type === "banned") return '<div class="cm-banner error">' + I.shield + '<div>Your account can read The Workshop but can\'t post, comment, vote or send messages.' + (r.reason ? " Reason: " + esc(r.reason) : "") + ' Questions? <a href="contact.html#support">Contact support</a>.</div></div>';
    return '<div class="cm-banner">' + I.shield + "<div>You can't post until " + esc(fullDate(r.until)) + "." + (r.reason ? " Reason: " + esc(r.reason) : "") + "</div></div>";
  }

  function render() {
    clearTimers();
    closeMenus();
    var r = route();
    renderNav();
    aside(null);
    if (api.mode !== "live") {
      view.innerHTML = '<div class="cm-empty"><b>The Workshop opens with the live server</b>The community needs the MyCraftingAI account server. It isn\'t available in preview mode.</div>';
      return;
    }
    if (closed()) return showPioneer();
    switch (r.name) {
      case "p": return showPost(r.arg);
      case "new": return showComposer(null, r.arg);
      case "edit": return showEdit(r.arg);
      case "u": return showProfile(r.arg);
      case "messages": return showMessages(r.arg);
      case "notifications": return showNotifications();
      case "settings": return showSettings();
      case "saved": return showFeed({ saved: true });
      case "search": return showFeed({ q: r.rest });
      case "s": return showFeed({ space: r.arg });
      default: return showFeed({});
    }
  }

  /* --------------------------------------------------------------- feed */
  function postCard(p) {
    var thumbs = (p.images || []).slice(0, 3).map(function (im) {
      return '<img src="' + esc(im.url) + '" alt="" loading="lazy">';
    }).join("");
    var tags = (p.pinned ? '<span class="cm-tag pin">PINNED</span>' : "") + (p.locked ? '<span class="cm-tag lock">LOCKED</span>' : "");
    var files = (p.files || []).length ? '<span class="sep">&middot;</span><span>' + I.download.replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px"') + " " + p.files.length + " file" + (p.files.length === 1 ? "" : "s") + "</span>" : "";
    return '<article class="cm-post' + (p.pinned ? " pinned" : "") + '" data-post="' + esc(p.id) + '">' +
      voteBox("post", p) +
      '<div class="cm-post-body" data-open="' + esc(p.id) + '">' +
      '<div class="cm-meta">' + spaceChip(p.space) + tags + '<span class="sep">&middot;</span>' + who(p.author) +
      '<span class="sep">&middot;</span><time title="' + esc(fullDate(p.createdAt)) + '">' + ago(p.createdAt) + "</time>" + files + "</div>" +
      "<h3>" + esc(p.title) + "</h3>" +
      (p.excerpt ? '<div class="cm-excerpt">' + esc(p.excerpt) + "</div>" : "") +
      (thumbs ? '<div class="cm-thumbs">' + thumbs + "</div>" : "") +
      '<div class="cm-foot">' +
      '<a class="cm-act" href="#/p/' + esc(p.id) + '">' + I.comment + " " + p.commentCount + " comment" + (p.commentCount === 1 ? "" : "s") + "</a>" +
      '<button class="cm-act' + (p.saved ? " on" : "") + '" data-act="save" data-id="' + esc(p.id) + '">' + I.save + (p.saved ? " Saved" : " Save") + "</button>" +
      '<button class="cm-act" data-act="share" data-id="' + esc(p.id) + '">' + I.share + " Share</button>" +
      "</div></div></article>";
  }

  function voteBox(type, item, row) {
    var mine = item.myVote || 0;
    return '<div class="cm-vote' + (row ? " row" : "") + '" data-vote="' + type + '" data-id="' + esc(item.id) + '">' +
      '<button class="up' + (mine === 1 ? " on" : "") + '" data-act="vote" data-v="1" aria-label="Upvote">' + I.up + "</button>" +
      "<b>" + (item.score || 0) + "</b>" +
      '<button class="down' + (mine === -1 ? " on" : "") + '" data-act="vote" data-v="-1" aria-label="Downvote">' + I.down + "</button></div>";
  }

  /** Home: a welcome hero and the spaces to explore. */
  function hero(newButton) {
    var posts = state.spaces.reduce(function (n, s) { return n + (s.posts || 0); }, 0);
    var who = state.me && state.me.username ? "Welcome back, " + esc(state.me.username) : "The Workshop";
    return '<section class="cm-hero">' +
      '<div class="cm-hero-text"><span class="eyebrow">MyCraftingAI community</span>' +
      "<h1>" + who + "</h1>" +
      "<p>Share the mods, textures and models you make with MyCraftingAI, get unstuck on build errors, and learn from other modders.</p>" +
      '<div class="cm-hero-actions">' + newButton +
      '<a class="btn" href="#/s/help">' + I.lifebuoy.replace("<svg", '<svg style="width:18px;height:18px"') + "Ask for help</a></div></div>" +
      '<div class="cm-hero-stats"><div><b>' + posts + "</b><span>posts</span></div><div><b>" + state.spaces.length +
      "</b><span>spaces</span></div><div><b>" + ((state.me && state.me.karma) || 0) + "</b><span>your karma</span></div></div>" +
      "</section>" +
      '<div class="cm-label">Explore spaces</div><div class="cm-spaces">' +
      state.spaces.map(function (s) {
        return '<a class="cm-space-tile" href="#/s/' + encodeURIComponent(s.slug) + '" style="--c:' + esc(s.color) + '">' +
          '<span class="ic">' + (I[s.icon] || I.chat) + "</span><b>" + esc(s.name) + "</b><small>" + esc(s.description) + "</small>" +
          '<em>' + (s.posts || 0) + " post" + (s.posts === 1 ? "" : "s") + (s.locked ? " &middot; team only" : "") + "</em></a>";
      }).join("") + "</div>";
  }

  function spaceHead(space, newButton) {
    return '<section class="cm-space-head" style="--c:' + esc(space.color) + '">' +
      '<span class="ic">' + (I[space.icon] || I.chat) + "</span>" +
      '<div class="grow"><h1>' + esc(space.name) + "</h1><p>" + esc(space.description) + "</p>" +
      '<small>' + (space.posts || 0) + " post" + (space.posts === 1 ? "" : "s") +
      (space.locked ? " &middot; only the MyCraftingAI team starts posts here" : "") + "</small></div>" + newButton + "</section>";
  }

  function showFeed(opts) {
    var space = opts.space ? state.spaces.filter(function (s) { return s.slug === opts.space; })[0] : null;
    var title = opts.saved ? "Saved posts" : opts.q ? "Search" : space ? space.name : "The Workshop";
    var desc = opts.saved ? "Posts you saved for later." : opts.q ? "Posts matching “" + opts.q + "”."
      : space ? space.description : "Share Minecraft mods, textures and models, get help, and learn from other modders.";
    var newHref = "#/new" + (space && !space.locked ? "/" + encodeURIComponent(space.slug) : "");
    var home = !space && !opts.saved && !opts.q;
    var newButton = space && space.locked ? "" : '<a class="btn btn-primary" href="' + newHref + '" data-new>' +
      I.plus.replace("<svg", '<svg style="width:18px;height:18px"') + "New post</a>";
    var head = home ? hero(newButton) : (space ? spaceHead(space, newButton)
      : '<div class="cm-head"><div><h1>' + esc(title) + "</h1><p>" + esc(desc) + "</p></div>" + newButton + "</div>");
    view.innerHTML = banner() + head +
      (home ? '<div class="cm-label">Latest from the community</div>' : "") +
      '<div class="cm-tools">' +
      '<div class="cm-tabs" role="tablist">' + [["hot", "Hot"], ["new", "New"], ["top", "Top"], ["active", "Active"]].map(function (t) {
        return '<button type="button" data-sort="' + t[0] + '" class="' + (state.sort === t[0] ? "on" : "") + '">' + t[1] + "</button>";
      }).join("") + "</div>" +
      '<select class="cm-select" data-period' + (state.sort === "top" ? "" : " hidden") + ' aria-label="Time range">' +
      [["day", "Today"], ["week", "This week"], ["month", "This month"], ["year", "This year"], ["all", "All time"]].map(function (t) {
        return '<option value="' + t[0] + '"' + (state.period === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
      }).join("") + "</select>" +
      '<form class="cm-search" data-search role="search">' + I.search + '<input class="input" name="q" maxlength="100" placeholder="Search posts" value="' + esc(opts.q || "") + '" aria-label="Search posts"></form>' +
      "</div>" +
      '<div class="cm-list" data-list><div class="cm-skel"></div><div class="cm-skel"></div></div><div class="cm-more" data-more></div>';
    view.querySelector("[data-new]") && view.querySelector("[data-new]").addEventListener("click", function (e) {
      if (!needMember()) e.preventDefault();
    });
    view.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () { state.sort = b.dataset.sort; showFeed(opts); });
    });
    view.querySelector("[data-period]").addEventListener("change", function (e) { state.period = e.target.value; loadFeed(opts, 1); });
    view.querySelector("[data-search]").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = e.target.q.value.trim();
      location.hash = q ? "#/search/" + encodeURIComponent(q) : "#/";
    });
    loadFeed(opts, 1);
  }

  function loadFeed(opts, page) {
    var q = "?sort=" + state.sort + "&period=" + state.period + "&page=" + page +
      (opts.space ? "&space=" + encodeURIComponent(opts.space) : "") + (opts.q ? "&q=" + encodeURIComponent(opts.q) : "") +
      (opts.saved ? "&saved=true" : "") + (opts.author ? "&author=" + encodeURIComponent(opts.author) : "");
    var list = view.querySelector("[data-list]"), more = view.querySelector("[data-more]");
    if (!list) return;
    req("GET", "/feed" + q).then(function (data) {
      if (page === 1) list.innerHTML = "";
      if (!data.posts.length && page === 1) {
        list.innerHTML = '<div class="cm-empty"><b>' + (opts.q ? "No posts found" : opts.saved ? "Nothing saved yet" : "No posts yet") + "</b>" +
          (opts.q ? "Try different words." : opts.saved ? "Tap Save on any post to keep it here." : "Be the first to share something.") +
          (!opts.q && !opts.saved && !opts.author ? '<br><a class="btn btn-primary" href="#/new' + (opts.space ? "/" + encodeURIComponent(opts.space) : "") + '">Write a post</a>' : "") + "</div>";
      }
      list.insertAdjacentHTML("beforeend", data.posts.map(postCard).join(""));
      more.innerHTML = data.hasMore ? '<button class="btn" type="button">Load more</button>' : "";
      if (data.hasMore) more.querySelector("button").addEventListener("click", function () { loadFeed(opts, page + 1); });
    }, function (err) {
      list.innerHTML = '<div class="cm-empty"><b>Couldn\'t load posts</b>' + esc(err.message) + "</div>";
    });
  }

  /* --------------------------------------------------------- post detail */
  var current = null;  // the open post

  function showPost(id) {
    view.innerHTML = '<a class="cm-back" href="#/">' + I.back.replace("<svg", '<svg style="width:16px;height:16px"') + "Back to the feed</a><div class=\"cm-skel\" style=\"height:260px\"></div>";
    req("GET", "/posts/" + encodeURIComponent(id)).then(function (p) {
      current = p;
      var space = state.spaces.filter(function (s) { return p.space && s.slug === p.space.slug; })[0];
      if (space) aside(space);
      drawPost();
    }, function (err) {
      view.innerHTML = '<div class="cm-empty"><b>This post isn\'t available</b>' + esc(err.message) + '<br><a class="btn" href="#/">Back to the feed</a></div>';
    });
  }

  function drawPost() {
    var p = current;
    var gallery = (p.images || []).map(function (im) {
      return '<button type="button" data-zoom="' + esc(im.url) + '" aria-label="Open image ' + esc(im.filename) + '"><img src="' + esc(im.url) + '" alt="' + esc(im.filename) + '" loading="lazy"></button>';
    }).join("");
    var files = (p.files || []).map(function (f) {
      return '<div class="cm-file"><span class="ic">' + esc(ext(f.filename)).slice(0, 4) + "</span><div><b title=\"" + esc(f.filename) + '">' + esc(f.filename) + "</b>" +
        "<small>" + size(f.size) + " &middot; " + f.downloads + " download" + (f.downloads === 1 ? "" : "s") + ' &middot; <span title="SHA-256: ' + esc(f.sha256) + '">SHA-256 ' + esc(f.sha256.slice(0, 12)) + "&hellip;</span></small></div>" +
        '<a class="btn btn-sm" data-download href="' + esc(f.url) + '?download=1" rel="nofollow" download>' + I.download.replace("<svg", '<svg style="width:15px;height:15px"') + "Download</a></div>";
    }).join("");
    var status = p.status === "removed" ? '<div class="cm-banner error">' + I.shield + "<div>This post was removed by a moderator." + (p.removedReason ? " " + esc(p.removedReason) : "") + "</div></div>"
      : p.status === "deleted" ? '<div class="cm-banner">' + I.shield + "<div>The author deleted this post.</div></div>" : "";
    view.innerHTML = banner() +
      '<a class="cm-back" href="' + (p.space ? "#/s/" + encodeURIComponent(p.space.slug) : "#/") + '">' + I.back.replace("<svg", '<svg style="width:16px;height:16px"') + "Back to " + esc(p.space ? p.space.name : "the feed") + "</a>" +
      status +
      '<article class="cm-article" data-post="' + esc(p.id) + '">' +
      '<div class="cm-meta">' + spaceChip(p.space) + (p.pinned ? '<span class="cm-tag pin">PINNED</span>' : "") + (p.locked ? '<span class="cm-tag lock">LOCKED</span>' : "") +
      '<span class="sep">&middot;</span>' + who(p.author) + '<span class="sep">&middot;</span><time title="' + esc(fullDate(p.createdAt)) + '">' + ago(p.createdAt) + "</time>" +
      (p.editedAt ? '<span class="sep">&middot;</span><span title="' + esc(fullDate(p.editedAt)) + '">edited</span>' : "") + "</div>" +
      "<h1>" + esc(p.title) + "</h1>" +
      (p.body ? md(p.body) : "") +
      (gallery ? '<div class="cm-gallery' + (p.images.length === 1 ? " single" : "") + '">' + gallery + "</div>" : "") +
      (files ? '<div class="cm-files">' + files + '</div><p class="cm-file-note">' + I.warn + "<span>Mods run code on your computer. Download only from members you trust, and compare the SHA-256 if the author shared it elsewhere. Report anything suspicious.</span></p>" : "") +
      '<div class="cm-foot" style="margin-top:16px">' + voteBox("post", p, true) +
      '<span class="cm-act">' + I.comment + " " + p.commentCount + "</span>" +
      '<button class="cm-act' + (p.saved ? " on" : "") + '" data-act="save" data-id="' + esc(p.id) + '">' + I.save + (p.saved ? " Saved" : " Save") + "</button>" +
      '<button class="cm-act' + (p.following ? " on" : "") + '" data-act="follow" data-id="' + esc(p.id) + '" title="Get a notification for new comments">' + I.bell + (p.following ? " Following" : " Follow") + "</button>" +
      '<button class="cm-act" data-act="share" data-id="' + esc(p.id) + '">' + I.share + " Share</button>" +
      '<button class="cm-act" data-act="post-menu" aria-label="More actions">' + I.more + "</button>" +
      "</div></article>" +
      '<section class="cm-comments" aria-label="Comments">' +
      (p.canComment ? '<form class="cm-composer" data-comment-form><textarea maxlength="10000" placeholder="' + (signedIn() ? "Add a comment (Markdown works)" : "Sign in to join the conversation") + '" aria-label="Comment"></textarea>' +
        '<div class="bar"><small>Be kind and stay on topic.</small><button class="btn btn-primary btn-sm" type="submit">Comment</button></div></form>'
        : '<div class="cm-banner">' + I.shield + "<div>" + (p.locked ? "This post is locked. New comments are turned off." : "Comments are closed.") + "</div></div>") +
      '<div class="cm-tools" style="margin-top:16px"><b style="font-size:15px">' + p.commentCount + " comment" + (p.commentCount === 1 ? "" : "s") + '</b><span style="flex:1"></span>' +
      '<select class="cm-select" data-csort aria-label="Sort comments"><option value="best">Best</option><option value="new">Newest</option><option value="old">Oldest</option></select></div>' +
      '<div class="cm-thread" data-thread></div></section>';
    var form = view.querySelector("[data-comment-form]");
    if (form) {
      form.querySelector("textarea").addEventListener("focus", function () { if (!signedIn()) { this.blur(); askSignIn(); } });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        sendComment(form, null);
      });
    }
    view.querySelector("[data-csort]").addEventListener("change", drawComments);
    drawComments();
    if (location.search.indexOf("c=") !== -1) { /* deep links handled by notifications */ }
  }

  function drawComments() {
    var p = current, sortBy = (view.querySelector("[data-csort]") || {}).value || "best";
    var kids = {};
    p.comments.forEach(function (c) { (kids[c.parentId || "root"] = kids[c.parentId || "root"] || []).push(c); });
    function sorter(a, b) {
      if (sortBy === "new") return a.createdAt < b.createdAt ? 1 : -1;
      if (sortBy === "old") return a.createdAt > b.createdAt ? 1 : -1;
      return (b.score - a.score) || (a.createdAt > b.createdAt ? 1 : -1);
    }
    function tree(parent) {
      return (kids[parent] || []).slice().sort(sorter).map(function (c) {
        var gone = c.status !== "visible";
        var body = c.authorBlocked && !gone ? '<p class="gone">Comment from a member you blocked.</p>'
          : gone && !c.body ? '<p class="gone">' + (c.status === "removed" ? "[removed by a moderator]" : "[deleted]") + "</p>" : md(c.body);
        return '<div class="cm-c" id="c-' + esc(c.id) + '" data-comment="' + esc(c.id) + '">' +
          '<div class="cm-c-head"><button class="cm-c-toggle" data-act="collapse" aria-label="Collapse thread">[&minus;]</button>' + who(c.author) +
          '<span class="sep">&middot;</span><time title="' + esc(fullDate(c.createdAt)) + '">' + ago(c.createdAt) + "</time>" +
          (c.editedAt ? '<span class="sep">&middot;</span>edited' : "") + (c.status === "removed" ? '<span class="cm-tag removed">REMOVED</span>' : "") + "</div>" +
          '<div class="cm-c-body">' + body + "</div>" +
          (gone && !c.canModerate ? "" : '<div class="cm-foot">' + voteBox("comment", c, true) +
            (p.canComment && !gone ? '<button class="cm-act" data-act="reply">' + I.comment + " Reply</button>" : "") +
            '<button class="cm-act" data-act="comment-menu" aria-label="More actions">' + I.more + "</button></div>") +
          '<div class="cm-c-kids">' + tree(c.id) + "</div></div>";
      }).join("");
    }
    var thread = view.querySelector("[data-thread]");
    thread.innerHTML = tree("root") || '<div class="cm-empty" style="padding:30px"><b>No comments yet</b>Start the conversation.</div>';
    if (/^#\/p\/[^/]+\/c\//.test(location.hash)) {
      var target = document.getElementById("c-" + location.hash.split("/c/")[1]);
      if (target) target.scrollIntoView({ block: "center" });
    }
  }

  function sendComment(form, parentId) {
    if (!needMember()) return;
    var box = form.querySelector("textarea"), btn = form.querySelector("button[type=submit]");
    var text = box.value.trim();
    if (!text) { box.focus(); return; }
    btn.disabled = true;
    req("POST", "/posts/" + current.id + "/comments", { body: text, parentId: parentId }).then(function (c) {
      current.comments.push(c);
      current.commentCount += 1;
      box.value = "";
      drawPost();
      var added = document.getElementById("c-" + c.id);
      if (added) added.scrollIntoView({ block: "center" });
    }, function (err) { btn.disabled = false; oops(err); });
  }

  function findComment(id) { return current && current.comments.filter(function (c) { return c.id === id; })[0]; }

  function commentMenu(btn, c) {
    var items = [];
    if (c.canEdit) {
      items.push({ label: "Edit", run: function () { editComment(c); } });
      items.push({ label: "Delete", danger: true, run: function () {
        confirmBox("Delete comment", "Delete your comment? Replies stay visible.", "Delete", function () {
          return req("DELETE", "/comments/" + c.id).then(function () { c.status = "deleted"; c.body = ""; c.canEdit = false; drawComments(); });
        });
      } });
    }
    items.push({ label: "Copy link", run: function () { copy(location.origin + location.pathname + "#/p/" + current.id + "/c/" + c.id); } });
    if (c.author && c.author.id && (!state.me || c.author.id !== state.me.id)) items.push({ label: "Report", run: function () { report("comment", c.id, "comment"); } });
    if (c.canModerate) {
      items.push("-");
      items.push(c.status === "removed"
        ? { label: "Restore (moderator)", run: function () { modAction("comments", c.id, "restore"); } }
        : { label: "Remove (moderator)", danger: true, run: function () { modRemove("comments", c.id); } });
    }
    menu(btn, items);
  }

  function editComment(c) {
    dialog("Edit comment", '<textarea class="input" data-body maxlength="10000" style="min-height:160px"></textarea>', [
      { label: "Cancel" },
      { label: "Save", primary: true, onClick: function (host) {
        return req("PATCH", "/comments/" + c.id, { body: host.querySelector("[data-body]").value }).then(function (n) {
          c.body = n.body; c.editedAt = n.editedAt; drawComments();
        });
      } }
    ]).querySelector("[data-body]").value = c.body;
  }

  function postMenu(btn) {
    var p = current, items = [];
    if (p.canEdit) items.push({ label: "Edit post", run: function () { location.hash = "#/edit/" + p.id; } });
    if (p.canDelete) items.push({ label: "Delete post", danger: true, run: function () {
      confirmBox("Delete post", "Delete this post and its files? Comments stay, but the post can't be brought back.", "Delete", function () {
        return req("DELETE", "/posts/" + p.id).then(function () { toast("Post deleted."); location.hash = "#/"; });
      });
    } });
    if (p.author && p.author.id && (!state.me || p.author.id !== state.me.id)) {
      items.push({ label: "Report post", run: function () { report("post", p.id, "post"); } });
      items.push({ label: "Message " + p.author.username, run: function () { startChat(p.author.username); } });
    }
    if (p.canModerate) {
      items.push("-");
      items.push({ label: p.pinned ? "Unpin" : "Pin to top of space", run: function () { modAction("posts", p.id, p.pinned ? "unpin" : "pin"); } });
      items.push({ label: p.locked ? "Unlock comments" : "Lock comments", run: function () { modAction("posts", p.id, p.locked ? "unlock" : "lock"); } });
      items.push(p.status === "removed"
        ? { label: "Restore post", run: function () { modAction("posts", p.id, "restore"); } }
        : { label: "Remove post", danger: true, run: function () { modRemove("posts", p.id); } });
    }
    if (!items.length) items.push({ label: "Copy link", run: function () { copy(p.url); } });
    menu(btn, items);
  }

  function modAction(kind, id, action, reason) {
    return req("POST", "/mod/" + kind + "/" + id, { action: action, reason: reason || "" }).then(function () {
      toast("Done.");
      showPost(current.id);
    }, oops);
  }
  function modRemove(kind, id) {
    dialog("Remove for breaking the rules", '<p style="color:var(--muted);margin-top:10px">The author gets a notification with the reason.</p><input class="input" data-reason maxlength="300" placeholder="Reason (e.g. Rule 3: no malware)">', [
      { label: "Cancel" },
      { label: "Remove", danger: true, onClick: function (host) { return modAction(kind, id, "remove", host.querySelector("[data-reason]").value); } }
    ]);
  }

  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast("Link copied."); }, function () {
      window.prompt("Copy this link:", text);
    });
  }

  /* ----------------------------------------------------------- composer */
  function showComposer(post, spaceSlug) {
    if (!signedIn()) { view.innerHTML = '<div class="cm-empty"><b>Sign in to post</b>You need a free MyCraftingAI account to write in The Workshop.<br><a class="btn btn-primary" href="login.html?next=' + encodeURIComponent("community.html" + location.hash) + '">Sign in</a></div>'; return; }
    if (!canPost()) { view.innerHTML = banner() + '<div class="cm-empty"><b>You can\'t post right now</b>' + (state.me && state.me.restriction ? "Your account is restricted." : "Accept the updated Terms of Service to take part.") + "</div>"; return; }
    var limits = (state.me && state.me.limits) || { imageMb: 8, fileMb: 50, attachments: 10, extensions: [] };
    var spaces = state.spaces.filter(function (s) { return !s.locked || (state.me && state.me.moderator); });
    var chosen = post ? post.space.slug : (spaceSlug || (spaces[1] || spaces[0] || {}).slug);
    var files = post ? (post.images || []).concat(post.files || []).map(function (u) { return { record: u, name: u.filename, size: u.size, done: true }; }) : [];
    view.innerHTML = '<a class="cm-back" href="' + (post ? "#/p/" + post.id : "#/") + '">' + I.back.replace("<svg", '<svg style="width:16px;height:16px"') + (post ? "Back to the post" : "Back to the feed") + "</a>" +
      '<div class="cm-head"><div><h1>' + (post ? "Edit post" : "New post") + "</h1><p>Share a mod, ask for help or show what you made. Markdown works: **bold**, *italic*, `code`, lists and links.</p></div></div>" +
      '<form class="cm-form cm-article" data-form novalidate>' +
      '<div class="field"><label for="cm-space">Space</label><select class="input" id="cm-space" name="space"' + (post ? " disabled" : "") + ">" +
      spaces.map(function (s) { return '<option value="' + esc(s.slug) + '"' + (s.slug === chosen ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="cm-title"><span>Title</span><small class="dim" data-count>0/200</small></label><input class="input" id="cm-title" name="title" maxlength="200" required placeholder="e.g. Ruby Armor 1.0 for NeoForge 1.21"></div>' +
      '<div class="field"><label for="cm-body">Text</label>' +
      '<div class="cm-mdbar" data-mdbar><button type="button" data-md="**|**" title="Bold">B</button><button type="button" data-md="*|*" title="Italic"><i>I</i></button>' +
      '<button type="button" data-md="`|`" title="Code">&lt;/&gt;</button><button type="button" data-md="```\n|\n```" title="Code block">{ }</button>' +
      '<button type="button" data-md="[|](https://)" title="Link">Link</button><button type="button" data-md="- |" title="List">&bull; List</button>' +
      '<button type="button" data-md="> |" title="Quote">&ldquo;</button><span class="spacer"></span><button type="button" data-preview>Preview</button></div>' +
      '<textarea class="input" id="cm-body" name="body" maxlength="40000" placeholder="Tell people what it is, which Minecraft and loader versions it supports, and how to use it."></textarea>' +
      '<div data-preview-box hidden class="cm-card" style="min-height:120px"></div></div>' +
      '<div class="field"><label>Images &amp; files</label>' +
      '<div class="cm-drop" data-drop>Drag files here or <label>browse<input type="file" multiple hidden data-file></label>' +
      "<small>Images (PNG, JPG, GIF, WebP) up to " + limits.imageMb + " MB, files up to " + limits.fileMb + " MB, " + limits.attachments + " per post. " +
      "Mods (.jar), projects (.zip), textures, models (.bbmodel), sounds (.ogg), configs and logs.</small></div>" +
      '<div class="cm-uploads" data-uploads style="margin-top:10px"></div></div>' +
      '<div class="notice" data-notice role="status"></div>' +
      '<p class="dim fine">By posting you agree to the <a href="community-rules.html" target="_blank">community rules</a> and confirm you have the right to share these files. Everyone can see your post.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" type="submit" data-submit>' + (post ? "Save changes" : "Publish post") + '</button><a class="btn btn-ghost" href="' + (post ? "#/p/" + post.id : "#/") + '">Cancel</a></div>' +
      "</form>";
    var form = view.querySelector("[data-form]"), title = form.title, body = form.body;
    var list = form.querySelector("[data-uploads]"), note = form.querySelector("[data-notice]");
    if (post) { title.value = post.title; body.value = post.body || ""; }
    function count() { form.querySelector("[data-count]").textContent = title.value.length + "/200"; }
    title.addEventListener("input", count); count();
    form.querySelectorAll("[data-md]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.dataset.md.split("|"), s = body.selectionStart, e = body.selectionEnd, sel = body.value.slice(s, e);
        body.setRangeText(parts[0] + sel + parts[1], s, e, "end");
        body.selectionStart = body.selectionEnd = s + parts[0].length + sel.length;
        body.focus();
      });
    });
    form.querySelector("[data-preview]").addEventListener("click", function () {
      var box = form.querySelector("[data-preview-box]"), on = box.hidden;
      box.hidden = !on; body.hidden = on;
      this.textContent = on ? "Write" : "Preview";
      if (on) box.innerHTML = body.value.trim() ? md(body.value) : '<p class="dim">Nothing to preview yet.</p>';
    });

    function drawFiles() {
      list.innerHTML = files.map(function (f, i) {
        var thumb = f.preview ? ' style="background-image:url(\'' + f.preview + '\')"'
          : (f.record && f.record.kind === "image" ? ' style="background-image:url(\'' + esc(f.record.url) + '\')"' : "");
        var label = thumb ? "" : esc(ext(f.name)).slice(0, 4);
        var line = f.error ? '<small class="err">' + esc(f.error) + "</small>"
          : f.done ? "<small>" + size(f.size) + "</small>" : '<small>Uploading&hellip;</small><div class="bar"><i style="width:' + Math.round((f.pct || 0) * 100) + '%"></i></div>';
        return '<div class="cm-up"><span class="thumb"' + thumb + ">" + label + "</span><div><b>" + esc(f.name) + "</b>" + line + '</div><button type="button" class="cm-act danger" data-remove="' + i + '">Remove</button></div>';
      }).join("");
      list.querySelectorAll("[data-remove]").forEach(function (b) {
        b.addEventListener("click", function () { files.splice(+b.dataset.remove, 1); drawFiles(); });
      });
    }
    function add(fileList) {
      Array.prototype.forEach.call(fileList, function (file) {
        if (files.length >= limits.attachments) { toast("Up to " + limits.attachments + " attachments per post.", true); return; }
        var item = { name: file.name, size: file.size, pct: 0, done: false };
        if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) item.preview = URL.createObjectURL(file);
        files.push(item); drawFiles();
        upload(file, "post", function (pct) { item.pct = pct; drawFiles(); }).then(function (rec) {
          item.record = rec; item.done = true; drawFiles();
        }, function (err) { item.error = err.message; drawFiles(); });
      });
    }
    form.querySelector("[data-file]").addEventListener("change", function () { add(this.files); this.value = ""; });
    var drop = form.querySelector("[data-drop]");
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files); });
    drawFiles();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      note.className = "notice";
      if (files.some(function (f) { return !f.done && !f.error; })) { note.className = "notice warn show"; note.textContent = "Wait for the uploads to finish."; return; }
      if (title.value.trim().length < 3) { note.className = "notice error show"; note.textContent = "Give your post a title (at least 3 characters)."; title.focus(); return; }
      var ids = files.filter(function (f) { return f.record; }).map(function (f) { return f.record.id; });
      var btn = form.querySelector("[data-submit]");
      btn.disabled = true;
      var call = post ? req("PATCH", "/posts/" + post.id, { title: title.value, body: body.value, attachments: ids })
        : req("POST", "/posts", { space: form.space.value, title: title.value, body: body.value, attachments: ids });
      call.then(function (saved) {
        toast(post ? "Post updated." : "Posted!");
        location.hash = "#/p/" + saved.id;
      }, function (err) {
        btn.disabled = false;
        note.className = "notice error show";
        note.textContent = err.message;
      });
    });
    title.focus();
  }

  function showEdit(id) {
    req("GET", "/posts/" + encodeURIComponent(id)).then(function (p) {
      if (!p.canEdit) { view.innerHTML = '<div class="cm-empty"><b>You can\'t edit this post</b></div>'; return; }
      showComposer(p);
    }, oops);
  }

  /* ------------------------------------------------------------- profile */
  function showProfile(name) {
    view.innerHTML = '<div class="cm-skel" style="height:160px"></div>';
    req("GET", "/users/" + encodeURIComponent(name)).then(function (u) {
      var actions = "";
      if (u.isMe) actions = '<a class="btn" href="#/settings">Edit profile</a>';
      else if (signedIn()) {
        actions = (u.acceptsMessages && !u.blocked ? '<button class="btn btn-primary" data-act="dm">Message</button>' : "") +
          '<button class="btn btn-ghost" data-act="user-menu" aria-label="More">' + I.more + "</button>";
      }
      view.innerHTML = '<div class="cm-article"><div class="cm-profile">' + avatar(u, "lg") +
        '<div style="flex:1;min-width:200px"><h1>' + esc(u.username) + " " + badges(u) + "</h1>" +
        (u.bio ? '<p style="color:var(--muted);margin-top:6px">' + esc(u.bio) + "</p>" : "") +
        '<div class="cm-stats"><span><b>' + u.karma + "</b> karma</span><span><b>" + u.posts + "</b> posts</span><span><b>" + u.comments + "</b> comments</span><span>Joined " + esc(ago(u.joined)) + "</span></div>" +
        (u.banned ? '<p class="cm-tag removed" style="margin-top:10px">Can\'t post</p>' : "") +
        '</div><div style="display:flex;gap:8px">' + actions + "</div></div></div>" +
        '<h3 style="margin:24px 0 12px">Posts</h3><div class="cm-list" data-list></div><div class="cm-more" data-more></div>';
      var dm = view.querySelector('[data-act="dm"]');
      if (dm) dm.addEventListener("click", function () { startChat(u.username); });
      var more = view.querySelector('[data-act="user-menu"]');
      if (more) more.addEventListener("click", function (e) {
        e.stopPropagation();
        menu(more, [
          { label: u.blocked ? "Unblock " + u.username : "Block " + u.username, danger: !u.blocked, run: function () { setBlock(u.username, !u.blocked); } },
          { label: "Report " + u.username, run: function () { report("user", u.username, u.username); } }
        ]);
      });
      loadFeed({ author: u.username }, 1);
    }, function (err) {
      view.innerHTML = '<div class="cm-empty"><b>Member not found</b>' + esc(err.message) + "</div>";
    });
  }

  function setBlock(name, blocked) {
    req("POST", "/users/" + encodeURIComponent(name) + "/block", { blocked: blocked }).then(function () {
      toast(blocked ? name + " is blocked. You won't see their posts or messages." : name + " is unblocked.");
      render();
    }, oops);
  }

  function startChat(name) {
    if (!needMember()) return;
    req("POST", "/conversations", { username: name }).then(function (c) { location.hash = "#/messages/" + c.id; }, oops);
  }

  /* ------------------------------------------------------------ messages */
  function showMessages(convId) {
    if (!signedIn()) return askSignInView();
    view.innerHTML = banner() + '<div class="cm-head"><div><h1>Messages</h1><p>Private 1:1 conversations. Moderators only see a message if someone reports it.</p></div></div>' +
      '<div class="cm-dm' + (convId ? " has-thread" : "") + '"><div class="cm-dm-list"><form class="top" data-new-chat><input class="input" name="u" placeholder="Username" maxlength="32" aria-label="Start a conversation with"><button class="btn btn-sm btn-primary" type="submit">Message</button></form><div class="cm-dm-items" data-convs></div></div>' +
      '<div class="cm-dm-thread" data-thread><div class="cm-dm-empty">Pick a conversation, or start one with a username.</div></div></div>';
    view.querySelector("[data-new-chat]").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = e.target.u.value.trim().replace(/^@/, "");
      if (name) startChat(name);
    });
    loadConversations(convId);
    if (convId) openThread(convId);
    state.timers.push(setInterval(function () { loadConversations(convId, true); }, 20000));
  }

  function askSignInView() {
    view.innerHTML = '<div class="cm-empty"><b>Sign in to continue</b>This part of The Workshop needs your MyCraftingAI account.<br><a class="btn btn-primary" href="login.html?next=' + encodeURIComponent("community.html" + location.hash) + '">Sign in</a></div>';
  }

  function loadConversations(active, quiet) {
    var host = view.querySelector("[data-convs]");
    if (!host) return;
    req("GET", "/conversations").then(function (d) {
      state.unread.messages = d.unread; renderNav();
      host.innerHTML = d.conversations.length ? d.conversations.map(function (c) {
        return '<a class="cm-dm-item' + (c.id === active ? " active" : "") + '" href="#/messages/' + esc(c.id) + '">' + avatar(c.other, "md") +
          "<div style=\"min-width:0\"><b>" + esc(c.other.username) + "</b><small>" + (c.last.fromMe ? "You: " : "") + esc(c.last.text) + "</small></div>" +
          (c.unread ? '<span class="n">' + c.unread + "</span>" : '<small class="dim">' + esc(ago(c.last.at)) + "</small>") + "</a>";
      }).join("") : '<p class="dim" style="padding:18px;font-size:14px">No conversations yet. Find someone in the community and say hi.</p>';
    }, function (err) { if (!quiet) oops(err); });
  }

  function openThread(id) {
    var host = view.querySelector("[data-thread]");
    var pending = [], lastStamp = "";
    host.innerHTML = '<div class="cm-dm-empty">Loading&hellip;</div>';
    function draw(d) {
      var day = "";
      var msgs = d.messages.map(function (m) {
        var dd = new Date(m.createdAt).toDateString(), sep = "";
        if (dd !== day) { day = dd; sep = '<div class="cm-day">' + new Date(m.createdAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + "</div>"; }
        if (m.status !== "visible") return sep + '<div class="cm-msg removed' + (m.fromMe ? " me" : "") + '">Message removed by a moderator.</div>';
        var att = (m.attachments || []).map(function (a) {
          return a.kind === "image" ? '<img src="' + esc(a.url) + '" alt="' + esc(a.filename) + '" data-zoom="' + esc(a.url) + '">'
            : '<a href="' + esc(a.url) + '?download=1" download rel="nofollow">' + I.download.replace("<svg", '<svg style="width:14px;height:14px"') + esc(a.filename) + " (" + size(a.size) + ")</a>";
        }).join("");
        return sep + '<div class="cm-msg' + (m.fromMe ? " me" : "") + '" data-msg="' + esc(m.id) + '">' + esc(m.body) + (att ? '<div class="att">' + att + "</div>" : "") +
          '<span class="t">' + new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
          (!m.fromMe ? ' &middot; <button class="cm-c-toggle" data-report-msg="' + esc(m.id) + '">Report</button>' : "") + "</span></div>";
      }).join("");
      host.innerHTML = '<div class="cm-dm-head"><a class="cm-act" href="#/messages" aria-label="Back to conversations">' + I.back + "</a>" + avatar(d.other, "md") +
        '<div class="grow"><a href="#/u/' + encodeURIComponent(d.other.username) + '"><b style="color:var(--text)">' + esc(d.other.username) + "</b></a> " + badges(d.other) + "</div>" +
        '<button class="cm-act" data-act="thread-menu" aria-label="More">' + I.more + "</button></div>" +
        '<div class="cm-dm-msgs" data-msgs>' + (msgs || '<div class="cm-dm-empty">Say hi to ' + esc(d.other.username) + ".</div>") + "</div>" +
        (d.blocked ? '<div class="cm-banner" style="margin:10px">' + I.shield + "<div>You can't message each other because one of you blocked the other.</div></div>"
          : '<form class="cm-dm-send" data-send><div class="cm-uploads" data-pending></div><div class="row">' +
          '<label class="cm-icon-btn" title="Attach image or file">' + I.clip + '<input type="file" hidden multiple data-file></label>' +
          '<textarea rows="1" maxlength="4000" placeholder="Write a message" aria-label="Message"></textarea>' +
          '<button class="cm-icon-btn" type="submit" style="background:var(--accent);color:#fff;border-color:var(--accent)" aria-label="Send">' + I.send + "</button></div></form>");
      var box = host.querySelector("[data-msgs]");
      box.scrollTop = box.scrollHeight;
      host.querySelectorAll("[data-report-msg]").forEach(function (b) {
        b.addEventListener("click", function () { report("message", b.dataset.reportMsg, "message"); });
      });
      host.querySelector('[data-act="thread-menu"]').addEventListener("click", function (e) {
        e.stopPropagation();
        menu(this, [
          { label: "View profile", run: function () { location.hash = "#/u/" + encodeURIComponent(d.other.username); } },
          { label: d.blocked ? "Unblock" : "Block " + d.other.username, danger: !d.blocked, run: function () { setBlock(d.other.username, !d.blocked); } },
          { label: "Report " + d.other.username, run: function () { report("user", d.other.username, d.other.username); } }
        ]);
      });
      var form = host.querySelector("[data-send]");
      if (!form) return;
      var area = form.querySelector("textarea"), pendHost = form.querySelector("[data-pending]");
      function drawPending() {
        pendHost.innerHTML = pending.map(function (f, i) {
          return '<div class="cm-up"><span class="thumb">' + esc(ext(f.name)).slice(0, 4) + "</span><div><b>" + esc(f.name) + "</b>" +
            (f.error ? '<small class="err">' + esc(f.error) + "</small>" : "<small>" + (f.done ? size(f.size) : "Uploading&hellip;") + "</small>") +
            '</div><button type="button" class="cm-act danger" data-rm="' + i + '">Remove</button></div>';
        }).join("");
        pendHost.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { pending.splice(+b.dataset.rm, 1); drawPending(); }); });
      }
      form.querySelector("[data-file]").addEventListener("change", function () {
        Array.prototype.forEach.call(this.files, function (file) {
          if (pending.length >= 5) return toast("Up to 5 attachments per message.", true);
          var item = { name: file.name, size: file.size };
          pending.push(item); drawPending();
          upload(file, "message").then(function (rec) { item.record = rec; item.done = true; drawPending(); }, function (err) { item.error = err.message; drawPending(); });
        });
        this.value = "";
      });
      area.addEventListener("input", function () { area.style.height = "auto"; area.style.height = Math.min(160, area.scrollHeight) + "px"; });
      area.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); } });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!needMember()) return;
        if (pending.some(function (f) { return !f.done && !f.error; })) return toast("Wait for the uploads to finish.", true);
        var ids = pending.filter(function (f) { return f.record; }).map(function (f) { return f.record.id; });
        if (!area.value.trim() && !ids.length) return;
        var text = area.value;
        area.value = "";
        req("POST", "/conversations/" + id + "/messages", { body: text, attachments: ids }).then(function () {
          pending = []; refresh(); loadConversations(id, true);
        }, function (err) { area.value = text; oops(err); });
      });
      area.focus();
    }
    function refresh(quiet) {
      return req("GET", "/conversations/" + encodeURIComponent(id) + "/messages").then(function (d) {
        var stamp = d.messages.length ? d.messages[d.messages.length - 1].id + d.messages.length : "0";
        var typing = host.querySelector("[data-send] textarea");
        if (stamp !== lastStamp || !quiet) {
          var draft = typing ? typing.value : "";
          lastStamp = stamp;
          draw(d);
          var again = host.querySelector("[data-send] textarea");
          if (again && draft) again.value = draft;
          req("POST", "/conversations/" + encodeURIComponent(id) + "/read", {}).then(function (u) { state.unread = u; renderNav(); }, function () {});
        }
      }, function (err) {
        if (!quiet) host.innerHTML = '<div class="cm-dm-empty">' + esc(err.message) + "</div>";
      });
    }
    refresh().then(function () { loadConversations(id, true); });
    state.timers.push(setInterval(function () { if (!document.hidden) refresh(true); }, 8000));
  }

  /* ------------------------------------------------------- notifications */
  var NOTE_ICON = { reply: I.comment, comment: I.comment, mention: I.at, message: I.mail, moderation: I.shield };

  function showNotifications() {
    if (!signedIn()) return askSignInView();
    view.innerHTML = '<div class="cm-head"><div><h1>Notifications</h1><p>Replies, comments on posts you follow, mentions, messages and notes from the moderators.</p></div>' +
      '<button class="btn" data-all>Mark all as read</button></div><div class="cm-article" style="padding:0;overflow:hidden" data-notes><div class="cm-skel" style="border:0"></div></div><div class="cm-more" data-more></div>';
    view.querySelector("[data-all]").addEventListener("click", function () {
      req("POST", "/notifications/read", { all: true }).then(function (u) { state.unread = u; showNotifications(); }, oops);
    });
    loadNotes(1);
  }

  function loadNotes(page) {
    req("GET", "/notifications?page=" + page).then(function (d) {
      state.unread = d.unread; renderNav();
      var host = view.querySelector("[data-notes]");
      var html = d.notifications.map(function (n) {
        var href = n.conversationId ? "#/messages/" + n.conversationId : n.postId ? "#/p/" + n.postId + (n.commentId ? "/c/" + n.commentId : "") : "#/notifications";
        return '<a class="cm-note' + (n.read ? "" : " unread") + '" href="' + href + '" data-note="' + esc(n.id) + '">' +
          (n.actor ? avatar(n.actor, "md") : '<span class="ic">' + (NOTE_ICON[n.kind] || I.bell) + "</span>") +
          "<div><p>" + esc(n.text) + "</p><small>" + esc(ago(n.createdAt)) + "</small></div></a>";
      }).join("");
      if (page === 1) host.innerHTML = html || '<div class="cm-empty" style="border:0"><b>You\'re all caught up</b>Replies, mentions and messages show up here.</div>';
      else host.insertAdjacentHTML("beforeend", html);
      host.querySelectorAll("[data-note]").forEach(function (a) {
        a.addEventListener("click", function () { req("POST", "/notifications/read", { ids: [a.dataset.note] }).then(function (u) { state.unread = u; renderNav(); }, function () {}); });
      });
      var more = view.querySelector("[data-more]");
      more.innerHTML = d.hasMore ? '<button class="btn">Load more</button>' : "";
      if (d.hasMore) more.querySelector("button").addEventListener("click", function () { loadNotes(page + 1); });
    }, oops);
  }

  /* ------------------------------------------------------------ settings */
  function showSettings() {
    if (!signedIn()) return askSignInView();
    var me = state.me || {};
    view.innerHTML = banner() + '<div class="cm-head"><div><h1>Profile &amp; settings</h1><p>How you appear in The Workshop. Your email address is never shown to other members.</p></div>' +
      '<a class="btn" href="#/u/' + encodeURIComponent(me.username || "") + '">View my profile</a></div>' +
      '<form class="cm-article cm-form" data-profile>' +
      '<div class="cm-profile">' + '<span data-av>' + avatar(me, "lg") + "</span>" +
      '<div><b style="font-size:18px">' + esc(me.username || "") + "</b> " + badges(me) +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><label class="btn btn-sm">Change picture<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-avatar></label>' +
      (me.avatarUrl ? '<button class="btn btn-sm btn-ghost" type="button" data-noavatar>Remove</button>' : "") + "</div>" +
      '<small class="dim">PNG, JPG, GIF or WebP, up to ' + ((me.limits || {}).avatarMb || 2) + " MB.</small></div></div>" +
      '<div class="field"><label for="cm-bio"><span>Bio</span><small class="dim">300 characters</small></label><input class="input" id="cm-bio" name="bio" maxlength="300" placeholder="What do you like to make?"></div>' +
      '<div class="prefs" style="grid-template-columns:1fr">' +
      '<div class="pref"><div><b>Private messages</b><span>Let any member start a conversation with you.</span></div><label class="switch"><input type="checkbox" name="dms"><i></i><span class="sr-only">Allow private messages</span></label></div>' +
      '<div class="pref"><div><b>Email me about activity</b><span>Replies, mentions and messages while you\'re away - at most one email every few hours. Also on your account page.</span></div><label class="switch"><input type="checkbox" name="emails"><i></i><span class="sr-only">Community emails</span></label></div>' +
      "</div>" +
      '<div class="notice" data-notice role="status"></div>' +
      '<div><button class="btn btn-primary" type="submit">Save</button></div></form>' +
      '<div class="cm-article" style="margin-top:16px"><h3 style="font-size:16px">Blocked members</h3><p class="dim" style="font-size:14px;margin-top:6px">You don\'t see their posts, and you can\'t message each other.</p><div data-blocks style="margin-top:10px"></div></div>';
    var form = view.querySelector("[data-profile]"), note = form.querySelector("[data-notice]");
    form.bio.value = me.bio || "";
    form.dms.checked = me.dmPolicy !== "nobody";
    form.emails.checked = me.emails !== false;
    function save(extra) {
      var body = { bio: form.bio.value, dmPolicy: form.dms.checked ? "everyone" : "nobody", emails: form.emails.checked };
      Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
      return req("PATCH", "/me", body).then(function (m) {
        state.me = m;
        note.className = "notice ok show"; note.textContent = "Saved.";
        if (extra) showSettings();
      }, function (err) { note.className = "notice error show"; note.textContent = err.message; });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
    form.querySelector("[data-avatar]").addEventListener("change", function () {
      var file = this.files[0];
      if (!file) return;
      note.className = "notice info show"; note.textContent = "Uploading picture…";
      upload(file, "avatar").then(function (rec) { save({ avatarId: rec.id }); }, function (err) { note.className = "notice error show"; note.textContent = err.message; });
    });
    var rm = form.querySelector("[data-noavatar]");
    if (rm) rm.addEventListener("click", function () { save({ removeAvatar: true }); });
    req("GET", "/blocks").then(function (d) {
      var host = view.querySelector("[data-blocks]");
      host.innerHTML = d.blocked.length ? d.blocked.map(function (b) {
        return '<div class="pref"><div>' + who(b) + '</div><button class="btn btn-sm" data-unblock="' + esc(b.username) + '">Unblock</button></div>';
      }).join("") : '<p class="dim" style="font-size:14px">Nobody blocked.</p>';
      host.querySelectorAll("[data-unblock]").forEach(function (b) { b.addEventListener("click", function () { setBlock(b.dataset.unblock, false); }); });
    }, function () {});
  }

  /* ---------------------------------------------------------- page events */
  function onClick(e) {
    var zoom = e.target.closest("[data-zoom]");
    if (zoom) { e.preventDefault(); lightbox(zoom.getAttribute("data-zoom")); return; }
    var dl = e.target.closest("[data-download]");
    if (dl && !signedIn()) { e.preventDefault(); askSignIn(); return; }
    var open = e.target.closest("[data-open]");
    var act = e.target.closest("[data-act]");
    if (!act) {
      if (open && !e.target.closest("a, button")) location.hash = "#/p/" + open.dataset.open;
      return;
    }
    var kind = act.dataset.act;
    if (kind === "vote") {
      e.preventDefault();
      if (!needMember()) return;
      var box = act.closest("[data-vote]"), type = box.dataset.vote, id = box.dataset.id;
      var up = box.querySelector(".up"), down = box.querySelector(".down"), score = box.querySelector("b");
      var mine = up.classList.contains("on") ? 1 : down.classList.contains("on") ? -1 : 0;
      var want = +act.dataset.v === mine ? 0 : +act.dataset.v;
      up.classList.toggle("on", want === 1); down.classList.toggle("on", want === -1);
      score.textContent = +score.textContent + (want - mine);
      req("POST", "/" + (type === "post" ? "posts" : "comments") + "/" + id + "/vote", { value: want }).then(function (r) {
        score.textContent = r.score;
        var item = type === "post" ? (current && current.id === id ? current : null) : findComment(id);
        if (item) { item.score = r.score; item.myVote = r.myVote; }
      }, function (err) {
        up.classList.toggle("on", mine === 1); down.classList.toggle("on", mine === -1);
        score.textContent = +score.textContent - (want - mine);
        oops(err);
      });
    } else if (kind === "save" || kind === "follow") {
      if (!signedIn()) return askSignIn();
      var on = !act.classList.contains("on");
      req("POST", "/posts/" + act.dataset.id + "/" + kind, { on: on }).then(function () {
        act.classList.toggle("on", on);
        act.innerHTML = (kind === "save" ? I.save + (on ? " Saved" : " Save") : I.bell + (on ? " Following" : " Follow"));
        if (current && current.id === act.dataset.id) current[kind === "save" ? "saved" : "following"] = on;
        toast(kind === "save" ? (on ? "Saved." : "Removed from saved.") : (on ? "You'll get a notification for new comments." : "Unfollowed."));
      }, oops);
    } else if (kind === "share") {
      copy(location.origin + location.pathname + "#/p/" + act.dataset.id);
    } else if (kind === "post-menu") {
      e.stopPropagation(); postMenu(act);
    } else if (kind === "comment-menu") {
      e.stopPropagation(); commentMenu(act, findComment(act.closest("[data-comment]").dataset.comment));
    } else if (kind === "collapse") {
      var c = act.closest(".cm-c");
      c.classList.toggle("collapsed");
      act.innerHTML = c.classList.contains("collapsed") ? "[+]" : "[&minus;]";
    } else if (kind === "reply") {
      if (!needMember()) return;
      var host = act.closest(".cm-c");
      var open2 = host.querySelector(":scope > .cm-reply");
      if (open2) { open2.remove(); return; }
      var form = document.createElement("form");
      form.className = "cm-composer cm-reply";
      form.innerHTML = '<textarea maxlength="10000" placeholder="Write a reply" aria-label="Reply"></textarea><div class="bar"><small>Replying to ' +
        esc((findComment(host.dataset.comment).author || {}).username || "comment") + '</small><div><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button> <button class="btn btn-primary btn-sm" type="submit">Reply</button></div></div>';
      host.querySelector(".cm-c-kids").before(form);
      form.querySelector("[data-cancel]").addEventListener("click", function () { form.remove(); });
      form.addEventListener("submit", function (ev) { ev.preventDefault(); sendComment(form, host.dataset.comment); });
      form.querySelector("textarea").focus();
    }
  }

  /* ---------------------------------------------------------------- start */
  function pollUnread() {
    if (!signedIn() || document.hidden || closed()) return;
    req("GET", "/unread").then(function (u) { state.unread = u; renderNav(); }, function () {});
  }

  function start() {
    view = el("[data-view]");
    nav = el("[data-nav]");
    if (!view || !api) return;
    document.addEventListener("click", onClick);
    el("[data-lightbox]").addEventListener("click", function () { this.classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") el("[data-lightbox]").classList.remove("open"); });
    window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
    if (api.mode !== "live") { render(); return; }
    var session = api.me().then(function (me) {
      state.session = me;
      return req("GET", "/me").then(function (cm) { state.me = cm; state.unread = { notifications: cm.notifications, messages: cm.messages }; });
    }, function () { state.session = null; });
    var spaces = req("GET", "/spaces").then(function (d) { state.spaces = d.spaces; }, function () { state.spaces = []; });
    // Ask after the session is known, so the vote and the team bypass are included.
    var status = session.then(function () {
      return req("GET", "/status").then(function (d) { state.status = d; }, function () { state.status = null; });
    });
    Promise.all([status, spaces]).then(render, render);
    setInterval(pollUnread, 30000);
    document.addEventListener("mca:legal-accepted", function () {
      req("GET", "/me").then(function (cm) { state.me = cm; render(); }, function () {});
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

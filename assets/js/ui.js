/* Shared page chrome: header, footer, mobile menu, scroll reveal, account chip, modal. */
(function () {
  "use strict";

  var cfg = window.MCA_CONFIG || {};
  var LOGO =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4F63F5"/>' +
    '<g fill="#fff"><rect x="14" y="6" width="4" height="4"/><rect x="14" y="10" width="4" height="4"/>' +
    '<rect x="6" y="14" width="4" height="4"/><rect x="10" y="14" width="4" height="4"/>' +
    '<rect x="18" y="14" width="4" height="4"/><rect x="22" y="14" width="4" height="4"/>' +
    '<rect x="14" y="18" width="4" height="4"/><rect x="14" y="22" width="4" height="4"/></g>' +
    '<rect x="14" y="14" width="4" height="4" fill="#fff" opacity=".5"/></svg>';

  function onHome() {
    var name = location.pathname.split("/").pop();
    return name === "" || name === "index.html";
  }
  function link(hash) { return (onHome() ? "" : "index.html") + hash; }

  function header() {
    var host = document.querySelector("[data-site-header]");
    if (!host) return;
    host.className = "site-header";
    host.innerHTML =
      '<div class="wrap">' +
      '<a class="brand" href="index.html" aria-label="MyCraftingAI home">' + LOGO + "MyCraftingAI</a>" +
      '<nav class="nav" aria-label="Main">' +
      '<a href="' + link("#demo") + '">How it works</a>' +
      '<a href="' + link("#tour") + '">Features</a>' +
      '<a href="' + link("#pricing") + '">Pricing</a>' +
      '<a href="download.html">Download</a>' +
      '<a href="' + link("#faq") + '">FAQ</a>' +
      "</nav>" +
      '<div class="header-actions" data-account-slot>' +
      '<a class="btn btn-ghost" href="login.html">Sign in</a>' +
      '<a class="btn btn-primary" href="download.html">Download</a>' +
      "</div>" +
      '<button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
      "</div>";
    var toggle = host.querySelector(".menu-toggle");
    toggle.addEventListener("click", function () {
      var open = !host.classList.contains("menu-open");
      host.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    host.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { host.classList.remove("menu-open"); });
    });
    var onScroll = function () { host.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function footer() {
    var host = document.querySelector("[data-site-footer]");
    if (!host) return;
    host.className = "site-footer";
    var contact = cfg.contactEmail
      ? '<a href="mailto:' + cfg.contactEmail + '">' + cfg.contactEmail + "</a>"
      : '<a href="' + link("#pricing") + '" data-contact>Contact sales</a>';
    host.innerHTML =
      '<div class="wrap"><div class="footer-grid">' +
      '<div><a class="brand" href="index.html">' + LOGO + "MyCraftingAI</a>" +
      '<p style="margin-top:14px;max-width:34ch">A desktop app that writes, paints and runs Minecraft mods from plain English.</p></div>' +
      '<div><h4>Product</h4><a href="download.html">Download</a><a href="' + link("#demo") + '">How it works</a><a href="' + link("#tour") + '">Features</a><a href="' + link("#pricing") + '">Pricing</a><a href="' + link("#faq") + '">FAQ</a></div>' +
      '<div><h4>Account</h4><a href="login.html">Sign in</a><a href="signup.html">Create account</a><a href="forgot.html">Reset password</a><a href="account.html">Your plan</a></div>' +
      '<div><h4>Company</h4>' + contact + '<a href="terms.html">Terms of Service</a><a href="privacy.html">Privacy Policy</a>' +
      '<a href="privacy.html#cookies">Cookie Policy</a><a href="#" data-cookie-settings>Cookie settings</a></div>' +
      "</div>" +
      '<div class="footer-bottom"><span>&copy; ' + new Date().getFullYear() + " MyCraftingAI</span>" +
      "<span>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</span></div></div>";
  }

  function reveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach(function (el) { el.classList.add("in"); }); return; }
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); seen.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { seen.observe(el); });
  }

  function previewBanner() {
    var api = window.MCA && window.MCA.api;
    if (!api || api.mode !== "preview" || document.querySelector(".preview-banner")) return;
    var tag = document.createElement("div");
    tag.className = "preview-banner";
    tag.textContent = "Preview mode - accounts are simulated in this browser only";
    document.body.appendChild(tag);
  }

  /** Swap "Sign in / Start free" for the account chip when a session exists. */
  function accountChip() {
    var slot = document.querySelector("[data-account-slot]");
    var api = window.MCA && window.MCA.api;
    if (!slot || !api || api.mode === "offline") return;
    api.me().then(function (me) {
      var name = (me.user && (me.user.name || me.user.email)) || "Account";
      slot.innerHTML =
        '<a class="account-chip" href="account.html"><span class="avatar">' +
        escapeHtml(name.charAt(0).toUpperCase()) + "</span>" + escapeHtml(me.plan ? me.plan.name : "Account") + "</a>";
    }, function () { /* signed out: keep the buttons */ });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Minimal accessible modal: MCA.modal(title, body, [{label, primary, href, onClick}]). */
  function modal(title, body, actions) {
    var host = document.getElementById("mca-modal");
    if (!host) {
      host = document.createElement("div");
      host.id = "mca-modal";
      host.className = "modal";
      host.setAttribute("role", "dialog");
      host.setAttribute("aria-modal", "true");
      host.innerHTML = '<div class="modal-card"><h3></h3><p></p><div class="actions"></div></div>';
      host.addEventListener("click", function (e) { if (e.target === host) close(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
      document.body.appendChild(host);
    }
    function close() { host.classList.remove("open"); }
    host.querySelector("h3").textContent = title;
    host.querySelector("p").textContent = body;
    var row = host.querySelector(".actions");
    row.innerHTML = "";
    (actions && actions.length ? actions : [{ label: "Close" }]).forEach(function (a) {
      var el = document.createElement(a.href ? "a" : "button");
      el.className = "btn" + (a.primary ? " btn-primary" : "");
      el.textContent = a.label;
      if (a.href) el.href = a.href;
      el.addEventListener("click", function () { if (a.onClick) a.onClick(); if (!a.href) close(); });
      row.appendChild(el);
    });
    host.classList.add("open");
    var first = row.querySelector(".btn");
    if (first) first.focus();
  }

  function contactLinks() {
    document.addEventListener("click", function (e) {
      var target = e.target.closest("[data-contact]");
      if (!target) return;
      e.preventDefault();
      if (cfg.contactEmail) { location.href = "mailto:" + cfg.contactEmail + "?subject=MyCraftingAI%20Enterprise"; return; }
      modal("Talk to us", "Our sales inbox is being set up. Leave this page open in a tab or check back in a few days - the address will appear right here.");
    });
  }

  /* ------------------------------------------------------ cookie consent
   * Essential storage (sign-in session, security, this choice) is always on.
   * Optional categories stay OFF until the visitor says yes; scripts that
   * would use them must check MCA.consent.allows("analytics") or listen for
   * the "mca:consent" event. The choice is kept for 12 months. */
  var CONSENT_KEY = "mca_cookie_consent";
  /* v2 added "advertising" (personalised ads on the download and unlock
     pages), so everyone is asked again once. */
  var CONSENT_VERSION = 2;
  var CONSENT_DAYS = 365;

  function readConsent() {
    try {
      var raw = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (!raw || raw.v !== CONSENT_VERSION) return null;
      if (Date.now() - (raw.at || 0) > CONSENT_DAYS * 864e5) return null;
      return raw;
    } catch (e) { return null; }
  }

  function saveConsent(prefs, analytics, advertising) {
    var value = {
      v: CONSENT_VERSION, at: Date.now(), essential: true,
      preferences: !!prefs, analytics: !!analytics, advertising: !!advertising
    };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(value)); } catch (e) { /* private mode: ask again next time */ }
    window.MCA.consent.current = value;
    try { document.dispatchEvent(new CustomEvent("mca:consent", { detail: value })); } catch (e) { /* old browser */ }
    return value;
  }

  function consentBanner(force) {
    var existing = document.getElementById("cookie-banner");
    if (existing) existing.remove();
    var current = readConsent();
    if (current && !force) return;
    var bar = document.createElement("section");
    bar.id = "cookie-banner";
    bar.className = "cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-label", "Cookie preferences");
    bar.innerHTML =
      '<div class="cookie-main">' +
      '<div class="cookie-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5Zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 15.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg></div>' +
      '<div class="cookie-text"><b>We value your privacy</b>' +
      '<p>We use essential cookies to keep you signed in and to protect your account. With your permission we\'d also use optional cookies to remember your preferences, understand how the site is used and show personalised ads on our download and unlock pages. ' +
      'Read our <a href="privacy.html#cookies">Cookie Policy</a>.</p></div>' +
      '<div class="cookie-actions">' +
      '<button class="btn btn-ghost" type="button" data-consent="custom">Customize</button>' +
      '<button class="btn" type="button" data-consent="essential">Essential only</button>' +
      '<button class="btn btn-primary" type="button" data-consent="all">Accept all</button>' +
      "</div></div>" +
      '<div class="cookie-options" hidden>' +
      '<label class="cookie-opt"><span><b>Essential</b><small>Sign-in, security and remembering this choice. The site can\'t work without them.</small></span><em>Always on</em></label>' +
      '<label class="cookie-opt"><span><b>Preferences</b><small>Remember choices such as the last tab or section you opened.</small></span>' +
      '<span class="switch"><input type="checkbox" data-opt="preferences"><i></i></span></label>' +
      '<label class="cookie-opt"><span><b>Analytics</b><small>Anonymous statistics that help us improve pages. Off unless you allow it.</small></span>' +
      '<span class="switch"><input type="checkbox" data-opt="analytics"><i></i></span></label>' +
      '<label class="cookie-opt"><span><b>Personalised advertising</b><small>Lets Google and its partners use cookies to show ads based on your interests on the download and unlock pages. If this is off, those pages show non-personalised ads.</small></span>' +
      '<span class="switch"><input type="checkbox" data-opt="advertising"><i></i></span></label>' +
      '<div class="cookie-actions"><button class="btn btn-primary" type="button" data-consent="save">Save choices</button></div>' +
      "</div>";
    document.body.appendChild(bar);
    if (current) {
      bar.querySelector('[data-opt="preferences"]').checked = !!current.preferences;
      bar.querySelector('[data-opt="analytics"]').checked = !!current.analytics;
      bar.querySelector('[data-opt="advertising"]').checked = !!current.advertising;
    }
    requestAnimationFrame(function () { bar.classList.add("show"); });
    function close() {
      bar.classList.remove("show");
      setTimeout(function () { bar.remove(); }, 300);
    }
    bar.addEventListener("click", function (e) {
      var button = e.target.closest("[data-consent]");
      if (!button) return;
      var choice = button.dataset.consent;
      if (choice === "custom") {
        var box = bar.querySelector(".cookie-options");
        box.hidden = !box.hidden;
        bar.classList.toggle("expanded", !box.hidden);
        return;
      }
      if (choice === "all") saveConsent(true, true, true);
      else if (choice === "essential") saveConsent(false, false, false);
      else saveConsent(
        bar.querySelector('[data-opt="preferences"]').checked,
        bar.querySelector('[data-opt="analytics"]').checked,
        bar.querySelector('[data-opt="advertising"]').checked
      );
      close();
    });
    if (force) {
      var custom = bar.querySelector('[data-consent="custom"]');
      if (custom) custom.click();
    }
  }

  /* ------------------------------------------------------------- effects
   * 1. A soft light follows the cursor and lights up the pixel grid under it.
   * 2. Cards light their edges (and a faint inner glow) where the cursor is.
   * 3. A few tiny "pixel" sparks trail fast mouse moves - block-game flavour.
   * Off for touch screens and for people who ask for reduced motion. */
  function effects() {
    var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var root = document.documentElement;

    var cards = ".plan, .card, .tour-tab, .fact, .cta-box, .calc, .bench, .shot, .auth-card, .download-card";
    // Matched on the fly: pricing cards and others are drawn after page load.
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(cards);
      if (!card) return;
      if (!card.classList.contains("glow-card")) card.classList.add("glow-card");
      var box = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - box.left) + "px");
      card.style.setProperty("--my", (e.clientY - box.top) + "px");
    }, { passive: true });

    if (!fine || calm) return;
    root.classList.add("fx-on");
    var glow = document.createElement("div");
    glow.className = "cursor-light";
    glow.setAttribute("aria-hidden", "true");
    var grid = document.createElement("div");
    grid.className = "cursor-grid";
    grid.setAttribute("aria-hidden", "true");
    document.body.appendChild(grid);
    document.body.appendChild(glow);

    var x = innerWidth / 2, y = innerHeight / 3, tx = x, ty = y, raf = 0, lastSpark = 0, lastX = x, lastY = y;
    var colours = ["#8aa0ff", "#4f63f5", "#3dd68c", "#f5b74a", "#b79cff"];
    function frame() {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      root.style.setProperty("--cx", x.toFixed(1) + "px");
      root.style.setProperty("--cy", y.toFixed(1) + "px");
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(frame) : 0;
    }
    document.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      root.classList.add("fx-active");
      if (!raf) raf = requestAnimationFrame(frame);
      var now = performance.now(), speed = Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      if (speed > 26 && now - lastSpark > 45 && !e.target.closest("input, textarea, select, .pixel-grid, #grid")) {
        lastSpark = now;
        var spark = document.createElement("i");
        spark.className = "pixel-spark";
        spark.style.left = e.clientX + "px";
        spark.style.top = e.clientY + "px";
        spark.style.background = colours[Math.floor(Math.random() * colours.length)];
        spark.style.setProperty("--dx", (Math.random() * 40 - 20).toFixed(0) + "px");
        spark.style.setProperty("--dy", (Math.random() * 30 + 14).toFixed(0) + "px");
        document.body.appendChild(spark);
        setTimeout(function () { spark.remove(); }, 750);
      }
    }, { passive: true });
    document.addEventListener("pointerleave", function () { root.classList.remove("fx-active"); });
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget) root.classList.remove("fx-active"); });
  }

  /** Legal pages: highlight the section being read in the side list. */
  function legalToc() {
    var links = document.querySelectorAll(".legal-toc a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("active"); });
        var a = byId[entry.target.id];
        if (a) a.classList.add("active");
      });
    }, { rootMargin: "-90px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  /* ------------------------------------------------------ seasonal look
   * Theme, promotion and banner come from the admin panel (Live settings) via
   * GET /v1/public/site. The last answer is cached so the next page opens in
   * the right colours straight away. ?theme=<id> previews a theme locally. */
  var LOOK_KEY = "mca_site_look";
  var THEME_IDS = ["classic", "halloween", "black_friday", "cyber_monday", "autumn", "christmas", "winter",
    "new_year", "valentines", "spring", "easter", "summer"];
  var FX = {
    halloween: { items: ["🦇", "🎃", "👻", "🦇"], n: 12 },
    black_friday: { items: ["🏷️", "🛍️", "💸"], n: 8 },
    cyber_monday: { items: ["⚡", "💻", "⚡"], n: 9 },
    autumn: { items: ["🍂", "🍁", "🍂"], n: 14 },
    christmas: { items: ["❄️", "❄️", "🎄", "🎁", "❄️"], n: 18 },
    winter: { items: ["❄️", "❅", "❆"], n: 20 },
    new_year: { items: ["🎉", "✨", "🎆", "✨"], n: 12, rise: true },
    valentines: { items: ["💖", "💕", "💗"], n: 12, rise: true },
    spring: { items: ["🌸", "🌷", "🌸"], n: 12 },
    easter: { items: ["🥚", "🐣", "🌷"], n: 10 },
    summer: { items: ["☀️", "🌴", "🍉"], n: 8, rise: true }
  };
  var GREET = {
    halloween: ["🎃", "Happy Halloween from MyCraftingAI"],
    black_friday: ["🏷️", "Black Friday at MyCraftingAI"],
    cyber_monday: ["⚡", "Cyber Monday at MyCraftingAI"],
    autumn: ["🍂", "Cosy autumn modding"],
    christmas: ["🎄", "Merry Christmas from MyCraftingAI"],
    winter: ["❄️", "Winter modding season"],
    new_year: ["🎆", "Happy New Year from MyCraftingAI"],
    valentines: ["💖", "Happy Valentine's Day"],
    spring: ["🌸", "Spring is here"],
    easter: ["🐣", "Happy Easter from MyCraftingAI"],
    summer: ["☀️", "Summer modding season"]
  };

  function previewTheme() {
    var m = /[?&]theme=([a-z_]+)/.exec(location.search);
    return m && THEME_IDS.indexOf(m[1]) >= 0 ? m[1] : "";
  }
  function cachedLook() {
    try { return JSON.parse(localStorage.getItem(LOOK_KEY) || "null"); } catch (e) { return null; }
  }
  function isAdminPage() { return document.body && document.body.dataset.page === "admin"; }

  function setTheme(look) {
    var theme = previewTheme() || (look && look.theme) || "classic";
    if (THEME_IDS.indexOf(theme) < 0 || isAdminPage()) theme = "classic";
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function themeEffects(theme, on) {
    var old = document.querySelector(".theme-fx");
    if (old) old.remove();
    var spec = FX[theme];
    if (!spec || !on || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    var layer = document.createElement("div");
    layer.className = "theme-fx" + (spec.rise ? " float" : "");
    layer.setAttribute("aria-hidden", "true");
    var count = window.innerWidth < 700 ? Math.ceil(spec.n / 2) : spec.n;
    for (var i = 0; i < count; i++) {
      var el = document.createElement("i");
      el.textContent = spec.items[i % spec.items.length];
      el.style.left = (Math.random() * 100).toFixed(1) + "%";
      el.style.fontSize = (12 + Math.random() * 14).toFixed(0) + "px";
      el.style.animationDuration = (11 + Math.random() * 12).toFixed(1) + "s";
      el.style.animationDelay = (-Math.random() * 20).toFixed(1) + "s";
      el.style.setProperty("--sway", (Math.random() * 80 - 40).toFixed(0) + "px");
      layer.appendChild(el);
    }
    document.body.appendChild(layer);
  }

  function seasonStrip(theme, look) {
    var old = document.querySelector(".season-strip");
    if (old) old.remove();
    var promo = look && look.promotion;
    var greet = GREET[theme];
    if (!greet && !promo) return;
    var key = "mca_strip_dismissed", id = theme + "|" + (promo ? JSON.stringify(promo.plans) + promo.label : "");
    try { if (localStorage.getItem(key) === id) return; } catch (e) { /* private mode */ }
    var planIds = promo ? (Array.isArray(promo.plans) ? promo.plans : Object.keys(promo.plans || {})) : [];
    var plans = planIds.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(", ");
    var codes = promo && !Array.isArray(promo.plans) ? planIds.map(function (p) { return promo.plans[p].code; }) : [];
    var oneCode = promo && (Array.isArray(promo.plans) ? promo.code : (codes.every(function (c) { return c === codes[0]; }) ? codes[0] : ""));
    var maxPct = promo ? (promo.maxPercent || promo.percent) : 0, minPct = promo ? (promo.minPercent || promo.percent) : 0;
    var bar = document.createElement("div");
    bar.className = "season-strip";
    bar.innerHTML = '<div class="wrap">' +
      (greet ? '<span class="em" aria-hidden="true">' + greet[0] + "</span><span><b>" + escapeHtml(greet[1]) + "</b></span>" : "") +
      (promo ? "<span>" + (greet ? "&middot; " : "") + "<b>" + escapeHtml(promo.label) + ":</b> " +
        (maxPct === minPct ? maxPct + "% off " : "up to " + maxPct + "% off ") + escapeHtml(plans) +
        (oneCode ? ' with code <span class="code">' + escapeHtml(oneCode) + "</span>" : " &middot; codes added at checkout") +
        (promo.terms ? " &middot; " + escapeHtml(promo.terms) : "") + "</span>" +
        '<a class="go" href="index.html#pricing">See plans &rarr;</a>' : "") +
      '<button type="button" aria-label="Hide">&times;</button></div>';
    bar.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem(key, id); } catch (e) { /* ignore */ }
      bar.remove();
    });
    var header = document.querySelector("[data-site-header]");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
  }

  function applyLook(look) {
    window.MCA.look = look || {};
    var theme = setTheme(look);
    if (isAdminPage()) return;
    themeEffects(theme, !look || look.effects !== false);
    seasonStrip(theme, look);
    try { document.dispatchEvent(new CustomEvent("mca:look", { detail: window.MCA.look })); } catch (e) { /* old browser */ }
  }

  // Right away (before the first paint) from the cached answer.
  window.MCA = window.MCA || {};
  setTheme(cachedLook());

  function siteLook() {
    var api = window.MCA && window.MCA.api;
    var cached = cachedLook();
    applyLook(cached || { theme: "classic" });
    if (!api || !api.site) return;
    api.site().then(function (look) {
      try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* private mode */ }
      if (JSON.stringify(look) !== JSON.stringify(cached)) applyLook(look);
      announcementBar(look && look.announcement);
    }, function () { /* keep the cached look */ });
  }

  /** Banner set from the admin panel (Settings > Announcement). Dismissable. */
  function announcementBar(a) {
    if (isAdminPage()) return;
    (function () {
      if (!a || !a.text) return;
      var key = "mca_notice_dismissed";
      try { if (localStorage.getItem(key) === String(a.id || a.text)) return; } catch (e) { /* private mode */ }
      var bar = document.createElement("div");
      bar.className = "site-notice " + (a.level || "info");
      bar.setAttribute("role", "status");
      var link = a.link && /^(https:\/\/|\/)/.test(a.link)
        ? ' <a href="' + escapeHtml(a.link) + '">' + escapeHtml(a.linkText || "Learn more") + " &rarr;</a>" : "";
      bar.innerHTML = '<div class="wrap"><span>' + escapeHtml(a.text) + link + '</span>' +
        '<button type="button" aria-label="Dismiss">&times;</button></div>';
      bar.querySelector("button").addEventListener("click", function () {
        try { localStorage.setItem(key, String(a.id || a.text)); } catch (e) { /* ignore */ }
        bar.remove();
      });
      var header = document.querySelector("[data-site-header]");
      if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
      else document.body.insertBefore(bar, document.body.firstChild);
    })();
  }

  function cookieSettingsLinks() {
    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-cookie-settings]");
      if (!link) return;
      e.preventDefault();
      consentBanner(true);
    });
  }

  window.MCA = window.MCA || {};
  window.MCA.consent = {
    current: readConsent(),
    allows: function (kind) { var c = readConsent(); return kind === "essential" || !!(c && c[kind]); },
    open: function () { consentBanner(true); }
  };
  window.MCA.modal = modal;
  window.MCA.escapeHtml = escapeHtml;
  window.MCA.formatTokens = function (n) {
    if (n === null || n === undefined) return "Custom";
    if (n >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "M";
    if (n >= 1e3) return (n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K";
    return String(n);
  };

  document.addEventListener("DOMContentLoaded", function () {
    header();
    footer();
    reveal();
    previewBanner();
    accountChip();
    contactLinks();
    cookieSettingsLinks();
    legalToc();
    siteLook();
    setTimeout(function () { consentBanner(false); }, 700);
    effects();
  });
})();

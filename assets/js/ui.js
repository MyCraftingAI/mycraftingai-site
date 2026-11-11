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
      '<div><h4>Company</h4>' + contact + '<a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></div>' +
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

  window.MCA = window.MCA || {};
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
  });
})();

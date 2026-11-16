/* About page > Supported versions: renders data/versions.json, which
   tools/export_versions.py writes from the reference library the desktop app
   ships with - so this list is exactly what the app offers. */
(function () {
  "use strict";
  var grid = document.querySelector("[data-kb-grid]");
  if (!grid) return;
  var summary = document.querySelector("[data-kb-summary]");
  var note = document.querySelector("[data-kb-note]");
  var BLURB = {
    forge: "The classic loader - from 1.7.10 to the year-based 26.x releases.",
    neoforge: "The modern Forge successor, recommended for new mods.",
    fabric: "Lightweight and fast to update. Fabric builds also run on Quilt Loader."
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* "1.21.11" -> "1.21", "26.1.2" -> "26.x" */
  function lineOf(v) {
    var p = String(v).split(".");
    return p[0] === "1" ? p[0] + "." + (p[1] || "0") : p[0] + ".x";
  }
  function groups(versions) {
    var out = [], index = {};
    versions.forEach(function (v) {
      var key = lineOf(v.minecraft);
      if (!(key in index)) { index[key] = out.length; out.push({ line: key, items: [] }); }
      out[index[key]].items.push(v.minecraft);
    });
    return out;
  }
  function card(l) {
    return '<article class="kb-card">' +
      '<div class="kb-head"><h3>' + esc(l.label) + '</h3><span class="kb-count">' + l.count + " versions</span></div>" +
      '<p class="kb-range">' + esc(l.oldest) + " &ndash; " + esc(l.newest) + "</p>" +
      '<p class="kb-blurb">' + esc(BLURB[l.id] || "") + "</p>" +
      '<div class="kb-lines">' + groups(l.versions).map(function (g) {
        return '<div class="kb-line"><span class="kb-line-name">' + esc(g.line) + '</span><span class="kb-vs">' +
          g.items.map(function (v) { return '<span class="kb-v">' + esc(v) + "</span>"; }).join("") + "</span></div>";
      }).join("") + "</div></article>";
  }

  fetch("data/versions.json?" + Date.now(), { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    var loaders = (d.loaders || []).filter(function (l) { return l.count; });
    var main = loaders.filter(function (l) { return l.id !== "quilt"; });
    var quilt = loaders.filter(function (l) { return l.id === "quilt"; })[0];
    var all = [];
    main.forEach(function (l) { l.versions.forEach(function (v) { if (all.indexOf(v.minecraft) < 0) all.push(v.minecraft); }); });
    var total = main.reduce(function (s, l) { return s + l.count; }, 0);
    if (summary) {
      summary.innerHTML =
        '<div class="kb-stat"><b>' + total + "</b><span>loader versions you can pick</span></div>" +
        '<div class="kb-stat"><b>' + all.length + "</b><span>Minecraft versions</span></div>" +
        '<div class="kb-stat"><b>' + main.length + "</b><span>mod loaders, plus datapacks</span></div>" +
        '<div class="kb-stat"><b>' + esc(d.appVersion ? "v" + d.appVersion : "-") + "</b><span>app version this list is for</span></div>";
    }
    grid.innerHTML = main.map(card).join("");
    if (note) {
      note.textContent = (quilt ? "Quilt projects you open get the Quilt guides for " + quilt.oldest + " to " + quilt.newest + ". " : "") +
        "Datapacks work on every version. New Minecraft releases are added in app updates, once their guides have been built and checked." +
        (d.libraryBuilt ? " Library updated " + d.libraryBuilt + "." : "");
    }
  }).catch(function () {
    grid.innerHTML = '<p class="kb-note">Forge 1.7.10 to 26.x, NeoForge 1.20.2 to 26.x and Fabric 1.14.3 to 26.x. The full list couldn\'t be loaded right now - please refresh the page.</p>';
  });
})();

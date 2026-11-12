/* Download page: a short preparation countdown, then the installer download.
   The download always starts on its own when the countdown ends - ads on this
   page are never required for it, and there is always a direct link. */
(function () {
  "use strict";

  var cfg = window.MCA_CONFIG || {};
  var delay = Math.max(3, Math.min(30, Number((cfg.ads || {}).downloadDelay) || 10));
  function $(s) { return document.querySelector(s); }
  function track(name) { if (window.MCA && MCA.api && MCA.api.track) MCA.api.track(name); }
  function esc(t) { return window.MCA && MCA.escapeHtml ? MCA.escapeHtml(String(t)) : String(t); }

  var ring = $("[data-ring]"), count = $("[data-count]"), bar = $("[data-bar]"), fill = bar.querySelector("i");
  var title = $("[data-state-title]"), text = $("[data-state-text]");

  function step(n, state) {
    var li = document.querySelector('[data-step="' + n + '"]');
    if (li) { li.classList.remove("active", "ok"); if (state) li.classList.add(state); }
  }

  function notesHtml(notes) {
    var lines = String(notes || "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return "<p>Bug fixes and improvements.</p>";
    var items = lines.map(function (line) {
      var body = esc(line.replace(/^\s*[-*]\s+/, "")).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      return "<li>" + body + "</li>";
    });
    return "<ul>" + items.join("") + "</ul>";
  }

  function unavailable(message) {
    step(1, "ok");
    ring.classList.add("done");
    count.textContent = "!";
    title.textContent = "The Windows download opens soon";
    text.innerHTML = esc(message || "We're putting the finishing touches on the installer.") +
      ' <a class="direct" href="signup.html">Create your free account</a> now and you\'re ready on day one.';
    bar.hidden = true;
  }

  function start(manifest) {
    // The countdown only runs while this page is in front: switching to another
    // tab or program pauses it, so the page is seen for the whole wait.
    var watched = 0, last = Date.now(), pausedOnce = false;
    var attention = window.MCA && MCA.attention;
    step(1, "ok");
    step(2, "active");
    $("[data-get-title]").textContent = "Preparing your download";
    $("[data-get-sub]").textContent = "MyCraftingAI " + manifest.version + " for Windows 10 & 11 (64-bit)";
    $("[data-file]").textContent = "MyCraftingAI-Setup.exe";
    if (manifest.size) $("[data-size]").textContent = "· " + (manifest.size / 1048576).toFixed(0) + " MB";
    if (manifest.sha256) $("[data-hash]").textContent = "SHA-256 " + manifest.sha256;
    $("[data-direct]").href = manifest.url;
    $("[data-notes]").innerHTML = notesHtml(manifest.notes);

    function tick() {
      var now = Date.now();
      var visible = !attention || attention.active();
      // Count at most 0.5 s per step, so a throttled background timer adds nothing.
      if (visible) watched += Math.min(0.5, (now - last) / 1000);
      last = now;
      var p = Math.min(1, watched / delay);
      ring.style.setProperty("--p", (p * 100).toFixed(1));
      fill.style.width = (p * 100).toFixed(1) + "%";
      ring.classList.toggle("paused", !visible);
      bar.classList.toggle("paused", !visible);
      var left = Math.max(0, Math.ceil(delay - watched));
      count.textContent = visible ? String(left) : "II";
      if (!visible && !pausedOnce) { pausedOnce = true; track("download.paused"); }
      if (!visible) {
        title.textContent = "Paused";
        text.textContent = "Come back to this page to continue. Your download starts after " + left + " more second" + (left === 1 ? "" : "s") + " here.";
        setTimeout(tick, 200);
        return;
      }
      title.textContent = left > 0 ? "Your download starts in " + left + " second" + (left === 1 ? "" : "s") : "Starting your download";
      text.textContent = p < 0.6 ? "We're preparing the latest signed release for you." : "Almost ready - the installer will save to your Downloads folder.";
      if (p >= 0.6) { step(2, "ok"); step(3, "active"); }
      if (p < 1) { setTimeout(tick, 100); return; }
      finish(manifest);
    }
    tick();
  }

  function finish(manifest) {
    step(2, "ok");
    step(3, "ok");
    ring.classList.add("done");
    bar.classList.add("done");
    count.innerHTML = "&#10003;";
    title.textContent = "Your download has started";
    text.textContent = "Open MyCraftingAI-Setup.exe when it finishes to install the app.";
    $("[data-after]").classList.add("show");
    track("download.start");
    // The GitHub release asset is sent as an attachment, so the browser saves it
    // and this page stays open with the install steps.
    var link = document.createElement("a");
    link.href = manifest.url;
    link.setAttribute("download", "");
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  document.addEventListener("DOMContentLoaded", function () {
    step(1, "active");
    track("download.view");
    if (window.MCA && MCA.ads) MCA.ads.display();
    fetch("latest.json?" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    }).then(function (m) {
      if (m && m.available && /^https:\/\//.test(m.url || "")) start(m);
      else unavailable("");
    }).catch(function () { unavailable(""); });
  });
})();

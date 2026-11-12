/*
 * Unlock page: the MyCraftingAI app opens unlock.html#t=<ticket> for a Free
 * account. The visitor chooses to watch one Google rewarded ad; when the ad
 * reports the reward, the server marks the ticket granted and the app unlocks
 * on its own. If no ad is available, a short MyCraftingAI message plays instead.
 *
 * The ticket is a single-use capability: it is read from the URL fragment
 * (never sent to the web server in a request line), then removed from the
 * address bar and kept only for this tab.
 */
(function () {
  "use strict";

  var api = window.MCA && MCA.api;
  var card = document.querySelector("[data-unlock]");
  var KEY = "mca_unlock_ticket";
  var ticket = "";
  var info = null;
  var source = "";  // "google" (rewarded ad) or "house" (our own message), sent with the claim

  /** Anonymous page counter; never allowed to break the page. */
  function track(name) {
    try { if (api && api.track) api.track(name); } catch (e) { /* ignore */ }
  }

  var ICONS = {
    lock: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H9V7a3 3 0 0 1 5.8-1.1 1 1 0 1 0 1.9-.6A5 5 0 0 0 12 2Z"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    err: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v7h-2V7Zm0 9h2v2h-2v-2Z"/></svg>'
  };

  function esc(t) { return MCA.escapeHtml ? MCA.escapeHtml(String(t == null ? "" : t)) : String(t); }

  function render(icon, kind, html) {
    card.innerHTML = '<div class="unlock-icon ' + (kind || "") + '" aria-hidden="true">' + ICONS[icon] + "</div>" + html;
  }

  function readTicket() {
    var match = /(?:^|[#&])t=([A-Za-z0-9_-]{24,96})/.exec(location.hash || "");
    if (match) {
      try { sessionStorage.setItem(KEY, match[1]); } catch (e) { /* private mode */ }
      try { history.replaceState(null, "", location.pathname); } catch (e) { /* old browser */ }
      return match[1];
    }
    try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }

  function failed(title, message) {
    stopBeats();
    run++;
    render("err", "err",
      "<h1>" + esc(title) + "</h1>" +
      '<p class="lede">' + esc(message) + "</p>" +
      '<div class="unlock-actions"><a class="btn" href="index.html">Go to the homepage</a></div>');
  }

  function fromError(err) {
    var code = err && err.code;
    if (code === "ticket_not_found") return failed("This unlock link has expired", "Unlock links work once and for 30 minutes. In MyCraftingAI, press Build & Run or open Texture Studio again to get a new one.");
    if (code === "reward_limit") return failed("Daily limit reached", err.message || "You've used today's ad unlocks. They reset at 00:00 UTC.");
    if (code === "not_live") return failed("Unlocks open soon", "This page works once accounts are live.");
    failed("Something went wrong", (err && err.message) || "Please try again from the app.");
  }

  function intro(notice) {
    var title = info.kind === "build" ? "Unlock Build & Run" : "Unlock Texture Studio";
    var lede = info.kind === "build"
      ? "Watch one short ad and MyCraftingAI unlocks one Build & Run: compile your mod, launch Minecraft and fix errors automatically."
      : "Watch one short ad and MyCraftingAI unlocks Texture Studio and the pixel-art AI for " + esc(info.reward.replace(/ of Texture Studio$/, "")) + ".";
    render("lock", "",
      "<h1>" + title + "</h1>" +
      '<p class="lede">' + lede + "</p>" +
      '<span class="unlock-reward">You get: ' + esc(info.reward) + "</span>" +
      (notice ? '<p class="lede" style="color:var(--amber);margin-top:14px">' + esc(notice) + "</p>" : "") +
      '<div class="unlock-actions">' +
      '<button class="btn btn-primary btn-lg" type="button" data-watch>Watch a short ad</button>' +
      '<a class="btn btn-ghost" href="index.html#pricing">Or upgrade for no ads</a></div>' +
      '<div class="unlock-steps">' +
      "<div><b>1 · Watch</b>Watch the ad to the end. Keep this page in front: the timer pauses if you switch away.</div>" +
      "<div><b>2 · Unlock</b>We confirm it and unlock your app automatically.</div>" +
      "<div><b>3 · Create</b>Go back to MyCraftingAI. No need to keep this page.</div></div>");
    card.querySelector("[data-watch]").addEventListener("click", watch);
  }

  /* ---- watching only counts while this page is in front ------------------
     A heartbeat goes to the server every 2 s while the page is visible and
     focused; the server adds up only those seconds and refuses the reward
     until enough were seen. Bars on this page pause the same way. */
  var attention = window.MCA && MCA.attention;
  var beatTimer = 0, beatBusy = false, run = 0;

  function visible() { return !attention || attention.active(); }

  function beat() {
    if (beatBusy || !ticket || !visible()) return;
    beatBusy = true;
    api.rewards.beat(ticket).then(function () { beatBusy = false; }, function () { beatBusy = false; });
  }

  function startBeats() {
    if (beatTimer) return;
    beatTimer = setInterval(beat, 2000);
    if (attention) attention.onChange(function (on) { if (on && beatTimer) beat(); });
  }

  function stopBeats() {
    clearInterval(beatTimer);
    beatTimer = 0;
  }

  function progress(seconds, label, done) {
    var mine = ++run;  // a newer progress bar replaces this one
    var watched = 0, last = Date.now();
    var bar = card.querySelector("[data-progress] i");
    var holder = card.querySelector("[data-progress]");
    var text = card.querySelector("[data-progress] small");
    (function tick() {
      if (mine !== run) return;
      var now = Date.now(), on = visible();
      if (on) watched += Math.min(0.5, (now - last) / 1000);
      last = now;
      var p = Math.min(1, watched / seconds);
      if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
      if (holder) holder.querySelector(".get-bar").classList.toggle("paused", !on);
      if (text) {
        text.classList.toggle("paused-note", !on);
        text.textContent = on
          ? label + " · " + Math.max(0, Math.ceil(seconds * (1 - p))) + "s"
          : "Paused - come back to this page to continue";
      }
      if (p < 1) setTimeout(tick, 100); else done();
    })();
  }

  function loading() {
    render("play", "",
      "<h1>Loading a short ad&hellip;</h1>" +
      '<p class="lede">The ad opens on top of this page. Watch it to the end to get your reward.</p>' +
      '<div class="unlock-progress"><div class="get-bar"><i style="width:35%;animation:none"></i></div><small>Requesting an ad from Google</small></div>');
  }

  function sponsor(seconds) {
    source = "house";
    track("unlock.house");
    render("play", "",
      "<h1>A short message from MyCraftingAI</h1>" +
      '<p class="lede">No ad is available for you right now, so here is a quick note from us instead. Your unlock is on its way.</p>' +
      '<div class="unlock-sponsor"><span class="ad-label">From MyCraftingAI</span>' +
      "<b>Builder unlocks every tool, with no ads</b>" +
      "<p>Texture Studio and Build & Run whenever you need them, Low and Normal thinking, and 100,000 tokens every day for $5.75 a month.</p>" +
      '<a class="btn btn-ghost btn-sm" href="index.html#pricing" target="_blank" rel="noopener">See plans</a></div>' +
      '<div class="unlock-progress" data-progress><div class="get-bar"><i></i></div><small></small></div>');
    progress(seconds, "Unlocking soon", claim);
  }

  function claiming(seconds) {
    render("play", "",
      "<h1>Finishing up&hellip;</h1>" +
      '<p class="lede">Thanks for watching. We\'re confirming your reward.</p>' +
      '<div class="unlock-progress" data-progress><div class="get-bar"><i></i></div><small></small></div>');
    progress(seconds, "Confirming", claim);
  }

  function done() {
    stopBeats();
    run++;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    render("ok", "ok",
      "<h1>Unlocked</h1>" +
      '<p class="lede">Go back to MyCraftingAI: your ' + esc(info.reward) + " is ready and the app has already updated. You can close this tab.</p>" +
      '<span class="unlock-reward" style="background:rgba(61,214,140,.12);border-color:rgba(61,214,140,.3);color:#9df0c4">Thanks for supporting MyCraftingAI</span>');
  }

  function claim() {
    api.rewards.complete(ticket, source).then(function (r) {
      if (r && r.status === "granted") done(); else claiming(3);
    }, function (err) {
      if (err && err.code === "too_early") {
        var wait = Number((err.data || {}).retryAfter) || 3;
        claiming(Math.min(30, Math.max(1, wait)));
        return;
      }
      fromError(err);
    }).catch(unexpected);
  }

  function watch(e) {
    var button = e.currentTarget;
    button.disabled = true;
    button.textContent = "Starting…";
    api.rewards.start(ticket).then(function (r) {
      info = r || info;
      if (info.status === "granted") { done(); return; }
      startBeats();
      var fallbackSeconds = Math.max(5, Number(info.secondsLeft) || Number(info.minSeconds) || 15);
      if (!(MCA.ads && MCA.ads.rewardedConfigured)) { sponsor(fallbackSeconds); return; }
      loading();
      MCA.ads.rewarded({
        ready: function () {
          source = "google";
          track("unlock.google");
          render("play", "", "<h1>Ad playing</h1><p class=\"lede\">Watch to the end to unlock your reward.</p>");
        },
        granted: claim,
        closed: function () { stopBeats(); track("unlock.closed"); intro("The ad was closed before the end, so nothing was unlocked yet. You can try again."); },
        unavailable: function () { sponsor(fallbackSeconds); }
      });
    }, fromError).catch(unexpected);
  }

  /** Anything unexpected: say so and offer a retry, never hang on "Loading". */
  function unexpected(err) {
    stopBeats();
    run++;
    if (window.console && console.error) console.error("Unlock page error:", err);
    render("err", "err",
      "<h1>Something went wrong</h1>" +
      '<p class="lede">The unlock page hit a problem. Your unlock link still works - try again.</p>' +
      '<div class="unlock-actions"><button class="btn btn-primary" type="button" data-retry>Try again</button></div>');
    var retry = card.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", function () { location.reload(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    ticket = readTicket();
    if (!ticket) {
      failed("Open this page from the app", "In MyCraftingAI on the Free plan, press Build & Run or open Texture Studio and choose Watch ad. This page then opens with your personal unlock link.");
      return;
    }
    // Safety net: if the server doesn't answer at all, don't spin forever.
    var watchdog = setTimeout(function () {
      if (!info) failed("Can't reach MyCraftingAI", "Check your internet connection, then reload this page. Your unlock link stays valid for 30 minutes.");
    }, 20000);
    api.rewards.info(ticket).then(function (r) {
      clearTimeout(watchdog);
      info = r;
      track("unlock.view");
      if (info.status === "granted") done(); else intro("");
    }, function (err) {
      clearTimeout(watchdog);
      fromError(err);
    }).catch(unexpected);
  });
})();

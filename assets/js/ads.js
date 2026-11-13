/*
 * Advertising, used only by the download page (get.html) and the unlock page
 * (unlock.html). Rules this file follows (Google AdSense / Ad Manager policy):
 *
 *  - Display ads are labelled "Advertisement", sit apart from download links and
 *    buttons, and never look like site content or controls.
 *  - Nothing here asks anyone to click an ad, and no reward is ever tied to a
 *    display ad. The only ad that unlocks something is a Google *rewarded* ad
 *    (Ad Manager OutOfPageFormat.REWARDED), which the visitor chooses to watch.
 *  - Personalised ads only with consent ("Personalised advertising" in Cookie
 *    settings); otherwise ads are requested as non-personalised.
 *  - Until a publisher id / ad unit is set in config.js, every place shows a
 *    clearly labelled MyCraftingAI notice instead of an empty box.
 */
(function () {
  "use strict";

  var cfg = (window.MCA_CONFIG && window.MCA_CONFIG.ads) || {};
  var client = /^ca-pub-\d{10,20}$/.test(cfg.client || "") ? cfg.client : "";
  var adsenseLoaded = false;

  function personalised() {
    return !!(window.MCA && window.MCA.consent && window.MCA.consent.allows("advertising"));
  }

  function loadScript(src, attrs) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
    return s;
  }

  function loadAdsense() {
    if (adsenseLoaded || !client) return;
    adsenseLoaded = true;
    window.adsbygoogle = window.adsbygoogle || [];
    if (!personalised()) window.adsbygoogle.requestNonPersonalizedAds = 1;
    loadScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client),
      { crossorigin: "anonymous" });
  }

  var HOUSE = [
    { title: "Builder: every tool, no ads", text: "Texture Studio, unlimited Build & Run and 100,000 tokens a day for $5.75 a month.", href: "index.html#pricing", cta: "See plans" },
    { title: "Think deeper with Pro", text: "High thinking mode plans big systems and checks every file before it answers.", href: "index.html#pricing", cta: "Compare plans" },
    { title: "Paint textures with AI", text: "Describe a sword, block or GUI and MyPixelAI draws it pixel by pixel.", href: "index.html#tour", cta: "See how" }
  ];
  var houseIndex = 0;

  function house(box) {
    var item = HOUSE[houseIndex++ % HOUSE.length];
    box.classList.add("ad-house");
    box.innerHTML =
      '<span class="ad-label">From MyCraftingAI</span>' +
      '<div class="ad-house-body"><b>' + item.title + "</b><p>" + item.text + "</p>" +
      '<a class="btn btn-ghost btn-sm" href="' + item.href + '">' + item.cta + "</a></div>";
  }

  /** Fill every [data-ad-slot="name"] on the page. */
  function display() {
    var boxes = document.querySelectorAll("[data-ad-slot]");
    Array.prototype.forEach.call(boxes, function (box) {
      var slot = (cfg.slots || {})[box.getAttribute("data-ad-slot")] || "";
      if (!client || !/^\d{6,20}$/.test(slot)) { house(box); return; }
      loadAdsense();
      box.classList.add("ad-live");
      box.innerHTML = '<span class="ad-label">Advertisement</span>';
      var ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", client);
      ins.setAttribute("data-ad-slot", slot);
      ins.setAttribute("data-ad-format", box.getAttribute("data-ad-format") || "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      box.appendChild(ins);
      watchFill(box, ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked by the browser */ }
    });
  }

  /**
   * Google sets data-ad-status="unfilled" when it has no ad for a place (new
   * site, new ad unit, ad blockers...). Instead of an empty "Advertisement"
   * box, that place then shows the MyCraftingAI notice - Google's recommended
   * way to handle unfilled ad units.
   */
  function watchFill(box, ins) {
    function check() {
      if (ins.getAttribute("data-ad-status") !== "unfilled") return false;
      box.classList.remove("ad-live");
      house(box);
      return true;
    }
    if (typeof MutationObserver === "function") {
      var seen = new MutationObserver(function () { if (check()) seen.disconnect(); });
      seen.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    }
    // No answer at all (script blocked): show the notice after a while.
    setTimeout(function () {
      if (!ins.getAttribute("data-ad-status") && !ins.querySelector("iframe")) {
        box.classList.remove("ad-live");
        house(box);
      }
    }, 8000);
  }

  /**
   * Show one Google rewarded ad (Ad Manager). Call only after the visitor chose
   * to watch. handlers: granted(), closed(), unavailable(reason).
   */
  function rewarded(handlers) {
    var unit = String(cfg.rewardedAdUnit || "");
    var finished = false, gotGrant = false, timer = 0;
    // "closed" and "unavailable" end the attempt; each fires at most once.
    function once(name, arg) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (handlers[name]) handlers[name](arg);
    }
    if (!/^\/\d+\/[\w.\-\/]+$/.test(unit)) { once("unavailable", "not_configured"); return; }

    timer = setTimeout(function () { once("unavailable", "timeout"); }, 12000);
    window.googletag = window.googletag || { cmd: [] };
    loadScript("https://securepubads.g.doubleclick.net/tag/js/gpt.js");
    window.googletag.cmd.push(function () {
      var gt = window.googletag;
      var slot = gt.defineOutOfPageSlot(unit, gt.enums.OutOfPageFormat.REWARDED);
      if (!slot) { clearTimeout(timer); once("unavailable", "unsupported"); return; }
      slot.addService(gt.pubads());
      try { gt.pubads().setPrivacySettings({ nonPersonalizedAds: !personalised() }); } catch (e) { /* older GPT */ }
      gt.pubads().addEventListener("rewardedSlotReady", function (event) {
        if (event.slot !== slot) return;
        clearTimeout(timer);
        if (handlers.ready) handlers.ready();
        event.makeRewardedVisible();
      });
      gt.pubads().addEventListener("rewardedSlotGranted", function (event) {
        if (event.slot !== slot || gotGrant) return;
        gotGrant = true;
        if (handlers.granted) handlers.granted();
      });
      gt.pubads().addEventListener("rewardedSlotClosed", function (event) {
        if (event.slot !== slot) return;
        gt.destroySlots([slot]);
        if (!gotGrant) once("closed");
      });
      gt.pubads().addEventListener("slotRenderEnded", function (event) {
        if (event.slot === slot && event.isEmpty) { clearTimeout(timer); once("unavailable", "no_fill"); }
      });
      gt.enableServices();
      gt.display(slot);
    });
  }

  /**
   * Is the visitor actually looking at this page? False when the tab is in the
   * background, the window is minimised, or another program / browser window has
   * focus. (Focus inside an ad's own frame still counts as this page.)
   * Timers on the download and unlock pages only advance while this is true.
   */
  var listeners = [];
  var lastActive = null;
  function active() {
    return !document.hidden && (typeof document.hasFocus !== "function" || document.hasFocus());
  }
  function notify() {
    var now = active();
    if (now === lastActive) return;
    lastActive = now;
    listeners.forEach(function (fn) { try { fn(now); } catch (e) { /* keep others running */ } });
  }
  ["visibilitychange", "focus", "blur", "pageshow", "pagehide"].forEach(function (name) {
    (name === "visibilitychange" ? document : window).addEventListener(name, function () { setTimeout(notify, 0); });
  });
  setInterval(notify, 300);  // focus moving into an ad frame fires "blur" on window

  window.MCA = window.MCA || {};
  window.MCA.attention = {
    active: active,
    onChange: function (fn) { listeners.push(fn); fn(active()); }
  };
  window.MCA.ads = {
    configured: !!client,
    rewardedConfigured: /^\/\d+\//.test(String(cfg.rewardedAdUnit || "")),
    display: display,
    rewarded: rewarded
  };

  // A consent change applies to the next page view; reload pages that show ads.
  document.addEventListener("mca:consent", function () {
    if (adsenseLoaded) setTimeout(function () { location.reload(); }, 300);
  });
})();

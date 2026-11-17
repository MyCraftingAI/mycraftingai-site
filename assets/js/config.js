/*
 * Site configuration - the only file you need to edit when things go live.
 *
 *  apiBase         Your account server, e.g. "https://api.mycraftingai.com".
 *                  Empty = accounts are not live yet: the sign-in pages say so
 *                  and stay disabled (on your own PC they run in preview mode).
 *  googleSignIn    true once the server's /v1/auth/google/start route works.
 *  contactEmail    Sales / support address for Enterprise (empty = "soon").
 *  downloadUrl     Windows installer link shown after sign-up (empty = "soon").
 *
 * Payments: Dodo Payments checkout opens in an overlay on our own pages
 * (assets/js/checkout.js). The account server creates every checkout session,
 * so there are no payment links or keys to set here.
 */
/* Always use the secure site. Some phone browsers (e.g. Xiaomi's) open
   "mycraftingai.com" over plain http://, where the account server refuses
   requests - so sign-in would fail. This runs first on every page. */
(function () {
  if (location.protocol === "http:" && /(^|\.)mycraftingai\.com$/i.test(location.hostname)) {
    location.replace("https://" + location.host + location.pathname + location.search + location.hash);
  }
})();

window.MCA_CONFIG = {
  apiBase: "https://api.mycraftingai.com",
  /* The button appears by itself once the server has GOOGLE_CLIENT_ID/SECRET
     (it asks /v1/auth/providers). Set false to hide it regardless. */
  googleSignIn: true,
  contactEmail: "",
  downloadUrl: "",
  /* Never change: the desktop app listens only on this host. */
  desktopCallbackHost: "127.0.0.1",

  /* Advertising - only on the download page (get.html) and the unlock page
     (unlock.html); never on account, sign-in, pricing or legal pages.
     Leave a value empty and that place shows a MyCraftingAI notice instead.
       client          Google AdSense publisher id, e.g. "ca-pub-1234567890123456".
                       Also add website/ads.txt with your publisher id.
       slots           AdSense display ad unit ids for the download page.
       rewardedAdUnit  Google Ad Manager rewarded ad unit path, e.g.
                       "/1234567/mycraftingai_rewarded". Rewarded ads are the
                       only format Google allows in exchange for a reward;
                       ordinary AdSense units must never be used for that.
       downloadDelay   Seconds the download page waits before the download. */
  ads: {
    client: "ca-pub-7730731521219274",
    slots: {
      downloadTop: "7617513329",     /* AdSense "MCA Download Top" (horizontal, responsive) */
      downloadSide: "4018334614",    /* AdSense "MCA Download Side" (square, responsive) */
      downloadBottom: "2493499951"   /* AdSense "MCA Download Bottom" (horizontal, responsive) */
    },
    rewardedAdUnit: "",
    downloadDelay: 10
  }
};

/* Local development only: open the site from your own PC with
   ?api=http://127.0.0.1:8000 to use a local account server (remembered in this
   browser; ?api=off goes back). Ignored on the public site. */
(function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  try {
    var m = /[?&]api=([^&#]+)/.exec(location.search);
    if (m) {
      var v = decodeURIComponent(m[1]);
      if (v === "off") localStorage.removeItem("mca_dev_api");
      else if (/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(v)) localStorage.setItem("mca_dev_api", v);
    }
    var dev = localStorage.getItem("mca_dev_api");
    if (dev) window.MCA_CONFIG.apiBase = dev;
  } catch (e) { /* private mode */ }
})();

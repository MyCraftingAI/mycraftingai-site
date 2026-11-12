/*
 * Site configuration - the only file you need to edit when things go live.
 *
 *  apiBase         Your account server, e.g. "https://api.mycraftingai.com".
 *                  Empty = accounts are not live yet: the sign-in pages say so
 *                  and stay disabled (on your own PC they run in preview mode).
 *  googleSignIn    true once the server's /v1/auth/google/start route works.
 *  contactEmail    Sales / support address for Enterprise (empty = "soon").
 *  downloadUrl     Windows installer link shown after sign-up (empty = "soon").
 *  checkout        Lemon Squeezy checkout URLs per paid plan (empty = "soon").
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
  checkout: {
    builder: "",
    pro: "",
    studio: ""
  },
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
    client: "",
    slots: {
      downloadTop: "",
      downloadSide: "",
      downloadBottom: ""
    },
    rewardedAdUnit: "",
    downloadDelay: 10
  }
};

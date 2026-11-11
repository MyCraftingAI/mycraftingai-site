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
window.MCA_CONFIG = {
  apiBase: "",
  googleSignIn: true,
  contactEmail: "",
  downloadUrl: "",
  checkout: {
    builder: "",
    pro: "",
    studio: ""
  },
  /* Never change: the desktop app listens only on this host. */
  desktopCallbackHost: "127.0.0.1"
};

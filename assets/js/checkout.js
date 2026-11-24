/*
 * In-site checkout (Dodo Payments overlay).
 *
 * Buy / Subscribe never leaves mycraftingai.com: the account server creates a
 * checkout session (POST /v1/billing/subscribe or /v1/billing/topup - it sets
 * the price, the browser never does) and Dodo's payment form opens in an
 * overlay on top of this page, in our dark theme (set on the session).
 *
 * The SDK is pinned (version + Subresource Integrity) and loaded only when
 * someone clicks Buy. It runs with manualRedirect, so it never navigates the
 * page by itself. When the payment succeeds (the "checkout.status" event) we
 * close the overlay and open the account page, which waits for the payment
 * webhook to add the plan or Coins and then shows them.
 *
 *   MCA.checkout.plan("pro")          subscribe to a monthly plan
 *   MCA.checkout.plan("pro", {interval: "year"})   ... billed yearly
 *   MCA.checkout.coins(1000)          buy 1,000 Coins
 *   MCA.checkout.open(checkoutUrl)    open an existing session URL
 */
(function () {
  "use strict";

  var SDK_URL = "https://cdn.jsdelivr.net/npm/dodopayments-checkout@2.1.0/dist/index.js";
  var SDK_SRI = "sha384-bKqHMqh/LAZEuwfPBNzz5+7xshjCXM9werJl/vcrbIOMhBgKUyYKY3Gv6pt/shbU";
  var SUCCESS = ["succeeded", "success", "active", "paid", "completed"];
  var FAILED = ["failed", "cancelled", "canceled", "expired"];

  var sdkPromise = null;
  var state = null;  // the checkout in progress

  function MCA() { return window.MCA || {}; }
  function modal(title, body, actions) { if (MCA().modal) MCA().modal(title, body, actions); }

  function loadSdk() {
    if (window.DodoPaymentsCheckout && window.DodoPaymentsCheckout.DodoPayments) {
      return Promise.resolve(window.DodoPaymentsCheckout.DodoPayments);
    }
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = SDK_URL;
      script.integrity = SDK_SRI;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = function () {
        var sdk = window.DodoPaymentsCheckout && window.DodoPaymentsCheckout.DodoPayments;
        if (sdk) resolve(sdk); else reject(new Error("sdk_missing"));
      };
      script.onerror = function () { sdkPromise = null; reject(new Error("sdk_blocked")); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  /* --------------------------------------------------------------- busy layer */
  function busy(on, text) {
    var el = document.getElementById("mca-checkout-busy");
    if (!el && on) {
      el = document.createElement("div");
      el.id = "mca-checkout-busy";
      el.className = "checkout-busy";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.innerHTML = '<div class="checkout-busy-card"><span class="checkout-spinner" aria-hidden="true"></span><span class="checkout-busy-text"></span></div>';
      document.body.appendChild(el);
    }
    if (!el) return;
    if (on) el.querySelector(".checkout-busy-text").textContent = text || "Opening secure checkout…";
    el.classList.toggle("open", !!on);
  }

  /* ------------------------------------------------------------- outcomes */
  function statusOf(message) {
    if (!message) return "";
    if (typeof message === "string") return message.toLowerCase();
    return String(message.status || message.payment_status || message.subscription_status || "").toLowerCase();
  }

  function sameSite(url) {
    try { return new URL(url, location.href).origin === location.origin || /(^|\.)mycraftingai\.com$/i.test(new URL(url).hostname); }
    catch (e) { return false; }
  }

  function finish(outcome) {
    if (!state || state.finished) return;
    state.finished = true;
    var job = state;
    try { if (job.sdk && job.sdk.Checkout.isOpen()) job.sdk.Checkout.close(); } catch (e) { /* already closed */ }
    busy(false);
    if (outcome === "success" || outcome === "processing") {
      // Paid: straight to the account page, which waits for the webhook to add the purchase.
      busy(true, "Payment received - opening your account…");
      var next = "account.html?checkout=" + (outcome === "processing" ? "processing" : "done") +
        "&kind=" + encodeURIComponent(job.kind || "") + (job.plan ? "&plan=" + encodeURIComponent(job.plan) : "") +
        "#" + (job.kind === "plan" ? "subscription" : "topups");
      setTimeout(function () { location.href = next; }, 600);
      state = null;
      return;
    } else if (outcome === "failed") {
      modal("Payment didn't go through",
        job.mode === "test"
          ? "Payments are in test mode: real cards are never charged and are always declined here. Use a test card such as " +
            "4242 4242 4242 4242 (or the India test card 4576 2389 1277 1450), expiry 06/32, CVC 123."
          : "Your bank declined the payment and nothing was charged. Please try again - you can choose another card, " +
            "UPI, Google Pay or your own currency in the payment window. If it keeps failing, write to billing@mycraftingai.com.",
        [{ label: "OK", primary: true }]);
    }
    closeBankWindow();
    state = null;
  }

  /* ------------------------------------------------------- bank verification
   * Some cards need the bank to confirm the payment (3-D Secure, Indian e-mandates,
   * wallets). Dodo asks us to open the bank's page; instead of sending the whole site
   * there, it opens in a small window above our page. Browsers only allow that window
   * after a click on our page, so the customer presses "Continue to your bank" first.
   * When the bank is done, Dodo brings that window back to our account page with the
   * result, we close it and show the outcome here. */
  var bankWin = null, bankTimer = null;

  function closeBankWindow() {
    if (bankTimer) { clearInterval(bankTimer); bankTimer = null; }
    try { if (bankWin && !bankWin.closed) bankWin.close(); } catch (e) { /* already gone */ }
    bankWin = null;
  }

  function resultFromUrl(url) {
    var status = "";
    try { status = String(new URL(url, location.href).searchParams.get("status") || "").toLowerCase(); } catch (e) { /* bad url */ }
    if (FAILED.indexOf(status) !== -1) return "failed";
    return SUCCESS.indexOf(status) !== -1 ? "success" : "processing";
  }

  function watchBankWindow() {
    if (bankTimer) clearInterval(bankTimer);
    bankTimer = setInterval(function () {
      if (!bankWin) return closeBankWindow();
      if (bankWin.closed) {
        closeBankWindow();
        busy(false);
        if (state && !state.finished) {
          modal("Bank verification closed",
            "The bank window was closed before the payment was confirmed. If you finished it, your purchase shows up on " +
            "your account page in a minute; otherwise nothing was charged - you can try again.",
            [{ label: "OK" }, { label: "Go to your account", primary: true, href: "account.html" }]);
        }
        return;
      }
      try {
        var href = bankWin.location.href;  // readable only once the window is back on our site
        if (href && sameSite(href) && !/^about:/.test(href)) finish(resultFromUrl(href));
      } catch (e) { /* still on the bank's or Dodo's page */ }
    }, 700);
  }

  function openBankWindow(url) {
    var w = 520, h = 720;
    var left = Math.max(0, (window.screenX || 0) + ((window.outerWidth || w) - w) / 2);
    var top = Math.max(0, (window.screenY || 0) + ((window.outerHeight || h) - h) / 2);
    bankWin = window.open(url, "mca-bank", "popup,width=" + w + ",height=" + h + ",left=" + Math.round(left) + ",top=" + Math.round(top));
    if (!bankWin) { location.href = url; return; }  // popups blocked: continue on this page instead
    try { bankWin.focus(); } catch (e) { /* ignore */ }
    busy(true, "Finish the verification in your bank's window…");
    raise("mca-checkout-busy");
    watchBankWindow();
  }

  /** Our dialogs and the waiting layer must sit above Dodo's overlay (it uses z-index 1000). */
  function raise(id) {
    var el = document.getElementById(id);
    if (el) el.style.zIndex = "2147483000";
  }

  function askForBank(url) {
    busy(false);
    modal("Confirm with your bank",
      "Your bank needs to confirm this payment. It opens in a small secure window above this page - you stay on mycraftingai.com.",
      [{ label: "Cancel", onClick: function () { close(); } },
       { label: "Continue to your bank", primary: true, onClick: function () { openBankWindow(url); } }]);
    raise("mca-modal");
  }

  /* A bank window that came back to our site reports the result to this page. */
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== "mca:bank-return") return;
    if (state && !state.finished) finish(resultFromUrl(String(e.data.url || "")));
  });

  function onEvent(event) {
    if (!state || !event) return;
    var type = event.event_type, message = event.data && event.data.message;
    switch (type) {
      case "checkout.opened":
      case "checkout.form_ready":
        busy(false);
        break;
      case "checkout.status": {
        // manualRedirect: this is the final result ({status: "succeeded" | "failed" | ...}); the
        // payment form waits on "Processing..." until we act on it.
        var status = statusOf(message);
        if (SUCCESS.indexOf(status) !== -1) finish("success");
        else if (FAILED.indexOf(status) !== -1) finish("failed");
        else if (status) finish("processing");
        break;
      }
      case "checkout.redirect_requested": {
        // manualRedirect: the SDK asks us where to go instead of navigating itself.
        var url = message && (message.redirect_to || message.url || message.redirect_url);
        if (url && sameSite(url)) {
          var status2 = "";
          try { status2 = String(new URL(url, location.href).searchParams.get("status") || "").toLowerCase(); } catch (e) { /* bad url */ }
          // Back at our return_url: the payment finished (processing payments complete later by webhook).
          finish(FAILED.indexOf(status2) !== -1 || state.result === "failed" ? "failed" : "success");
        } else if (url) {
          // A bank or wallet step that has to happen on the bank's own page (3-D Secure,
          // e-mandates, wallets): it opens in a small window above our page.
          askForBank(url);
        }
        break;
      }
      case "checkout.link_expired":
        finish("closed");
        modal("Checkout timed out", "The payment page expired before it was finished. Nothing was charged - please start again.", [{ label: "OK", primary: true }]);
        break;
      case "checkout.error":
        busy(false);
        if (window.console) console.warn("checkout error:", message);
        break;
      case "checkout.closed":
        if (state && state.result === "success") finish("success");
        else if (state && state.result === "failed") finish("failed");
        else { busy(false); state = null; }
        break;
    }
  }

  /** Open a checkout session URL in the overlay. */
  function open(checkoutUrl, job) {
    job = job || {};
    var mode = /(^|\.)test\.checkout\.dodopayments\.com$/i.test((function () {
      try { return new URL(checkoutUrl).hostname; } catch (e) { return ""; }
    })()) ? "test" : "live";
    busy(true, job.busyText);
    return loadSdk().then(function (sdk) {
      state = { kind: job.kind || "", label: job.label || "", plan: job.plan || "", before: job.before || MCA().session || null,
                sdk: sdk, result: "", mode: mode };
      sdk.Initialize({ mode: mode, displayType: "overlay", onEvent: onEvent });
      sdk.Checkout.open({
        checkoutUrl: checkoutUrl,
        options: { manualRedirect: true, showTimer: true, showSecurityBadge: true, payButtonText: job.payText || undefined }
      });
      // If the frame never reports back (blocked by an extension), don't leave the spinner up.
      setTimeout(function () { if (!bankWin) busy(false); }, 15000);
    }, function () {
      busy(false);
      modal("Couldn't open the secure checkout",
        "Your browser blocked the payment form (an ad or script blocker can do this). Allow cdn.jsdelivr.net and dodopayments.com for this site and try again.",
        [{ label: "OK", primary: true }]);
    });
  }

  function needSignIn(err, back, plan) {
    if (!(err && (err.status === 401 || err.code === "unauthorized" || err.code === "not_live"))) return false;
    var next = encodeURIComponent(back || "index.html#pricing");
    modal(plan ? "Create your account first" : "Sign in to buy Coins",
      plan
        ? "Your plan is added to your MyCraftingAI account, so sign in (or create a free account) first. You'll come straight back here to pay."
        : "Coins are added to your MyCraftingAI account, so sign in (or create a free account) first. You'll come straight back here.",
      [{ label: "Not now" },
       { label: "Create account", href: "signup.html?" + (plan ? "plan=" + encodeURIComponent(plan) + "&" : "") + "next=" + next },
       { label: "Sign in", primary: true, href: "login.html?next=" + next }]);
    return true;
  }

  function failed(err) {
    busy(false);
    var code = err && err.code;
    if (code === "topups_unavailable" || code === "billing_unavailable") {
      modal("Checkout opens soon", (err && err.message) || "Payments aren't switched on yet.", [{ label: "OK", primary: true }]);
      return;
    }
    if (code === "already_subscribed") {
      modal("You already have a plan", err.message, [{ label: "Close" }, { label: "Go to your account", primary: true, href: "account.html" }]);
      return;
    }
    modal("Couldn't start the payment", (err && err.message) || "Please try again in a minute.", [{ label: "OK", primary: true }]);
  }

  /** Subscribe to a plan, billed monthly or yearly (``opts.interval`` "year"). */
  function plan(planId, opts) {
    opts = opts || {};
    var interval = opts.interval === "year" ? "year" : "month";
    var api = MCA().api;
    if (!api || !api.billing) return Promise.resolve();
    busy(true, "Preparing your " + (opts.label || "plan") + " checkout…");
    return api.me().then(function (me) {
      if (!me || !me.user) throw new api.ApiError("unauthorized", "", 401);
      return api.billing.subscribe(planId, interval).then(function (session) {
        var label = session.planName ? session.planName + (interval === "year" ? " (yearly)" : "") : opts.label;
        return open(session.checkoutUrl, { kind: "plan", plan: planId, label: label, before: me,
                                           busyText: "Opening secure checkout…" });
      });
    }).catch(function (err) {
      busy(false);
      if (!needSignIn(err, opts.back, planId)) failed(err);
    });
  }

  /** Buy ``amount`` top-up Coins. */
  function coins(amount, opts) {
    opts = opts || {};
    var api = MCA().api;
    if (!api || !api.billing) return Promise.resolve();
    busy(true, "Preparing your checkout…");
    return api.me().then(function (me) {
      if (!me || !me.user) throw new api.ApiError("unauthorized", "", 401);
      return api.billing.topup(amount).then(function (session) {
        return open(session.checkoutUrl, { kind: "topup", before: me, busyText: "Opening secure checkout…" });
      });
    }).catch(function (err) {
      busy(false);
      if (!needSignIn(err, opts.back || "index.html#topup")) failed(err);
    });
  }

  /** Close the overlay (Escape key, or a page that wants it gone). */
  function close() {
    if (!state) return;
    var job = state;
    if (job.result === "success") { finish("success"); return; }
    try { if (job.sdk && job.sdk.Checkout.isOpen()) job.sdk.Checkout.close(); } catch (e) { /* already closed */ }
    closeBankWindow();
    busy(false);
    state = null;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state) close(); });

  window.MCA = window.MCA || {};
  window.MCA.checkout = { plan: plan, coins: coins, open: open, close: close, loadSdk: loadSdk };
})();

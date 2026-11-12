/* Home page interactions: pixel workbench, example runs, app tour, token calculator, pricing. */
(function () {
  "use strict";

  var DATA = window.MCA_PLANS || { plans: [], features: {} };
  var cfg = window.MCA_CONFIG || {};
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(n) { return window.MCA.formatTokens(n); }

  /* ================================================== pixel workbench */
  /* Workbench sprites (16 x 16, "." = transparent). The active theme from the
     admin panel picks one; Classic shows the MyCraftingAI app icon. */
  var SEASON_ART = {
    classic: {
      file: "mycraftingai.png",
      colors: { B: "#4f63f5", L: "#6376ff", H: "#8aa0ff", D: "#3342c2", k: "#1a1f5c", W: "#ffffff", e: "#dfe4ff", c: "#a9b6ff" },
      art: [
        "..kkkkkkkkkkkk..",
        ".kHHHHHHHHHHHHk.",
        "kLBBBBBBBBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBWWWWccWWWWBDk",
        "kLBWeWeccWeWeBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBBBBBBBBDk",
        ".kDDDDDDDDDDDDk.",
        "..kkkkkkkkkkkk.."
      ]
    },
    halloween: {
      file: "jack_o_lantern.png",
      colors: { s: "#3e7a2a", S: "#2a5a1c", o: "#ff8a1a", O: "#e0650a", d: "#a8440a", D: "#6e2a06", y: "#ffd23f", Y: "#fff1a8", k: "#1a0d05" },
      art: [
        "................",
        ".......SS.......",
        "........sS......",
        "....DOOssOOD....",
        "..DOOooOOooOOD..",
        ".DOooooOOoooooD.",
        ".OooyooOOooyooO.",
        "DOoyyyoOOoyyyooD",
        "DOyYYYyOOyYYYyoD",
        "DOoooooOOoooooOD",
        "DOoyoyyyyyyoyooD",
        "DOoyyyYYYYyyyooD",
        ".DOooyykkyyooOD.",
        ".DdOoooOOooooOd.",
        "..DdOOOOOOOOdD..",
        "....DDDDDDDD...."
      ]
    },
    black_friday: {
      file: "sale_tag.png",
      colors: { k: "#2a2008", g: "#e8b92f", G: "#b8891a", l: "#ffe27a", w: "#ffffff", d: "#111111", s: "#8a8a8a" },
      art: [
        "................",
        "................",
        "................",
        "...ss...........",
        "..s.kkkkkkkkkkk.",
        ".s.kglllllllllk.",
        ".skggggddggdggk.",
        ".ksggggddgdgggk.",
        "kggkgggggdggggk.",
        ".ksgggggdgddggk.",
        "..kggggdggddggk.",
        "...kgGGGGGGGGGk.",
        "....kkkkkkkkkkk.",
        "................",
        "................",
        "................"
      ]
    },
    cyber_monday: {
      file: "power_bolt.png",
      colors: { c: "#14c8e0", C: "#0b8ea1", l: "#a6f3fb", w: "#ffffff", p: "#ec4899", P: "#9d174d", k: "#06222a" },
      art: [
        ".........kkkkk..",
        "........kclwck..",
        ".......kcllck...",
        "......kcllck....",
        ".....kcllck.....",
        "....kcllcCkkkk..",
        "...kcllllllwck..",
        "..kclllllllck...",
        "..kkkkCcllck....",
        "......kcllk..p..",
        ".....kcllk..ppp.",
        "....kclck....p..",
        "...kclck..p.....",
        "..kcCk...ppp....",
        "..kkk.....p.....",
        "................"
      ]
    },
    autumn: {
      file: "maple_leaf.png",
      colors: { r: "#d9622b", R: "#a8401a", o: "#f0a23a", y: "#ffd27a", b: "#6e3a14", k: "#3a1a08" },
      art: [
        ".......k........",
        "......kok.......",
        "..k...kok...k...",
        "..kok.krok.kok..",
        "...kokrrrokok...",
        ".kkkorrbrrook...",
        "kooorrrbrrrrok..",
        ".korrrrbrrrrook.",
        "..korRrbrRrrk...",
        "...kRRrbrRRk....",
        "..kRRRrbrRRRk...",
        ".kkkkkRbRkkkk...",
        "......kbk.......",
        ".......bk.......",
        ".......b........",
        "................"
      ]
    },
    christmas: {
      file: "snowy_tree.png",
      colors: { y: "#ffd23f", Y: "#fff1a8", g: "#2fae66", G: "#1f6b34", w: "#f4f8ff", W: "#cfe3ff", r: "#d93a3a", b: "#4da3e8", t: "#7a4a24", T: "#5a3418" },
      art: [
        ".......Yy.......",
        "......yYYy......",
        ".......yy.......",
        ".......Gg.......",
        "......wwwg......",
        ".....GggrgG.....",
        "....wwwwwwgG....",
        "....GgbgggggG...",
        "...wwwwwwwwgG...",
        "...GggggrggbgG..",
        "..wwwwwwwwwwwgG.",
        "..GgrggbgggrgggG",
        ".......tT.......",
        ".W.....tT....W..",
        "wwwWwwwwwwwwWwww",
        "WWWWWWWWWWWWWWWW"
      ]
    },
    winter: {
      file: "snowman.png",
      colors: { w: "#f4f8ff", W: "#b8cfe8", k: "#1c2433", o: "#f08a24", r: "#d93a3a", R: "#9e2626", h: "#2a2f3a", b: "#7a4a24", f: "#9ccbf3" },
      art: [
        "..f.....hhh...f.",
        "......hhhhh.....",
        ".....hhhhhhh....",
        "......wwwww...f.",
        ".f...wkwwkW.....",
        ".....wwoowW.....",
        "......wwwW......",
        ".....RrrrrrR....",
        "....wwwRwwwWb...",
        "..b.wwwrkwwWb.f.",
        "...bwwwwwwwWb...",
        ".f..wwwwkwwW....",
        "...wwwwwwwwwW...",
        "...wwwwwkwwwW...",
        "....WwwwwwwW....",
        "..WWWWWWWWWWWW.."
      ]
    },
    new_year: {
      file: "firework.png",
      colors: { p: "#9b5cf6", P: "#c9a9ff", y: "#e8b92f", Y: "#fff1a8", w: "#ffffff", c: "#14c8e0", r: "#e64a86" },
      art: [
        ".......y........",
        "..p....y....c...",
        "...p...Y...c....",
        "....P..y..c.....",
        ".y...P.Y.c...r..",
        "..y...PwPc..r...",
        "...yYYwwwYYrr...",
        "yyyYYwwYwwYYyyy.",
        "...rrYwwwYYyy...",
        "..r...cwPP..y...",
        ".r...c.Y.P...y..",
        "....c..y..P.....",
        "...c...Y...p....",
        "..c....y....p...",
        ".......y........",
        "................"
      ]
    },
    valentines: {
      file: "heart.png",
      colors: { k: "#4a0e24", r: "#e64a86", R: "#b8305e", p: "#f59bbe", w: "#ffffff" },
      art: [
        "................",
        "................",
        "..kkkk....kkkk..",
        ".krrrrk..krrrrk.",
        "krwprrrkkrrrrrRk",
        "krpprrrrrrrrrrRk",
        "krprrrrrrrrrrrRk",
        "krrrrrrrrrrrrrRk",
        ".krrrrrrrrrrrRk.",
        "..krrrrrrrrrRk..",
        "...krrrrrrrRk...",
        "....krrrrrRk....",
        ".....krrrRk.....",
        "......krRk......",
        ".......kk.......",
        "................"
      ]
    },
    spring: {
      file: "tulip.png",
      colors: { p: "#f48fb1", P: "#d6457c", l: "#ffd0e0", g: "#3fbf7f", G: "#2a8a5a", y: "#ffd23f", k: "#4a1a2c" },
      art: [
        "................",
        ".....k.kk.k.....",
        "....kpkllkpk....",
        "....kplplppk....",
        "....kppplppk....",
        "....kPpppppk....",
        ".....kPPPPk.....",
        "......kGgk......",
        "..kk...gG...kk..",
        "..kgk..gG..kgk..",
        "...kgk.gG.kgk...",
        "....kgkgGkgk....",
        ".....kgggGk.....",
        "......kgGk......",
        ".......gG.......",
        "................"
      ]
    },
    easter: {
      file: "easter_egg.png",
      colors: { k: "#3a2a5a", v: "#a78bfa", V: "#7458d6", y: "#fde047", Y: "#e0b800", w: "#ffffff", p: "#f59bbe", g: "#8fe0b5" },
      art: [
        "................",
        "......kkkk......",
        ".....kwvvvk.....",
        "....kwvvvvVk....",
        "....kvvvvvVk....",
        "...kyyyyyyyYk...",
        "...kpypypypYk...",
        "...kvvvvvvvVk...",
        "...kggggggggk...",
        "...kvgvvgvvVk...",
        "...kvvvvvvvVk...",
        "...kyyyyyyyYk...",
        "....kvvvvvVk....",
        "....kVvvvVVk....",
        ".....kkkkkk.....",
        "................"
      ]
    },
    summer: {
      file: "watermelon.png",
      colors: { r: "#f25c6b", R: "#c93a4a", k: "#2a1418", g: "#3fbf7f", G: "#2a8a5a", w: "#e8f8e0", d: "#1a0a0e", y: "#ffd27a" },
      art: [
        "................",
        "................",
        "................",
        "kkkkkkkkkkkkkkkk",
        "krrrrrrrrrrrrrRk",
        ".krrdrrrrrdrrRk.",
        ".krrrrrrdrrrrRk.",
        "..krrdrrrrrdRk..",
        "..krrrrrrrrrRk..",
        "...krrrdrrrRk...",
        "...kwwwwwwwwk...",
        "....kgggggGk....",
        ".....kGGGGk.....",
        "......kkkk......",
        "................",
        "................"
      ]
    }
  };

  function workbench() {
    var grid = $("#pixel-grid");
    if (!grid) return;
    var SIZE = 16;
    // Extra swatches when a sprite uses fewer than ten colours.
    var EXTRA_COLOURS = ["#ffffff", "#1a1a22", "#5e5e5e", "#9c6b3c", "#3dd68c", "#8aa0ff", "#f2555a", "#f5b74a", "#4f63f5", "#b79cff"];
    var PALETTE = EXTRA_COLOURS;
    var pixels = [];
    var colour = PALETTE[0];
    var season = "";      // theme whose sprite is on the canvas
    var dirty = false;    // the visitor painted: don't swap their drawing away
    var tool = "pencil";
    var mirror = false;
    var painting = false;
    var erasing = false;

    function activeTheme() {
      var theme = document.documentElement.getAttribute("data-theme") || "classic";
      return SEASON_ART[theme] ? theme : "classic";
    }

    /** The sprite for the active theme (the MyCraftingAI icon for Classic). */
    function sprite() {
      var spec = SEASON_ART[activeTheme()];
      var used = [], art = [];
      spec.art.forEach(function (row) {
        for (var x = 0; x < SIZE; x++) {
          var c = row.charAt(x) === "." ? null : spec.colors[row.charAt(x)];
          art.push(c || null);
          if (c && used.indexOf(c) < 0) used.push(c);
        }
      });
      // Swatches: the sprite's own colours, most-used first, topped up to ten.
      used.sort(function (a, b) {
        return art.filter(function (c) { return c === b; }).length - art.filter(function (c) { return c === a; }).length;
      });
      PALETTE = used.concat(EXTRA_COLOURS.filter(function (c) { return used.indexOf(c) < 0; })).slice(0, 10);
      return art;
    }

    function fileName() {
      var spec = SEASON_ART[activeTheme()];
      return spec.file;
    }

    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement("div");
      cell.className = "px";
      cell.dataset.i = i;
      grid.appendChild(cell);
    }
    var cells = $$(".px", grid);

    function render() {
      cells.forEach(function (cell, index) { cell.style.background = pixels[index] || ""; });
      ["#preview-hand", "#preview-1x", "#preview-2x", "#preview-4x"].forEach(function (id) {
        var canvas = $(id);
        if (!canvas) return;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, SIZE, SIZE);
        pixels.forEach(function (c, index) {
          if (!c) return;
          ctx.fillStyle = c;
          ctx.fillRect(index % SIZE, Math.floor(index / SIZE), 1, 1);
        });
      });
    }

    function put(index, value) {
      pixels[index] = value;
      if (mirror) {
        var x = index % SIZE, y = Math.floor(index / SIZE);
        pixels[y * SIZE + (SIZE - 1 - x)] = value;
      }
    }

    function flood(index, value) {
      var target = pixels[index] || null;
      if (target === value) return;
      var stack = [index];
      while (stack.length) {
        var at = stack.pop();
        if ((pixels[at] || null) !== target) continue;
        pixels[at] = value;
        var x = at % SIZE, y = Math.floor(at / SIZE);
        if (x > 0) stack.push(at - 1);
        if (x < SIZE - 1) stack.push(at + 1);
        if (y > 0) stack.push(at - SIZE);
        if (y < SIZE - 1) stack.push(at + SIZE);
      }
    }

    function apply(target) {
      if (!target || !target.classList.contains("px")) return;
      var index = Number(target.dataset.i);
      var value = erasing || tool === "eraser" ? null : colour;
      if (tool === "fill" && !erasing) flood(index, value);
      else put(index, value);
      dirty = true;
      render();
    }

    grid.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    grid.addEventListener("pointerdown", function (e) {
      painting = true;
      erasing = e.button === 2;
      grid.setPointerCapture(e.pointerId);
      apply(document.elementFromPoint(e.clientX, e.clientY));
    });
    grid.addEventListener("pointermove", function (e) {
      if (!painting || tool === "fill") return;
      apply(document.elementFromPoint(e.clientX, e.clientY));
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      grid.addEventListener(ev, function () { painting = false; erasing = false; });
    });

    function setTool(name) {
      if (name === "mirror") {
        mirror = !mirror;
        $('[data-tool="mirror"]').setAttribute("aria-pressed", String(mirror));
        return;
      }
      tool = name;
      $$("[data-tool]").forEach(function (b) {
        if (b.dataset.tool !== "mirror") b.setAttribute("aria-pressed", String(b.dataset.tool === name));
      });
    }
    $$("[data-tool]").forEach(function (b) { b.addEventListener("click", function () { setTool(b.dataset.tool); }); });
    $('[data-action="reset"]').addEventListener("click", function () { load(); });

    var palette = $("#palette");
    function buildPalette() {
      $$(".swatch", palette).forEach(function (s) { s.remove(); });
      PALETTE.slice().reverse().forEach(function (c) {
        var sw = document.createElement("button");
        sw.type = "button";
        sw.className = "swatch";
        sw.style.background = c;
        sw.title = c;
        sw.setAttribute("aria-label", "Colour " + c);
        sw.setAttribute("aria-pressed", String(c === colour));
        sw.addEventListener("click", function () {
          colour = c;
          if (tool === "eraser") setTool("pencil");
          $$(".swatch", palette).forEach(function (s) { s.setAttribute("aria-pressed", String(s === sw)); });
        });
        palette.insertBefore(sw, palette.firstChild);
      });
    }

    /** Put the active theme's sprite on the canvas (file name and swatches too). */
    function load() {
      season = activeTheme();
      pixels = sprite();
      colour = PALETTE[0];
      dirty = false;
      var title = $(".bench-title b");
      if (title) title.textContent = fileName();
      grid.setAttribute("aria-label", "16 by 16 pixel canvas: " + fileName().replace(/\.png$/, "").replace(/_/g, " "));
      buildPalette();
      render();
    }

    // The admin switched the theme (or the fresh answer differs from the cache).
    document.addEventListener("mca:look", function () {
      if (activeTheme() !== season && !dirty) load();
    });

    document.addEventListener("keydown", function (e) {
      if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
      var map = { p: "pencil", e: "eraser", f: "fill", m: "mirror" };
      var name = map[e.key.toLowerCase()];
      if (name && grid.getBoundingClientRect().top < innerHeight) setTool(name);
    });

    load();
  }

  /* ===================================================== example runs */
  var RUNS = [
    {
      title: "Add a ruby sword with 9 attack damage",
      note: "item + texture",
      steps: [
        "Read 6 project files",
        "Planned a sword tier repaired with rubies",
        "Wrote item/RubySword.java",
        "Registered it in ModItems.java",
        "Painted textures/item/ruby_sword.png (16 x 16)",
        "Compiled with Gradle",
        "Launched the game - mod loaded"
      ],
      files: [["J", "item/RubySword.java", "new", "+31"], ["J", "ModItems.java", "edited", "+4"], ["png", "item/ruby_sword.png", "new", "16 x 16"], ["{}", "models/item/ruby_sword.json", "new", "+6"]],
      usage: ["12,480 in", "3,912 out", "68% cached", "8.4s"]
    },
    {
      title: "Copper lamps that glow brighter when powered",
      note: "block + blockstate",
      steps: [
        "Read 9 project files",
        "Planned a POWER property (0-15) mapped to light level",
        "Wrote block/CopperLampBlock.java",
        "Wrote blockstates/copper_lamp.json",
        "Painted lamp textures: off and lit",
        "Compiled with Gradle - 1 error fixed automatically",
        "Launched the game - mod loaded"
      ],
      files: [["J", "block/CopperLampBlock.java", "new", "+58"], ["J", "ModBlocks.java", "edited", "+6"], ["{}", "blockstates/copper_lamp.json", "new", "+18"], ["png", "block/copper_lamp_on.png", "new", "16 x 16"]],
      usage: ["21,904 in", "6,210 out", "71% cached", "14.2s"]
    },
    {
      title: "A swamp frog that drops slime balls",
      note: "entity + loot table",
      steps: [
        "Read 7 project files",
        "Planned a frog variant with its own loot table",
        "Wrote entity/SwampFrog.java",
        "Wrote loot_table/entities/swamp_frog.json",
        "Painted a 64 x 64 entity skin",
        "Compiled with Gradle",
        "Launched the game - mod loaded"
      ],
      files: [["J", "entity/SwampFrog.java", "new", "+74"], ["J", "ModEntities.java", "edited", "+9"], ["{}", "loot_table/entities/swamp_frog.json", "new", "+22"], ["png", "entity/swamp_frog.png", "new", "64 x 64"]],
      usage: ["18,377 in", "5,044 out", "64% cached", "12.9s"]
    }
  ];

  function exampleRuns() {
    var list = $("#prompt-list"), body = $("#demo-body"), state = $("#demo-state");
    if (!list) return;
    var timer = null;
    var started = false;

    function play(index) {
      var run = RUNS[index];
      clearTimeout(timer);
      $$(".prompt-btn", list).forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === index)); });
      body.innerHTML =
        '<div class="msg-user"></div>' +
        '<div class="msg-ai"><div class="av"><svg width="15" height="15" viewBox="0 0 24 24"><path fill="#fff" d="M12 2.6l2.1 7.3 7.3 2.1-7.3 2.1L12 21.4l-2.1-7.3L2.6 12l7.3-2.1z"/></svg></div>' +
        '<ol class="steps"></ol></div>' +
        '<div class="files"><div class="files-head"><span>' + run.files.length + ' files changed</span><span class="plus">' +
        run.files.filter(function (f) { return f[3].charAt(0) === "+"; }).reduce(function (sum, f) { return sum + Number(f[3].slice(1)); }, 0) +
        " lines</span></div>" +
        run.files.map(function (f) {
          var cls = f[0] === "png" ? "png" : (f[0] === "{}" ? "json" : "");
          return '<div class="file-row"><span class="badge ' + cls + '">' + (f[0] === "png" ? "" : f[0]) + "</span>" + f[1] +
            '<span class="n">' + (f[3].charAt(0) === "+" ? f[3] : "") + '</span><span class="s">' + (f[3].charAt(0) === "+" ? f[2] : f[2] + " &middot; " + f[3]) + "</span></div>";
        }).join("") + "</div>" +
        '<div class="usage-row" style="opacity:0;transition:opacity .3s">Usage &nbsp; ' + run.usage[0] + " &middot; " + run.usage[1] +
        ' &middot; <span class="ok">' + run.usage[2] + "</span> &middot; " + run.usage[3] + "</div>";
      $(".msg-user", body).textContent = run.title + ".";
      var steps = $(".steps", body);
      run.steps.forEach(function (text) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="st">&#9680;</span><span></span>';
        li.lastChild.textContent = text;
        steps.appendChild(li);
      });
      var items = $$("li", steps);
      var at = 0;
      state.textContent = "Working...";
      function next() {
        if (at > 0) { items[at - 1].classList.add("done"); items[at - 1].firstChild.innerHTML = "&#10003;"; }
        if (at < items.length) {
          items[at].classList.add("shown");
          at += 1;
          timer = setTimeout(next, at === items.length ? 700 : 520);
        } else {
          $(".files", body).classList.add("shown");
          $(".usage-row", body).style.opacity = "1";
          state.textContent = "Done - example run";
        }
      }
      timer = setTimeout(next, 350);
    }

    RUNS.forEach(function (run, index) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "prompt-btn";
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = "<span></span><small>" + run.note + "</small>";
      b.firstChild.textContent = "“" + run.title + "”";
      b.addEventListener("click", function () { play(index); });
      list.appendChild(b);
    });

    // Start the first run when the section scrolls into view (once).
    var section = $("#demo");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting && !started) { started = true; play(0); obs.disconnect(); }
      }, { threshold: 0.35 }).observe(section);
    } else { play(0); }
  }

  /* ============================================================ tour */
  function tour() {
    var img = $("#tour-img");
    if (!img) return;
    var tabs = $$(".tour-tab");
    function select(tab) {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t === tab)); });
      img.style.opacity = "0";
      setTimeout(function () {
        img.src = tab.dataset.shot;
        img.alt = tab.dataset.alt;
        img.onload = function () { img.style.opacity = "1"; };
      }, 150);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(tab);
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); tabs[(i + 1) % tabs.length].focus(); select(tabs[(i + 1) % tabs.length]); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); tabs[(i + tabs.length - 1) % tabs.length].focus(); select(tabs[(i + tabs.length - 1) % tabs.length]); }
      });
    });
    tabs.slice(1).forEach(function (t) { var pre = new Image(); pre.src = t.dataset.shot; });
  }

  /* ====================================================== calculator */
  function calculator() {
    var req = $("#c-requests");
    if (!req) return;
    var tex = $("#c-textures"), size = $("#c-size");
    var PER_REQUEST = { 1: 9000, 2: 16000, 3: 28000 };
    var SIZE_NAMES = { 1: "Small", 2: "Medium", 3: "Large" };
    var PER_TEXTURE = 7000;
    var UNCACHED = 0.35; // share of a request that is new (not cached) in our test runs
    var plans = DATA.plans.filter(function (p) { return p.dailyTokens; });
    /** What a day of work costs against this plan's allowance. */
    function counted(plan, total) { return plan.countsCached === false ? Math.round(total * UNCACHED / 1000) * 1000 : total; }

    function update() {
      req.nextElementSibling.textContent = req.value;
      tex.nextElementSibling.textContent = tex.value;
      size.nextElementSibling.textContent = SIZE_NAMES[size.value];
      var total = Number(req.value) * PER_REQUEST[size.value] + Number(tex.value) * PER_TEXTURE;
      total = Math.round(total * 1.15 / 1000) * 1000; // + room for automatic build fixes
      $("#c-total").textContent = total.toLocaleString("en-US");
      var needsTextures = Number(tex.value) > 0;
      var fit = plans.filter(function (p) {
        return p.dailyTokens >= counted(p, total) && (!needsTextures || p.features.indexOf("textures") !== -1);
      })[0];
      var meter = $("#c-meter");
      if (fit) {
        var used = counted(fit, total);
        var share = Math.max(2, Math.min(100, used / fit.dailyTokens * 100));
        meter.style.width = share + "%";
        meter.style.background = share > 85 ? "var(--amber)" : "var(--accent)";
        $("#c-meter-label").textContent = fit.countsCached === false
          ? "~" + used.toLocaleString("en-US") + " new tokens counted - " + Math.round(share) + "% of Free's " + fmt(fit.dailyTokens) + " (cached context is free)"
          : Math.round(share) + "% of " + fit.name + "'s " + fmt(fit.dailyTokens) + " daily tokens";
        $("#c-plan").textContent = fit.name + (fit.price ? " · $" + fit.price.toFixed(2) : "");
        $("#c-cta").textContent = fit.price ? "See " + fit.name : "Start free";
        $("#c-cta").href = fit.price ? "#plan-" + fit.id : "signup.html";
      } else {
        meter.style.width = "100%";
        meter.style.background = "var(--ruby)";
        $("#c-meter-label").textContent = "More than our biggest standard plan";
        $("#c-plan").textContent = "Enterprise";
        $("#c-cta").textContent = "Talk to us";
        $("#c-cta").href = "#plan-enterprise";
      }
    }
    [req, tex, size].forEach(function (input) { input.addEventListener("input", update); });
    update();
  }

  /* ===================================================== promotions */
  /** The admin's running promotion for ``planId`` (Live settings), or null. */
  function activePromo(planId) {
    var promo = window.MCA && window.MCA.look && window.MCA.look.promotion;
    return promo && promo.code && (promo.plans || []).indexOf(planId) >= 0 ? promo : null;
  }
  function salePrice(price, promo) { return Math.round(price * (100 - promo.percent)) / 100; }

  /** Show sale prices on the cards and in the table (or restore normal prices). */
  function applyPromo() {
    DATA.plans.forEach(function (plan) {
      var card = document.getElementById("plan-" + plan.id);
      if (!card || !plan.price) return;
      var promo = activePromo(plan.id);
      var priceBox = card.querySelector(".price");
      var badge = card.querySelector(".sale"), note = card.querySelector(".promo-note");
      if (badge) badge.remove();
      if (note) note.remove();
      if (!promo) {
        priceBox.innerHTML = "<b>$" + plan.price.toFixed(2) + "</b><span>/ month</span>";
        return;
      }
      priceBox.innerHTML = "<s>$" + plan.price.toFixed(2) + "</s><b>$" + salePrice(plan.price, promo).toFixed(2) + "</b><span>/ month</span>";
      badge = document.createElement("span");
      badge.className = "sale";
      badge.textContent = promo.percent + "% off";
      card.appendChild(badge);
      note = document.createElement("p");
      note.className = "promo-note";
      note.innerHTML = window.MCA.escapeHtml(promo.label) + " &middot; code <code>" + window.MCA.escapeHtml(promo.code) +
        "</code> added at checkout" + (promo.terms ? " &middot; " + window.MCA.escapeHtml(promo.terms) : "");
      card.querySelector(".tokens").insertAdjacentElement("afterend", note);
    });
    var cells = document.querySelectorAll("[data-compare-price]");
    Array.prototype.forEach.call(cells, function (td) {
      var plan = DATA.plans.filter(function (p) { return p.id === td.dataset.comparePrice; })[0];
      if (!plan || !plan.price) return;
      var promo = activePromo(plan.id);
      td.innerHTML = promo ? "<s>$" + plan.price.toFixed(2) + "</s>$" + salePrice(plan.price, promo).toFixed(2) : "$" + plan.price.toFixed(2);
    });
  }
  document.addEventListener("mca:look", applyPromo);

  /* ========================================================= pricing */
  function pricing() {
    var host = $("#pricing-cards");
    if (!host) return;
    host.innerHTML = DATA.plans.map(function (plan) {
      var price = plan.price === null ? '<b>Custom</b>' : '<b>$' + (plan.price ? plan.price.toFixed(2) : "0") + "</b><span>/ month</span>";
      var tokens = plan.dailyTokens ? fmt(plan.dailyTokens) + " tokens / day" : "Limits set with you";
      var cta;
      if (plan.id === "free") cta = '<a class="btn btn-block" href="signup.html">Start free</a>';
      else if (plan.id === "enterprise") cta = '<a class="btn btn-block" href="#" data-contact>Contact sales</a>';
      else cta = '<button class="btn btn-block ' + (plan.popular ? "btn-primary" : "") + '" type="button" data-checkout="' + plan.id + '">Choose ' + plan.name + "</button>";
      var items = plan.highlights.map(function (h) {
        var locked = /\blocked\b/i.test(h);
        return "<li" + (locked ? ' class="no"' : "") + ">" + window.MCA.escapeHtml(h) + "</li>";
      }).join("");
      return '<article class="plan reveal' + (plan.popular ? " popular" : "") + '" id="plan-' + plan.id + '">' +
        (plan.popular ? '<span class="tag">MOST PICKED</span>' : "") +
        "<h3>" + plan.name + '</h3><p class="tagline">' + window.MCA.escapeHtml(plan.tagline) + "</p>" +
        '<div class="price">' + price + '</div><div class="tokens">' + tokens + "</div>" +
        "<ul>" + items + "</ul>" + cta + "</article>";
    }).join("");

    // Lemon Squeezy checkout (inactive until the URLs are set in config.js).
    host.addEventListener("click", function (e) {
      var button = e.target.closest("[data-checkout]");
      if (!button) return;
      var id = button.dataset.checkout;
      var url = (cfg.checkout || {})[id];
      if (!url) {
        window.MCA.modal(
          "Paid plans open soon",
          "Checkout isn't switched on yet. Create a free account now and we'll keep your spot - you can upgrade from your account page the moment it opens.",
          [{ label: "Not now" }, { label: "Create free account", primary: true, href: "signup.html?plan=" + encodeURIComponent(id) }]
        );
        return;
      }
      window.MCA.api.me().then(function (me) {
        var target = new URL(url);
        if (me.user && me.user.email) target.searchParams.set("checkout[email]", me.user.email);
        var promo = activePromo(id);
        if (promo) target.searchParams.set("checkout[discount_code]", promo.code);
        location.href = target.href;
      }, function () {
        location.href = "signup.html?plan=" + encodeURIComponent(id);
      });
    });

    // Comparison table.
    var compare = $("#compare");
    var head = "<thead><tr><th></th>" + DATA.plans.map(function (p) { return "<th>" + p.name + "</th>"; }).join("") + "</tr></thead>";
    var rows = "<tr><td>Daily tokens</td>" + DATA.plans.map(function (p) {
      return "<td class=\"mono\">" + (p.dailyTokens ? fmt(p.dailyTokens) : "Custom") + "</td>";
    }).join("") + "</tr>";
    var THINK = { none: "None", low: "Low", normal: "Normal", high: "High" };
    rows += "<tr><td>AI thinking modes</td>" + DATA.plans.map(function (p) {
      var levels = p.thinking || ["none", "low", "normal", "high"];
      return "<td>" + (levels.length === 4 ? "All four" : levels.map(function (l) { return THINK[l]; }).join(", ")) + "</td>";
    }).join("") + "</tr>";
    Object.keys(DATA.features).forEach(function (key) {
      rows += "<tr><td>" + window.MCA.escapeHtml(DATA.features[key]) + "</td>" + DATA.plans.map(function (p) {
        if (p.features.indexOf(key) !== -1) return '<td class="yes" aria-label="included">&#10003;</td>';
        if ((p.rewarded || []).indexOf(key) !== -1) return '<td title="Unlock with a short ad on our website">With a short ad</td>';
        return '<td class="nope" aria-label="not included">&mdash;</td>';
      }).join("") + "</tr>";
    });
    rows += "<tr><td>Ads</td>" + DATA.plans.map(function (p) {
      return "<td>" + ((p.rewarded || []).length ? "Optional, for unlocks" : "None") + "</td>";
    }).join("") + "</tr>";
    rows += "<tr><td>Price / month</td>" + DATA.plans.map(function (p) {
      return "<td" + (p.price ? ' data-compare-price="' + p.id + '"' : "") + ">" + (p.price === null ? "Custom" : "$" + (p.price ? p.price.toFixed(2) : "0")) + "</td>";
    }).join("") + "</tr>";
    compare.innerHTML = "<table>" + head + "<tbody>" + rows + "</tbody></table>";
    var toggle = $("#compare-toggle");
    toggle.addEventListener("click", function () {
      var open = !compare.classList.contains("open");
      compare.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Hide the comparison" : "Compare every feature";
    });

    // The cards were added after ui.js set up scroll reveal.
    $$(".plan.reveal", host).forEach(function (el, i) { setTimeout(function () { el.classList.add("in"); }, 80 * i); });
    applyPromo();  // a promotion that was already known before the cards existed
  }

  document.addEventListener("DOMContentLoaded", function () {
    workbench();
    exampleRuns();
    tour();
    calculator();
    pricing();
  });
})();

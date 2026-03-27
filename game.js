(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const minimapCanvas = document.getElementById("minimap");
  const minimapCtx = minimapCanvas.getContext("2d");

  const hpReadout = document.getElementById("hpReadout");
  const warningText = document.getElementById("warningText");
  const phaseBanner = document.getElementById("phaseBanner");
  const timerLabel = document.getElementById("timerLabel");
  const aliveLabel = document.getElementById("aliveLabel");
  const killLabel = document.getElementById("killLabel");
  const missileCount = document.getElementById("missileCount");
  const leaderboard = document.getElementById("leaderboard");
  const toastLayer = document.getElementById("toastLayer");
  const startScreen = document.getElementById("startScreen");
  const singleModeButton = document.getElementById("singleModeButton");
  const onlineModeButton = document.getElementById("onlineModeButton");
  const modeHint = document.getElementById("modeHint");
  const onlinePanel = document.getElementById("onlinePanel");
  const serverUrlInput = document.getElementById("serverUrlInput");
  const playerNameInput = document.getElementById("playerNameInput");
  const createRoomButton = document.getElementById("createRoomButton");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const joinRoomButton = document.getElementById("joinRoomButton");
  const backToModesButton = document.getElementById("backToModesButton");
  const onlineStatus = document.getElementById("onlineStatus");
  const roomPanel = document.getElementById("roomPanel");
  const roomCodeLabel = document.getElementById("roomCodeLabel");
  const roomPhaseLabel = document.getElementById("roomPhaseLabel");
  const onlinePlayerList = document.getElementById("onlinePlayerList");
  const readyButton = document.getElementById("readyButton");
  const startRoomButton = document.getElementById("startRoomButton");
  const leaveRoomButton = document.getElementById("leaveRoomButton");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayBody = document.getElementById("overlayBody");
  const restartButton = document.getElementById("restartButton");

  const statusCards = {
    magnet: document.querySelector('[data-effect="magnet"]'),
    slow: document.querySelector('[data-effect="slow"]'),
    shield: document.querySelector('[data-effect="shield"]'),
    radiation: document.querySelector('[data-effect="radiation"]'),
  };

  const TAU = Math.PI * 2;
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  };

  const CONFIG = {
    initialZoneSize: 2600,
    targetZoneSizes: [1850, 1200, 700, 420],
    phaseStarts: [60, 120, 210, 300],
    phaseDuration: 10,
    phaseWarningLead: 20,
    chestLead: 15,
    chestEvents: [
      { spawn: 90, count: 3 },
      { spawn: 180, count: 2 },
      { spawn: 240, count: 1 },
    ],
    totalSnakes: 20,
    maxHp: 5000,
    initialHp: 100,
    initialMissiles: 1,
    dotCount: 720,
    crateCap: 24,
    ufoCap: 6,
    crateSpawnEvery: 3.4,
    ufoSpawnEvery: 9.5,
    objectDespawnTime: 42,
    itemProtection: 1,
    dotValue: 1,
    magnetDuration: 5,
    slowDuration: 5,
    shieldDuration: 5,
    missileCooldown: 0.38,
    missileRadius: 96,
    missileLife: 1,
    bodyHitCooldown: 0.32,
    containerHitCooldown: 0.34,
    radiationBaseDps: [20, 34, 54, 78],
    starfieldCount: 260,
  };

  const ITEM_DEFS = {
    missile: { type: "missile", weight: 4.8 },
    mushroom: { type: "mushroom", weight: 2.1, heal: 20 },
    star: { type: "star", weight: 2.2, heal: 40 },
    magnet: { type: "magnet", weight: 2.0, duration: 5 },
    heart: { type: "heart", weight: 1, heal: 1000 },
  };

  const SNAKE_COLORS = [
    ["#76f7ff", "#dffcff"],
    ["#ffb34d", "#fff0c7"],
    ["#ff7b8c", "#ffd2da"],
    ["#98ff84", "#e5ffd8"],
    ["#c287ff", "#f0ddff"],
    ["#ff6b47", "#ffd0b8"],
    ["#57c9ff", "#d8f2ff"],
    ["#ffd56a", "#fff5c5"],
    ["#7ef2c4", "#dbfff0"],
    ["#f596ff", "#ffe0ff"],
  ];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function distance(ax, ay, bx, by) {
    return Math.sqrt(distSq(ax, ay, bx, by));
  }

  function pointSegmentDistanceSq(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq <= 0.0001) {
      return distSq(px, py, ax, ay);
    }
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    return distSq(px, py, closestX, closestY);
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) {
      angle -= TAU;
    }
    while (angle < -Math.PI) {
      angle += TAU;
    }
    return angle;
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
  }

  function formatTime(value) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function pickWeighted(entries) {
    let total = 0;
    for (let i = 0; i < entries.length; i += 1) {
      total += entries[i].weight;
    }
    let cursor = Math.random() * total;
    for (let i = 0; i < entries.length; i += 1) {
      cursor -= entries[i].weight;
      if (cursor <= 0) {
        return entries[i];
      }
    }
    return entries[entries.length - 1];
  }

  function heartCount(hp) {
    return (clamp(hp, 0, CONFIG.maxHp) / 1000).toFixed(1);
  }

  function createToast(text, duration) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = text;
    toastLayer.appendChild(node);
    window.setTimeout(function () {
      node.remove();
    }, duration * 1000);
  }

  class Game {
    constructor() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.keys = input;
      this.state = "menu";
      this.selectedMode = null;
      this.multiplayer = {
        serverUrl: "",
        room: null,
        playerId: "",
        eventSource: null,
        matchActive: false,
        matchFetchInFlight: false,
        matchPollTimer: 0,
        lastInputSentAt: 0,
        lastInputSignature: "",
        fireSeq: 0,
      };
      this.setupEvents();
      this.restart(true);
      this.showStartScreen();
    }

    setupEvents() {
      const self = this;
      window.addEventListener("resize", function () {
        self.resize();
      });

      window.addEventListener("keydown", function (event) {
        const key = event.key.toLowerCase();
        if (key === "w" || event.key === "ArrowUp") {
          input.up = true;
        }
        if (key === "s" || event.key === "ArrowDown") {
          input.down = true;
        }
        if (key === "a" || event.key === "ArrowLeft") {
          input.left = true;
        }
        if (key === "d" || event.key === "ArrowRight") {
          input.right = true;
        }
        if (key === "n") {
          input.boost = true;
        }
        if (event.code === "Space" && self.state === "playing") {
          event.preventDefault();
          if (self.selectedMode === "online" && self.multiplayer.matchActive) {
            self.multiplayer.fireSeq += 1;
            self.sendOnlineInput(true);
          } else {
            self.fireMissile(self.player);
          }
        }
        if (key === "r") {
          self.restartSelectedMode();
        }
      });

      window.addEventListener("keyup", function (event) {
        const key = event.key.toLowerCase();
        if (key === "w" || event.key === "ArrowUp") {
          input.up = false;
        }
        if (key === "s" || event.key === "ArrowDown") {
          input.down = false;
        }
        if (key === "a" || event.key === "ArrowLeft") {
          input.left = false;
        }
        if (key === "d" || event.key === "ArrowRight") {
          input.right = false;
        }
        if (key === "n") {
          input.boost = false;
        }
      });

      restartButton.addEventListener("click", function () {
        self.restartSelectedMode();
      });

      singleModeButton.addEventListener("click", function () {
        self.startSingleMode();
      });

      onlineModeButton.addEventListener("click", function () {
        self.previewMultiplayerMode();
      });

      createRoomButton.addEventListener("click", function () {
        self.createOnlineRoom();
      });

      joinRoomButton.addEventListener("click", function () {
        self.joinOnlineRoom();
      });

      backToModesButton.addEventListener("click", function () {
        self.leaveOnlineRoom(true);
        self.hideOnlinePanel();
      });

      readyButton.addEventListener("click", function () {
        self.toggleOnlineReady();
      });

      startRoomButton.addEventListener("click", function () {
        self.startOnlineRoom();
      });

      leaveRoomButton.addEventListener("click", function () {
        self.leaveOnlineRoom();
      });

      window.addEventListener("pagehide", function () {
        self.leaveOnlineRoom(true);
      });
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      canvas.width = Math.floor(this.width * DPR);
      canvas.height = Math.floor(this.height * DPR);
      canvas.style.width = this.width + "px";
      canvas.style.height = this.height + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    restart(silent) {
      this.resize();
      this.time = 0;
      this.lastTick = performance.now();
      this.finished = false;
      this.nextCrateSpawn = 5;
      this.nextUfoSpawn = 10;
      this.messageState = {};
      this.starfield = this.generateStarfield();
      this.zoneTargets = this.generateZoneTargets();
      this.chestEvents = this.createChestEvents();
      this.snakes = [];
      this.dots = [];
      this.items = [];
      this.crates = [];
      this.ufos = [];
      this.droplets = [];
      this.missiles = [];
      this.floatingTexts = [];
      this.killFeed = [];
      this.matchSummary = null;

      for (let i = 0; i < CONFIG.dotCount; i += 1) {
        this.dots.push(this.createDot(false));
      }

      this.player = this.createSnake(0, true);
      this.snakes.push(this.player);

      for (let i = 1; i < CONFIG.totalSnakes; i += 1) {
        this.snakes.push(this.createSnake(i, false));
      }

      overlay.classList.add("hidden");
      overlayTitle.textContent = "游戏结束";
      overlayBody.textContent = "";
      if (!silent) {
        createToast("20 蛇混战开始", 2.4);
      }
    }

    showStartScreen() {
      this.leaveOnlineRoom(true);
      this.state = "menu";
      startScreen.classList.remove("hidden");
      overlay.classList.add("hidden");
      modeHint.textContent = "单机：20 蛇混战，19 条 AI，直接开始。";
      this.hideOnlinePanel(true);
    }

    startSingleMode() {
      this.leaveOnlineRoom(true);
      this.selectedMode = "single";
      this.state = "playing";
      startScreen.classList.add("hidden");
      this.restart(false);
    }

    previewMultiplayerMode() {
      this.selectedMode = "online";
      modeHint.textContent = "联机：创建或加入房间，由服务器统一结算战斗。";
      onlinePanel.classList.remove("hidden");
      serverUrlInput.value = serverUrlInput.value || this.defaultServerUrl();
      playerNameInput.value = playerNameInput.value || "Pilot-" + Math.floor(rand(100, 999));
      onlineStatus.textContent = "联机大厅未连接";
    }

    restartSelectedMode() {
      if (this.selectedMode === "single") {
        this.state = "playing";
        startScreen.classList.add("hidden");
        this.restart(false);
        return;
      }
      this.showStartScreen();
    }

    hideOnlinePanel(silent) {
      onlinePanel.classList.add("hidden");
      roomPanel.classList.add("hidden");
      if (!silent) {
        modeHint.textContent = "单机：20 蛇混战，19 条 AI，直接开始。";
      }
    }

    defaultServerUrl() {
      if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        return window.location.origin;
      }
      return "http://localhost:3000";
    }

    getOnlineServerUrl() {
      return (serverUrlInput.value.trim() || this.defaultServerUrl()).replace(/\/+$/, "");
    }

    getOnlinePlayerName() {
      return (playerNameInput.value.trim() || "Pilot-" + Math.floor(rand(100, 999))).slice(0, 18);
    }

    async apiRequest(pathname, options) {
      const response = await fetch(this.getOnlineServerUrl() + pathname, {
        method: options && options.method ? options.method : "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined,
      });
      const payload = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        throw new Error(payload.error || "请求失败");
      }
      return payload;
    }

    resetOnlineRoomState() {
      if (this.multiplayer.eventSource) {
        this.multiplayer.eventSource.close();
      }
      this.multiplayer.eventSource = null;
      this.multiplayer.room = null;
      this.multiplayer.playerId = "";
      this.multiplayer.matchActive = false;
      this.multiplayer.matchFetchInFlight = false;
      if (this.multiplayer.matchPollTimer) {
        window.clearTimeout(this.multiplayer.matchPollTimer);
      }
      this.multiplayer.matchPollTimer = 0;
      this.multiplayer.lastInputSentAt = 0;
      this.multiplayer.lastInputSignature = "";
      this.multiplayer.fireSeq = 0;
      roomPanel.classList.add("hidden");
      roomCodeLabel.textContent = "----";
      roomPhaseLabel.textContent = "大厅";
      onlinePlayerList.innerHTML = "";
    }

    subscribeOnlineRoom(code, playerId) {
      if (this.multiplayer.eventSource) {
        this.multiplayer.eventSource.close();
      }
      const source = new EventSource(
        this.getOnlineServerUrl() +
          "/api/rooms/" +
          encodeURIComponent(code) +
          "/events?playerId=" +
          encodeURIComponent(playerId)
      );
      this.multiplayer.eventSource = source;
      source.addEventListener("room", (event) => {
        const payload = JSON.parse(event.data);
        this.multiplayer.room = payload;
        this.renderOnlineRoom();
      });
      source.addEventListener("match", (event) => {
        const payload = JSON.parse(event.data);
        this.applyOnlineMatchSnapshot(payload);
      });
      source.onerror = () => {
        onlineStatus.textContent = "联机流已断开，请重新连接房间";
      };
    }

    primeOnlineMessageState(time) {
      this.messageState = this.messageState || {};
      for (let i = 0; i < CONFIG.phaseStarts.length; i += 1) {
        const warnTime = CONFIG.phaseStarts[i] - CONFIG.phaseWarningLead;
        this.messageState["phaseWarn" + i] = time >= warnTime;
      }
    }

    applyOnlineMatchSnapshot(snapshot) {
      console.log("[online:match]", {
        phase: snapshot.phase,
        time: snapshot.time,
        snakes: snapshot.snakes ? snapshot.snakes.length : 0,
      });
      const wasActive = this.multiplayer.matchActive;
      const wasFinished = this.finished;
      this.selectedMode = "online";
      this.multiplayer.matchActive = true;
      if (this.multiplayer.matchPollTimer) {
        window.clearTimeout(this.multiplayer.matchPollTimer);
      }
      this.multiplayer.matchPollTimer = 0;
      this.time = snapshot.time || 0;
      this.zoneTargets = snapshot.zoneTargets || this.zoneTargets;
      this.chestEvents = snapshot.chestEvents || [];
      this.snakes = (snapshot.snakes || []).map(function (snake) {
        snake.trail = snake.trail || [];
        snake.damageTexts = snake.damageTexts || [];
        return snake;
      });
      this.dots = snapshot.dots || [];
      this.items = snapshot.items || [];
      this.crates = snapshot.crates || [];
      this.ufos = snapshot.ufos || [];
      this.droplets = snapshot.droplets || [];
      this.missiles = snapshot.missiles || [];
      this.killFeed = snapshot.killFeed || [];
      this.finished = snapshot.phase === "finished";
      this.state = this.finished ? "gameover" : "playing";
      this.player =
        this.snakes.find((snake) => snake.isPlayer) ||
        this.player ||
        this.snakes[0] ||
        null;
      this.matchSummary = snapshot.summary || null;

      if (!wasActive) {
        this.primeOnlineMessageState(this.time);
      }

      startScreen.classList.add("hidden");
      overlay.classList.add("hidden");
      this.hideOnlinePanel(true);
      this.handlePhaseMessages(
        snapshot.currentZone || this.getCurrentZone(this.time),
        snapshot.incomingZone || this.getIncomingZone(this.time)
      );

      if (!wasActive) {
        this.sendOnlineInput(true);
      }

      if (this.finished && !wasFinished) {
        this.showOnlineMatchResult(snapshot.summary);
      }
    }

    showOnlineMatchResult(summary) {
      overlay.classList.remove("hidden");
      if (summary && summary.playerId === this.multiplayer.playerId) {
        overlayTitle.textContent = "你是最后赢家";
        overlayBody.innerHTML =
          "终局生命值：" +
          Math.round(summary.hp) +
          "<br>击杀：" +
          summary.kills +
          "<br>联机战斗中活到了最后。";
      } else if (summary) {
        overlayTitle.textContent = "最终胜者：" + summary.id;
        overlayBody.innerHTML =
          "你的蛇已被淘汰。<br>冠军生命值：" +
          Math.round(summary.hp) +
          "<br>冠军击杀：" +
          summary.kills;
      } else {
        overlayTitle.textContent = "全员覆灭";
        overlayBody.textContent = "这局里没有蛇活到最后。";
      }
    }

    buildOnlineInputState() {
      return {
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        boost: input.boost,
        fireSeq: this.multiplayer.fireSeq,
      };
    }

    sendOnlineInput(force) {
      if (
        !this.multiplayer.matchActive ||
        !this.multiplayer.room ||
        !this.multiplayer.playerId ||
        !this.getOnlineServerUrl()
      ) {
        return;
      }
      const state = this.buildOnlineInputState();
      const signature = JSON.stringify(state);
      const now = performance.now();
      if (
        !force &&
        signature === this.multiplayer.lastInputSignature &&
        now - this.multiplayer.lastInputSentAt < 120
      ) {
        return;
      }

      this.multiplayer.lastInputSentAt = now;
      this.multiplayer.lastInputSignature = signature;
      fetch(
        this.getOnlineServerUrl() +
          "/api/rooms/" +
          encodeURIComponent(this.multiplayer.room.code) +
          "/input",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            playerId: this.multiplayer.playerId,
            input: state,
          }),
        }
      ).catch(() => {
        onlineStatus.textContent = "联机输入发送失败";
      });
    }

    renderOnlineRoom() {
      const room = this.multiplayer.room;
      if (!room) {
        roomPanel.classList.add("hidden");
        return;
      }

      if ((room.phase === "playing" || room.phase === "finished") && !this.multiplayer.matchActive) {
        this.ensureOnlineMatchPolling();
      }

      roomPanel.classList.remove("hidden");
      roomCodeLabel.textContent = room.code;
      roomPhaseLabel.textContent = room.phase;
      onlineStatus.textContent = room.message || "房间已连接";

      const selfPlayer = room.players.find((player) => player.id === this.multiplayer.playerId);
      readyButton.textContent = selfPlayer && selfPlayer.ready ? "取消准备" : "准备";

        onlinePlayerList.innerHTML = room.players
        .map((player) => {
          return (
            '<div class="online-player-row' +
            (player.id === this.multiplayer.playerId ? " self" : "") +
            '">' +
            "<div>" +
            escapeHtml(player.name) +
            "</div>" +
            '<div class="online-badge' +
            (player.ready ? " ready" : "") +
            '">' +
            (player.ready ? "已准备" : "未准备") +
            "</div>" +
            '<div class="online-badge">' +
            (player.isHost ? "房主" : player.connected ? "在线" : "断开") +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    ensureOnlineMatchPolling() {
      if (this.multiplayer.matchActive || this.multiplayer.matchPollTimer) {
        return;
      }
      const poll = () => {
        this.multiplayer.matchPollTimer = 0;
        if (
          this.multiplayer.matchActive ||
          !this.multiplayer.room ||
          !this.multiplayer.playerId ||
          (this.multiplayer.room.phase !== "playing" && this.multiplayer.room.phase !== "finished")
        ) {
          return;
        }
        this.fetchOnlineMatchSnapshot();
        if (!this.multiplayer.matchActive) {
          this.multiplayer.matchPollTimer = window.setTimeout(poll, 500);
        }
      };
      poll();
    }

    async fetchOnlineMatchSnapshot() {
      if (
        this.multiplayer.matchFetchInFlight ||
        !this.multiplayer.room ||
        !this.multiplayer.playerId
      ) {
        return;
      }
      this.multiplayer.matchFetchInFlight = true;
      try {
        const payload = await this.apiRequest(
          "/api/rooms/" +
            encodeURIComponent(this.multiplayer.room.code) +
            "/match?playerId=" +
            encodeURIComponent(this.multiplayer.playerId)
        );
        if (payload && payload.match) {
          console.log("[online:match-fetch]", payload.match.phase, payload.match.time);
          this.applyOnlineMatchSnapshot(payload.match);
        }
      } catch (_error) {
        if (this.multiplayer.room && this.multiplayer.room.phase === "playing") {
          onlineStatus.textContent = "战斗同步中...";
        }
      } finally {
        this.multiplayer.matchFetchInFlight = false;
      }
    }

    async createOnlineRoom() {
      try {
        const payload = await this.apiRequest("/api/rooms", {
          method: "POST",
          body: {
            name: this.getOnlinePlayerName(),
          },
        });
        this.multiplayer.playerId = payload.playerId;
        this.multiplayer.room = payload.room;
        roomCodeInput.value = payload.room.code;
        this.subscribeOnlineRoom(payload.room.code, payload.playerId);
        this.renderOnlineRoom();
        onlineStatus.textContent = "房间创建成功";
      } catch (error) {
        onlineStatus.textContent = error.message;
      }
    }

    async joinOnlineRoom() {
      try {
        const code = roomCodeInput.value.trim().toUpperCase();
        if (!code) {
          onlineStatus.textContent = "先输入房间码";
          return;
        }
        const payload = await this.apiRequest("/api/rooms/" + encodeURIComponent(code) + "/join", {
          method: "POST",
          body: {
            name: this.getOnlinePlayerName(),
          },
        });
        this.multiplayer.playerId = payload.playerId;
        this.multiplayer.room = payload.room;
        this.subscribeOnlineRoom(payload.room.code, payload.playerId);
        this.renderOnlineRoom();
        onlineStatus.textContent = "加入房间成功";
      } catch (error) {
        onlineStatus.textContent = error.message;
      }
    }

    async toggleOnlineReady() {
      if (!this.multiplayer.room || !this.multiplayer.playerId) {
        onlineStatus.textContent = "先创建或加入房间";
        return;
      }
      const selfPlayer = this.multiplayer.room.players.find(
        (player) => player.id === this.multiplayer.playerId
      );
      try {
        const payload = await this.apiRequest(
          "/api/rooms/" + encodeURIComponent(this.multiplayer.room.code) + "/ready",
          {
            method: "POST",
            body: {
              playerId: this.multiplayer.playerId,
              ready: !(selfPlayer && selfPlayer.ready),
            },
          }
        );
      this.multiplayer.room = payload.room;
      this.renderOnlineRoom();
    } catch (error) {
      onlineStatus.textContent = error.message;
    }
    }

    async startOnlineRoom() {
      if (!this.multiplayer.room || !this.multiplayer.playerId) {
        onlineStatus.textContent = "先进入房间";
        return;
      }
      try {
        const payload = await this.apiRequest(
          "/api/rooms/" + encodeURIComponent(this.multiplayer.room.code) + "/start",
          {
            method: "POST",
            body: {
              playerId: this.multiplayer.playerId,
            },
          }
        );
        this.multiplayer.room = payload.room;
        this.renderOnlineRoom();
        if (payload.room && (payload.room.phase === "playing" || payload.room.phase === "finished")) {
          this.ensureOnlineMatchPolling();
        }
      } catch (error) {
        onlineStatus.textContent = error.message;
      }
    }

    async leaveOnlineRoom(silent) {
      if (this.multiplayer.room && this.multiplayer.playerId) {
        try {
          await fetch(
            this.getOnlineServerUrl() +
              "/api/rooms/" +
              encodeURIComponent(this.multiplayer.room.code) +
              "/leave",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                playerId: this.multiplayer.playerId,
              }),
              keepalive: true,
            }
          );
        } catch (_error) {
        }
      }
      this.resetOnlineRoomState();
      if (!silent) {
        onlineStatus.textContent = "已离开房间";
      }
    }

    generateStarfield() {
      const stars = [];
      for (let i = 0; i < CONFIG.starfieldCount; i += 1) {
        stars.push({
          x: rand(-CONFIG.initialZoneSize, CONFIG.initialZoneSize),
          y: rand(-CONFIG.initialZoneSize, CONFIG.initialZoneSize),
          radius: rand(0.8, 2.2),
          alpha: rand(0.18, 0.65),
          color: Math.random() > 0.82 ? "#ffc770" : "#76f7ff",
        });
      }
      return stars;
    }

    generateZoneTargets() {
      const zones = [{ x: 0, y: 0, size: CONFIG.initialZoneSize }];
      for (let i = 0; i < CONFIG.targetZoneSizes.length; i += 1) {
        const prev = zones[zones.length - 1];
        const nextSize = CONFIG.targetZoneSizes[i];
        const drift = (prev.size - nextSize) * 0.22;
        zones.push({
          x: clamp(prev.x + rand(-drift, drift), -prev.size * 0.18, prev.size * 0.18),
          y: clamp(prev.y + rand(-drift, drift), -prev.size * 0.18, prev.size * 0.18),
          size: nextSize,
        });
      }
      return zones;
    }

    createChestEvents() {
      const events = [];
      for (let i = 0; i < CONFIG.chestEvents.length; i += 1) {
        const event = CONFIG.chestEvents[i];
        const zoneIndex = Math.min(i + 1, this.zoneTargets.length - 1);
        const previewPositions = [];
        for (let count = 0; count < event.count; count += 1) {
          previewPositions.push(this.randomPositionInZone(this.zoneTargets[zoneIndex], 120));
        }
        events.push({
          announce: event.spawn - CONFIG.chestLead,
          spawn: event.spawn,
          count: event.count,
          previewPositions: previewPositions,
          announced: false,
          spawned: false,
          zoneIndex: zoneIndex,
        });
      }
      return events;
    }

    createSnake(index, isPlayer) {
      const palette = SNAKE_COLORS[index % SNAKE_COLORS.length];
      const zone = this.zoneTargets[0];
      const pos = this.randomPositionInZone(zone, 140);
      const snake = {
        id: "S-" + String(index + 1).padStart(2, "0"),
        isPlayer: isPlayer,
        name: isPlayer ? "YOU" : "AI-" + String(index + 1).padStart(2, "0"),
        x: pos.x,
        y: pos.y,
        angle: rand(0, TAU),
        desiredAngle: rand(0, TAU),
        hp: CONFIG.initialHp,
        radius: 9,
        bodyLength: 96,
        pointSpacing: 6,
        segmentCount: 0,
        trail: [],
        alive: true,
        missiles: CONFIG.initialMissiles,
        kills: 0,
        lastShotAt: -99,
        lastBodyHitAt: -99,
        effects: {
          magnetUntil: 0,
          slowUntil: 0,
          shieldUntil: 0,
        },
        bodyColor: palette[0],
        headColor: palette[1],
        textColor: palette[0],
        ai: {
          wanderAngle: rand(0, TAU),
          goalX: pos.x,
          goalY: pos.y,
          shootDelay: rand(1.8, 3),
          boostUntil: 0,
          aggression: rand(0.38, 0.72),
          caution: rand(0.92, 1.2),
          missileConfidence: rand(0.6, 0.9),
        },
        damageTexts: [],
      };
      this.syncSnakeScale(snake);
      return snake;
    }

    createDot(isWreck, origin, value) {
      const zone = this.zoneTargets[0];
      const pos = origin || this.randomPositionInZone(zone, 30);
      return {
        x: pos.x,
        y: pos.y,
        value: value || CONFIG.dotValue,
        radius: isWreck ? rand(5, 9) : rand(2.2, 3.8),
        color: isWreck ? "#ffc770" : "#76f7ff",
        alpha: isWreck ? rand(0.65, 0.95) : rand(0.35, 0.85),
        kind: isWreck ? "wreck" : "dot",
        drift: rand(0.6, 1.6),
        ttl: isWreck ? rand(28, 44) : Infinity,
      };
    }

    createItem(type, x, y) {
      return {
        type: type,
        x: x,
        y: y,
        radius: type === "heart" ? 24 : 16,
        seed: Math.random() * 1000,
        protectedUntil: this.time + CONFIG.itemProtection,
        ttl: this.time + CONFIG.objectDespawnTime,
        vx: rand(-72, 72),
        vy: rand(-72, 72),
      };
    }

    createCrate() {
      const pos = this.randomPositionInZone(this.getCurrentZone(this.time), 120);
      return {
        x: pos.x,
        y: pos.y,
        radius: 26,
        type: "crate",
        hp: 1,
        createdAt: this.time,
        contacting: {},
      };
    }

    createUfo() {
      const pos = this.randomPositionInZone(this.getCurrentZone(this.time), 160);
      return {
        x: pos.x,
        y: pos.y,
        radius: 34,
        type: "ufo",
        hp: 4,
        createdAt: this.time,
        contacting: {},
        seed: Math.random() * 1000,
        nextBurst: this.time + rand(7.5, 10),
        vx: rand(-46, 46),
        vy: rand(-46, 46),
      };
    }

    createChest(position) {
      return {
        x: position.x,
        y: position.y,
        radius: 54,
        type: "chest",
        hp: 12,
        createdAt: this.time,
        contacting: {},
      };
    }

    randomPositionInZone(zone, margin) {
      const safeMargin = margin || 0;
      const half = zone.size * 0.5 - safeMargin;
      return {
        x: rand(zone.x - half, zone.x + half),
        y: rand(zone.y - half, zone.y + half),
      };
    }

    getCurrentZone(time) {
      for (let i = CONFIG.phaseStarts.length - 1; i >= 0; i -= 1) {
        const start = CONFIG.phaseStarts[i];
        if (time >= start) {
          const progress = clamp((time - start) / CONFIG.phaseDuration, 0, 1);
          const from = this.zoneTargets[i];
          const to = this.zoneTargets[i + 1];
          return {
            x: lerp(from.x, to.x, easeOutCubic(progress)),
            y: lerp(from.y, to.y, easeOutCubic(progress)),
            size: lerp(from.size, to.size, easeOutCubic(progress)),
            phaseIndex: i + 1,
            progress: progress,
          };
        }
      }
      return {
        x: this.zoneTargets[0].x,
        y: this.zoneTargets[0].y,
        size: this.zoneTargets[0].size,
        phaseIndex: 0,
        progress: 0,
      };
    }

    getIncomingZone(time) {
      for (let i = 0; i < CONFIG.phaseStarts.length; i += 1) {
        if (time < CONFIG.phaseStarts[i]) {
          return {
            phaseStart: CONFIG.phaseStarts[i],
            zone: this.zoneTargets[i + 1],
            index: i + 1,
          };
        }
      }
      return null;
    }

    isInsideZone(x, y, zone) {
      const half = zone.size * 0.5;
      return (
        x >= zone.x - half &&
        x <= zone.x + half &&
        y >= zone.y - half &&
        y <= zone.y + half
      );
    }

    getDistanceOutsideZone(x, y, zone) {
      const half = zone.size * 0.5;
      const dx = Math.max(zone.x - half - x, 0, x - (zone.x + half));
      const dy = Math.max(zone.y - half - y, 0, y - (zone.y + half));
      return Math.sqrt(dx * dx + dy * dy);
    }

    syncSnakeScale(snake) {
      const hpRatio = clamp(snake.hp / CONFIG.maxHp, 0, 1);
      snake.radius = lerp(9, 30, Math.sqrt(hpRatio));
      snake.bodyLength = lerp(96, 1180, hpRatio);
      snake.pointSpacing = lerp(3.6, 5.2, hpRatio);
      snake.segmentCount = clamp(Math.round(snake.bodyLength / 3.8), 18, 320);
      this.syncSnakeSegments(snake);
    }

    syncSnakeSegments(snake) {
      const desired = snake.segmentCount || 0;
      if (!snake.trail) {
        snake.trail = [];
      }

      if (snake.trail.length === 0 && desired > 0) {
        for (let i = 1; i <= desired; i += 1) {
          snake.trail.push({
            x: snake.x - Math.cos(snake.angle) * snake.pointSpacing * i,
            y: snake.y - Math.sin(snake.angle) * snake.pointSpacing * i,
          });
        }
        return;
      }

      while (snake.trail.length < desired) {
        const tail = snake.trail[snake.trail.length - 1] || { x: snake.x, y: snake.y };
        snake.trail.push({ x: tail.x, y: tail.y });
      }

      while (snake.trail.length > desired) {
        snake.trail.pop();
      }
    }

    queuePlayerValueText(snake, value, color, size) {
      if (!snake || !snake.isPlayer) {
        return;
      }
      snake.damageTexts.push({
        text: value > 0 ? "+" + Math.round(value) : String(Math.round(value)),
        color: color,
        life: 1.25,
        offsetY: -34 - Math.min(3, snake.damageTexts.length) * 18,
        size: size || 22,
      });
    }

    addHp(snake, amount, source) {
      const before = snake.hp;
      snake.hp = clamp(snake.hp + amount, 0, CONFIG.maxHp);
      this.syncSnakeScale(snake);
      const gained = snake.hp - before;
      if (
        gained > 0 &&
        (source === "missile" || source === "body" || source === "mushroom" || source === "star" || source === "heart")
      ) {
        this.queuePlayerValueText(snake, gained, "#7bffb2", source === "heart" ? 28 : 23);
      }
    }

    killSnake(target, killer, reason) {
      if (!target.alive) {
        return;
      }
      const deathHp = target.hp;
      target.hp = 0;
      target.alive = false;
      if (killer) {
        killer.kills += 1;
      }
      this.spawnWreckage(target, Math.max(180, deathHp));
      this.killFeed.unshift({
        text:
          target.id +
          " 被 " +
          (killer ? killer.id : "辐射") +
          " 击毁" +
          (reason === "missile" ? " [导弹]" : reason === "body" ? " [撞击]" : ""),
        ttl: 6,
      });
      this.killFeed = this.killFeed.slice(0, 4);
      if (target.isPlayer) {
        createToast("你已淘汰", 2.2);
      }
    }

    spawnWreckage(snake, hpValue) {
      const pieces = clamp(Math.round(hpValue / 90), 16, 58);
      const perPiece = Math.max(2, Math.round((hpValue * 0.58) / pieces));
      for (let i = 0; i < pieces; i += 1) {
        const anchor = snake.trail[Math.floor(rand(0, snake.trail.length))] || {
          x: snake.x,
          y: snake.y,
        };
        this.dots.push(
          this.createDot(
            true,
            {
              x: anchor.x + rand(-28, 28),
              y: anchor.y + rand(-28, 28),
            },
            perPiece
          )
        );
      }
    }

    applyDamage(target, amount, attacker, source) {
      if (!target.alive || amount <= 0) {
        return 0;
      }
      if (source !== "radiation" && target.effects.shieldUntil > this.time) {
        return 0;
      }
      if (target.hp < 400 && source !== "radiation") {
        amount = target.hp;
      }
      if (source === "radiation" && target.hp < 400) {
        amount = target.hp;
      }
      const actual = clamp(amount, 0, target.hp);
      target.hp -= actual;
      this.syncSnakeScale(target);

      if ((source === "missile" || source === "body") && target.isPlayer) {
        this.queuePlayerValueText(target, -actual, "#ff5f73", 24);
      }

      if (source !== "radiation") {
        target.effects.shieldUntil = Math.max(
          target.effects.shieldUntil,
          this.time + CONFIG.shieldDuration
        );
      }

      if (attacker && attacker !== target) {
        this.addHp(attacker, actual, source);
      }

      if (target.hp <= 0) {
        this.killSnake(target, attacker, source);
      }

      return actual;
    }

    fireMissile(snake) {
      if (!snake || !snake.alive) {
        return;
      }
      if (snake.missiles <= 0) {
        return;
      }
      if (this.time - snake.lastShotAt < CONFIG.missileCooldown) {
        return;
      }
      snake.lastShotAt = this.time;
      snake.missiles -= 1;
      const distanceAhead = 86 + snake.radius;
      const x = snake.x + Math.cos(snake.angle) * distanceAhead;
      const y = snake.y + Math.sin(snake.angle) * distanceAhead;
      this.missiles.push({
        x: x,
        y: y,
        ownerId: snake.id,
        ttl: CONFIG.missileLife,
        totalLife: CONFIG.missileLife,
        radius: CONFIG.missileRadius,
        color: snake.isPlayer ? "#62b9ff" : "#ff657a",
      });
    }

    update(dt) {
      if (this.selectedMode === "online" && this.multiplayer.matchActive) {
        if (!this.finished) {
          this.sendOnlineInput(false);
        }
        this.render();
        return;
      }

      if (this.state !== "playing" || this.finished) {
        this.render();
        return;
      }

      this.time += dt;
      const zone = this.getCurrentZone(this.time);
      const incoming = this.getIncomingZone(this.time);

      this.handlePhaseMessages(zone, incoming);
      this.handleChestSchedule();
      this.spawnObjects();
      this.updateDots(dt);
      this.updateItems(dt);
      this.updateContainers(dt);
      this.updateDroplets(dt);
      this.updateMissiles(dt);
      this.updateSnakes(dt, zone, incoming);
      this.resolveCollections();
      this.resolveBodyCollisions();
      this.resolveContainerCollisions();
      this.updateTexts(dt);
      this.trimKillFeed(dt);
      this.checkWinCondition();
      this.render();
    }

    handlePhaseMessages(zone, incoming) {
      for (let i = 0; i < CONFIG.phaseStarts.length; i += 1) {
        const warnTime = CONFIG.phaseStarts[i] - CONFIG.phaseWarningLead;
        if (!this.messageState["phaseWarn" + i] && this.time >= warnTime) {
          this.messageState["phaseWarn" + i] = true;
          createToast("20s 后辐射扩散", 2.6);
        }
      }

      if (incoming && incoming.phaseStart - this.time <= CONFIG.phaseWarningLead) {
        warningText.textContent = "辐射 " + Math.ceil(incoming.phaseStart - this.time) + "s";
      } else {
        const activeChest = this.chestEvents.find(function (event) {
          return event.announced && !event.spawned;
        });
        warningText.textContent = activeChest
          ? "宝箱 " + Math.max(0, Math.ceil(activeChest.spawn - this.time)) + "s"
          : "存活到最后";
      }

      phaseBanner.textContent =
        zone.phaseIndex === 0
          ? "安全区"
          : zone.progress < 1
            ? "辐射扩散"
            : zone.phaseIndex >= CONFIG.phaseStarts.length
              ? "终局"
              : "收缩完成";
    }

    handleChestSchedule() {
      for (let i = 0; i < this.chestEvents.length; i += 1) {
        const event = this.chestEvents[i];
        if (!event.announced && this.time >= event.announce) {
          event.announced = true;
          createToast(CONFIG.chestLead + "s 后投放 " + event.count + " 宝箱", 2.8);
        }
        if (!event.spawned && this.time >= event.spawn) {
          event.spawned = true;
          for (let j = 0; j < event.previewPositions.length; j += 1) {
            this.crates.push(this.createChest(event.previewPositions[j]));
          }
          createToast("宝箱已投放", 2.4);
        }
      }
    }

    spawnObjects() {
      if (this.time >= this.nextCrateSpawn) {
        this.nextCrateSpawn = this.time + CONFIG.crateSpawnEvery + rand(-2, 2);
        const aliveCrates = this.crates.filter(function (entity) {
          return entity.type === "crate";
        }).length;
        if (aliveCrates < CONFIG.crateCap) {
          this.crates.push(this.createCrate());
        }
      }

      if (this.time >= this.nextUfoSpawn) {
        this.nextUfoSpawn = this.time + CONFIG.ufoSpawnEvery + rand(-3, 3);
        const aliveUfos = this.ufos.length;
        if (aliveUfos < CONFIG.ufoCap) {
          this.ufos.push(this.createUfo());
        }
      }

      let normalDots = 0;
      for (let i = 0; i < this.dots.length; i += 1) {
        if (this.dots[i].kind === "dot") {
          normalDots += 1;
        }
      }
      while (normalDots < CONFIG.dotCount) {
        this.dots.push(this.createDot(false));
        normalDots += 1;
      }
    }

    updateDots(dt) {
      for (let i = this.dots.length - 1; i >= 0; i -= 1) {
        const dot = this.dots[i];
        if (dot.kind === "wreck") {
          dot.ttl -= dt;
          if (dot.ttl <= 0) {
            this.dots.splice(i, 1);
            continue;
          }
          dot.x += Math.cos(this.time * dot.drift + i) * dt * 5;
          dot.y += Math.sin(this.time * dot.drift * 0.8 + i * 0.2) * dt * 5;
        }
      }
    }

    updateItems(dt) {
      for (let i = this.items.length - 1; i >= 0; i -= 1) {
        const item = this.items[i];
        const wobbleX =
          Math.sin(this.time * 1.9 + item.seed) * 48 +
          Math.cos(this.time * 0.63 + item.seed * 0.8) * 34;
        const wobbleY =
          Math.cos(this.time * 1.35 + item.seed * 0.7) * 44 +
          Math.sin(this.time * 0.88 + item.seed * 0.5) * 30;
        item.vx += wobbleX * dt * 1.18;
        item.vy += wobbleY * dt * 1.18;
        item.vx = clamp(item.vx, -126, 126);
        item.vy = clamp(item.vy, -126, 126);
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.vx *= 0.992;
        item.vy *= 0.992;

        if (this.time > item.ttl) {
          this.items.splice(i, 1);
        }
      }
    }

    updateContainers(dt) {
      for (let i = this.crates.length - 1; i >= 0; i -= 1) {
        const entity = this.crates[i];
        if (entity.type === "chest" && this.time - entity.createdAt > 70) {
          this.crates.splice(i, 1);
        }
      }

      for (let i = this.ufos.length - 1; i >= 0; i -= 1) {
        const ufo = this.ufos[i];
        const sway =
          Math.sin(this.time * 0.92 + ufo.seed) * 56 +
          Math.cos(this.time * 0.47 + ufo.seed * 0.6) * 24;
        const rise =
          Math.cos(this.time * 0.78 + ufo.seed * 0.9) * 46 +
          Math.sin(this.time * 0.54 + ufo.seed * 0.3) * 20;
        ufo.vx += sway * dt * 1.08;
        ufo.vy += rise * dt * 1.08;
        ufo.vx = clamp(ufo.vx, -78, 78);
        ufo.vy = clamp(ufo.vy, -78, 78);
        ufo.x += ufo.vx * dt;
        ufo.y += ufo.vy * dt;
        ufo.vx *= 0.992;
        ufo.vy *= 0.992;

        const zone = this.getCurrentZone(this.time);
        const half = zone.size * 0.5 - 110;
        ufo.x = clamp(ufo.x, zone.x - half, zone.x + half);
        ufo.y = clamp(ufo.y, zone.y - half, zone.y + half);

        if (this.time >= ufo.nextBurst) {
          ufo.nextBurst = this.time + 11.5;
          this.emitDropletRing(ufo);
        }
      }
    }

    emitDropletRing(ufo) {
      const count = 16;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU;
        const speed = rand(88, 108);
        this.droplets.push({
          x: ufo.x,
          y: ufo.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 12,
          ttl: 4.8,
          totalTtl: 4.8,
        });
      }
    }

    updateDroplets(dt) {
      for (let i = this.droplets.length - 1; i >= 0; i -= 1) {
        const drop = this.droplets[i];
        drop.ttl -= dt;
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        if (drop.ttl <= 0) {
          this.droplets.splice(i, 1);
          continue;
        }
        for (let j = 0; j < this.snakes.length; j += 1) {
          const snake = this.snakes[j];
          if (!snake.alive) {
            continue;
          }
          const hitRadius = drop.radius + snake.radius * 0.75;
          if (distSq(drop.x, drop.y, snake.x, snake.y) <= hitRadius * hitRadius) {
            snake.effects.slowUntil = Math.max(snake.effects.slowUntil, this.time + CONFIG.slowDuration);
            if (snake.isPlayer) {
              createToast("减速 5s", 1.8);
            }
            this.droplets.splice(i, 1);
            break;
          }
        }
      }
    }

    updateMissiles(dt) {
      for (let i = this.missiles.length - 1; i >= 0; i -= 1) {
        const missile = this.missiles[i];
        missile.ttl -= dt;
        if (missile.ttl <= 0) {
          this.resolveMissileExplosion(missile);
          this.missiles.splice(i, 1);
        }
      }
    }

    resolveMissileExplosion(missile) {
      const owner = this.snakes.find(function (snake) {
        return snake.id === missile.ownerId;
      });
      if (!owner) {
        return;
      }
      for (let i = 0; i < this.snakes.length; i += 1) {
        const snake = this.snakes[i];
        if (!snake.alive || snake.id === missile.ownerId) {
          continue;
        }
        if (distSq(missile.x, missile.y, snake.x, snake.y) <= missile.radius * missile.radius) {
          const damage = snake.hp < 400 ? snake.hp : snake.hp * 0.4;
          this.applyDamage(snake, damage, owner, "missile");
        }
      }

      for (let i = this.crates.length - 1; i >= 0; i -= 1) {
        const crate = this.crates[i];
        const hitRadius = missile.radius + crate.radius;
        if (distSq(missile.x, missile.y, crate.x, crate.y) <= hitRadius * hitRadius) {
          if (crate.type === "crate") {
            this.openCrate(crate, owner);
            this.crates.splice(i, 1);
          } else if (crate.type === "chest") {
            crate.hp -= 4;
            if (crate.hp <= 0) {
              this.openChest(crate);
              this.crates.splice(i, 1);
            }
          }
        }
      }

      for (let i = this.ufos.length - 1; i >= 0; i -= 1) {
        const ufo = this.ufos[i];
        const hitRadius = missile.radius + ufo.radius;
        if (distSq(missile.x, missile.y, ufo.x, ufo.y) <= hitRadius * hitRadius) {
          ufo.hp -= 2.7;
          if (ufo.hp <= 0) {
            this.openUfo(ufo);
            this.ufos.splice(i, 1);
          }
        }
      }
    }

    updateSnakes(dt, zone, incoming) {
      for (let i = 0; i < this.snakes.length; i += 1) {
        const snake = this.snakes[i];
        if (!snake.alive) {
          continue;
        }

        if (snake.isPlayer) {
          this.updatePlayerIntent(snake);
        } else {
          this.updateAiIntent(snake, zone, incoming, dt);
        }

        const turnSpeed = snake.isPlayer ? 5.4 : 4.4;
        const angleDiff = normalizeAngle(snake.desiredAngle - snake.angle);
        snake.angle += clamp(angleDiff, -turnSpeed * dt, turnSpeed * dt);

        let speed = lerp(122, 178, 1 - snake.hp / CONFIG.maxHp);
        if (snake.hp > 2500) {
          speed -= 8;
        }
        if (!snake.isPlayer) {
          speed *= 0.94;
        }
        const isBoosting =
          snake.isPlayer ? input.boost : snake.ai.boostUntil > this.time;
        if (isBoosting) {
          speed *= snake.isPlayer ? 1.62 : 1.3;
        }
        if (snake.effects.slowUntil > this.time) {
          speed *= 0.58;
        }

        const previousHeadX = snake.x;
        const previousHeadY = snake.y;
        snake.x += Math.cos(snake.angle) * speed * dt;
        snake.y += Math.sin(snake.angle) * speed * dt;
        snake.x = clamp(snake.x, -CONFIG.initialZoneSize * 0.7, CONFIG.initialZoneSize * 0.7);
        snake.y = clamp(snake.y, -CONFIG.initialZoneSize * 0.7, CONFIG.initialZoneSize * 0.7);

        this.updateTrail(snake, previousHeadX, previousHeadY);

        if (!this.isInsideZone(snake.x, snake.y, zone)) {
          const phaseLevel =
            clamp(zone.phaseIndex || 1, 1, CONFIG.radiationBaseDps.length) - 1;
          const outside = this.getDistanceOutsideZone(snake.x, snake.y, zone);
          const dps = CONFIG.radiationBaseDps[phaseLevel] + outside * 0.08;
          this.applyDamage(snake, dps * dt, null, "radiation");
        }

        if (snake.isPlayer) {
          snake.damageTexts = snake.damageTexts.filter(function (text) {
            return text.life > 0;
          });
        }
      }
    }

    updateTrail(snake, previousHeadX, previousHeadY) {
      this.syncSnakeSegments(snake);
      let followX = previousHeadX;
      let followY = previousHeadY;
      for (let i = 0; i < snake.trail.length; i += 1) {
        const segment = snake.trail[i];
        const oldX = segment.x;
        const oldY = segment.y;
        segment.x = followX;
        segment.y = followY;
        followX = oldX;
        followY = oldY;
      }
    }

    updatePlayerIntent(snake) {
      let dx = 0;
      let dy = 0;
      if (input.left) {
        dx -= 1;
      }
      if (input.right) {
        dx += 1;
      }
      if (input.up) {
        dy -= 1;
      }
      if (input.down) {
        dy += 1;
      }
      if (dx !== 0 || dy !== 0) {
        snake.desiredAngle = Math.atan2(dy, dx);
      }
    }

    updateAiIntent(snake, zone, incoming, dt) {
      const repel = { x: 0, y: 0 };
      const aggression = snake.ai.aggression || 0.5;
      const caution = snake.ai.caution || 1;
      const futureZone =
        incoming && incoming.phaseStart - this.time < 9 ? incoming.zone : zone;

      const boundaryGapX = snake.x - futureZone.x;
      const boundaryGapY = snake.y - futureZone.y;
      const margin = futureZone.size * 0.5 - 90;
      if (Math.abs(boundaryGapX) > margin) {
        repel.x -= Math.sign(boundaryGapX) * 2.2;
      }
      if (Math.abs(boundaryGapY) > margin) {
        repel.y -= Math.sign(boundaryGapY) * 2.2;
      }

      for (let i = 0; i < this.snakes.length; i += 1) {
        const other = this.snakes[i];
        if (!other.alive || other.id === snake.id) {
          continue;
        }
        const bodyLimit = Math.min(other.trail.length, 50);
        for (let j = 5; j < bodyLimit; j += 3) {
          const point = other.trail[j];
          const dangerRadius = (snake.radius + other.radius + 78) * caution;
          const sq = distSq(snake.x, snake.y, point.x, point.y);
          if (sq < dangerRadius * dangerRadius) {
            const d = Math.max(12, Math.sqrt(sq));
            repel.x += (snake.x - point.x) / d * (dangerRadius / d);
            repel.y += (snake.y - point.y) / d * (dangerRadius / d);
          }
        }
      }

      const target = this.findBestTargetForSnake(snake, zone, futureZone);
      if (target) {
        snake.ai.goalX = target.x;
        snake.ai.goalY = target.y;
      } else {
        snake.ai.wanderAngle += rand(-0.7, 0.7) * dt;
        snake.ai.goalX = zone.x + Math.cos(snake.ai.wanderAngle) * zone.size * 0.2;
        snake.ai.goalY = zone.y + Math.sin(snake.ai.wanderAngle * 1.17) * zone.size * 0.2;
      }

      let goalX = snake.ai.goalX - snake.x + repel.x * 120;
      let goalY = snake.ai.goalY - snake.y + repel.y * 120;
      if (Math.abs(goalX) + Math.abs(goalY) < 0.1) {
        goalX = Math.cos(snake.angle);
        goalY = Math.sin(snake.angle);
      }

      snake.desiredAngle = Math.atan2(goalY, goalX);

      snake.ai.boostUntil = snake.ai.boostUntil > this.time ? snake.ai.boostUntil : 0;
      if (target) {
        const shouldBoost =
          target.kind === "heart" ||
          target.kind === "chest" ||
          target.kind === "beacon" ||
          !this.isInsideZone(snake.x, snake.y, futureZone) ||
          (target.kind === "enemy" && snake.hp > 1800 && aggression > 0.64);
        if (shouldBoost) {
          snake.ai.boostUntil = this.time + 0.24;
        }
      }

      const missileTarget = this.findMissileTarget(snake);
      if (missileTarget && this.time - snake.lastShotAt > snake.ai.shootDelay) {
        snake.ai.shootDelay = rand(2.4, 4.1);
        this.fireMissile(snake);
      }
    }

    findBestTargetForSnake(snake, zone, futureZone) {
      let best = null;
      let bestScore = -Infinity;
      const aggression = snake.ai.aggression || 0.5;
      const resourceBias = 1.16 + (1 - aggression) * 0.42;
      const fightBias = 0.48 + aggression * 0.34;

      const pushCandidate = function (candidate, weight, kind) {
        const d = distance(snake.x, snake.y, candidate.x, candidate.y);
        const zonePenalty = !this.isInsideZone(candidate.x, candidate.y, futureZone) ? 0.54 : 1;
        const score = (weight / (d + 40)) * zonePenalty;
        if (score > bestScore) {
          bestScore = score;
          best = {
            x: candidate.x,
            y: candidate.y,
            kind: kind,
          };
        }
      }.bind(this);

      for (let i = 0; i < this.items.length; i += 1) {
        const item = this.items[i];
        const weight =
          item.type === "heart"
            ? 4200 * resourceBias
            : item.type === "missile"
              ? 1800 * resourceBias
              : item.type === "magnet"
                ? 1550 * resourceBias
                : item.type === "star"
                  ? 1700 * resourceBias
                  : 1450 * resourceBias;
        pushCandidate(item, weight, item.type);
      }

      for (let i = 0; i < this.crates.length; i += 1) {
        const crate = this.crates[i];
        const weight = (crate.type === "chest" ? 3200 : 1400) * resourceBias;
        pushCandidate(crate, weight, crate.type);
      }

      for (let i = 0; i < this.ufos.length; i += 1) {
        pushCandidate(this.ufos[i], 1800 * resourceBias, "ufo");
      }

      for (let i = 0; i < this.dots.length; i += 1) {
        const dot = this.dots[i];
        if (dot.kind === "wreck") {
          pushCandidate(dot, (1200 + dot.value * 6) * resourceBias, "wreck");
        } else if (i % 14 === 0) {
          pushCandidate(dot, 180 * resourceBias, "dot");
        }
      }

      for (let i = 0; i < this.chestEvents.length; i += 1) {
        const event = this.chestEvents[i];
        if (!event.announced || event.spawned) {
          continue;
        }
        for (let j = 0; j < event.previewPositions.length; j += 1) {
          pushCandidate(event.previewPositions[j], 2100 * resourceBias, "beacon");
        }
      }

      for (let i = 0; i < this.snakes.length; i += 1) {
        const other = this.snakes[i];
        if (!other.alive || other.id === snake.id) {
          continue;
        }
        if (other.effects.shieldUntil > this.time) {
          continue;
        }
        const shouldChase =
          (snake.hp > 1400 && snake.hp > other.hp * (1.42 - aggression * 0.18)) ||
          other.hp < 420;
        if (shouldChase) {
          pushCandidate(other, (900 + (CONFIG.maxHp - other.hp) * 0.35) * fightBias, "enemy");
        }
      }

      return best;
    }

    findMissileTarget(snake) {
      if (snake.missiles <= 0) {
        return null;
      }
      if (snake.hp < 700 || snake.missiles < 1) {
        return null;
      }
      let best = null;
      for (let i = 0; i < this.snakes.length; i += 1) {
        const other = this.snakes[i];
        if (!other.alive || other.id === snake.id || other.effects.shieldUntil > this.time) {
          continue;
        }
        const d = distance(snake.x, snake.y, other.x, other.y);
        if (d > 240) {
          continue;
        }
        if (snake.hp < other.hp * (1.12 - (snake.ai.missileConfidence || 0.6) * 0.08)) {
          continue;
        }
        const angleToTarget = Math.atan2(other.y - snake.y, other.x - snake.x);
        const diff = Math.abs(normalizeAngle(angleToTarget - snake.angle));
        if (diff < 0.26 && Math.random() < (snake.ai.missileConfidence || 0.6)) {
          best = other;
          break;
        }
      }
      return best;
    }

    resolveCollections() {
      for (let i = 0; i < this.snakes.length; i += 1) {
        const snake = this.snakes[i];
        if (!snake.alive) {
          continue;
        }
        const magnetRange = snake.effects.magnetUntil > this.time ? 118 : 58;
        const collectRange = snake.effects.magnetUntil > this.time ? 44 + snake.radius : 24 + snake.radius;

        for (let j = this.dots.length - 1; j >= 0; j -= 1) {
          const dot = this.dots[j];
          const d = distance(snake.x, snake.y, dot.x, dot.y);
          if (d < magnetRange) {
            const pull = snake.effects.magnetUntil > this.time ? 520 : 180;
            dot.x += ((snake.x - dot.x) / Math.max(10, d)) * pull * 0.016;
            dot.y += ((snake.y - dot.y) / Math.max(10, d)) * pull * 0.016;
          }
          if (d <= collectRange) {
            this.addHp(snake, dot.value, null);
            this.dots.splice(j, 1);
          }
        }

        for (let j = this.items.length - 1; j >= 0; j -= 1) {
          const item = this.items[j];
          const d = distance(snake.x, snake.y, item.x, item.y);
          if (d < magnetRange + item.radius && this.time >= item.protectedUntil) {
            item.x += ((snake.x - item.x) / Math.max(10, d)) * 12;
            item.y += ((snake.y - item.y) / Math.max(10, d)) * 12;
          }
          if (this.time < item.protectedUntil) {
            continue;
          }
          if (d <= collectRange + item.radius) {
            this.collectItem(snake, item);
            this.items.splice(j, 1);
          }
        }
      }
    }

    collectItem(snake, item) {
      if (item.type === "missile") {
        snake.missiles += 1;
      } else if (item.type === "magnet") {
        snake.effects.magnetUntil = Math.max(snake.effects.magnetUntil, this.time + CONFIG.magnetDuration);
      } else if (item.type === "mushroom") {
        this.addHp(snake, ITEM_DEFS.mushroom.heal, "mushroom");
      } else if (item.type === "star") {
        this.addHp(snake, ITEM_DEFS.star.heal, "star");
      } else if (item.type === "heart") {
        this.addHp(snake, ITEM_DEFS.heart.heal, "heart");
        if (snake.isPlayer) {
          createToast("心脏 +1000", 2);
        }
      }
    }

    resolveBodyCollisions() {
      for (let i = 0; i < this.snakes.length; i += 1) {
        const victim = this.snakes[i];
        if (!victim.alive || this.time - victim.lastBodyHitAt < CONFIG.bodyHitCooldown) {
          continue;
        }
        for (let j = 0; j < this.snakes.length; j += 1) {
          const owner = this.snakes[j];
          if (!owner.alive || owner.id === victim.id) {
            continue;
          }
          const bodyRadius = owner.radius + victim.radius * 0.9;
          const limit = Math.min(owner.trail.length, 220);
          let hit = false;
          for (let k = 2; k < limit; k += 1) {
            const point = owner.trail[k];
            if (distSq(victim.x, victim.y, point.x, point.y) <= bodyRadius * bodyRadius) {
              const damage = victim.hp < 400 ? victim.hp : clamp(victim.hp * 0.22, 220, 900);
              const actualDamage = this.applyDamage(victim, damage, owner, "body");
              if (actualDamage > 0) {
                victim.lastBodyHitAt = this.time;
                victim.angle += normalizeAngle(Math.PI + rand(-0.6, 0.6));
              }
              hit = true;
              break;
            }
          }
          if (hit) {
            break;
          }
        }
      }
    }

    resolveContainerCollisions() {
      for (let i = 0; i < this.snakes.length; i += 1) {
        const snake = this.snakes[i];
        if (!snake.alive) {
          continue;
        }

        for (let j = this.crates.length - 1; j >= 0; j -= 1) {
          const crate = this.crates[j];
          const hitRadius = snake.radius + crate.radius;
          const overlapping =
            distSq(snake.x, snake.y, crate.x, crate.y) <= hitRadius * hitRadius;
          if (!overlapping) {
            delete crate.contacting[snake.id];
            continue;
          }

          if (crate.contacting[snake.id]) {
            continue;
          }

          crate.contacting[snake.id] = true;
          if (crate.type === "crate") {
            this.openCrate(crate, snake);
            this.crates.splice(j, 1);
          } else if (crate.type === "chest") {
            crate.hp -= 1;
            if (crate.hp <= 0) {
              this.openChest(crate);
              this.crates.splice(j, 1);
            }
          }
        }

        for (let j = this.ufos.length - 1; j >= 0; j -= 1) {
          const ufo = this.ufos[j];
          const hitRadius = snake.radius + ufo.radius;
          const overlapping =
            distSq(snake.x, snake.y, ufo.x, ufo.y) <= hitRadius * hitRadius;
          if (!overlapping) {
            delete ufo.contacting[snake.id];
            continue;
          }

          if (ufo.contacting[snake.id]) {
            continue;
          }

          ufo.contacting[snake.id] = true;
          ufo.hp -= 1;
          if (ufo.hp <= 0) {
            this.openUfo(ufo);
            this.ufos.splice(j, 1);
          }
        }
      }
    }

    openCrate(crate) {
      const dropCount = Math.round(rand(1, 3.99));
      const table = [
        ITEM_DEFS.missile,
        ITEM_DEFS.mushroom,
        ITEM_DEFS.star,
        ITEM_DEFS.magnet,
      ];
      for (let i = 0; i < dropCount; i += 1) {
        const choice = pickWeighted(table);
        this.items.push(
          this.createItem(
            choice.type,
            crate.x + rand(-10, 10),
            crate.y + rand(-10, 10)
          )
        );
      }
    }

    openUfo(ufo) {
      const table = [
        ITEM_DEFS.missile,
        ITEM_DEFS.mushroom,
        ITEM_DEFS.star,
        ITEM_DEFS.magnet,
      ];
      for (let i = 0; i < 4; i += 1) {
        const choice = pickWeighted(table);
        this.items.push(
          this.createItem(
            choice.type,
            ufo.x + rand(-16, 16),
            ufo.y + rand(-16, 16)
          )
        );
      }
    }

    openChest(chest) {
      this.items.push(this.createItem("heart", chest.x, chest.y));
      createToast("心脏掉落", 2.2);
    }

    updateTexts(dt) {
      const player = this.player;
      if (player) {
        for (let i = player.damageTexts.length - 1; i >= 0; i -= 1) {
          player.damageTexts[i].life -= dt;
          player.damageTexts[i].offsetY -= 42 * dt;
          if (player.damageTexts[i].life <= 0) {
            player.damageTexts.splice(i, 1);
          }
        }
      }
    }

    trimKillFeed(dt) {
      for (let i = this.killFeed.length - 1; i >= 0; i -= 1) {
        this.killFeed[i].ttl -= dt;
        if (this.killFeed[i].ttl <= 0) {
          this.killFeed.splice(i, 1);
        }
      }
    }

    checkWinCondition() {
      const alive = this.snakes.filter(function (snake) {
        return snake.alive;
      });
      if (alive.length <= 1) {
        this.finished = true;
        this.state = "gameover";
        const winner = alive[0] || null;
        this.matchSummary = winner;
        overlay.classList.remove("hidden");
        if (winner && winner.isPlayer) {
          overlayTitle.textContent = "你是最后赢家";
          overlayBody.innerHTML =
            "终局生命值：" +
            Math.round(winner.hp) +
            "<br>击杀：" +
            winner.kills +
            "<br>你在太空危机中活到了最后。";
        } else if (winner) {
          overlayTitle.textContent = "最终胜者：" + winner.id;
          overlayBody.innerHTML =
            "你的蛇已被淘汰。<br>冠军生命值：" +
            Math.round(winner.hp) +
            "<br>冠军击杀：" +
            winner.kills;
        } else {
          overlayTitle.textContent = "全员覆灭";
          overlayBody.textContent = "这局里没有蛇活到最后。";
        }
      }
    }

    getCameraTarget() {
      if (this.player && this.player.alive) {
        return this.player;
      }
      const alive = this.snakes
        .filter(function (snake) {
          return snake.alive;
        })
        .sort(function (a, b) {
          return b.hp - a.hp;
        });
      return alive[0] || this.player || this.snakes[0];
    }

    worldToScreen(x, y) {
      return {
        x: (x - this.camera.x) * this.camera.zoom + this.width * 0.5,
        y: (y - this.camera.y) * this.camera.zoom + this.height * 0.5,
      };
    }

    render() {
      const cameraTarget = this.getCameraTarget();
      this.camera.x = cameraTarget.x;
      this.camera.y = cameraTarget.y;
      this.camera.zoom = clamp(1.56 - cameraTarget.radius / 76, 1.06, 1.46);

      ctx.clearRect(0, 0, this.width, this.height);
      this.drawBackground();
      this.drawGrid();
      this.drawSafeZone();
      this.drawDots();
      this.drawContainers();
      this.drawItems();
      this.drawDroplets();
      this.drawMissiles();
      this.drawSnakes();
      this.drawKillFeed();
      this.drawFloatingTexts();
      this.renderMinimap();
      this.updateHud();
    }

    drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, "#06101d");
      gradient.addColorStop(1, "#081a25");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);

      for (let i = 0; i < this.starfield.length; i += 1) {
        const star = this.starfield[i];
        const screen = this.worldToScreen(star.x, star.y);
        if (
          screen.x < -20 ||
          screen.y < -20 ||
          screen.x > this.width + 20 ||
          screen.y > this.height + 20
        ) {
          continue;
        }
        ctx.fillStyle = rgba(star.color, star.alpha);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, star.radius, 0, TAU);
        ctx.fill();
      }
    }

    drawGrid() {
      const spacing = 120 * this.camera.zoom;
      const offsetX = ((this.width * 0.5 - this.camera.x * this.camera.zoom) % spacing + spacing) % spacing;
      const offsetY = ((this.height * 0.5 - this.camera.y * this.camera.zoom) % spacing + spacing) % spacing;
      ctx.strokeStyle = "rgba(118,247,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = offsetX; x < this.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = offsetY; y < this.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
    }

    drawSafeZone() {
      const zone = this.getCurrentZone(this.time);
      const incoming = this.getIncomingZone(this.time);
      const half = zone.size * 0.5;
      const topLeft = this.worldToScreen(zone.x - half, zone.y - half);
      const bottomRight = this.worldToScreen(zone.x + half, zone.y + half);
      const width = bottomRight.x - topLeft.x;
      const height = bottomRight.y - topLeft.y;

      const dangerTint = ctx.createLinearGradient(0, 0, 0, this.height);
      dangerTint.addColorStop(0, "rgba(255, 70, 70, 0.18)");
      dangerTint.addColorStop(1, "rgba(255, 20, 40, 0.26)");
      ctx.fillStyle = dangerTint;
      ctx.fillRect(0, 0, this.width, topLeft.y);
      ctx.fillRect(0, bottomRight.y, this.width, this.height - bottomRight.y);
      ctx.fillRect(0, topLeft.y, topLeft.x, height);
      ctx.fillRect(bottomRight.x, topLeft.y, this.width - bottomRight.x, height);

      const edgeGlow = ctx.createLinearGradient(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
      edgeGlow.addColorStop(0, "rgba(255, 110, 110, 0.12)");
      edgeGlow.addColorStop(1, "rgba(255, 50, 76, 0.2)");
      ctx.strokeStyle = edgeGlow;
      ctx.lineWidth = 10;
      ctx.strokeRect(topLeft.x, topLeft.y, width, height);

      ctx.strokeStyle = "rgba(118,247,255,0.42)";
      ctx.lineWidth = 2;
      ctx.strokeRect(topLeft.x, topLeft.y, width, height);

      if (incoming && incoming.phaseStart - this.time <= CONFIG.phaseWarningLead) {
        const futureHalf = incoming.zone.size * 0.5;
        const futureTopLeft = this.worldToScreen(
          incoming.zone.x - futureHalf,
          incoming.zone.y - futureHalf
        );
        const futureBottomRight = this.worldToScreen(
          incoming.zone.x + futureHalf,
          incoming.zone.y + futureHalf
        );
        ctx.save();
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = "rgba(123,255,178,0.72)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          futureTopLeft.x,
          futureTopLeft.y,
          futureBottomRight.x - futureTopLeft.x,
          futureBottomRight.y - futureTopLeft.y
        );
        ctx.restore();
      }
    }

    drawDots() {
      for (let i = 0; i < this.dots.length; i += 1) {
        const dot = this.dots[i];
        const screen = this.worldToScreen(dot.x, dot.y);
        if (
          screen.x < -20 ||
          screen.y < -20 ||
          screen.x > this.width + 20 ||
          screen.y > this.height + 20
        ) {
          continue;
        }
        const radius = dot.radius * this.camera.zoom;
        const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius * 2.4);
        gradient.addColorStop(0, rgba(dot.color, dot.alpha));
        gradient.addColorStop(1, rgba(dot.color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(dot.color, Math.min(1, dot.alpha + 0.2));
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, TAU);
        ctx.fill();
      }
    }

    drawContainers() {
      for (let i = 0; i < this.crates.length; i += 1) {
        const entity = this.crates[i];
        const screen = this.worldToScreen(entity.x, entity.y);
        if (!this.isOnScreen(screen, entity.radius + 20)) {
          continue;
        }
        if (entity.type === "crate") {
          this.drawSupplyCrate(screen.x, screen.y, entity.radius * this.camera.zoom);
        } else {
          this.drawTreasureChest(screen.x, screen.y, entity.radius * this.camera.zoom, entity.hp / 12);
        }
      }

      for (let i = 0; i < this.ufos.length; i += 1) {
        const ufo = this.ufos[i];
        const screen = this.worldToScreen(ufo.x, ufo.y);
        if (!this.isOnScreen(screen, ufo.radius + 20)) {
          continue;
        }
        this.drawUfo(screen.x, screen.y, ufo.radius * this.camera.zoom, ufo.hp / 4);
      }
    }

    drawSupplyCrate(x, y, radius) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(255, 199, 112, 0.18)";
      ctx.strokeStyle = "rgba(255, 199, 112, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-radius, -radius, radius * 2, radius * 2, radius * 0.32);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * 0.6, 0);
      ctx.lineTo(radius * 0.6, 0);
      ctx.moveTo(0, -radius * 0.6);
      ctx.lineTo(0, radius * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    drawTreasureChest(x, y, radius, hpRatio) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(255, 123, 140, 0.16)";
      ctx.strokeStyle = "rgba(255, 199, 112, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-radius, -radius * 0.65, radius * 2, radius * 1.3, radius * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius, -radius * 0.1);
      ctx.quadraticCurveTo(0, -radius * 1.05, radius, -radius * 0.1);
      ctx.stroke();
      ctx.fillStyle = "rgba(118,247,255,0.75)";
      ctx.fillRect(-radius * 0.75, radius * 0.9, radius * 1.5 * hpRatio, 4);
      ctx.restore();
    }

    drawUfo(x, y, radius, hpRatio) {
      ctx.save();
      ctx.translate(x, y);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.8);
      glow.addColorStop(0, "rgba(118,247,255,0.14)");
      glow.addColorStop(1, "rgba(118,247,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.8, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(118,247,255,0.18)";
      ctx.strokeStyle = "rgba(118,247,255,0.78)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.35, radius * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -radius * 0.25, radius * 0.6, radius * 0.45, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,199,112,0.8)";
      ctx.fillRect(-radius * 0.75, radius * 0.95, radius * 1.5 * hpRatio, 4);
      ctx.restore();
    }

    drawItems() {
      for (let i = 0; i < this.items.length; i += 1) {
        const item = this.items[i];
        const screen = this.worldToScreen(item.x, item.y);
        if (!this.isOnScreen(screen, item.radius + 20)) {
          continue;
        }
        this.drawItem(screen.x, screen.y, item);
      }
    }

    drawItem(x, y, item) {
      const radius = item.radius * this.camera.zoom;
      ctx.save();
      ctx.translate(x, y);
      const pulse = 1 + Math.sin(this.time * 4 + item.seed) * 0.08;
      const activeAlpha = this.time < item.protectedUntil ? 0.44 : 1;
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = activeAlpha;

      if (item.type === "missile") {
        ctx.fillStyle = "rgba(98,185,255,0.18)";
        ctx.strokeStyle = "rgba(98,185,255,0.82)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.35, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#9fcbff";
        ctx.beginPath();
        ctx.roundRect(-radius * 0.25, -radius * 0.65, radius * 0.5, radius * 0.95, radius * 0.25);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-radius * 0.22, radius * 0.45);
        ctx.lineTo(0, radius * 0.88);
        ctx.lineTo(radius * 0.22, radius * 0.45);
        ctx.closePath();
        ctx.fill();
      } else if (item.type === "mushroom") {
        ctx.fillStyle = "rgba(255,123,140,0.22)";
        ctx.strokeStyle = "rgba(255,123,140,0.84)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -radius * 0.12, radius * 0.65, Math.PI, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffe7e4";
        ctx.fillRect(-radius * 0.15, -radius * 0.08, radius * 0.3, radius * 0.78);
      } else if (item.type === "star") {
        ctx.strokeStyle = "rgba(255,199,112,0.88)";
        ctx.fillStyle = "rgba(255,199,112,0.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i += 1) {
          const a = -Math.PI / 2 + (i / 5) * TAU;
          const px = Math.cos(a) * radius;
          const py = Math.sin(a) * radius;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
          const innerA = a + TAU / 10;
          ctx.lineTo(Math.cos(innerA) * radius * 0.42, Math.sin(innerA) * radius * 0.42);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.type === "magnet") {
        ctx.strokeStyle = "rgba(123,255,178,0.86)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, Math.PI * 0.2, Math.PI * 0.8, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-radius * 0.5, 0);
        ctx.lineTo(-radius * 0.5, radius * 0.65);
        ctx.moveTo(radius * 0.5, 0);
        ctx.lineTo(radius * 0.5, radius * 0.65);
        ctx.stroke();
      } else if (item.type === "heart") {
        ctx.fillStyle = "rgba(255,123,140,0.28)";
        ctx.strokeStyle = "rgba(255,123,140,0.88)";
        ctx.lineWidth = 2;
        this.drawHeartShape(ctx, 0, 0, radius);
        ctx.fill();
        ctx.stroke();
      }

      if (this.time < item.protectedUntil) {
        ctx.strokeStyle = "rgba(118,247,255,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.45, 0, TAU);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawDroplets() {
      for (let i = 0; i < this.droplets.length; i += 1) {
        const drop = this.droplets[i];
        const screen = this.worldToScreen(drop.x, drop.y);
        if (!this.isOnScreen(screen, drop.radius + 10)) {
          continue;
        }
        const radius = drop.radius * this.camera.zoom;
        const alpha = clamp(drop.ttl / (drop.totalTtl || drop.ttl || 1), 0.18, 0.92);
        ctx.fillStyle = "rgba(118,247,255," + alpha + ")";
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - radius);
        ctx.quadraticCurveTo(
          screen.x + radius,
          screen.y - radius * 0.4,
          screen.x,
          screen.y + radius
        );
        ctx.quadraticCurveTo(
          screen.x - radius,
          screen.y - radius * 0.4,
          screen.x,
          screen.y - radius
        );
        ctx.fill();
      }
    }

    drawMissiles() {
      for (let i = 0; i < this.missiles.length; i += 1) {
        const missile = this.missiles[i];
        const screen = this.worldToScreen(missile.x, missile.y);
        const radius = missile.radius * this.camera.zoom;
        const lifeRatio = 1 - missile.ttl / missile.totalLife;
        const drawRadius = radius * (0.9 + lifeRatio * 0.24);
        ctx.strokeStyle = rgba(missile.color, 0.78);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, drawRadius, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba(missile.color, 0.24);
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, drawRadius, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(missile.color, 0.07);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, drawRadius * 0.96, 0, TAU);
        ctx.fill();
      }
    }

    drawSnakes() {
      const ordered = this.snakes.slice().sort(function (a, b) {
        return a.radius - b.radius;
      });

      for (let i = 0; i < ordered.length; i += 1) {
        const snake = ordered[i];
        if (!snake.alive) {
          continue;
        }
        if (snake.trail.length >= 2) {
          this.drawSnakeBody(snake);
        }

        const head = this.worldToScreen(snake.x, snake.y);
        const headRadius = snake.radius * this.camera.zoom;

        if (snake.effects.shieldUntil > this.time) {
          const pulse = 1 + Math.sin(this.time * 7 + i) * 0.04;
          const bubbleRadius = headRadius * 1.58 * pulse;
          const aura = ctx.createRadialGradient(
            head.x - headRadius * 0.35,
            head.y - headRadius * 0.35,
            headRadius * 0.15,
            head.x,
            head.y,
            bubbleRadius
          );
          aura.addColorStop(0, "rgba(222,248,255,0.36)");
          aura.addColorStop(0.45, "rgba(160,235,255,0.24)");
          aura.addColorStop(1, "rgba(118,247,255,0.04)");
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(head.x, head.y, bubbleRadius, 0, TAU);
          ctx.fill();
        }

        ctx.fillStyle = snake.headColor;
        ctx.beginPath();
        ctx.arc(head.x, head.y, headRadius, 0, TAU);
        ctx.fill();

        if (snake.effects.shieldUntil > this.time) {
          ctx.fillStyle = "rgba(170, 238, 255, 0.16)";
          ctx.beginPath();
          ctx.arc(head.x, head.y, headRadius * 1.12, 0, TAU);
          ctx.fill();

          ctx.strokeStyle = "rgba(175, 241, 255, 0.9)";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(head.x, head.y, headRadius * 1.42, 0, TAU);
          ctx.stroke();

          ctx.strokeStyle = "rgba(255,255,255,0.42)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(head.x - headRadius * 0.12, head.y - headRadius * 0.12, headRadius * 1.08, 0, TAU);
          ctx.stroke();
        }

        ctx.fillStyle = "#09121e";
        ctx.beginPath();
        ctx.arc(
          head.x + Math.cos(snake.angle) * headRadius * 0.3,
          head.y + Math.sin(snake.angle) * headRadius * 0.3,
          headRadius * 0.18,
          0,
          TAU
        );
        ctx.fill();

        this.drawSnakeLabel(snake, head.x, head.y, headRadius);
      }
    }

    drawSnakeBody(snake) {
      const total = snake.trail.length;
      for (let j = total - 1; j >= 0; j -= 1) {
        const point = this.worldToScreen(snake.trail[j].x, snake.trail[j].y);
        const t = 1 - j / Math.max(1, total);
        const radius = snake.radius * this.camera.zoom * lerp(0.72, 0.98, Math.pow(t, 0.58));
        ctx.fillStyle = rgba(snake.bodyColor, 0.18 + t * 0.18);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius * 1.24, 0, TAU);
        ctx.fill();

        ctx.fillStyle = rgba(snake.bodyColor, 0.7 + t * 0.22);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fill();

        ctx.fillStyle = rgba(snake.headColor, 0.08 + t * 0.12);
        ctx.beginPath();
        ctx.arc(point.x - radius * 0.18, point.y - radius * 0.18, radius * 0.46, 0, TAU);
        ctx.fill();
      }
    }

    drawSnakeLabel(snake, x, y, headRadius) {
      const labelY = y - headRadius - 28;
      ctx.font = "13px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillStyle = snake.isPlayer ? "#ffc770" : "rgba(223,250,255,0.88)";
      ctx.fillText(snake.id, x, labelY);
      this.drawHeartBar(x, labelY + 16, snake.hp);
    }

    drawHeartBar(x, y, hp) {
      const maxHearts = 5;
      const size = 9;
      const gap = 17;
      const startX = x - ((maxHearts - 1) * gap) * 0.5;
      for (let i = 0; i < maxHearts; i += 1) {
        const threshold = i * 1000;
        const remaining = clamp(hp - threshold, 0, 1000) / 1000;
        ctx.save();
        ctx.translate(startX + i * gap, y);
        this.drawHeartShape(ctx, 0, 0, size);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();
        if (remaining > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(-size, -size, size * 2 * remaining, size * 2.2);
          ctx.clip();
          this.drawHeartShape(ctx, 0, 0, size);
          ctx.fillStyle = "#ff7b8c";
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.42)";
        ctx.lineWidth = 1.2;
        this.drawHeartShape(ctx, 0, 0, size);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawHeartShape(targetCtx, x, y, size) {
      targetCtx.beginPath();
      targetCtx.moveTo(x, y + size * 0.86);
      targetCtx.bezierCurveTo(x - size * 1.05, y + size * 0.22, x - size * 1.02, y - size * 0.72, x, y - size * 0.18);
      targetCtx.bezierCurveTo(x + size * 1.02, y - size * 0.72, x + size * 1.05, y + size * 0.22, x, y + size * 0.86);
      targetCtx.closePath();
    }

    drawKillFeed() {
      ctx.textAlign = "left";
      ctx.font = "13px Trebuchet MS";
      for (let i = 0; i < this.killFeed.length; i += 1) {
        ctx.fillStyle = "rgba(223,250,255," + clamp(this.killFeed[i].ttl / 6, 0.2, 0.9) + ")";
        ctx.fillText(this.killFeed[i].text, 26, this.height - 170 - i * 20);
      }
    }

    drawFloatingTexts() {
      const player = this.player;
      if (!player || !player.alive && !player.damageTexts.length) {
        return;
      }
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5 - player.radius * this.camera.zoom - 14;
      ctx.textAlign = "center";
      for (let i = 0; i < player.damageTexts.length; i += 1) {
        const text = player.damageTexts[i];
        const alpha = clamp(text.life, 0, 1);
        ctx.font = "bold " + (text.size || 22) + "px Trebuchet MS";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(5, 10, 18," + Math.min(0.9, alpha) + ")";
        ctx.strokeText(text.text, centerX, centerY + text.offsetY);
        ctx.fillStyle = rgba(text.color, alpha);
        ctx.fillText(text.text, centerX, centerY + text.offsetY);
      }
    }

    renderMinimap() {
      minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
      minimapCtx.fillStyle = "#07111c";
      minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

      const mapPadding = 14;
      const size = CONFIG.initialZoneSize;
      const scale =
        (Math.min(minimapCanvas.width, minimapCanvas.height) - mapPadding * 2) / size;

      const mapX = function (x) {
        return minimapCanvas.width * 0.5 + x * scale;
      };
      const mapY = function (y) {
        return minimapCanvas.height * 0.5 + y * scale;
      };

      minimapCtx.strokeStyle = "rgba(118,247,255,0.2)";
      minimapCtx.strokeRect(
        mapPadding,
        mapPadding,
        minimapCanvas.width - mapPadding * 2,
        minimapCanvas.height - mapPadding * 2
      );

      const zone = this.getCurrentZone(this.time);
      minimapCtx.strokeStyle = "rgba(123,255,178,0.85)";
      minimapCtx.lineWidth = 2;
      minimapCtx.strokeRect(
        mapX(zone.x - zone.size * 0.5),
        mapY(zone.y - zone.size * 0.5),
        zone.size * scale,
        zone.size * scale
      );

      const incoming = this.getIncomingZone(this.time);
      if (incoming && incoming.phaseStart - this.time <= CONFIG.phaseWarningLead) {
        minimapCtx.setLineDash([6, 4]);
        minimapCtx.strokeStyle = "rgba(255,199,112,0.9)";
        minimapCtx.strokeRect(
          mapX(incoming.zone.x - incoming.zone.size * 0.5),
          mapY(incoming.zone.y - incoming.zone.size * 0.5),
          incoming.zone.size * scale,
          incoming.zone.size * scale
        );
        minimapCtx.setLineDash([]);
      }

      for (let i = 0; i < this.chestEvents.length; i += 1) {
        const event = this.chestEvents[i];
        if (!event.announced || event.spawned) {
          continue;
        }
        for (let j = 0; j < event.previewPositions.length; j += 1) {
          const pulse = 1 + Math.sin(this.time * 5 + j) * 0.22;
          const x = mapX(event.previewPositions[j].x);
          const y = mapY(event.previewPositions[j].y);
          minimapCtx.strokeStyle = "rgba(255,199,112,0.96)";
          minimapCtx.lineWidth = 2;
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 7 * pulse, 0, TAU);
          minimapCtx.stroke();
          minimapCtx.fillStyle = "rgba(255,123,140,0.92)";
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 4.8 * pulse, 0, TAU);
          minimapCtx.fill();
          minimapCtx.strokeStyle = "rgba(255,240,205,0.95)";
          minimapCtx.beginPath();
          minimapCtx.moveTo(x - 8, y);
          minimapCtx.lineTo(x + 8, y);
          minimapCtx.moveTo(x, y - 8);
          minimapCtx.lineTo(x, y + 8);
          minimapCtx.stroke();
        }
      }

      for (let i = 0; i < this.snakes.length; i += 1) {
        const snake = this.snakes[i];
        if (!snake.alive) {
          continue;
        }
        const x = mapX(snake.x);
        const y = mapY(snake.y);
        if (snake.isPlayer) {
          const pulse = 1 + Math.sin(this.time * 5.5) * 0.18;
          minimapCtx.strokeStyle = "rgba(255,199,112,0.96)";
          minimapCtx.lineWidth = 3;
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 10 * pulse, 0, TAU);
          minimapCtx.stroke();
          minimapCtx.strokeStyle = "rgba(255,255,255,0.92)";
          minimapCtx.lineWidth = 1.5;
          minimapCtx.beginPath();
          minimapCtx.moveTo(x - 12, y);
          minimapCtx.lineTo(x + 12, y);
          minimapCtx.moveTo(x, y - 12);
          minimapCtx.lineTo(x, y + 12);
          minimapCtx.stroke();
          minimapCtx.fillStyle = "#ffc770";
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 5.8, 0, TAU);
          minimapCtx.fill();
          minimapCtx.fillStyle = "#ffffff";
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 2.1, 0, TAU);
          minimapCtx.fill();
        } else {
          minimapCtx.fillStyle = snake.bodyColor;
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 3.2, 0, TAU);
          minimapCtx.fill();
        }
      }
    }

    updateHud() {
      const cameraTarget = this.getCameraTarget();
      const player = this.player;
      const alive = this.snakes.filter(function (snake) {
        return snake.alive;
      });
      const ranking = this.snakes
        .slice()
        .sort(function (a, b) {
          return b.hp - a.hp;
        })
        .slice(0, 6);

      timerLabel.textContent = formatTime(this.time);
      aliveLabel.textContent = "剩余 " + alive.length;
      killLabel.textContent = "击杀 " + (player ? player.kills : 0);

      if (player) {
        missileCount.textContent = "x" + player.missiles;
        const safeZone = this.getCurrentZone(this.time);
        const radiation = player.alive ? !this.isInsideZone(player.x, player.y, safeZone) : false;
        hpReadout.innerHTML =
          "生命值 <strong>" +
          Math.round(player.hp) +
          "</strong> / " +
          CONFIG.maxHp +
          "<br>体型 " +
          heartCount(player.hp) +
          " 心 | 长度 " +
          Math.round(player.bodyLength) +
          "<br>" +
          (player.alive
            ? radiation
              ? "你正处于辐射区，持续掉血中"
              : "你目前位于安全区"
            : "你已淘汰，当前观战：" + cameraTarget.id);

        this.updateStatusCard(statusCards.magnet, player.effects.magnetUntil, this.time, CONFIG.magnetDuration);
        this.updateStatusCard(statusCards.slow, player.effects.slowUntil, this.time, CONFIG.slowDuration);
        this.updateStatusCard(statusCards.shield, player.effects.shieldUntil, this.time, CONFIG.shieldDuration);
        this.updateRadiationCard(statusCards.radiation, radiation);
      }

      leaderboard.innerHTML = ranking
        .map(function (snake) {
          return (
            '<div class="leader-row' +
            (snake.isPlayer ? " self" : "") +
            '">' +
            '<div>' +
            snake.id +
            "</div>" +
            '<div class="leader-name">' +
            (snake.alive ? "在线" : "淘汰") +
            "</div>" +
            '<div class="leader-hp">' +
            Math.round(snake.hp) +
            "</div></div>"
          );
        })
        .join("");
    }

    updateStatusCard(node, until, now, duration) {
      const active = until > now;
      const timer = node.querySelector(".status-timer");
      const ring = node.querySelector(".status-ring");
      node.classList.toggle("active", active);
      if (active) {
        const remaining = until - now;
        const ratio = clamp(remaining / duration, 0, 1);
        timer.textContent = remaining.toFixed(1) + "s";
        ring.style.background =
          "conic-gradient(var(--accent) " +
          Math.round(ratio * 360) +
          "deg, rgba(118,247,255,0.08) 0deg)";
      } else {
        timer.textContent = "0.0s";
        ring.style.background =
          "conic-gradient(var(--accent) 0deg, rgba(118,247,255,0.08) 0deg)";
      }
    }

    updateRadiationCard(node, active) {
      node.classList.toggle("active", active);
      node.querySelector(".status-timer").textContent = active ? "持续中" : "安全";
    }

    isOnScreen(point, padding) {
      return (
        point.x >= -padding &&
        point.y >= -padding &&
        point.x <= this.width + padding &&
        point.y <= this.height + padding
      );
    }
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
      const r = Math.min(radius, width * 0.5, height * 0.5);
      this.beginPath();
      this.moveTo(x + r, y);
      this.lineTo(x + width - r, y);
      this.quadraticCurveTo(x + width, y, x + width, y + r);
      this.lineTo(x + width, y + height - r);
      this.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      this.lineTo(x + r, y + height);
      this.quadraticCurveTo(x, y + height, x, y + height - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      this.closePath();
      return this;
    };
  }

  const game = new Game();

  function tick(now) {
    const dt = Math.min(0.033, (now - game.lastTick) / 1000 || 0.016);
    game.lastTick = now;
    game.update(dt);
    window.requestAnimationFrame(tick);
  }

  window.requestAnimationFrame(tick);
})();

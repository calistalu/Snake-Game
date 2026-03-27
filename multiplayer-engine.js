"use strict";

const TAU = Math.PI * 2;

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
  radiationBaseDps: [20, 34, 54, 78],
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

function normalizeAngle(angle) {
  while (angle > Math.PI) {
    angle -= TAU;
  }
  while (angle < -Math.PI) {
    angle += TAU;
  }
  return angle;
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

class MultiplayerMatch {
  constructor(room) {
    this.roomCode = room.code;
    this.time = 0;
    this.finished = false;
    this.nextEntityId = 1;
    this.nextCrateSpawn = 5;
    this.nextUfoSpawn = 10;
    this.zoneTargets = this.generateZoneTargets();
    this.chestEvents = this.createChestEvents();
    this.snakes = [];
    this.playerSnakeById = new Map();
    this.dots = [];
    this.items = [];
    this.crates = [];
    this.ufos = [];
    this.droplets = [];
    this.missiles = [];
    this.killFeed = [];
    this.winner = null;

    for (let i = 0; i < CONFIG.dotCount; i += 1) {
      this.dots.push(this.createDot(false));
    }

    let index = 0;
    for (let i = 0; i < room.players.length; i += 1) {
      const snake = this.createSnake(index, room.players[i]);
      this.snakes.push(snake);
      this.playerSnakeById.set(room.players[i].id, snake);
      index += 1;
    }

    while (index < CONFIG.totalSnakes) {
      this.snakes.push(this.createSnake(index, null));
      index += 1;
    }
  }

  allocateEntityId(prefix) {
    const id = prefix + "-" + this.nextEntityId;
    this.nextEntityId += 1;
    return id;
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

  createSnake(index, player) {
    const palette = SNAKE_COLORS[index % SNAKE_COLORS.length];
    const zone = this.zoneTargets[0];
    const pos = this.randomPositionInZone(zone, 140);
    const isHuman = Boolean(player);
    const snake = {
      id: isHuman ? "P-" + String(index + 1).padStart(2, "0") : "S-" + String(index + 1).padStart(2, "0"),
      playerId: isHuman ? player.id : "",
      isHuman: isHuman,
      isPlayer: false,
      name: isHuman ? String(player.name || ("Pilot-" + (index + 1))).slice(0, 18) : "AI-" + String(index + 1).padStart(2, "0"),
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
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        boost: false,
        fireSeq: 0,
        lastFireSeq: 0,
      },
      ai: {
        wanderAngle: rand(0, TAU),
        goalX: pos.x,
        goalY: pos.y,
        shootDelay: rand(2.2, 3.5),
        boostUntil: 0,
        aggression: rand(0.42, 0.76),
        caution: rand(0.95, 1.18),
        missileConfidence: rand(0.66, 0.84),
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
      id: this.allocateEntityId(isWreck ? "wreck" : "dot"),
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
      id: this.allocateEntityId(type),
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
      id: this.allocateEntityId("crate"),
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
      id: this.allocateEntityId("ufo"),
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
      id: this.allocateEntityId("chest"),
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
    const half = Math.max(20, zone.size * 0.5 - safeMargin);
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
    snake.segmentCount = clamp(Math.round(snake.bodyLength / snake.pointSpacing), 18, 240);
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

  setPlayerInput(playerId, payload) {
    const snake = this.playerSnakeById.get(playerId);
    if (!snake || !snake.alive) {
      return;
    }
    snake.input.up = Boolean(payload.up);
    snake.input.down = Boolean(payload.down);
    snake.input.left = Boolean(payload.left);
    snake.input.right = Boolean(payload.right);
    snake.input.boost = Boolean(payload.boost);
    snake.input.fireSeq = Math.max(snake.input.fireSeq || 0, Number(payload.fireSeq || 0));
  }

  clearPlayerInput(playerId) {
    const snake = this.playerSnakeById.get(playerId);
    if (!snake) {
      return;
    }
    snake.input.up = false;
    snake.input.down = false;
    snake.input.left = false;
    snake.input.right = false;
    snake.input.boost = false;
  }

  handlePlayerLeave(playerId) {
    const snake = this.playerSnakeById.get(playerId);
    if (!snake) {
      return;
    }
    snake.isHuman = false;
    snake.playerId = "";
    snake.name = snake.name || "Recovered AI";
    snake.input.up = false;
    snake.input.down = false;
    snake.input.left = false;
    snake.input.right = false;
    snake.input.boost = false;
    this.playerSnakeById.delete(playerId);
  }

  queueHumanValueText(snake, value, color, size) {
    if (!snake || !snake.isHuman) {
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
      this.queueHumanValueText(snake, gained, "#7bffb2", source === "heart" ? 28 : 23);
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

    if ((source === "missile" || source === "body") && target.isHuman) {
      this.queueHumanValueText(target, -actual, "#ff5f73", 24);
    }

    if (source !== "radiation") {
      target.effects.shieldUntil = Math.max(target.effects.shieldUntil, this.time + CONFIG.shieldDuration);
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
    this.missiles.push({
      id: this.allocateEntityId("missile"),
      x: snake.x + Math.cos(snake.angle) * distanceAhead,
      y: snake.y + Math.sin(snake.angle) * distanceAhead,
      ownerId: snake.id,
      ttl: CONFIG.missileLife,
      totalLife: CONFIG.missileLife,
      radius: CONFIG.missileRadius,
      color: snake.isHuman ? "#62b9ff" : "#ff657a",
    });
  }

  step(dt) {
    if (this.finished) {
      return;
    }
    this.time += dt;
    const zone = this.getCurrentZone(this.time);
    const incoming = this.getIncomingZone(this.time);

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
  }

  handleChestSchedule() {
    for (let i = 0; i < this.chestEvents.length; i += 1) {
      const event = this.chestEvents[i];
      if (!event.announced && this.time >= event.announce) {
        event.announced = true;
      }
      if (!event.spawned && this.time >= event.spawn) {
        event.spawned = true;
        for (let j = 0; j < event.previewPositions.length; j += 1) {
          this.crates.push(this.createChest(event.previewPositions[j]));
        }
      }
    }
  }

  spawnObjects() {
    if (this.time >= this.nextCrateSpawn) {
      this.nextCrateSpawn = this.time + CONFIG.crateSpawnEvery + rand(-2, 2);
      let aliveCrates = 0;
      for (let i = 0; i < this.crates.length; i += 1) {
        if (this.crates[i].type === "crate") {
          aliveCrates += 1;
        }
      }
      if (aliveCrates < CONFIG.crateCap) {
        this.crates.push(this.createCrate());
      }
    }

    if (this.time >= this.nextUfoSpawn) {
      this.nextUfoSpawn = this.time + CONFIG.ufoSpawnEvery + rand(-3, 3);
      if (this.ufos.length < CONFIG.ufoCap) {
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

    const zone = this.getCurrentZone(this.time);
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
          id: this.allocateEntityId("droplet"),
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
    let owner = null;
    for (let i = 0; i < this.snakes.length; i += 1) {
      if (this.snakes[i].id === missile.ownerId) {
        owner = this.snakes[i];
        break;
      }
    }
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
          this.openCrate(crate);
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

      if (snake.isHuman) {
        this.updateHumanIntent(snake);
        if ((snake.input.fireSeq || 0) > (snake.input.lastFireSeq || 0)) {
          snake.input.lastFireSeq = snake.input.fireSeq;
          this.fireMissile(snake);
        }
      } else {
        this.updateAiIntent(snake, zone, incoming, dt);
      }

      const turnSpeed = snake.isHuman ? 5.4 : 4.4;
      const angleDiff = normalizeAngle(snake.desiredAngle - snake.angle);
      snake.angle += clamp(angleDiff, -turnSpeed * dt, turnSpeed * dt);

      let speed = lerp(122, 178, 1 - snake.hp / CONFIG.maxHp);
      if (snake.hp > 2500) {
        speed -= 8;
      }
      if (!snake.isHuman) {
        speed *= 0.94;
      }
      const isBoosting = snake.isHuman ? snake.input.boost : snake.ai.boostUntil > this.time;
      if (isBoosting) {
        speed *= snake.isHuman ? 1.62 : 1.3;
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

  updateHumanIntent(snake) {
    let dx = 0;
    let dy = 0;
    if (snake.input.left) {
      dx -= 1;
    }
    if (snake.input.right) {
      dx += 1;
    }
    if (snake.input.up) {
      dy -= 1;
    }
    if (snake.input.down) {
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

    const pushCandidate = (candidate, weight, kind) => {
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
    };

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
        return other;
      }
    }
    return null;
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
          this.openCrate(crate);
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
  }

  updateTexts(dt) {
    for (let i = 0; i < this.snakes.length; i += 1) {
      const snake = this.snakes[i];
      if (!snake.damageTexts || snake.damageTexts.length === 0) {
        continue;
      }
      for (let j = snake.damageTexts.length - 1; j >= 0; j -= 1) {
        snake.damageTexts[j].life -= dt;
        snake.damageTexts[j].offsetY -= 42 * dt;
        if (snake.damageTexts[j].life <= 0) {
          snake.damageTexts.splice(j, 1);
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
      this.winner = alive[0] || null;
    }
  }

  getSpectatorTarget(playerId) {
    const self = this.playerSnakeById.get(playerId);
    if (self && self.alive) {
      return self;
    }
    const alive = this.snakes
      .filter(function (snake) {
        return snake.alive;
      })
      .sort(function (a, b) {
        return b.hp - a.hp;
      });
    return alive[0] || self || this.snakes[0];
  }

  isNearFocus(entity, focus, range) {
    return (
      Math.abs(entity.x - focus.x) <= range &&
      Math.abs(entity.y - focus.y) <= range
    );
  }

  serializeSnake(snake, playerId, focus) {
    const includeTrail =
      snake.playerId === playerId ||
      this.isNearFocus(snake, focus, 760);
    const trail = [];
    if (includeTrail) {
      for (let i = 0; i < snake.trail.length; i += 1) {
        trail.push({
          x: snake.trail[i].x,
          y: snake.trail[i].y,
        });
      }
      const tail = snake.trail[snake.trail.length - 1];
      if (tail && (trail.length === 0 || trail[trail.length - 1] !== tail)) {
        const last = trail[trail.length - 1];
        if (!last || last.x !== tail.x || last.y !== tail.y) {
          trail.push({ x: tail.x, y: tail.y });
        }
      }
    }
    return {
      id: snake.id,
      name: snake.name,
      playerId: snake.playerId,
      isHuman: snake.isHuman,
      isPlayer: snake.playerId === playerId,
      alive: snake.alive,
      x: snake.x,
      y: snake.y,
      angle: snake.angle,
      desiredAngle: snake.desiredAngle,
      hp: snake.hp,
      radius: snake.radius,
      bodyLength: snake.bodyLength,
      pointSpacing: snake.pointSpacing,
      segmentCount: snake.segmentCount,
      missiles: snake.missiles,
      kills: snake.kills,
      effects: {
        magnetUntil: snake.effects.magnetUntil,
        slowUntil: snake.effects.slowUntil,
        shieldUntil: snake.effects.shieldUntil,
      },
      bodyColor: snake.bodyColor,
      headColor: snake.headColor,
      textColor: snake.textColor,
      trail: trail,
      damageTexts: snake.playerId === playerId ? snake.damageTexts.slice() : [],
    };
  }

  stampEntitySignature(entity, signature) {
    Object.defineProperty(entity, "_sig", {
      value: signature,
      enumerable: false,
      configurable: true,
    });
    return entity;
  }

  serializeDot(dot) {
    return this.stampEntitySignature(
      {
        id: dot.id,
        x: dot.x,
        y: dot.y,
        value: dot.value,
        radius: dot.radius,
        color: dot.color,
        alpha: dot.alpha,
        kind: dot.kind,
      },
      [
        dot.id,
        dot.x,
        dot.y,
        dot.value,
        dot.radius,
        dot.color,
        dot.alpha,
        dot.kind,
      ].join("|")
    );
  }

  serializeItem(item) {
    return this.stampEntitySignature(
      {
        id: item.id,
        type: item.type,
        x: item.x,
        y: item.y,
        radius: item.radius,
        seed: item.seed,
        protectedUntil: item.protectedUntil,
        ttl: item.ttl,
      },
      [
        item.id,
        item.type,
        item.x,
        item.y,
        item.radius,
        item.seed,
        item.protectedUntil,
        item.ttl,
      ].join("|")
    );
  }

  serializeCrate(item) {
    return this.stampEntitySignature(
      {
        id: item.id,
        type: item.type,
        x: item.x,
        y: item.y,
        radius: item.radius,
        hp: item.hp,
        createdAt: item.createdAt,
      },
      [
        item.id,
        item.type,
        item.x,
        item.y,
        item.radius,
        item.hp,
        item.createdAt,
      ].join("|")
    );
  }

  serializeUfo(ufo) {
    return this.stampEntitySignature(
      {
        id: ufo.id,
        type: ufo.type,
        x: ufo.x,
        y: ufo.y,
        radius: ufo.radius,
        hp: ufo.hp,
        seed: ufo.seed,
      },
      [
        ufo.id,
        ufo.type,
        ufo.x,
        ufo.y,
        ufo.radius,
        ufo.hp,
        ufo.seed,
      ].join("|")
    );
  }

  serializeDroplet(drop) {
    return this.stampEntitySignature(
      {
        id: drop.id,
        x: drop.x,
        y: drop.y,
        radius: drop.radius,
        ttl: drop.ttl,
        totalTtl: drop.totalTtl,
      },
      [drop.id, drop.x, drop.y, drop.radius, drop.ttl, drop.totalTtl].join("|")
    );
  }

  serializeMissile(missile) {
    return this.stampEntitySignature(
      {
        id: missile.id,
        x: missile.x,
        y: missile.y,
        ownerId: missile.ownerId,
        ttl: missile.ttl,
        totalLife: missile.totalLife,
        radius: missile.radius,
        color: missile.color,
      },
      [
        missile.id,
        missile.x,
        missile.y,
        missile.ownerId,
        missile.ttl,
        missile.totalLife,
        missile.radius,
        missile.color,
      ].join("|")
    );
  }

  serializeChestEvent(event) {
    return {
      announce: event.announce,
      spawn: event.spawn,
      count: event.count,
      previewPositions: event.previewPositions,
      announced: event.announced,
      spawned: event.spawned,
      zoneIndex: event.zoneIndex,
    };
  }

  createEntityDelta(previousEntries, nextEntries) {
    const previousMap = new Map();
    const nextMap = new Map();
    const upsert = [];
    const remove = [];

    for (let i = 0; i < previousEntries.length; i += 1) {
      previousMap.set(previousEntries[i].id, previousEntries[i]);
    }

    for (let i = 0; i < nextEntries.length; i += 1) {
      const entity = nextEntries[i];
      nextMap.set(entity.id, entity);
      const previous = previousMap.get(entity.id);
      if (!previous || previous._sig !== entity._sig) {
        upsert.push(entity);
      }
    }

    for (let i = 0; i < previousEntries.length; i += 1) {
      const entity = previousEntries[i];
      if (!nextMap.has(entity.id)) {
        remove.push(entity.id);
      }
    }

    return {
      upsert: upsert,
      remove: remove,
    };
  }

  createSnapshotFor(playerId) {
    const focus = this.getSpectatorTarget(playerId);
    const range = 700;
    const dots = [];
    let normalDotBudget = 90;
    const zone = this.getCurrentZone(this.time);
    const incoming = this.getIncomingZone(this.time);

    for (let i = 0; i < this.dots.length; i += 1) {
      const dot = this.dots[i];
      if (!this.isNearFocus(dot, focus, range)) {
        continue;
      }
      if (dot.kind === "dot") {
        if (!this.isNearFocus(dot, focus, 420) && i % 5 !== 0) {
          continue;
        }
        if (normalDotBudget <= 0) {
          continue;
        }
        normalDotBudget -= 1;
      }
      dots.push(this.serializeDot(dot));
    }

    return {
      phase: this.finished ? "finished" : "playing",
      time: this.time,
      roomCode: this.roomCode,
      zoneTargets: this.zoneTargets,
      chestEvents: this.chestEvents.map((event) => this.serializeChestEvent(event)),
      currentZone: zone,
      incomingZone: incoming,
      snakes: this.snakes.map((snake) => this.serializeSnake(snake, playerId, focus)),
      dots: dots,
      items: this.items
        .filter((item) => this.isNearFocus(item, focus, range))
        .map((item) => this.serializeItem(item)),
      crates: this.crates
        .filter((item) => this.isNearFocus(item, focus, range + 160))
        .map((item) => this.serializeCrate(item)),
      ufos: this.ufos
        .filter((item) => this.isNearFocus(item, focus, range + 160))
        .map((ufo) => this.serializeUfo(ufo)),
      droplets: this.droplets
        .filter((item) => this.isNearFocus(item, focus, range))
        .map((drop) => this.serializeDroplet(drop)),
      missiles: this.missiles
        .filter((item) => this.isNearFocus(item, focus, range))
        .map((missile) => this.serializeMissile(missile)),
      killFeed: this.killFeed.slice(),
      summary: this.winner
        ? {
            id: this.winner.id,
            name: this.winner.name,
            playerId: this.winner.playerId,
            hp: this.winner.hp,
            kills: this.winner.kills,
          }
        : null,
    };
  }

  createSyncPacket(playerId, syncState) {
    const snapshot = this.createSnapshotFor(playerId);
    const sequence = syncState && typeof syncState.sequence === "number"
      ? syncState.sequence + 1
      : 1;
    const previousSnapshot = syncState && syncState.snapshot ? syncState.snapshot : null;
    const shouldSendFull = !previousSnapshot || sequence % 60 === 0;

    if (shouldSendFull) {
      return {
        packet: Object.assign({ mode: "full" }, snapshot),
        syncState: {
          sequence: sequence,
          snapshot: snapshot,
        },
      };
    }

    return {
      packet: {
        mode: "delta",
        phase: snapshot.phase,
        time: snapshot.time,
        roomCode: snapshot.roomCode,
        currentZone: snapshot.currentZone,
        incomingZone: snapshot.incomingZone,
        chestEvents: snapshot.chestEvents,
        killFeed: snapshot.killFeed,
        summary: snapshot.summary,
        snakes: {
          upsert: snapshot.snakes,
          remove: [],
        },
        dots: this.createEntityDelta(previousSnapshot.dots, snapshot.dots),
        items: this.createEntityDelta(previousSnapshot.items, snapshot.items),
        crates: this.createEntityDelta(previousSnapshot.crates, snapshot.crates),
        ufos: this.createEntityDelta(previousSnapshot.ufos, snapshot.ufos),
        droplets: this.createEntityDelta(previousSnapshot.droplets, snapshot.droplets),
        missiles: this.createEntityDelta(previousSnapshot.missiles, snapshot.missiles),
      },
      syncState: {
        sequence: sequence,
        snapshot: snapshot,
      },
    };
  }
}

module.exports = {
  MultiplayerMatch,
};

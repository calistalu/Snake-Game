const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const rooms = new Map();

function getLanUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((details) => {
      if (details.family === "IPv4" && !details.internal) {
        urls.push({
          name,
          url: `http://${details.address}:${port}`,
        });
      }
    });
  });
  return urls;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function roomSnapshot(room) {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    message: room.message,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      isHost: player.id === room.hostId,
    })),
  };
}

function broadcastRoom(room) {
  room.updatedAt = Date.now();
  const snapshot = roomSnapshot(room);
  room.streams.forEach((res) => {
    sendSse(res, "room", snapshot);
  });
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 5; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase());
}

function requireRoom(code, res) {
  const room = getRoom(code);
  if (!room) {
    sendJson(res, 404, { error: "房间不存在" });
    return null;
  }
  return room;
}

function requirePlayer(room, playerId, res) {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    sendJson(res, 404, { error: "玩家不存在" });
    return null;
  }
  return player;
}

function cleanupRoom(room) {
  if (room.players.length === 0 && room.streams.size === 0) {
    rooms.delete(room.code);
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: Date.now(), rooms: rooms.size });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/rooms") {
    const body = await parseBody(req).catch(() => null);
    if (!body) {
      sendJson(res, 400, { error: "请求体不是有效 JSON" });
      return true;
    }
    const code = createRoomCode();
    const player = {
      id: randomUUID(),
      name: String(body.name || "Pilot").slice(0, 18),
      ready: false,
      connected: true,
    };
    const room = {
      code,
      phase: "lobby",
      hostId: player.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      message: "等待玩家加入",
      players: [player],
      streams: new Set(),
    };
    rooms.set(code, room);
    sendJson(res, 201, {
      room: roomSnapshot(room),
      playerId: player.id,
    });
    return true;
  }

  const match = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)(?:\/([a-z-]+))?$/i);
  if (!match) {
    return false;
  }

  const room = requireRoom(match[1], res);
  if (!room) {
    return true;
  }

  const action = match[2] || "";

  if (req.method === "GET" && !action) {
    sendJson(res, 200, { room: roomSnapshot(room) });
    return true;
  }

  if (req.method === "GET" && action === "events") {
    const playerId = String(new URL(req.url, `http://${req.headers.host}`).searchParams.get("playerId") || "");
    const player = room.players.find((entry) => entry.id === playerId);
    if (player) {
      player.connected = true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write("\n");
    room.streams.add(res);
    sendSse(res, "room", roomSnapshot(room));
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      room.streams.delete(res);
      if (player) {
        player.connected = false;
        broadcastRoom(room);
      }
      cleanupRoom(room);
    });
    return true;
  }

  const body = await parseBody(req).catch(() => null);
  if (!body) {
    sendJson(res, 400, { error: "请求体不是有效 JSON" });
    return true;
  }

  if (req.method === "POST" && action === "join") {
    if (room.players.length >= 4) {
      sendJson(res, 409, { error: "房间已满，第一版先支持 4 人大厅" });
      return true;
    }
    if (room.phase !== "lobby") {
      sendJson(res, 409, { error: "房间已不在大厅阶段" });
      return true;
    }
    const player = {
      id: randomUUID(),
      name: String(body.name || "Pilot").slice(0, 18),
      ready: false,
      connected: true,
    };
    room.players.push(player);
    room.message = "玩家已加入";
    broadcastRoom(room);
    sendJson(res, 200, {
      room: roomSnapshot(room),
      playerId: player.id,
    });
    return true;
  }

  if (req.method === "POST" && action === "ready") {
    const player = requirePlayer(room, body.playerId, res);
    if (!player) {
      return true;
    }
    player.ready = Boolean(body.ready);
    room.message = room.players.every((entry) => entry.ready)
      ? "全员准备，可以由房主开始"
      : "等待其他玩家准备";
    broadcastRoom(room);
    sendJson(res, 200, { room: roomSnapshot(room) });
    return true;
  }

  if (req.method === "POST" && action === "start") {
    const player = requirePlayer(room, body.playerId, res);
    if (!player) {
      return true;
    }
    if (player.id !== room.hostId) {
      sendJson(res, 403, { error: "只有房主可以开始" });
      return true;
    }
    if (room.players.length < 2) {
      sendJson(res, 409, { error: "至少需要 2 名玩家" });
      return true;
    }
    if (!room.players.every((entry) => entry.ready)) {
      sendJson(res, 409, { error: "还有玩家未准备" });
      return true;
    }
    room.phase = "sync-pending";
    room.message = "联机战斗同步下一步接入，这一版先打通房间与实时同步。";
    broadcastRoom(room);
    sendJson(res, 200, { room: roomSnapshot(room) });
    return true;
  }

  if (req.method === "POST" && action === "leave") {
    const playerIndex = room.players.findIndex((entry) => entry.id === body.playerId);
    if (playerIndex === -1) {
      sendJson(res, 404, { error: "玩家不存在" });
      return true;
    }
    const leavingPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    if (room.hostId === leavingPlayer.id && room.players[0]) {
      room.hostId = room.players[0].id;
    }
    room.message = room.players.length > 0 ? "有玩家离开了房间" : "房间已关闭";
    broadcastRoom(room);
    cleanupRoom(room);
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 404, { error: "接口不存在" });
  return true;
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT, filePath);
  if (!absolutePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "禁止访问" });
    return;
  }
  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
      return;
    }
    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const handled = await handleApi(req, res, url.pathname);
    if (handled) {
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: "服务器异常", detail: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Multiplayer server running at http://localhost:${PORT}`);
  const lanUrls = getLanUrls(PORT);
  if (lanUrls.length > 0) {
    console.log("LAN URLs:");
    lanUrls.forEach((entry) => {
      console.log(`- [${entry.name}] ${entry.url}`);
    });
  } else {
    console.log("No external IPv4 address detected.");
  }
});

# 贪吃蛇之太空危机逃亡

一个H5 Canvas电脑端单页游戏，支持单机和联机两种模式。Vibe Coding制作， 已部署在[网站](https://snake-game-cje1.onrender.com)。

## 玩法介绍

### 操作
- 移动：`WASD` 或 `方向键`
- 发射导弹：`Space`
- 加速：`N`

### 核心规则
- 开局生命值 `100`，上限 `5000`
- 生命越高，蛇越粗越长
- 场上只剩 1 条蛇时，玩家胜利
- 血量低于 `400` 时，再吃伤害会直接死亡
- 获取生命值：道具或伤害其他蛇（撞蛇身任意部位/导弹命中）

### 状态效果
- 磁铁：`5s`，扩大吸附范围
- 减速：`5s`，碰到 UFO 水滴触发
- 保护：受伤后自动触发 `5s` 护盾
- 辐射：在安全区外持续掉血

### 地图事件
- 宝箱：出现前 `15s` 地图标记位置，含1000生命值
- 辐射扩散：提前 `20s` 预警并显示倒计时

---

## Space Snake: Radiation Escape (Quick Guide)

### Controls
- Move: `WASD` or `Arrow Keys`
- Fire missile: `Space`
- Boost: `N`

### Win Condition
- Start HP: `100`, Max HP: `5000`
- More HP = bigger/longer snake
- Match ends when only one snake is alive
- If HP is below `400`, the next hit is fatal

### What to Focus On
- Collect resources: dots (`+1`) and wreckage (auto-pickup at close range)
- Grab items: Mushroom (`+20`), Star (`+40`), Heart (`+1000`)
- Deal damage: enemy HP loss is converted to your HP (up to 5000)

### Damage Rules
- Your head hitting another snake’s body deals damage to you
- Missile creates a ring in front of you and resolves after `1s`
- On hit: target loses `40%` current HP, same amount goes to shooter
- Your missiles are blue and won’t hurt you; enemy missiles are red

### Status Effects
- Magnet: `5s`, larger pickup pull range
- Slow: `5s`, triggered by UFO droplets
- Shield: auto `5s` after taking damage
- Radiation: constant damage outside safe zone (no timer icon)

### Timed Events
- Chests:
  - `90s`: 3 chests
  - `180s`: 2 chests
  - `240s`: 1 chest
  - Spawn markers appear `15s` early
- Radiation shrinks:
  - Starts at `60s`, `120s`, `210s`
  - Each shrink lasts `10s`
  - `20s` warning before each shrink

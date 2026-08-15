# Project Sandline：网页版经典战术 FPS（CS 1.6 风格）Clean-room 项目开发设计书

> 版本：v1.0  
> 日期：2026-08-15  
> 目标平台：桌面浏览器，单机离线/本机运行，不实现局域网或互联网联机  
> 目标使用者：使用能力有限的本地大模型作为主要编码 Agent，由人类负责验收、提供参考测量值和处理美术资产  
> 法律定位：**机制/手感高保真复现 + 全部代码、地图、美术、音效、UI 和品牌表达原创**  
> 重要声明：本文不是法律意见。若项目准备公开发布、商业化、上架游戏平台或在公司环境中使用，应让熟悉目标法域的软件/游戏知识产权律师做正式审查。

---

## 0. 先给结论

原始需求中“在不违反专利保护法的前提下，1:1 与 CS 1.6 保持一致”需要改写。

**可执行、风险明显更低的目标应定义为：**

> 在不复制 Valve/Counter-Strike 的源代码、地图几何、美术、模型、贴图、音效、UI、文字、角色外观、Logo、品牌标识和游戏文件的前提下，以 clean-room 方式复现经典 Counter-Strike 1.x 的可观察玩法机制、操作节奏、回合制结构、经济系统、武器行为类别、移动手感和战术节奏；所有地图和视听表达重新设计；额外加入离线机器人系统。

原因是：

1. 美国版权局明确指出，**ideas / procedures / processes / systems / methods of operation** 本身通常不受版权保护，但具体表达受保护。
2. 游戏的地图、美术、视听表现、代码、UI 组合等属于更高风险的“表达”。
3. 美国法院在游戏克隆案件中也曾认定：即便规则本身不可版权化，过度接近原作的“整体表达”和具体视觉/布局组合仍可能构成侵权。
4. “Counter-Strike”“CS”等名称、Logo 和相关视觉标识还涉及商标与来源混淆风险。
5. Steam Subscriber Agreement 明确将 Valve 内容作为许可内容而非出售内容，并对复制、逆向、派生作品等设置限制，除非协议、适用法律或单独授权允许。
6. 专利反而不是该项目最主要的 IP 风险。美国实用专利通常按申请日起约 20 年计算，但存在期限调整、续案、不同法域等例外；如果商业发布，需要做正式的 Freedom-to-Operate（FTO）检索，不能只凭游戏年代推断“没有专利风险”。

因此本文给出的方案不是“把 CS 1.6 网页化复制一遍”，而是：

**玩法机制尽量接近，受保护表达彻底重做。**

---

# 1. 研究结论与事实边界

## 1.1 关于 CS 1.6 本身

截至本文检索日期：

- Steam 上的经典 Counter-Strike 仍由 Valve 发布。
- Valve Developer Community 的 Counter-Strike 页面明确提示：经典 Counter-Strike 本身**没有原生机器人**。
- Counter-Strike: Condition Zero 则加入了官方 “CS bot”，并提供单人/Skirmish 类玩法。
- 因此你的实际目标更准确地说是：

> **“CS 1.6 式核心枪战与回合机制 + 自己实现的离线机器人系统。”**

不能把“机器人”误认为标准 CS 1.6 的原生组成。

## 1.2 可高保真复现的部分

以下部分可以作为 clean-room 的主要目标：

- 第一人称视角
- 鼠标自由视角
- WASD 移动
- 走/跑/蹲/跳
- 地面加速、摩擦、空中控制的整体手感
- 无 ADS 的经典腰射体系
- 部分武器的开火模式切换
- 命中扫描（hitscan）为主的枪械
- 弹匣、备弹、换弹
- 后坐力、扩散、移动精度惩罚
- 命中部位伤害倍率
- 护甲、头盔
- 手雷
- 回合制
- 死亡后本回合不复活
- 购买阶段
- 经济系统
- 阵营差异化武器池
- 爆破目标
- 人质目标
- VIP/护送类目标
- 观战
- 雷达/队友信息
- Bot 添加、删除、难度调整
- NavMesh 寻路
- Bot 目标执行、警戒、交火和基本团队行为

这些属于“功能/规则/机制”的层面。最终实现仍要避免把受保护的视觉和内容表达一起复制。

## 1.3 不应 1:1 复制的部分

以下默认全部重做：

| 内容 | 是否允许在本项目中直接复制 | 本项目策略 |
|---|---:|---|
| CS 1.6 源代码/反编译代码 | 否 | 全部自行实现 |
| BSP 地图 | 否 | 原创地图 |
| 地图房间/走廊几何逐尺寸复刻 | 否 | 只继承“战术类型”，重新布局 |
| WAD 贴图 | 否 | CC0/自制 |
| MDL 武器/人物模型 | 否 | 自制或合规第三方资产 |
| 原始枪声/脚步/电台语音 | 否 | 自制/CC0 |
| HUD 图标和布局逐像素复刻 | 否 | 功能相似，视觉原创 |
| 菜单背景和字体风格逐像素复刻 | 否 | 原创 |
| “Counter-Strike”游戏名和 Logo | 否 | 使用 Project Sandline 或其他原创名 |
| 原地图名用于正式发布 | 不建议 | 原创地图名 |
| 枪械玩法类别 | 可以作为机制参考 | 使用内部抽象 ID |
| 回合规则 | 可以作为机制参考 | clean-room 实现 |
| 经济规则 | 可以作为机制参考 | clean-room 实现 |
| 移动和射击手感 | 可以黑盒标定 | 不查看/复制原代码 |

---

# 2. 项目成功标准

本项目不把“相似”定义为视觉相似，而定义为以下 5 个维度。

## 2.1 Gameplay Fidelity

目标：

- 回合节奏高度接近经典战术 FPS
- 死亡惩罚与经济压力明显
- 停下后射击比移动射击稳定
- 连射需要压枪
- 狙击枪停稳后精度明显提高
- 手枪回合、经济局、全装局拥有不同节奏
- 爆破点进攻、回防、残局具备合理战术空间

目标主观评分：**≥ 9/10 的“经典 1.x 战术 FPS 手感”**

## 2.2 Mechanical Fidelity

对于可以测量的参数：

- 伤害：目标误差 ≤ 1 HP
- 射速：目标误差 ≤ 1%
- 换弹时间：目标误差 ≤ 30 ms
- 移动速度：目标误差 ≤ 2%
- 跳跃最高点：目标误差 ≤ 3%
- 开火间隔：目标误差 ≤ 1 帧或 10 ms
- 购买/经济结算：应精确一致于你选定的“参考规则版本”
- 回合结束逻辑：100% 符合规格表

注意：

**这里的“参考规则版本”必须由你自己建立。**  
CS 1.6 历史版本、服务器配置和社区规则存在变化，不能让本地模型“凭记忆猜一个数字”。

## 2.3 Content Independence

正式资产满足：

- 0 个 Valve 原始资产
- 0 个从 CS 文件中导出的模型
- 0 个从 CS 截图裁剪的贴图
- 0 个原地图 BSP
- 0 个原地图逐尺寸重建
- 0 个原始语音/声音文件
- 0 个原 Logo

## 2.4 Browser Performance

建议目标：

- Chrome/Edge 桌面版优先
- 1080p
- 中端独显：稳定 120 FPS 或显示器刷新率上限
- 集显：稳定 60 FPS
- 单局最多 1 人类 + 15 Bot
- 99% 帧时间不出现明显 > 50 ms 卡顿
- 地图首次加载 ≤ 5 秒（本地静态服务器，SSD）
- 地图切换过程中释放旧 GPU 资源

## 2.5 AI 可维护性

任何一个“小任务”应满足：

- 本地模型一次只改 1～4 个文件
- 每次改动 ≤ 400 行为宜
- 每个功能有明确验收命令
- 不允许模型跨阶段“顺便重构”
- 不允许模型凭空重写整个系统
- 所有规则数据放配置文件，不硬编码散落在逻辑中

---

# 3. 推荐技术路线

## 3.1 核心技术栈

推荐：

```text
语言：TypeScript
构建：Vite 8.x
渲染：three.js
物理：Rapier 3D WASM
导航：recast-navigation-js
音频：Web Audio API
输入：Pointer Lock API + KeyboardEvent
资源：glTF / GLB
测试：Vitest + Playwright
格式化/静态检查：ESLint + Prettier 或 Biome
地图制作：Blender
```

### 为什么不使用 Unity WebGL

可以，但对“能力一般的代码大模型”不一定最友好：

- 构建链更重
- C# + Unity Editor 状态较多
- 自动化修改场景和 Prefab 对 LLM 不如纯文本工程稳定
- WebGL build 调试周期较长

Three.js + TypeScript 的工程状态几乎都在文本文件里，更适合代码 Agent。

## 3.2 版本建议

截至 2026-08：

- three.js npm 最新公开结果为 0.185.1
- Vite 8 已发布，2026-06 又发布了 8.1
- Rapier 官方 JS binding 已并入主 Rapier 仓库，Rapier 本身使用 Apache-2.0
- recast-navigation-js 使用 MIT License，并支持浏览器、TypeScript、离线 NavMesh 生成和 crowd/pathfinding

**工程上不要写 `latest`。**

初始化成功后：

```bash
npm ls --depth=0
```

把真实安装版本锁入：

```text
package-lock.json
docs/DEPENDENCY_LOCK.md
```

之后除非单独建“依赖升级任务”，任何本地模型不得升级依赖。

---

# 4. 浏览器架构

## 4.1 总体结构

```text
Browser
│
├── Main Thread
│   ├── Renderer (three.js)
│   ├── Input
│   ├── Fixed-step Game Simulation
│   ├── Physics Interface
│   ├── Weapon/Combat
│   ├── Round/Objectives/Economy
│   ├── Bot High-level Decision
│   ├── HUD/Menu
│   └── Audio
│
└── Optional Worker
    ├── Offline/Runtime NavMesh generation
    └── heavy preprocessing
```

对于第一版不要把游戏逻辑分散到多个 Worker。

**先保证正确，再做并行化。**

## 4.2 固定时间步

必须使用固定模拟步长。

推荐起始：

```ts
SIM_HZ = 120
SIM_DT = 1 / 120
MAX_CATCHUP_STEPS = 8
```

这不是在宣称 CS 1.6 原引擎就是 120 Hz。

这是网页版工程的稳定实现策略。

之后所有“手感参数”在该固定步长下通过黑盒标定。

渲染使用插值：

```text
simulation state N
simulation state N+1
        ↓
render interpolation alpha
```

不要把速度、射击、后坐力直接依赖 `requestAnimationFrame()` 的可变 `deltaTime`。

---

# 5. 推荐仓库结构

```text
project-sandline/
├── public/
│   ├── assets/
│   │   ├── maps/
│   │   ├── models/
│   │   ├── textures/
│   │   ├── audio/
│   │   └── fonts/
│   └── nav/
│
├── src/
│   ├── app/
│   │   ├── bootstrap.ts
│   │   └── GameApp.ts
│   │
│   ├── core/
│   │   ├── Clock.ts
│   │   ├── FixedStepLoop.ts
│   │   ├── EventBus.ts
│   │   ├── GameState.ts
│   │   └── RNG.ts
│   │
│   ├── input/
│   │   ├── InputManager.ts
│   │   ├── KeyBindings.ts
│   │   └── MouseLook.ts
│   │
│   ├── world/
│   │   ├── World.ts
│   │   ├── MapLoader.ts
│   │   ├── CollisionWorld.ts
│   │   ├── MapMetadata.ts
│   │   └── SpawnSystem.ts
│   │
│   ├── player/
│   │   ├── Player.ts
│   │   ├── CharacterMotor.ts
│   │   ├── HealthArmor.ts
│   │   └── Spectator.ts
│   │
│   ├── weapons/
│   │   ├── Weapon.ts
│   │   ├── WeaponController.ts
│   │   ├── WeaponStateMachine.ts
│   │   ├── Hitscan.ts
│   │   ├── Recoil.ts
│   │   ├── Spread.ts
│   │   ├── Penetration.ts
│   │   ├── Grenade.ts
│   │   └── WeaponRegistry.ts
│   │
│   ├── combat/
│   │   ├── Damage.ts
│   │   ├── Hitbox.ts
│   │   ├── HitRegion.ts
│   │   └── DeathSystem.ts
│   │
│   ├── rules/
│   │   ├── RoundManager.ts
│   │   ├── Economy.ts
│   │   ├── BuySystem.ts
│   │   ├── Team.ts
│   │   └── MatchConfig.ts
│   │
│   ├── objectives/
│   │   ├── ObjectiveSystem.ts
│   │   ├── BombObjective.ts
│   │   ├── HostageObjective.ts
│   │   └── VipObjective.ts
│   │
│   ├── bots/
│   │   ├── Bot.ts
│   │   ├── BotManager.ts
│   │   ├── BotBlackboard.ts
│   │   ├── BotPerception.ts
│   │   ├── BotAim.ts
│   │   ├── BotMovement.ts
│   │   ├── BotCombat.ts
│   │   ├── BotObjective.ts
│   │   └── behavior/
│   │
│   ├── nav/
│   │   ├── NavMeshLoader.ts
│   │   ├── PathPlanner.ts
│   │   └── CoverPoints.ts
│   │
│   ├── audio/
│   ├── ui/
│   ├── debug/
│   └── main.ts
│
├── data/
│   ├── weapons/
│   ├── maps/
│   ├── economy/
│   ├── bots/
│   └── game/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── reference/
│   └── e2e/
│
├── tools/
│   ├── build-navmesh.ts
│   ├── validate-map.ts
│   ├── validate-assets.ts
│   └── generate-reference-report.ts
│
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── LEGAL_ASSET_RULES.md
│   ├── REFERENCE_MEASUREMENTS.md
│   ├── MODEL_RULES.md
│   ├── CURRENT_TASK.md
│   ├── PROJECT_STATE.md
│   └── DECISIONS.md
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

# 6. 核心架构原则

## 6.1 Data-driven

武器、经济、Bot 难度、地图元数据全部数据驱动。

错误做法：

```ts
if (weapon === "xxx") {
  damage = 36;
}
```

正确做法：

```ts
const spec = weaponRegistry.get(id);
damage = spec.damage;
```

## 6.2 渲染和规则逻辑分离

例如：

```text
WeaponSimulation
  ↓ emits WeaponFired
GamePresentation
  ↓
muzzle flash / animation / sound
```

游戏规则不能依赖动画是否播放完成。

## 6.3 可重复 RNG

Bot、弹道扩散、随机出生选择：

```text
seed = matchSeed
```

必须支持固定 seed。

这样：

```bash
npm run test:determinism
```

可以复现 Bug。

## 6.4 事件不可滥用

高频逻辑直接函数调用。

EventBus 只用于：

- 玩家死亡
- 回合开始
- 回合结束
- 炸弹安装
- 炸弹拆除
- 人质获救
- Bot 加入/离开
- UI 通知

不要把每一帧的移动都做 EventBus。

---

# 7. 游戏状态机

```text
BOOT
 ↓
MAIN_MENU
 ↓
MAP_LOADING
 ↓
MATCH_INIT
 ↓
ROUND_FREEZE
 ↓
ROUND_LIVE
 ├── objective completed
 ├── team eliminated
 └── timeout
 ↓
ROUND_END
 ↓
ROUND_FREEZE
 ↓
...
 ↓
MATCH_END
```

另外：

```text
PAUSED
SPECTATING
```

属于覆盖状态。

## 7.1 RoundManager 必须是唯一权威

严禁：

- BombObjective 自己直接加载下一回合
- Player 死亡代码自己发奖金
- UI 自己修改当前回合状态

它们都只能向 `RoundManager` 报告事实。

---

# 8. 阵营设计

为了降低品牌和表达风险，代码和发布版本建议使用原创名称。

例如：

```text
TEAM_ATTACKER
TEAM_DEFENDER
```

UI 可显示：

```text
Raiders
Response Unit
```

不要把正式游戏标题、Logo、队徽做成 Counter-Strike 风格。

---

# 9. 玩家移动系统

这是最影响“像不像经典 1.x”的模块之一。

## 9.1 状态

```text
GROUND
AIR
CROUCH
LADDER
DEAD
SPECTATOR
```

## 9.2 参数

所有参数放：

```text
data/game/movement.json
```

推荐字段：

```json
{
  "gravity": 0,
  "groundAcceleration": 0,
  "airAcceleration": 0,
  "groundFriction": 0,
  "stopSpeed": 0,
  "walkSpeed": 0,
  "runSpeed": 0,
  "crouchSpeedScale": 0,
  "jumpImpulse": 0,
  "maxAirSpeed": 0,
  "stepHeight": 0,
  "capsuleRadius": 0,
  "standingHeight": 0,
  "crouchingHeight": 0
}
```

**初始全部允许为占位值。**

不要让模型“凭知识写经典 GoldSrc 数字”。

必须通过你的参考测量逐项标定。

## 9.3 移动更新顺序

每个固定 tick：

```text
1. sample command
2. calculate wish direction
3. determine ground/air
4. apply friction
5. accelerate
6. jump
7. physics move
8. stair/step handling
9. resolve collision
10. update grounded state
11. update camera height
```

## 9.4 武器速度上限

不同武器可影响最大移动速度：

```ts
effectiveMaxSpeed = min(playerBaseMaxSpeed, activeWeapon.maxMoveSpeed)
```

该逻辑放 WeaponSpec，不写大量 switch。

---

# 10. 相机和输入

## 10.1 Pointer Lock

FPS 必须使用 Pointer Lock API。

流程：

```text
click “进入游戏”
 ↓
requestPointerLock()
 ↓
pointerlockchange
 ↓
开始接收 movementX / movementY
```

必须处理：

- 用户按 Esc 退出 Pointer Lock
- 浏览器拒绝锁定
- 窗口失焦
- 暂停
- 鼠标灵敏度
- Y 轴反转
- 原始鼠标运动支持差异

## 10.2 Mouse Look

保存：

```text
yaw
pitch
```

Pitch 限制：

```text
[-89°, +89°]
```

不要使用 Euler 累积矩阵避免漂移。

---

# 11. 武器系统

## 11.1 武器内部 ID

不要在核心逻辑到处出现真实产品名。

建议：

```text
pistol_defender_start
pistol_attacker_start
pistol_heavy
pistol_compact
pistol_dual

shotgun_pump
shotgun_auto

smg_light
smg_fast
smg_heavy
smg_compact

rifle_attacker_primary
rifle_defender_primary
rifle_burst_attacker
rifle_burst_defender
rifle_light_attacker
rifle_light_defender

sniper_light
sniper_heavy
sniper_semi

machinegun_heavy

knife
grenade_frag
grenade_flash
grenade_smoke
objective_device
```

如果只在个人内部的 `REFERENCE_MEASUREMENTS.md` 里做对照，可单独记录参考武器名称；发布版数据不需要用 Valve 的产品体系命名。

## 11.2 WeaponSpec

```ts
interface WeaponSpec {
  id: string;
  category: string;

  magazineSize: number;
  reserveAmmoMax: number;

  damage: number;
  fireIntervalMs: number;

  reloadMs: number;
  drawMs: number;

  maxMoveSpeed: number;

  baseSpread: number;
  movementSpread: number;
  airSpread: number;
  crouchSpreadScale: number;

  recoilProfileId: string;

  armorPenetration: number;
  surfacePenetrationPower: number;

  zoomLevels?: number[];
  fireModes?: ("semi" | "auto" | "burst")[];

  price: number;
  teamRestriction?: string;
}
```

## 11.3 武器状态机

```text
HOLSTERED
DRAWING
READY
FIRING
COOLDOWN
RELOADING
MODE_SWITCHING
```

任何状态切换必须由明确时间戳驱动。

## 11.4 开火处理

hitscan 流程：

```text
input fire
 ↓
check weapon state
 ↓
consume ammo
 ↓
calculate recoil state
 ↓
calculate spread
 ↓
raycast
 ↓
optional penetration
 ↓
hitbox
 ↓
damage calculation
 ↓
emit presentation event
```

## 11.5 后坐力

不要只做“随机相机抖动”。

至少拆成：

```text
weapon recoil state
camera punch
spread growth
recovery
```

从而允许：

- 点射
- 短 burst
- 连射
- 压枪

表现出不同结果。

## 11.6 精度机制

建议分解为：

```text
base inaccuracy
+ movement penalty
+ airborne penalty
+ firing penalty
+ recoil/spread state
```

站定、蹲下、移动、跳跃必须能通过自动测试产生明显不同的统计散布。

---

# 12. 伤害和护甲

## 12.1 HitRegion

```text
HEAD
CHEST
STOMACH
ARM
LEG
```

## 12.2 伤害函数

```text
base weapon damage
 × distance modifier
 × hit region modifier
 → armor reduction
 → final HP damage
```

所有倍率来自配置。

## 12.3 测试

每个武器至少测试：

- 近距离头部
- 近距离躯干
- 远距离
- 有甲
- 无甲
- 头盔
- 无头盔

---

# 13. 穿墙/表面穿透

经典玩法里穿透是重要战术组成。

但网页第一版不要一开始就实现复杂多层穿透。

分三阶段：

### V1

```text
没有穿透
```

### V2

```text
一层表面
```

每种材质：

```json
{
  "id": "wood_light",
  "penetrationResistance": 0.2,
  "damageRetention": 0.75
}
```

### V3

支持：

- 多层材料
- 剩余穿透功率
- 进入/离开点
- 厚度
- 伤害衰减

---

# 14. 手雷

## 14.1 类型

```text
fragmentation
flash
smoke
```

## 14.2 第一版顺序

1. 先做投掷物轨迹
2. 再做爆炸伤害
3. 再做闪光
4. 最后做烟雾

## 14.3 Smoke

网页端建议使用：

```text
低成本 billboard / sprite particle volume
```

不是一开始做体积流体。

需要保证：

- 视线遮挡
- Bot 感知受影响
- 不把 GPU 打爆

---

# 15. 购买和经济系统

## 15.1 Economy 独立模块

```ts
interface EconomyEvent {
  type:
    | "ROUND_WIN"
    | "ROUND_LOSS"
    | "KILL"
    | "OBJECTIVE"
    | "TEAM_DAMAGE_PENALTY"
    | "HOSTAGE_PENALTY";
}
```

Economy 不知道 UI，也不控制武器实体。

## 15.2 购买限制

至少支持：

```text
buy zone
buy time
team restriction
money
inventory slot
ammo
armor
helmet
defuse tool
grenade count
```

## 15.3 规则版本

创建：

```text
data/economy/classic_reference_v1.json
```

你自己确定的参考数据一旦锁定：

```text
sha256
```

写入：

```text
docs/REFERENCE_MEASUREMENTS.md
```

本地模型不得随意“平衡”。

---

# 16. 爆破模式

## 16.1 实体

```text
AttackerSpawn
DefenderSpawn
BombSiteA
BombSiteB
BuyZone
BombCarrier
PlantedBomb
```

## 16.2 状态机

```text
CARRIED
 ↓
DROPPED
 ↓
PICKED_UP
 ↓
PLANTING
 ↓
PLANTED
 ├── DETONATED
 └── DEFUSING → DEFUSED
```

## 16.3 胜负判断优先级

RoundManager 必须显式定义优先级。

例如：

```text
if bomb is planted:
    elimination does not automatically cancel bomb outcome
```

不要简单写：

```ts
if attackersAlive === 0 -> defender win
```

否则会出现经典爆破规则错误。

---

# 17. 人质模式

建议第一版简化：

```text
hostage idle
 ↓ use/interact
following player
 ↓
rescue zone
rescued
```

Bot 必须：

- Defender/Response side 能主动找人质
- Attacker/Raider side 能守关键区域
- 不把人质堵死在狭窄门口

第二版再做：

- 卡住恢复
- 重新寻路
- 跟随间距
- 恐慌/动画

---

# 18. VIP/护送模式

为了覆盖经典模式，但避免复刻具体内容：

```text
随机一个 Defender 成为 VIP
VIP 装备受限制
Attackers 尝试击杀 VIP
Defenders 护送 VIP 到 Escape Zone
```

地图必须原创。

---

# 19. Bot 架构

这是项目中第二复杂的模块。

不要直接让 LLM “写一个聪明 AI”。

拆成 6 层。

## 19.1 Navigation

```text
NavMesh
Path query
Local avoidance
stuck detection
door/ladder/offmesh
```

## 19.2 Perception

Bot 只能根据感知信息行动。

```text
vision cone
line of sight
hearing event
last seen position
last heard position
teammate report
```

禁止 Bot 直接读取：

```text
enemy.position
```

除非 `Perception` 已经确认可见。

## 19.3 Blackboard

```ts
interface BotBlackboard {
  visibleEnemies: EntityId[];
  targetEnemy?: EntityId;
  lastSeenEnemyPos?: Vec3;
  lastSeenTime?: number;

  currentObjective?: string;
  currentPath?: Vec3[];

  health: number;
  aggression: number;
  caution: number;

  isReloading: boolean;
  isUnderFire: boolean;
  bombKnownPosition?: Vec3;
}
```

## 19.4 High-level Behavior Tree

```text
ROOT
├── IfDead
├── IfRoundEnded
├── IfImmediateThreat
│   ├── Fight
│   ├── TakeCover
│   └── Retreat
├── IfObjectiveUrgent
│   ├── Plant
│   ├── Defuse
│   ├── Rescue
│   └── Escort
├── FollowTeamPlan
└── Patrol / Hold / Rotate
```

## 19.5 Combat

Combat 再拆：

```text
target selection
aim
reaction delay
burst control
reload decision
weapon switch
strafe
crouch
peek
grenade
```

## 19.6 Bot 难度

不要给高难度 Bot “外挂”。

差异主要通过：

```text
reactionDelay
aimNoise
trackingLag
burstLength
recoilCompensation
hearingAccuracy
tacticalUpdateRate
aggression
```

示例：

```json
{
  "easy": {
    "reactionMs": [450, 700],
    "aimNoiseDeg": 4.5,
    "tacticalHz": 2
  },
  "normal": {
    "reactionMs": [250, 450],
    "aimNoiseDeg": 2.5,
    "tacticalHz": 4
  },
  "hard": {
    "reactionMs": [140, 260],
    "aimNoiseDeg": 1.2,
    "tacticalHz": 6
  },
  "expert": {
    "reactionMs": [90, 180],
    "aimNoiseDeg": 0.7,
    "tacticalHz": 8
  }
}
```

以上是工程初始值，不是 CS/CZ 官方数据。

---

# 20. Bot 添加/删除功能

主菜单必须有：

```text
Bot 数量
难度
Attackers 数量
Defenders 数量
是否自动平衡
```

游戏中 Debug Console：

```text
ai_add attackers
ai_add defenders
ai_remove <id>
ai_kick_all
ai_fill 15
ai_difficulty normal
ai_freeze 1
ai_debug 1
```

这样就满足“自己玩，能添加删减机器人”。

---

# 21. NavMesh

## 21.1 推荐流程

地图基本静态，因此：

**离线生成 NavMesh。**

```text
Blender collision mesh
 ↓
GLB
 ↓
tools/build-navmesh.ts
 ↓
public/nav/map_name.navbin
```

运行时只加载。

## 21.2 为什么不用运行时烘焙

- 首次加载更慢
- 更难 debug
- Bot 数量越多越不稳定
- 本项目地图静态，没有必要

## 21.3 Off-mesh Link

需要：

```text
ladder
drop down
jump connection
door
```

第一版先只做：

```text
walk + stairs
```

再加 ladder。

---

# 22. 原创地图系统

这是法律边界中最重要的地方之一。

## 22.1 禁止

不要：

- 导入 CS BSP
- 按 CS overview 图描线
- 用截图测坐标后按比例重建
- 逐个复制掩体位置
- 复刻原地图纹理
- 复刻标志性建筑立面

## 22.2 可以继承的抽象设计思想

例如：

```text
两队出生区
2 个目标点
3 条主要交通路线
中路可控
两边各有不同距离的交火空间
防守方有回防路线
进攻方有节奏选择
```

这属于更高层的战术结构。

---

# 23. 首发地图清单

推荐首发 8 张原创地图。

---

## 23.1 map_sandline

类型：

```text
Bomb
```

主题：

```text
干旱边境工业区
```

拓扑：

```text
                [Site A]
               /       \
Attack Spawn--Mid------Connector---Defender Spawn
      \         \       /
       Long -----\-----/
          \
          [Site B]
```

设计目标：

- 中路争夺
- A 有中距离交战
- B 偏近距离
- 进攻方可快速转点
- 防守方转点略短但需要暴露

---

## 23.2 map_cold_storage

类型：

```text
Bomb
```

主题：

```text
冷链仓储中心
```

特点：

- 两层结构
- 大仓库长视线
- 地下运输通道
- 一处可从高层落下的风险路线

---

## 23.3 map_foundry

类型：

```text
Bomb
```

主题：

```text
铸造工厂
```

特点：

- 大量近距离角落
- 热处理大厅中距离
- 一条危险长直线
- 回防路线明确

---

## 23.4 map_harbor

类型：

```text
Bomb
```

主题：

```text
集装箱港口
```

特点：

- 长枪发挥空间大
- 集装箱形成非规则短路线
- 高低差少
- Bot 寻路容易

---

## 23.5 map_consulate

类型：

```text
Hostage
```

主题：

```text
现代行政办公楼
```

特点：

- 人质位于内部不同区域
- 防守方需进入建筑
- 攻方控制多个门厅
- 地图必须有至少 2 条人质撤离路线

---

## 23.6 map_motel

类型：

```text
Hostage
```

主题：

```text
公路汽车旅馆
```

特点：

- 室内外混合
- 近战较多
- 走廊与院子形成自然 flanking

---

## 23.7 map_embassy_run

类型：

```text
VIP
```

主题：

```text
城市使馆撤离路线
```

目标：

- 1 个 VIP
- 2 个 Escape Zone
- 多个 ambush 点
- Defenders 必须选择护送路线

---

## 23.8 map_training_yard

类型：

```text
Training
```

用途：

- 移动调试
- 武器调试
- Bot 调试
- 穿透测试
- Grenade 测试
- FPS benchmark

它是整个开发期间最重要的调试地图。

---

# 24. 地图文件格式

每张地图：

```text
public/assets/maps/map_sandline.glb
data/maps/map_sandline.json
public/nav/map_sandline.navbin
```

Metadata：

```json
{
  "id": "map_sandline",
  "mode": "bomb",

  "spawns": {
    "attackers": [],
    "defenders": []
  },

  "buyZones": [],

  "bombSites": {
    "A": {},
    "B": {}
  },

  "rescueZones": [],

  "soundZones": [],

  "coverPoints": []
}
```

不要把游戏规则写在 Blender object name 的魔法字符串里。

---

# 25. 美术方向

目标不是“现代高画质”。

推荐：

> **原创的 2000 年代早期低多边形军事 FPS 视觉语言。**

但要避开 CS 特有外观。

## 25.1 模型

- 人物：1.5k～5k triangles
- 武器：2k～8k triangles
- 世界主要建筑低模
- 使用 glTF

## 25.2 贴图

建议：

```text
256²
512²
1024²
```

根据物体尺寸选择。

不要故意复制 CS 原纹理低分辨率的具体图案。

## 25.3 光照

优先：

```text
baked lightmap
+
少量 dynamic light
```

而不是全动态 PBR。

这样：

- 更接近早期 FPS 节奏
- 性能稳定
- 地图可控

---

# 26. 音频

所有音频必须有来源记录：

```text
asset path
source
author
license
download date
modified?
```

存：

```text
docs/ASSET_LICENSES.md
```

可以使用：

- CC0
- 自己录音
- 自己合成
- 明确允许商业/非商业使用的库

不要下载“CS 1.6 sound pack”。

---

# 27. HUD

功能可以相似：

```text
health
armor
ammo
money
timer
objective
radar
kill feed
team status
```

但视觉必须原创。

推荐：

```text
左下：生命/护甲
右下：弹药
上中：时间/比分
左上：极简雷达
```

使用新的：

- 图标
- 字体
- 边框
- 色彩
- 动画

---

# 28. 菜单

主菜单：

```text
开始游戏
地图
模式
Bot 数量
Bot 难度
阵营
游戏设置
音频设置
图像设置
键位
开发者选项
```

不要复刻经典 CS 1.6 VGUI 菜单皮肤。

---

# 29. Reference Measurement：如何获得真正的“像 CS 1.6”

本地模型最容易失败的地方，是让它凭记忆写参数。

正确办法：

**自己建立黑盒参考测量数据库。**

## 29.1 Clean-room 原则

本地模型不得读取：

```text
CS 安装目录
DLL
BSP
WAD
MDL
PAK
反编译结果
逆向源码
```

只允许读取：

```text
你人工填写的 reference JSON / CSV / Markdown
官方公开规则说明
合法公开事实资料
```

## 29.2 测量项目

### Movement

```text
从静止到最大速度时间
最大跑速
持不同武器最大速度
走路速度
蹲走速度
跳跃最高点
落地时间
空中横移量
急停距离
```

### Weapon

每个参考武器：

```text
magazine
reserve ammo
price
fire interval
reload time
draw time
base damage
head damage
body damage
armor interaction
moving spread
standing spread
crouching spread
jump spread
recoil recovery
penetration
```

### Round

```text
freeze time
buy time
round time
bomb plant time
bomb timer
defuse time
defuse tool effect
round end delay
```

### Economy

```text
start money
money cap
kill reward
win reward
loss reward
objective reward
penalty
```

## 29.3 测量文件

```text
tests/reference/movement_reference.json
tests/reference/weapon_reference.json
tests/reference/round_reference.json
tests/reference/economy_reference.json
```

每条记录：

```json
{
  "metric": "reference_rifle_fire_interval_ms",
  "value": 0,
  "method": "manual observation",
  "sampleCount": 20,
  "confidence": "medium",
  "date": "2026-08-15",
  "notes": ""
}
```

---

# 30. Fidelity Test Harness

实现：

```bash
npm run bench:movement
npm run bench:weapons
npm run bench:round
npm run bench:bots
```

输出：

```text
Metric                      Ref       Current    Error
------------------------------------------------------
run_speed                   xxx       xxx        1.1%
jump_peak                   xxx       xxx        2.0%
rifle_fire_interval         xxx       xxx        0.4%
reload                      xxx       xxx        18 ms
...
```

## 30.1 不允许用“感觉差不多”结束模块

每个机制都要：

```text
measurement
implementation
comparison
tuning
lock
```

---

# 31. 测试体系

## 31.1 Unit Tests

重点：

- Economy
- Weapon state
- Damage
- Round outcome
- Objective
- Inventory
- RNG
- Bot decision utility

## 31.2 Integration Tests

例如：

```text
玩家购买武器 → 钱减少 → inventory 更新
炸弹安装 → timer → Defender 拆除 → 回合结束 → 发钱
最后一个敌人死亡 → 正确结束回合
炸弹已经安装后 Attacker 全灭 → 不应立即判 Defender 胜
```

## 31.3 E2E

Playwright：

- 打开主页
- 开始游戏
- 选择地图
- 创建 5 Bot
- 进入地图
- HUD 可见
- Pause/Resume
- 返回菜单

不要尝试用 E2E 自动判断“枪感”。

---

# 32. Debug 工具

必须从早期加入。

按键：

```text
F1 debug menu
F2 collision
F3 navmesh
F4 bot target
F5 hitbox
F6 weapon spread
F7 FPS
```

Debug overlay：

```text
FPS
frame ms
simulation tick
player pos
velocity
grounded
weapon
ammo
spread
recoil
ray hit
bot count
nav query time
```

没有 Debug 可视化时，本地模型会浪费大量时间猜 Bug。

---

# 33. 性能预算

单局：

```text
1 Player
15 Bots
```

每帧预算参考：

```text
render        < 5 ms
physics       < 2 ms
bot total     < 2 ms
game rules    < 1 ms
other         < 2 ms
```

## 33.1 Bot 降频

不要每个 Bot 每 120Hz 做高级决策。

例如：

```text
movement           60-120 Hz
perception ray     10-20 Hz
combat decision    10 Hz
tactical decision  2-8 Hz
path replanning    event-driven / <= 2 Hz
```

---

# 34. 开发阶段

下面才是“让比较笨的本地模型照着做”的核心。

---

## Phase 0：工程基线

### Task 0.1 创建 Vite + TypeScript

交付：

```text
空白 canvas
npm run dev
npm run build
npm run typecheck
npm test
```

验收：

- 无 TypeScript error
- build 成功
- 浏览器打开白页不报错

### Task 0.2 加 Three.js

显示：

```text
地面
立方体
相机
基础灯光
```

不要添加游戏逻辑。

### Task 0.3 加 Rapier

验收：

- 一个动态盒子落地
- 固定时间步工作
- debug 显示物理 tick

---

## Phase 1：第一人称基础

### Task 1.1 Pointer Lock

验收：

- 点击进入
- 鼠标控制相机
- Esc 释放鼠标
- 重新点击可恢复

### Task 1.2 CharacterMotor

只做：

```text
WASD
碰撞
重力
地面检测
```

不要做跳跃。

### Task 1.3 Jump/Crouch

加入：

```text
jump
crouch
camera height
```

### Task 1.4 Movement benchmark

创建训练走廊和测试脚本。

---

## Phase 2：武器最小闭环

### Task 2.1 一个测试步枪

只做：

```text
hitscan
ammo
fire cooldown
reload
```

无动画也可以。

### Task 2.2 Dummy target

目标有：

```text
head
chest
legs
HP
```

### Task 2.3 damage/armor

加入护甲。

### Task 2.4 recoil/spread

开发 debug 可视化。

---

## Phase 3：完整武器框架

### Task 3.1 WeaponRegistry

从 JSON 加载。

### Task 3.2 Inventory

```text
primary
secondary
knife
grenades
objective
```

### Task 3.3 Weapon switch

数字键和滚轮。

### Task 3.4 Weapon classes

逐个添加，不允许一次让模型生成 25 把枪。

建议顺序：

```text
starting pistols
primary rifles
heavy sniper
SMG
shotgun
remaining weapons
```

---

## Phase 4：回合系统

### Task 4.1 Team

### Task 4.2 Spawn

### Task 4.3 RoundManager

### Task 4.4 Death/Spectator

### Task 4.5 Freeze phase

---

## Phase 5：购买经济

### Task 5.1 Economy

先 unit test。

### Task 5.2 Buy zones

### Task 5.3 Buy menu

### Task 5.4 equipment

```text
armor
helmet
defuse tool
ammo
grenades
```

---

## Phase 6：爆破

### Task 6.1 Objective item

### Task 6.2 Plant

### Task 6.3 Bomb timer

### Task 6.4 Defuse

### Task 6.5 Round outcome integration

---

## Phase 7：第一张真正地图

只做：

```text
map_sandline graybox
```

不用精美资产。

验收：

- 两队出生
- A/B 两点
- 所有路径可走
- 没有卡点
- 所有地方都有 collision
- 可完成一整局

---

## Phase 8：Bot Navigation

### Task 8.1 NavMesh build

### Task 8.2 单 Bot 走到目标点

### Task 8.3 stuck recovery

### Task 8.4 15 Bot 压测

---

## Phase 9：Bot Perception + Combat

### Task 9.1 Vision

### Task 9.2 Hearing

### Task 9.3 Aim

### Task 9.4 Fire

### Task 9.5 Reload / weapon switch

---

## Phase 10：Bot Objectives

### Task 10.1 Bomb carrier

### Task 10.2 plant

### Task 10.3 defender rotate

### Task 10.4 defuse

### Task 10.5 team behavior

---

## Phase 11：手雷

顺序：

```text
frag
flash
smoke
```

---

## Phase 12：人质

先让玩家模式正确，再接 Bot。

---

## Phase 13：VIP

放在后期，因为使用频率低。

---

## Phase 14：剩余地图

顺序：

```text
cold_storage
foundry
harbor
consulate
motel
embassy_run
```

每张先 graybox → Bot 测试 → 美术。

---

## Phase 15：Audio/UI/Polish

只有核心玩法稳定后才做。

---

## Phase 16：性能优化

在有 profiler 数据之后。

禁止 LLM 提前“优化”。

---

# 35. 本地模型工作协议

这是整个项目能否成功的关键。

将下面内容保存为：

```text
docs/MODEL_RULES.md
```

---

## 35.1 模型总规则

```text
你是本项目的实现工程师，不是产品经理。

你必须：

1. 先阅读：
   - docs/PROJECT_SPEC.md
   - docs/ARCHITECTURE.md
   - docs/MODEL_RULES.md
   - docs/CURRENT_TASK.md
   - docs/PROJECT_STATE.md

2. 当前任务之外的功能禁止实现。

3. 先检查现有代码，再修改。
   不允许因为“不喜欢当前结构”而重写。

4. 一次最多修改 4 个源文件。
   如果需要更多文件，先停止并报告原因。

5. 不允许修改：
   - tests/reference/*
   - docs/REFERENCE_MEASUREMENTS.md
   除非 CURRENT_TASK 明确授权。

6. 不允许升级 npm dependency。

7. 不允许复制或导入任何 Counter-Strike / Valve 游戏资产、地图、音频、模型、贴图或代码。

8. 不允许使用从游戏二进制、BSP、DLL、WAD、MDL 等提取的数据。

9. 机制数据只能来自：
   - data/*
   - tests/reference/*
   - 当前任务明确给出的参数。

10. 所有可调值必须进入数据文件或明确常量。
    禁止散布 magic number。

11. 完成后必须运行 CURRENT_TASK 中要求的测试。

12. 如果测试失败，先修复，不得声称任务完成。

13. 不要顺便重构无关代码。

14. 输出必须包含：
    - 修改文件
    - 每个文件做了什么
    - 执行的命令
    - 测试结果
    - 已知问题

15. 如果信息不足，不要猜。
    返回 NEED_INFO，并指出缺少什么。
```

---

# 36. CURRENT_TASK 模板

每次只给本地模型一个这种任务。

```markdown
# CURRENT TASK

## ID
T-012

## Goal
实现 WeaponStateMachine 的 reload 状态。

## Allowed files
- src/weapons/WeaponStateMachine.ts
- src/weapons/Weapon.ts
- tests/unit/weapon_reload.test.ts

## Forbidden
- 不改 WeaponSpec schema
- 不改 UI
- 不改其他武器
- 不添加动画
- 不升级依赖

## Required behavior
1. READY 状态按 reload 时，如果弹匣未满且有 reserve ammo，进入 RELOADING。
2. reload 持续时间来自 WeaponSpec.reloadMs。
3. reload 结束时，一次性转移弹药。
4. reload 期间 fire 无效。
5. 切枪取消 reload。
6. reserve ammo 不得为负。

## Acceptance
- npm run typecheck
- npm test -- weapon_reload
- npm run build

## Definition of done
所有命令退出码为 0。
```

---

# 37. 对“笨模型”的拆任务规则

### 单任务建议规模

```text
30～200 行有效代码
```

尽量不超过：

```text
400 行
```

### 不要这样问

```text
帮我把完整 CS 1.6 网页版做出来。
```

### 要这样问

```text
实现 CharacterMotor 中的 ground friction。
只允许修改 CharacterMotor.ts 和对应 unit test。
具体公式在 CURRENT_TASK。
```

---

# 38. 每次模型调用推荐 Prompt

```text
严格执行 docs/MODEL_RULES.md。

只完成 docs/CURRENT_TASK.md。

开始编码前：
1. 阅读任务允许修改的文件。
2. 简要说明你认为当前代码的行为。
3. 给出最小修改计划，不超过 8 条。

然后实施。

禁止实现任何下一阶段功能。

结束时必须输出：
MODIFIED_FILES
TESTS_RUN
TEST_RESULTS
KNOWN_ISSUES
```

如果模型支持工具调用，再加：

```text
在修改前执行 git status。
修改完成后执行 git diff --check。
不得删除与当前任务无关的代码。
```

---

# 39. 项目状态文件

`docs/PROJECT_STATE.md`：

```markdown
# PROJECT STATE

## Current phase
Phase 2

## Last completed task
T-009 hitscan

## Passing
- typecheck
- unit tests
- build

## Known bugs
- crouch under low ceiling not handled

## Locked systems
- FixedStepLoop v1
- PointerLock v1

## Do not touch
- RNG
- input mapping

## Next task
T-010 weapon reload
```

每次任务完成后：

**人类确认通过后才更新。**

不要让模型自己宣布“锁定”。

---

# 40. Git 策略

建议每个任务一个 commit。

例如：

```text
T-001 bootstrap vite
T-002 add three renderer
T-003 add fixed loop
T-004 add rapier world
...
```

Commit message：

```text
feat(T-012): implement weapon reload state
```

如果某任务坏了：

```bash
git revert
```

比让本地模型连续“修修补补 20 轮”更可控。

---

# 41. Definition of Done

一个 Task 完成：

```text
[ ] 只改允许文件
[ ] typecheck 通过
[ ] unit test 通过
[ ] build 通过
[ ] 无 console error
[ ] git diff --check 通过
[ ] 无新 TODO
[ ] 无未授权 dependency
[ ] 没有 Valve asset
[ ] 行为符合 Acceptance
```

一个 Phase 完成：

```text
[ ] 所有 Task DoD
[ ] 人工试玩
[ ] Debug overlay 检查
[ ] benchmark
[ ] PROJECT_STATE 更新
[ ] git tag
```

例如：

```bash
git tag phase-03-weapons-v1
```

---

# 42. 法律合规的资产流水线

创建：

```text
assets_manifest.csv
```

字段：

```text
asset_id
file
category
creator
source
license
license_url
date
modified
notes
```

CI 规则：

任何：

```text
public/assets/**
```

新增文件，没有 manifest 行：

```text
CI fail
```

---

# 43. 自动法律风险扫描

写：

```text
tools/validate-assets.ts
```

检查：

### 文件名

阻止：

```text
de_dust
de_inferno
de_nuke
cs_office
counterstrike
valve
cstrike
```

这里只是内部警戒，不表示字符串本身必然违法。

### Hash

保存已知禁止资产 hash。

如果误把参考文件复制进仓库：

```text
fail
```

### License

没有 license metadata：

```text
fail
```

---

# 44. 商标策略

项目内部代号：

```text
Project Sandline
```

公开名另取原创名称。

避免公开宣传：

```text
“CS 1.6 网页版”
“Counter-Strike Web”
“CS 1.6 Remake”
```

更安全的描述：

```text
“a browser-based classic tactical round FPS”
```

如果为了评论、比较、兼容性说明而提到 Counter-Strike，属于不同法律分析；正式产品品牌不应让用户误认为 Valve 官方产品。

---

# 45. 专利风险策略

仅凭“这是老游戏”不能做专利安全结论。

正式发布前：

1. 确定国家/地区。
2. 列出可能涉及专利的技术点。
3. 使用 USPTO Patent Public Search 等官方数据库检索。
4. 不只查 “Counter-Strike”。
5. 查询更一般的 claim 关键词：
   - networked FPS
   - game spectator
   - aim assistance
   - matchmaking
   - dynamic navigation
   - user interface interaction
   - game replay
6. 查看：
   - assignee
   - priority date
   - filing date
   - family
   - legal status
   - expiration
   - continuation
7. 商业项目请律师做 claim chart / FTO。

本项目不实现网络联机、 matchmaking、反作弊和账号系统，天然减少了很多复杂专利/协议风险面。

---

# 46. Clean-room 开发组织方式

如果追求更强合规性，可以采用：

## Role A：Reference Analyst

只负责：

- 玩正版参考游戏
- 观察行为
- 记录数值
- 写 measurement

不能：

- 反编译
- 提取资源
- 复制源码

## Role B：Implementer

本地模型就是 Role B。

只看到：

```text
reference measurement
mechanical specification
original project source
```

不接触原游戏文件。

这比“把 CS 目录喂给大模型让它照着抄”风险低得多，也更容易证明独立实现。

---

# 47. 推荐 Reference 测量顺序

按重要性：

## P0

```text
movement
fire interval
reload
damage
round timer
economy
```

## P1

```text
spread
recoil
armor
weapon movement speed
grenade timing
```

## P2

```text
penetration
ladder
spectator details
minor UI timing
```

不要第一天就测 100 个小参数。

---

# 48. 第一版 MVP 边界

MVP 不需要 8 张地图。

只要：

```text
1 张 bomb map
1 Player
9 Bots
2 teams
6 类武器
knife
frag
armor
buy
economy
bomb plant
defuse
round loop
basic HUD
```

达到：

```text
连续玩 20 个回合无严重 bug
```

才允许扩展。

---

# 49. MVP 的 6 类武器

为了验证机制：

```text
1 starting pistol
1 heavy pistol
1 attacker rifle
1 defender rifle
1 heavy sniper
1 SMG
```

这 6 类足够暴露：

- 半自动
- 全自动
- 后坐力
- 移动精度
- zoom
- movement speed
- reload
- economy

---

# 50. 第二阶段内容

MVP 稳定后才增加：

```text
全部武器类别
全部 3 种 grenade
hostage
VIP
更多 map
更多 Bot tactics
audio polish
weapon animations
ragdoll/corpse
settings
save
```

---

# 51. 不建议实现的功能

当前目标是单机，因此不做：

```text
WebSocket server
LAN
Steam
VAC
accounts
matchmaking
rank
skins
market
anti-cheat
voice chat
text chat backend
demo network protocol
```

这些会把工程量增加数倍，而且与目标无关。

---

# 52. Browser 限制

## 52.1 Pointer Lock

需要用户手势。

不能页面加载后自动锁鼠标。

## 52.2 Audio

现代浏览器通常也要求用户交互后恢复 AudioContext。

Start Game 点击时：

```text
requestPointerLock
resume AudioContext
```

一起处理。

## 52.3 Tab 失焦

失焦：

```text
pause simulation
clear input state
```

防止 W 键“卡住”。

---

# 53. 资源释放

地图切换必须 dispose：

```text
geometry
material
texture
render target
audio node
physics collider
bot
navmesh
```

实现：

```ts
interface Disposable {
  dispose(): void;
}
```

长期跑几十局不能让显存一直增长。

---

# 54. Save/Settings

只存：

```text
mouse sensitivity
audio volume
graphics
key bindings
last map
bot difficulty
```

`localStorage` 足够。

不需要数据库。

---

# 55. Debug Console

自己实现一个轻量 console。

语法：

```text
command arg1 arg2
```

第一版命令：

```text
map_load
round_restart
ai_add
ai_remove
ai_fill
ai_kick_all
ai_difficulty
give_weapon
give_money
set_hp
set_armor
show_nav
show_hitbox
show_spread
noclip
god
```

其中作弊命令只在开发构建启用。

---

# 56. 关键 Bug 清单

提前告诉本地模型这些是高风险区：

### Movement

- 台阶抖动
- 斜坡弹飞
- crouch 解除后卡进天花板
- 高 FPS 与低 FPS 手感不同
- Pointer Lock 失焦后输入卡死

### Weapon

- reload 时切枪造成复制弹药
- 连射 fire rate 依赖 FPS
- 穿透造成一次射线多次打同一实体
- recoil 恢复错误

### Round

- Bomb planted 后队伍全灭错误结束
- RoundEnd 重复触发
- Bot 在 freeze phase 移动
- 购买时间跨回合

### Bot

- 看到墙后的敌人
- path 每帧重算
- 互相堵门
- 原地转圈
- 追最后看到点后不更新状态
- smoke 里仍完美锁头

---

# 57. Bot 行为最低验收

Normal Bot：

```text
[ ] 能从 spawn 到目标
[ ] 碰到敌人会射击
[ ] 会换弹
[ ] 会买武器
[ ] 会执行爆破
[ ] 会拆弹
[ ] 不知道墙后敌人的实时位置
[ ] 会对声音作有限响应
[ ] 10 分钟内不会频繁卡死
```

Hard Bot 再做：

```text
cover
burst
retreat
rotate
grenade
team grouping
```

---

# 58. 地图自动验证

`tools/validate-map.ts`：

检查：

```text
spawn count
spawn overlap
navmesh coverage
bomb sites
buy zones
rescue zones
unreachable areas
out-of-bounds
missing collision
```

对于 bomb map：

```text
每个 Attacker spawn → A 可达
每个 Attacker spawn → B 可达
每个 Defender spawn → A 可达
每个 Defender spawn → B 可达
```

否则 build fail。

---

# 59. Bot 路线测试

自动生成：

```text
1000 random path requests
```

统计：

```text
success %
average ms
95p ms
failure position
```

标准：

```text
static map path success > 99%
```

---

# 60. 美术制作顺序

不要一开始做武器模型。

顺序：

```text
graybox
 ↓
gameplay lock
 ↓
collision/nav lock
 ↓
environment modular kit
 ↓
textures
 ↓
props
 ↓
lighting
 ↓
weapon model
 ↓
character
 ↓
animations
```

如果顺序反过来，会大量返工。

---

# 61. 动画系统

第一版只需要：

```text
idle
fire
reload
draw
knife
grenade throw
walk/run
crouch
death
```

第一人称 weapon viewmodel 与第三人称 world model 分开。

---

# 62. 第一人称武器模型

相机：

```text
World Camera
Viewmodel Camera / separate layer
```

这样方便：

- FOV
- clipping
- weapon scale
- muzzle flash

不要让 viewmodel 撞进墙后疯狂裁剪。

---

# 63. 音效事件

```text
WEAPON_FIRE
WEAPON_RELOAD
FOOTSTEP
LAND
GRENADE_BOUNCE
EXPLOSION
BOMB_PLANT
BOMB_BEEP
BOMB_DEFUSE
ROUND_WIN
```

Bot hearing 监听的是：

```text
GameSoundEvent
```

不是 Web Audio 实际声波。

---

# 64. Footstep

每个 surface：

```text
concrete
metal
wood
gravel
glass
water
```

metadata：

```json
{
  "surface": "metal",
  "footstepSet": "metal_01",
  "penetration": 0.5
}
```

同一材质同时服务：

```text
audio
bullet impact
penetration
particle
```

---

# 65. 观战

死亡后：

第一版：

```text
free spectator
```

第二版：

```text
follow teammate first-person
follow teammate third-person
```

由于是单机，不需要复制原作复杂 spectator restriction。

---

# 66. Radar

Radar 不用从 3D 场景实时渲染。

地图制作时额外输出一张：

```text
original top-down schematic
```

只显示：

- 自己
- 队友
- objective
- 必要标记

这张图必须由原创地图生成。

---

# 67. 版本控制里禁止放 Reference 游戏文件

`.gitignore` 增加：

```text
reference_game/
*.bsp
*.wad
*.mdl
```

但注意：

你自己的 glTF/GLB 不应被这一规则误伤。

建议 reference 资料只保留：

```text
JSON
CSV
自己写的 Markdown
```

---

# 68. CI

每个 commit：

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:assets
npm run validate:maps
```

后期再加：

```bash
npm run test:e2e
```

---

# 69. Local Model 的失败恢复

如果模型连续两次修改后仍失败：

不要继续说：

```text
再修一下
```

而是：

1. `git diff`
2. 保存错误输出
3. `git reset --hard <last_good_commit>`
4. 把失败拆成更小 Task
5. 重新给模型

这是弱模型开发复杂工程时最有效的控制方法之一。

---

# 70. 不允许模型做的事情

```text
“我顺便重构了……”
“为了方便我换成另一套物理引擎……”
“我把目录结构重新设计了……”
“我升级了 Three.js……”
“我直接使用了网上找到的 CS 模型……”
“我把整个模块一次性写完了……”
```

出现任意一条：

**拒绝合并。**

---

# 71. 关键文档锁

模型每次都必须读：

```text
PROJECT_SPEC
ARCHITECTURE
MODEL_RULES
CURRENT_TASK
PROJECT_STATE
```

不要一次塞整个仓库给模型。

让它只读取：

```text
当前模块
相关 interface
相关 test
```

上下文越小，弱模型越稳定。

---

# 72. 推荐模型上下文策略

每个任务输入：

```text
1. 当前任务
2. 规则
3. 相关接口
4. 相关测试
5. 相关实现文件
```

不要输入：

```text
整个 node_modules
所有地图 JSON
所有历史日志
```

---

# 73. “先测试后实现”策略

规则模块：

```text
Economy
Damage
Round
Weapon state
Objective
```

优先：

```text
先写 failing test
再实现
```

渲染类：

```text
Camera
Particles
UI
```

可以先人工验收。

---

# 74. 里程碑

## M0 技术样机

```text
可走动
可开枪
可击杀 dummy
```

## M1 可玩 FPS

```text
1 map
Player vs static targets
6 weapons
```

## M2 回合游戏

```text
team
economy
buy
death
round
bomb
```

## M3 单机游戏

```text
9 Bots
完整打 20 回合
```

## M4 内容 Alpha

```text
8 maps
全部主要 weapon categories
grenades
hostage
VIP
```

## M5 Polish

```text
原创模型
原创音效
HUD
menu
settings
optimization
```

## M6 Release Candidate

```text
legal asset audit
performance
bug fixing
packaging
```

---

# 75. 工期估算

假设：

- 1 个人
- LLM 协助
- 已会 TypeScript/JS 基本开发
- 美术不追求 AAA
- 每周 15～25 小时

粗略：

| 阶段 | 人工周 |
|---|---:|
| 技术样机 | 1～2 |
| Movement + gunplay | 2～4 |
| weapons + combat | 2～4 |
| round + economy + bomb | 2～3 |
| Bot MVP | 4～8 |
| first map | 2～3 |
| 其余地图 graybox | 4～8 |
| hostage/VIP/grenade | 2～4 |
| art/audio/UI | 4～10 |
| tuning/testing | 4～8 |
| 合计 | 27～54 周 |

如果完全依赖一个能力一般的 27B 左右本地模型，且没有成熟游戏开发经验：

**不要按“几周做完”估算。**

Bot、移动手感、地图调优会占用绝大多数时间。

---

# 76. MVP 可行性判断

## 高可行

- 浏览器 3D FPS
- 单人
- 15 Bot
- round
- buy
- bomb
- hitscan
- classic movement feel
- low-poly map

## 中等难度

- 高度接近经典 1.x 的移动
- 后坐力/扩散
- 穿透
- grenade
- Bot tactical behavior

## 高难度

- Bot 看起来“像真人”
- 8 张地图都具备成熟战术性
- 精确匹配所有 CS 1.6 bug/quirk
- 同时 1:1 地图且完全避开版权风险

最后这一项本身存在目标冲突，因此本文明确不采用。

---

# 77. 建议的最终产品定义

正式 README 可以写：

> Project Sandline is a desktop-browser tactical first-person shooter focused on short round-based matches, economy-driven equipment decisions, low time-to-kill gunplay, objective-based maps, and offline AI opponents. The project uses original maps, art, audio and code.

不要把 Valve 作为开发依赖或兼容目标。

---

# 78. 第一批实际执行任务

把以下顺序交给本地模型：

```text
T-001 bootstrap Vite TS
T-002 add Three scene
T-003 fixed step loop
T-004 Rapier world
T-005 pointer lock
T-006 CharacterMotor ground movement
T-007 jump
T-008 crouch
T-009 debug overlay
T-010 test range map
T-011 hitscan
T-012 hitboxes
T-013 health
T-014 weapon state
T-015 reload
T-016 recoil
T-017 spread
T-018 armor
T-019 team
T-020 round manager
T-021 spectator
T-022 economy
T-023 buy
T-024 bomb state
T-025 bomb plant
T-026 bomb defuse
T-027 map metadata
T-028 navmesh build
T-029 bot movement
T-030 bot perception
T-031 bot aim
T-032 bot combat
T-033 bot purchase
T-034 bot bomb behavior
T-035 bot manager
T-036 main menu
T-037 match settings
T-038 sound
T-039 frag grenade
T-040 flash
T-041 smoke
```

完成 T-041 之前：

**不要开始第 2 张正式地图。**

---

# 79. T-001 Prompt

```text
严格执行 docs/MODEL_RULES.md。

目标：
创建一个最小 Vite + TypeScript 项目。

要求：
- 不使用 React/Vue。
- vanilla TypeScript。
- 页面只包含一个全屏 canvas 容器。
- 添加 scripts：
  dev
  build
  typecheck
  test
- 配置 Vitest。
- 创建一个最小 smoke test。

不允许：
- three.js
- physics
- game logic
- CSS framework

验收：
npm run typecheck
npm test
npm run build

完成后只输出：
MODIFIED_FILES
TESTS_RUN
TEST_RESULTS
KNOWN_ISSUES
```

---

# 80. T-002 Prompt

```text
目标：
在现有 Vite 项目加入 three.js。

只实现：
- Scene
- PerspectiveCamera
- WebGLRenderer
- resize
- one box
- one floor
- ambient + directional light
- requestAnimationFrame render

不实现：
- movement
- physics
- input
- weapons

把渲染封装进 src/app/GameApp.ts。

验收：
typecheck
test
build
浏览器无 console error
```

---

# 81. T-003 Prompt

```text
目标：
实现 FixedStepLoop。

要求：
- simulation fixed timestep 可配置。
- render callback 独立。
- accumulator。
- max catchup steps。
- 超出部分丢弃并记录 debug warning。
- unit test 验证 1 秒累计产生预期 tick 数。

不要接 physics。
```

---

# 82. T-006 Prompt：CharacterMotor

```text
目标：
在 Rapier 上实现最基础地面角色移动。

仅支持：
- forward
- backward
- strafe
- collision
- gravity
- grounded

暂时不支持：
- jump
- crouch
- ladder
- step

要求：
- velocity 不能直接绑定 FPS。
- 参数从 movement.json 读取。
- debug overlay 显示 pos/velocity/grounded。

验收：
- 60Hz/120Hz 显示刷新下，10 秒直线移动距离误差 < 1%。
```

---

# 83. T-011 Prompt：Hitscan

```text
目标：
实现单发 hitscan。

输入：
camera origin
camera forward
spread = 0

输出：
HitResult:
- hit
- entity
- point
- normal
- distance
- hitRegion

要求：
- raycast 只由 simulation 调用。
- renderer 只读取 event。
- unit test 使用固定测试 collider。
```

---

# 84. T-020 Prompt：RoundManager

```text
实现：
ROUND_FREEZE
ROUND_LIVE
ROUND_END

只做 team elimination 和 timeout。

不做：
bomb
hostage
economy

所有状态转换必须有 test。
RoundManager 是唯一可以结束 round 的模块。
```

---

# 85. T-024 Prompt：BombObjective

```text
实现炸弹状态机本身。

状态：
CARRIED
DROPPED
PLANTING
PLANTED
DEFUSING
DEFUSED
DETONATED

本任务：
不修改 RoundManager。

BombObjective 只产生 ObjectiveEvent。

RoundManager 集成放下一个 task。
```

---

# 86. T-029 Prompt：Bot Movement

```text
目标：
让一个 Bot 在 map_training_yard 的 navmesh 上从 A 走到 B。

禁止：
enemy
weapon
combat
objective

必须支持：
- compute path
- follow path
- reach radius
- stuck timer
- debug draw

验收：
重复 100 次随机点，成功率 > 99%。
```

---

# 87. T-030 Prompt：Bot Perception

```text
目标：
只实现视觉感知。

Bot 可以知道：
- 自己位置
- teammate
- visible enemy

Bot 不可以直接获得：
- 非可见敌人的实时 position

视觉规则：
- max range
- FOV
- LOS raycast
- updateHz

加入 debug：
green = visible
red = blocked
```

---

# 88. T-031 Prompt：Bot Aim

```text
BotAim 输入：
- perceived target
- difficulty
- current view angles
- dt

输出：
desired yaw/pitch

要求：
- reaction delay
- max angular speed
- aim noise
- tracking lag

禁止：
瞬间 snap 到头部。
```

---

# 89. T-034 Prompt：Bot Bomb

```text
目标：
让 Bot 在已有 combat/nav 系统基础上完成一个 bomb round。

Attacker：
- 找 bomb
- carrier 去 site
- plant
- defend

Defender：
- 前期守点
- bomb planted 后 rotate
- 找到 bomb
- clear threat
- defuse

不要实现高级战术。
```

---

# 90. 每次人工验收问题

你每次看本地模型输出，只问 6 个问题：

```text
1. 它有没有修改任务外文件？
2. 它有没有引入新依赖？
3. 它有没有猜参数？
4. 它有没有绕过测试？
5. 它有没有把 presentation 和 simulation 混在一起？
6. 它有没有顺便重构？
```

任意“是”：

不要 merge。

---

# 91. 玩法手感的最终调优顺序

不要同时调所有参数。

顺序：

```text
1 ground speed
2 acceleration
3 friction
4 stop behavior
5 jump
6 air movement
7 crouch
8 weapon movement speed
9 single-shot accuracy
10 recoil
11 spread growth
12 recovery
13 armor/damage
14 grenade
```

每次只改一组。

---

# 92. Map 调优指标

每张 map 记录：

```text
spawn-to-first-contact
spawn-to-objective
rotation time
site entry count
long sightline count
cover density
Bot path success
average round duration
attacker win rate
defender win rate
```

Bot 做 1000 个模拟回合。

不要追求 50/50 到小数点。

主要发现：

- 必输点
- 不可达区域
- 极端优势出生
- 无意义路线

---

# 93. Bot 自动对战统计

实现 headless-ish simulation mode：

```bash
npm run sim -- --map map_sandline --rounds 1000 --seed 123
```

输出：

```text
Attacker win
Defender win
Timeout
Bomb planted
Bomb detonated
Defused
Average round length
Bot stuck count
Path failure
```

渲染可以关闭或降频。

---

# 94. Regression 数据

每个 release 保留：

```text
benchmark-v0.1.json
benchmark-v0.2.json
```

如果一次“优化”导致：

```text
movement error 1% → 8%
```

立即回滚。

---

# 95. 法律风险等级

## 低

- 自己写 FPS movement
- round system
- generic bomb mode
- generic hostage mode
- economy
- generic weapon classes
- original maps

## 中

- 非常接近特定 CS 武器全部行为参数
- UI 功能排列高度相似
- marketing 大量提及 CS
- 人物职业/服装与原角色过度相似

## 高

- 原地图逐尺寸复刻
- 原模型
- 原贴图
- 原音频
- 原 Logo
- 原代码
- 直接导入 BSP/WAD/MDL
- 从截图描图重建
- 宣传为“CS 1.6 Web Remake”

---

# 96. 如果你坚持“私人电脑上视觉也 1:1”

本文仍不推荐把这种要求交给本地模型实施。

最稳妥路径不是寻找“复制但合法”的技术技巧，而是：

1. 先完成本文 clean-room 版本。
2. 如果之后确实希望使用原资产或做授权衍生项目，先确认 Valve 授权条款和适用法。
3. 如果准备公开传播，先做专业法律审查。

“仅自己玩”会降低实际执法暴露程度，但**不自动把复制行为变成合法**。

---

# 97. 资料来源与检索范围

本文优先使用：

1. 美国版权局
2. USPTO
3. Valve / Steam
4. Valve Developer Community
5. three.js 官方
6. Rapier 官方
7. recast-navigation-js 项目
8. W3C / MDN
9. 公开法院判决/法律数据库
10. 少量社区资料用于历史玩法事实交叉确认

没有声称“已经穷尽互联网上所有资料”。

公开资料会持续变化，依赖版本、Valve 条款和浏览器兼容性在真正开始项目时应再次检查。

---

# 98. 关键参考资料

## Intellectual Property

### U.S. Copyright Office — Circular 33: Works Not Protected by Copyright

https://www.copyright.gov/circs/circ33.pdf

重点：

- ideas
- procedures
- processes
- systems
- methods of operation

不因其描述方式本身而获得对底层方法的版权垄断。

### U.S. Copyright Office — What Does Copyright Protect?

https://www.copyright.gov/help/faq/faq-protect.html

### USPTO — Trademark Basics

https://www.uspto.gov/trademarks/basics

### USPTO — What is a trademark?

https://www.uspto.gov/trademarks/basics/what-trademark

### USPTO — Patent Term

https://www.uspto.gov/web/offices/pac/mpep/s2701.html

### USPTO — Patent Public Search

https://www.uspto.gov/patents/search/patent-public-search

### Tetris Holding, LLC v. Xio Interactive, Inc.

https://law.justia.com/cases/federal/district-courts/new-jersey/njdce/3%3A2009cv06115/235418/61/

该案常被用于说明：

- 游戏规则/功能与可保护表达需要区分
- 极度接近的整体视觉与具体表达可能产生侵权风险

---

## Valve / Counter-Strike

### Steam — Counter-Strike

https://store.steampowered.com/app/10/CounterStrike/

### Steam — Counter-Strike: Condition Zero

https://store.steampowered.com/app/80/CounterStrike_Condition_Zero/

### Steam Subscriber Agreement

https://store.steampowered.com/subscriber_agreement/

特别关注：

```text
Section 2.A General Content and Services License
Section 2.F Ownership
Section 2.G Restrictions on Use
```

### Valve Developer Community — Counter-Strike

https://developer.valvesoftware.com/wiki/Counter-Strike

### Valve Developer Community — Counter-Strike: Condition Zero

https://developer.valvesoftware.com/wiki/Counter-Strike%3A_Condition_Zero

### Valve Developer Community — Counter-Strike FGD

https://developer.valvesoftware.com/wiki/Counter-Strike.fgd

### Valve Developer Community — Counter-Strike Versions

https://developer.valvesoftware.com/wiki/Counter-Strike/Versions

---

## Web Game Technology

### three.js

https://threejs.org/

### three.js npm

https://www.npmjs.com/package/three

### Vite

https://vite.dev/guide/

### Vite 8.1 announcement

https://vite.dev/blog/announcing-vite8-1

### Rapier

https://rapier.rs/docs/

### Rapier JS getting started

https://rapier.rs/docs/user_guides/javascript/getting_started_js

### recast-navigation-js

https://github.com/isaac-mason/recast-navigation-js

### Recast Navigation

https://github.com/recastnavigation/recastnavigation

### MDN Pointer Lock API

https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API

### W3C Pointer Lock 2.0

https://www.w3.org/TR/pointerlock-2/

### MDN Web Workers

https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers

---

# 99. 最终执行建议

如果你明天就开始项目，顺序不要改变：

```text
Day 1:
repo + Vite + TypeScript + Three

Day 2:
fixed loop + Rapier

Day 3:
pointer lock + movement

Day 4:
movement debug + test range

Day 5:
hitscan

Day 6:
health + hitbox

Day 7:
weapon state + reload

Day 8:
recoil/spread

Day 9:
team + round

Day 10:
economy + buy
```

到这里仍然：

```text
0 Bot
0 正式美术
0 第二张地图
```

这是正确状态。

继续：

```text
bomb objective
 ↓
一张完整 graybox
 ↓
navmesh
 ↓
1 Bot
 ↓
combat Bot
 ↓
9 Bot
 ↓
完整 20 round
```

只有这一条链跑通以后，才扩内容。

---

# 100. 一句话项目原则

> **复现“为什么 CS 1.x 好玩”，不要复制“CS 1.6 长什么样”。**

这样既更容易做成，也更接近一个可以长期维护、公开展示、继续扩展的独立项目。

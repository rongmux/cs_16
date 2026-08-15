# Project Sandline — 开发进度与续接指南（Handoff）

> 生成时间：本轮开发结束
> GitHub：https://github.com/rongmux/cs_16 （Public，main 分支）
> 设计书：`project_sandline_cleanroom_web_fps_design.md`（工作区根目录，4437 行）

---

## 1. 当前总体状态

| 项目 | 状态 |
|---|---|
| `npm run typecheck` | ✅ 通过（tsc --noEmit，0 错误） |
| `npm run build` | ✅ 通过（vite 8.2.1 + rolldown，产物 ~643KB JS / 167KB gzip） |
| `npm test` | ❌ 尚未编写测试（测试文件只写了 3 个单元测试，见 §4） |
| dev server 实测 | ❌ 尚未在浏览器中实际运行验证 |
| 机器人（Bot） | 已实现全部模块，未跑通实测 |
| 美术/音频资产 | 全部程序化生成（灰盒 + Web Audio 合成音效），无外部资产 |

**一句话：整个 MVP 的代码骨架已经写完并通过编译，接下来是"测试→联调→修 bug→对照设计书核查"阶段。**

---

## 2. 已完成内容（按设计书阶段映射）

### Phase 0 工程基线 ✅
- Vite 8.2.1 + TypeScript 5.9.3 + Vitest 4.1.10 + three.js 0.185.1 + tsx 4.23.12（版本已锁入 package-lock.json）
- `npm run dev / build / typecheck / test / preview / validate:assets / validate:maps / sim / bench:*` 脚本齐全
- `.gitignore` 含设计书 §67 要求的 `reference_game/`、`*.bsp`、`*.wad`、`*.mdl`、`*.pak`

### 核心基础设施 ✅
- `src/core/`：`math.ts`（Vec3）、`RNG.ts`（mulberry32，支持固定 seed）、`EventBus.ts`（带类型的事件总线，仅离散事件）、`FixedStepLoop.ts`（120Hz 固定步长 + accumulator + maxCatchup=8，设计书 §4.2）

### 世界/地图 ✅
- `src/world/CollisionWorld.ts`：AABB 静态盒碰撞（raycast 平板法、逐轴 moveAABB、地面探测）
- `src/world/MapBuilder.ts`：**房间矩形自动生成墙体**（1m 网格，边界自动成墙，杜绝手工排墙的拓扑漏洞）
- `data/maps/map_sandline.json`：原创爆破图（A/B 两点、中路、Long、连接通道、回防路线，拓扑已手工推演验证无泄漏）
- `data/maps/map_training_yard.json`：训练场（10 个静态靶、隔墙、测试用）
- 材质表 `data/game/materials.json`（脚步音量 + 穿透阻力，供 §64 复用）

### 玩家移动 ✅（设计书 §9）
- `CharacterMotor.ts`：地面摩擦/加速（Quake 式）、空中控制带 maxAirSpeed 上限、跳跃、蹲下（含站起碰撞检测）、台阶步升、武器限速接入点
- 参数全部在 `data/game/movement.json`，**均为占位值，待人工黑盒标定**（设计书 §9.2 明确允许）

### 武器 ✅（设计书 §11）
- `WeaponRegistry.ts`（JSON 数据驱动 + 默认值合并）、`WeaponInstance.ts`（状态机 HOLSTERED/DRAWING/READY/FIRING/COOLDOWN/RELOADING，半自动需松扳机、burst、auto、换弹一次性转移弹药、切枪取消换弹）
- 后坐力 = 视角 punch（垂直上扬+随机水平）+ spread 增长/衰减；精度 = 基础+移动惩罚+空中+蹲伏倍率+开火积累，狙击开镜精度独立（§11.5/11.6）
- `data/weapons/weapons.json`：11 种原创命名的武器（Kite-45、Sparrow-9、Grizzly .50、Vulture 7.62、Falcon 5.56、Thunderclap .338、Hornet 9、Judge 12、Anvil M-6、Knife、Frag Grenade、Detonator）
- **伤害/射速等数值为占位参考 v1，待人工参照测量标定（设计书 §29）**

### 战斗 ✅（设计书 §12/13）
- `Hitbox.ts`：5 部位判定（head≥0.86 / chest / stomach / arm / leg，按垂直比例+水平偏移）
- `Damage.ts` + `PlayerEntity.receiveDamage`：基础伤害×距离衰减×部位倍率→护甲分摊（甲 50% 吸收、头盔爆头减免、穿甲系数）→整数 HP
- 穿透：**V1 按设计书 §13 不做穿透**（字段已预留）

### 规则 ✅（设计书 §7/8/15）
- `RoundManager.ts`：唯一权威。FREEZE→LIVE→END 循环、半场换边、先到 N+1 分结束、**已安装炸弹时全灭不判负**（§16.3）、round_end 防重入守卫、超时判防守方胜、连败经济递增
- `Economy.ts` / `BuySystem.ts`：数据驱动（`data/economy/economy.json`），购买限制齐全（买区/买时/阵营/金钱/槽位/弹药/护甲头盔/拆弹器/雷数，§15.2）
- 阵营名 Raiders（攻）/ Response Unit（守），原创命名

### 爆破目标 ✅（设计书 §16/§85）
- `BombObjective.ts`：CARRIED→DROPPED→PLANTING→PLANTED→DEFUSING→DEFUSED/DETONATED 全状态机，只发事件、不自己结束回合

### Bot ✅（设计书 §19-21，模块全，未实测）
- `bots/`：`Bot`（黑板聚合）、`BotPerception`（110° 视锥+射线遮挡+听力事件+队友无线电共享，**禁止直接读敌位置** §19.2）、`BotAim`（反应延迟+转向角速度+噪声+追踪滞后，禁止瞬移锁头 §88）、`BotMovement`（A* 路径+LOS 平滑+卡死检测+队友避让）、`BotCombat`（目标选择/点射控制/换弹切枪/横移蹲伏/扔雷）、`BotObjective`（攻方选点带包下包守包、守方分点防守→转点拆弹）
- `nav/WaypointGraph.ts`：**MVP 用航点图替代 NavMesh**（2m 网格自动布点+LOS 连边+A*），recast-navigation-js 留作后续升级任务（决策记录见 §7）
- 难度 4 档（easy/normal/hard/expert）全参数数据驱动（`data/bots/difficulty.json`），无"外挂"差异（§19.6）
- `BotManager`：填充/增删/难度切换/控制台 ai_* 命令（§20）

### 浏览器壳 ✅（未实测）
- `GameApp.ts`：three.js 渲染（灰盒地图按颜色合并网格）、第一人称视模（盒子枪+枪口火光+后坐动画）、实体网格、炸弹/手雷网格、曳光弹、观战自由飞行、暂停/菜单/购买流、调试可视化（F1-F7）
- `input/`：Pointer Lock + 键盘 + 鼠标（灵敏度/反转/滚轮切枪/切枪数字键），失焦清空输入（§52.3）
- `ui/`：HUD（血/甲/钱/弹/计时/比分/击杀流/雷达/准星扩散/命中红闪/狙击镜遮罩/炸弹倒计时）、主菜单（图/阵营/Bot 数/难度/灵敏度/音量）、购买菜单、暂停菜单、赛末面板、控制台
- `audio/AudioSystem.ts`：全合成音效（枪声/脚步/爆炸/滴滴/胜负音），带空间 pan/衰减

---

## 3. 关键设计决策（后续不得随意推翻，若要改先读这里）

1. **物理**：用自研 AABB 运动控制器代替设计书推荐的 Rapier。理由：地图为纯盒灰盒、确定性可测、免 WASM 异步初始化；Rapier 留作独立升级任务。若升级必须单独立项。
2. **导航**：航点图（自动布点+LOS 连边）代替 recast NavMesh，理由同上；`MapBuilder` 生成点集是数据驱动的一部分。
3. **渲染插值**：V1 直接渲染最新模拟状态（不做 N/N+1 状态插值），仅相机平滑。设计书 §4.2 的完整插值列为后续任务。
4. **数值**：所有手感/伤害/经济数值为"参考规则 v1"占位，**未经人工测量标定**；标定流程见设计书 §29-30，标定后要算 sha256 锁入 `docs/REFERENCE_MEASUREMENTS.md`。
5. **手雷**：V1 只有 frag（设计书 MVP 边界 §48-49），flash/smoke 为第二阶段。
6. **模式**：V1 爆破 + 训练场；人质/VIP 按设计书 Phase 12/13 排后。
7. **穿透**：V1 无（§13），字段已预留。
8. **E2E（Playwright）**：设计书 §68 注明"后期再加"，暂未引入依赖。

---

## 4. 下一步任务清单（按优先级）

1. **补测试**（`npm test` 目前只有 3 个单元测试文件）：
   - tests/unit/：character（跳跃高度≈v²/2g、10 秒直线距离误差<1%、蹲伏高度）、weapon（弹药消耗/射速/换弹/半自动松扳机/burst/换弹取消）、damage（头部×4、护甲分摊、头盔、距离衰减）、economy（胜负奖励/连败封顶/金钱上限/惩罚）、round（淘汰/超时/埋弹后全灭不判负/换边/赛末）、bomb（状态机全路径、拆弹器加速）、waypoint（地图连通性：每出生点→A/B 可达，§58）、botaim（收敛+反应延迟）
   - tests/integration/match.test.ts：买枪扣钱→库存更新；埋弹→倒计时→拆除→回合结束→发钱；全灭结束回合；埋弹后攻方全灭不结束；20 回合 bot 冒烟测试
2. **tools/**：`validate-assets.ts`（manifest+禁用名+license）、`validate-map.ts`（出生点/买区/点位/连通性自动验证，§58）、`sim.ts`（无渲染 1000 回合对战统计，§93）、`bench-movement.ts`/`bench-weapons.ts`（§30）
3. **docs/**：PROJECT_SPEC / ARCHITECTURE / MODEL_RULES / CURRENT_TASK / PROJECT_STATE / DECISIONS / LEGAL_ASSET_RULES / ASSET_LICENSES / REFERENCE_MEASUREMENTS / DEPENDENCY_LOCK + `assets_manifest.csv`（§42，目前无外部资产，空表即可）
4. **dev server 实测**：启动 `npm run dev`，浏览器跑通：菜单→开赛→买枪→射击→Bot 对战→下包→拆包→回合循环→20 回合。重点验证 §56 高危 bug 清单（移动/武器/回合/Bot 四类）
5. **对照设计书逐章核查**（目标已更新为"每个阶段完成后与设计书核查"）：重点 §2 成功标准、§48 MVP 边界（1 图/1 人/9 Bot/2 队/6 类武器/刀/雷/甲/买/经济/下包/拆包/回合循环/基础 HUD/连续 20 回合无严重 bug）
6. 修 bug → 补测试 → 里程碑 M0→M3（§74）

---

## 5. 环境/工具链注意事项（重要！换会话/换机器前必读）

1. **npm 缓存必须重定向**：沙箱禁止写用户目录，安装命令必须带
   `npm install --cache "D:\VScode\cs_16\project-sandline\.npm-cache"`
2. **vite/vitest 需要提权**：Vite 8 加载配置时会 `child_process.exec` 解析 Windows 真实路径（piped stdio 被沙箱拦 → `spawn EPERM`）。跑 `npm run build` / `npm run dev` / `npm test` 被拒时，用 `sandbox_permissions: danger-full-access` 重试一次（需要用户批准）。
3. **git push 流程**（已配好，照抄即可）：
   - 远程 origin 已含 token（在 `.git/config` 里，不会被提交）
   - `git push origin main 2> gitpush.log; $c=$LASTEXITCODE; Get-Content gitpush.log -Tail 2; "PUSH_EXIT=$c"`
   - `gitpush.log` 里会有 msys sh 的崩溃噪音（沙箱拦 signal pipe），**只要 `PUSH_EXIT=0` 且日志末行是 `xxxx..xxxx main -> main` 即成功**
   - commit 前缀约定：feat / test / chore / fix
4. **PowerShell 编码坑**：`Get-Content -Raw`（不带 -Encoding）在中文系统按 GBK 读 UTF-8 文件会毁掉非 ASCII 字符（曾把 `·`→`路`）。改文件请用 edit 工具，必须用 pwsh 批量替换时用 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` + UTF8 无 BOM 写回。
5. **CRLF 警告**：git 的 LF→CRLF 警告无害，忽略。
6. **esbuild postinstall 被 npm 拦截**：实测不影响（二进制走 optional dependency），勿升级依赖（设计书 §35.1 规则 6）。
7. **node 26 / npm 12 / gh 2.96（已登录 rongmux）**。仓库为 Public（用户选择）。

---

## 6. 目录结构（现有）

```text
D:\VScode\cs_16\
├── .git / .gitignore / .git-credentials（本地，勿提交）
├── project_sandline_cleanroom_web_fps_design.md   ← 设计书（源头）
├── gitpush.log（临时，已 ignore）
└── project-sandline\
    ├── package.json / tsconfig.json / vite.config.ts / vitest.config.ts / index.html
    ├── data\ { weapons, economy, game(movement/round/materials), bots, maps(×2) }
    ├── src\
    │   ├── core\ { math, RNG, EventBus, FixedStepLoop }
    │   ├── world\ { CollisionWorld, MapBuilder, MapData, DataFiles }
    │   ├── nav\ WaypointGraph.ts
    │   ├── player\ { CharacterMotor, PlayerEntity }
    │   ├── weapons\ { WeaponRegistry, WeaponInstance }
    │   ├── combat\ { Hitbox, Damage }
    │   ├── rules\ { Team, MatchConfig, Economy, BuySystem, RoundManager }
    │   ├── objectives\ BombObjective.ts
    │   ├── sim\ { Match, GrenadeSim }
    │   ├── bots\ { types, Bot, BotManager, BotPerception, BotAim, BotMovement, BotCombat, BotObjective }
    │   ├── input\ { InputManager, MouseLook, KeyBindings }
    │   ├── audio\ AudioSystem.ts
    │   ├── ui\ { Hud, Radar, BuyMenu, Menus, DebugConsole, Settings }
    │   ├── debug\ DebugOverlay.ts
    │   ├── app\ { GameApp, bootstrap } + main.ts + style.css
    └── tests\unit\ { rng, fixedstep, collision }（其余待写）
```

## 7. 续接起点（按顺序执行）

```powershell
cd D:\VScode\cs_16\project-sandline
npx tsc --noEmit            # 应 0 错误
npm run build               # 若 spawn EPERM → 提权重试（§5.2）
npm test                    # 目前 3 个测试通过，随后按 §4.1 补测试
npm run dev                 # 浏览器 http://127.0.0.1:5173 实测（§4.4）
```

完成每小步后按 §5.3 的 git 流程提交+推送（feat/test/chore/fix 前缀）。

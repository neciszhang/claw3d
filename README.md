# Claw Machine 3D

基于 React + Three.js + Rapier 物理引擎构建的 3D 娃娃机网页游戏。通过虚拟摇杆或键盘操控天车爪子，在限定币数内尽可能多地抓取玩具投入出口，还原真实娃娃机的手感与紧张感。

## 在线预览

> 在线预览链接：[即将上线](#)（部署后请替换此链接，例如 GitHub Pages / Vercel）

## 截图预览

| 游戏主界面 | 抓取瞬间 |
|:---:|:---:|
| ![游戏主界面](docs/screenshot-main.png) | ![抓取瞬间](docs/screenshot-grab.png) |

> 以上为截图占位符，请将实际游戏截图放入 `docs/` 目录并替换文件名。

## 功能特性

- 真实物理模拟：基于 Rapier 3D 刚体物理，玩具碰撞、堆叠、滑落均实时计算
- 三爪抓取机制：天车移动 → 下降 → 闭合 → 上升 → 移至出口 → 释放，完整还原娃娃机操作流程
- 多难度系统：简单 / 标准 / 困难，影响爪子速度、传感器半径与玩具布局密度
- 投币制玩法：每局 15 枚硬币，硬币耗尽即结束，统计成功率与最快通关时间
- 双端操控：移动端虚拟摇杆 + 桌面端键盘（WASD/方向键移动，空格/回车抓取）
- 实时小地图：俯视展示爪子位置与玩具分布，辅助瞄准
- 中英双语：内置 i18n，支持中文 / English 切换
- 画质自适应：高 / 低画质档位，自动适配设备像素比与阴影
- 音效与振动：投币、抓取、成功 / 失败音效，移动端触觉反馈
- 新手教程：首次进入引导操作流程，可跳过
- 数据持久化：设置、统计数据本地存储，刷新不丢失
- WebGL 能力检测：不支持时友好提示，上下文丢失可恢复

## 技术栈

| 类别 | 技术 | 版本 |
| --- | --- | --- |
| 前端框架 | React + React DOM | ^19.2 |
| 3D 渲染 | Three.js | ^0.185 |
| React 3D 绑定 | @react-three/fiber | ^9.7 |
| 3D 物理引擎 | @react-three/rapier (Rapier) | ^2.2 |
| 3D 辅助库 | @react-three/drei | ^10.7 |
| 状态管理 | Zustand | ^5.0 |
| 构建工具 | Vite | ^5.4 |
| 类型系统 | TypeScript | ^5.6 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9（或使用 pnpm / yarn 等包管理器）

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

启动 Vite 开发服务器，默认访问 `http://localhost:5173`（已开启 `host: true`，可局域网访问）。

### 生产构建

```bash
npm run build
```

先执行 `tsc -b` 进行类型检查与编译，再执行 `vite build` 打包，产物输出到 `dist/`。

### 预览构建产物

```bash
npm run preview
```

本地启动静态服务器预览 `dist/` 中的生产构建结果。

## 项目结构

```
claw3d/
├── public/
│   └── models/              # 3D 模型资源（.glb）
│       ├── boxoutnew.glb            # 机箱（含 WebP 纹理）
│       ├── boxoutnewWithOutWebp.glb # 机箱（无 WebP 纹理，兜底）
│       ├── clawoutnew.glb           # 爪子组件
│       ├── dogout.glb              # 玩具（含 WebP 纹理）
│       └── dogoutWithOutWebp.glb    # 玩具（无 WebP 纹理，兜底）
├── src/
│   ├── audio/
│   │   └── soundManager.ts         # 音效与振动管理
│   ├── config/
│   │   └── gameConfig.ts           # 游戏常量配置（物理、爪子、难度、渲染等）
│   ├── game/                        # 3D 场景与游戏逻辑组件
│   │   ├── Scene.tsx                # 3D 场景入口（灯光、物理世界、组件编排）
│   │   ├── Stage.tsx                # 舞台与机箱渲染
│   │   ├── Machine.tsx             # 娃娃机机箱主体
│   │   ├── Claw.tsx                # 爪子模型与动画
│   │   ├── GrabController.tsx      # 抓取流程控制器（下降/闭合/上升/出口/释放）
│   │   ├── Toys.tsx                # 玩具生成与物理刚体
│   │   ├── CameraRig.tsx           # 相机轨道控制
│   │   └── MinimapRenderer.tsx     # 俯视小地图渲染
│   ├── hooks/
│   │   └── useKeyboard.ts          # 键盘输入 Hook
│   ├── i18n/
│   │   └── index.ts               # 中英文文案
│   ├── store/
│   │   ├── gameStore.ts           # Zustand 全局状态（状态机、设置、统计）
│   │   ├── persistence.ts         # localStorage 持久化工具
│   │   └── refs.ts               # 非 React 渲染周期的可变引用（输入、阶段计时）
│   ├── ui/                         # 2D UI 覆盖层组件
│   │   ├── HUD.tsx                # 顶部信息栏（币数、玩具数、计时）
│   │   ├── Joystick.tsx           # 移动端虚拟摇杆
│   │   ├── StartButton.tsx        # 抓取按钮
│   │   ├── LoadingScreen.tsx      # 加载界面
│   │   ├── Tutorial.tsx           # 新手教程引导
│   │   ├── Modals.tsx             # 结果/暂停/完成/错误等弹窗
│   │   ├── SettingsPanel.tsx      # 设置面板（音效/画质/难度/语言/历史记录）
│   │   └── PerfPanel.tsx          # 性能监控面板
│   ├── utils/
│   │   └── capabilities.ts        # WebGL 能力检测
│   ├── App.tsx                    # 应用根组件（Canvas + UI 编排）
│   ├── main.tsx                   # React 入口
│   └── styles.css                 # 全局样式
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 浏览器支持

需支持 WebGL 2 的现代浏览器（Chrome / Edge / Firefox / Safari 最新版本）。移动端建议 iOS 15+ / Android 10+。

## License

本项目采用 MIT License，详见 [LICENSE](./LICENSE)。

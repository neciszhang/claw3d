# Claw Machine 3D

A 3D claw machine web game built with React + Three.js + the Rapier physics engine. Drive the overhead claw via a virtual joystick or keyboard, and grab as many toys as possible into the exit chute within a limited number of coins — recreating the feel and tension of a real claw machine.

## Live Preview

> Live preview link: [coming soon](#) (replace this link after deployment, e.g. GitHub Pages / Vercel)

## Screenshot

![Claw Machine 3D Gameplay](screenshot/20260807172320.jpg)

## Features

- Realistic physics simulation: powered by Rapier 3D rigid-body physics; toy collision, stacking, and sliding are computed in real time
- Three-prong grab mechanic: move → descend → close → ascend → move to exit → release, fully reproducing the claw machine operation flow
- Multiple difficulty levels: Easy / Normal / Hard, affecting claw speed, sensor radius, and toy layout density
- Coin-based gameplay: 15 coins per session; the round ends when coins run out, tracking success rate and fastest completion time
- Dual-platform controls: virtual joystick on mobile + keyboard on desktop (WASD / arrow keys to move, Space / Enter to grab)
- Real-time minimap: top-down view showing claw position and toy distribution for easier aiming
- Bilingual (zh / en): built-in i18n with Chinese / English switching
- Adaptive quality: high / low quality presets, auto-adjusting device pixel ratio and shadows
- Sound effects & haptics: coin, grab, success / failure sounds with mobile vibration feedback
- Onboarding tutorial: first-time guided walkthrough, skippable
- Data persistence: settings and stats stored locally, surviving page refreshes
- WebGL capability detection: graceful fallback when unsupported, with context-loss recovery

## Tech Stack

| Category | Technology | Version |
| --- | --- | --- |
| UI Framework | React + React DOM | ^19.2 |
| 3D Rendering | Three.js | ^0.185 |
| React 3D Bindings | @react-three/fiber | ^9.7 |
| 3D Physics Engine | @react-three/rapier (Rapier) | ^2.2 |
| 3D Helpers | @react-three/drei | ^10.7 |
| State Management | Zustand | ^5.0 |
| Build Tool | Vite | ^5.4 |
| Type System | TypeScript | ^5.6 |

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9 (or use pnpm / yarn etc.)

### Install Dependencies

```bash
npm install
```

### Local Development

```bash
npm run dev
```

Starts the Vite dev server, available at `http://localhost:5173` by default (`host: true` is enabled for LAN access).

### Production Build

```bash
npm run build
```

Runs `tsc -b` for type checking and compilation, then `vite build` to bundle. Output goes to `dist/`.

### Preview Build

```bash
npm run preview
```

Starts a local static server to preview the production build in `dist/`.

## Project Structure

```
claw3d/
├── public/
│   └── models/              # 3D model assets (.glb)
│       ├── boxoutnew.glb            # Cabinet (with WebP textures)
│       ├── boxoutnewWithOutWebp.glb # Cabinet (without WebP textures, fallback)
│       ├── clawoutnew.glb           # Claw assembly
│       ├── dogout.glb              # Toys (with WebP textures)
│       └── dogoutWithOutWebp.glb    # Toys (without WebP textures, fallback)
├── src/
│   ├── audio/
│   │   └── soundManager.ts         # Sound effects and haptics management
│   ├── config/
│   │   └── gameConfig.ts           # Game constants (physics, claw, difficulty, rendering, etc.)
│   ├── game/                        # 3D scene and game logic components
│   │   ├── Scene.tsx                # 3D scene entry (lights, physics world, component orchestration)
│   │   ├── Stage.tsx                # Stage and cabinet rendering
│   │   ├── Machine.tsx             # Claw machine cabinet body
│   │   ├── Claw.tsx                # Claw model and animation
│   │   ├── GrabController.tsx      # Grab flow controller (descend / close / ascend / exit / release)
│   │   ├── Toys.tsx                # Toy spawning and physics rigid bodies
│   │   ├── CameraRig.tsx           # Camera orbit controls
│   │   └── MinimapRenderer.tsx     # Top-down minimap rendering
│   ├── hooks/
│   │   └── useKeyboard.ts          # Keyboard input hook
│   ├── i18n/
│   │   └── index.ts               # Chinese / English copy
│   ├── store/
│   │   ├── gameStore.ts           # Zustand global state (state machine, settings, stats)
│   │   ├── persistence.ts         # localStorage persistence utilities
│   │   └── refs.ts               # Mutable refs outside React render cycle (input, phase timing)
│   ├── ui/                         # 2D UI overlay components
│   │   ├── HUD.tsx                # Top info bar (coins, toy count, timer)
│   │   ├── Joystick.tsx           # Mobile virtual joystick
│   │   ├── StartButton.tsx        # Grab button
│   │   ├── LoadingScreen.tsx      # Loading screen
│   │   ├── Tutorial.tsx           # Onboarding tutorial
│   │   ├── Modals.tsx             # Result / pause / complete / error modals
│   │   ├── SettingsPanel.tsx      # Settings panel (sound / quality / difficulty / language / history)
│   │   └── PerfPanel.tsx          # Performance monitor panel
│   ├── utils/
│   │   └── capabilities.ts        # WebGL capability detection
│   ├── App.tsx                    # Root app component (Canvas + UI orchestration)
│   ├── main.tsx                   # React entry
│   └── styles.css                 # Global styles
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Browser Support

Requires a modern browser with WebGL 2 support (latest Chrome / Edge / Firefox / Safari). On mobile, iOS 15+ / Android 10+ is recommended.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

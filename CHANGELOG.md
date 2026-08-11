# Changelog

## v1.1.0 — 2026-08-11

The first feature release since launch. Adds a full content and progression layer (toy variants, collection album, achievements, persistent wallet), player-facing UX tools (photo mode, share card, aim assist, precision slowdown), and a round of GPU/CPU performance optimizations. All existing saves remain compatible.

### New Features

#### Toys & progression
- **5 toy variants** across 3 rarity tiers (common / rare / hidden) — each with distinct tint, scale, density, slip factor, star reward, and spawn weight
  - Shiba (common, ★1), Snow (common, ★1), Sakura (rare, ★3), Golden (rare, ★4), Cosmic (hidden, ★8)
- **Collection album** with owned counts and hidden-toy teasers
- **9 achievements** — first catch, one-shot, 3-streak, lucky roll, sub-10s, hard-mode win, no-assist win, no-minimap win, full collection
- **Persistent coin wallet** — daily login bonus, win rewards, bankruptcy relief (top-up to 5), and interrupted-round refund via bfcache-safe pending flag

#### Gameplay feel
- **Aim assist** — floor projection ring that turns gold over a catchable toy (toggleable)
- **Precision slowdown** — claw decelerates near catchable toys for precise aiming
- **Machine shake** — one nudge per game, applies random impulses to loosen stuck toys
- **Slip reasons surfaced** to the player: off-center grab / moved too fast / weak grip
- **Steady-grip mode** — grabbed toys never slip (assist / demo)
- **Accelerated failure recovery** — fast recall on miss, skip button, shortened coin animation on replays

#### Controls & camera
- **Follow-finger joystick** mode — re-centers to wherever the finger lands
- **Left-handed layout** — joystick on the right, start button on the left
- **Auto cinematic camera** toggle — coin close-up and carry follow (can be disabled for full manual)
- **Four-way camera snap** with one-tap front / side / top presets

#### Extras
- **Photo mode** — hide the UI, frame your shot, export PNG
- **Share card** — canvas-rendered result card download

### Performance

- **InstancedMesh toy rendering** — physics/render split (ToyBody + ToyInstances), one draw call per GLB submesh instead of N per toy, zero-GC per-frame matrix updates
- **Light count reduced 8 → 4** — hemisphere absorbs ambient term, interior point lights consolidated to one, decorative colored lights replaced by additive glow sprites
- **Shader offscreen throttling** — raymarched nebula floor (512², every other frame) and aurora dome (512×256 equirect, every 3rd frame) render into small render targets
- **Shadow map freezing** — auto-disables `shadowMap.autoUpdate` after 2s of scene inactivity; kinematic bodies (parked collected toys) skipped to prevent false-positive shadow activation
- **PerfMonitor multi-pass accuracy** — `gl.info.autoReset = false` with priority-2 read, accumulates draw calls / triangles across main + offscreen + minimap passes
- **Vendor chunk splitting** — three / rapier (WASM) / react split via `manualChunks` for long-term browser caching
- **Minimap throttle** — top-down capture every 3rd frame, per-frame blit from cached texture only

### Engineering

- **ESLint** setup with `eslint-plugin-react-hooks`
- **Vitest** test runner with jsdom — 4 test files: achievements, persistence, refund, toy types
- **Dev debug exposure** — `window.__refs` and `window.__gameStore` in dev mode for automated testing / debugging

### i18n

- 120+ new zh/en translation entries for all new features

---

## v1.0.0 — 2026-08-07

Initial release.

# Environment record — 2026-11-27

Verified on the Mac Studio (macOS 27.2.1, arm64e).

| Capability | State | Evidence |
|---|---|---|
| Repo workspace | ready | `~/Sandbox/deepseek-harness-workspace/nervix-world` |
| Git | available | repo initialised |
| Blender | **not installed** | `command -v blender` resolves to a disk-guard shim at `~/.local/share/danslab-workflow/guard-bin/blender`; its target `/opt/homebrew/bin/blender` does not exist; no `Blender.app` found by `mdfind` |
| Reference images | **not supplied** | no matching files in `~/Downloads`, `~/Documents`, `~/Desktop`; `~/Documents/ChatGPT` has no Nervix World project |
| Node.js / pnpm | not checked | runtime work not started |
| NervixPay docs/credentials | not checked | demo adapter assumed |

## Consequence

Milestone 0 cannot produce or validate a `.blend` until Blender 4.x is installed. Per the master prompt, the unblocked work is: author the `bpy` scripts and instructions, complete application scaffolding, and label every Blender-dependent output as unexecuted.

## Fix

```sh
brew install --cask blender      # or install Blender 4.x from blender.org
blender --version                # record the exact version in PROGRESS.md
blender --background --python blender/scripts/validate_scene.py
```
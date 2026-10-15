"""YAML preset loader and dispatcher.

Preset schema (presets/*.yaml):
  name: str
  target_stem: str
  description: str
  chain:
    - op: <effects.py function name>
      params: {kwarg: value, ...}
"""
import os
import yaml
from remixkit import effects as _effects

_PRESETS_DIR = os.path.join(os.path.dirname(__file__), "..", "presets")


def load_preset(name: str) -> dict:
    """Load a preset by name (without .yaml extension)."""
    path = os.path.join(_PRESETS_DIR, f"{name}.yaml")
    with open(path) as f:
        return yaml.safe_load(f)


def list_presets() -> list:
    """Return names of all available presets (without extension)."""
    return sorted(
        os.path.splitext(f)[0]
        for f in os.listdir(_PRESETS_DIR)
        if f.endswith(".yaml")
    )


def apply_preset(audio, sr, preset) -> object:
    """Apply a preset's effect chain to audio (channel-major).

    `preset` can be a dict (from load_preset) or a string name.
    """
    if isinstance(preset, str):
        preset = load_preset(preset)
    for step in preset.get("chain", []):
        op = step["op"]
        params = step.get("params", {})
        fn = getattr(_effects, op, None)
        if fn is None:
            raise ValueError(f"Unknown effect op: {op!r} — check effects.py")
        audio = fn(audio, sr, **params)
    return audio

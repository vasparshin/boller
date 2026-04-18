"""
Split one ASCII STL into connected components (Trimesh split), each written as body_XXXX.stl.
Used after repair so the viewer can restore one Three.js mesh per solid island (e.g. 18 letters).
"""
from __future__ import annotations

import os
import sys

import trimesh


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: split_stl_bodies.py <input_ascii.stl> <output_dir>", file=sys.stderr)
        return 1
    inp = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    mesh = trimesh.load_mesh(inp, force="mesh")
    try:
        parts = mesh.split()
    except Exception as e:
        print(f"[split_stl_bodies] split failed, using whole mesh: {e}", file=sys.stderr)
        parts = []
    if not parts:
        parts = [mesh]
    for i, p in enumerate(parts):
        out_path = os.path.join(outdir, f"body_{i:04d}.stl")
        p.export(out_path, file_type="stl_ascii")
    print(len(parts), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

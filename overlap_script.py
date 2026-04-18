#!/usr/bin/env python3
"""
Find Overlap — minimal solid intersection only.

Used by /api/intersect-stl-scripted. Intentionally separate from subtract_script.py:
no voxel rebuild, no convex hull, no morphological volume merge.

The web app’s Find Overlap endpoint uses subtract_script.py --operation intersection
(pre-repair + Manifold). This file remains a lighter CLI alternative.

Intersects each *connected component* of the logo mesh with the full model, then
concatenates results so separate letters / shells stay separate shells in one STL.

When a component fails boolean (common with non-watertight / inverted / messy shells),
we retry after light stabilization and, if needed, a single fill_holes pass — still
no global voxel merge that caused the old "blob".
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Callable

import numpy as np
import trimesh

try:
    import manifold3d  # noqa: F401

    _HAS_MANIFOLD = True
except Exception:
    _HAS_MANIFOLD = False

def _load_stl_trimesh(path: str, label: str) -> trimesh.Trimesh:
    """
    STL from Three.js / repair can be multi-solid (Scene). trimesh.load_mesh(..., force='mesh')
    calls Scene.to_mesh() and often raises; load as Scene and merge with to_geometry() / concat.
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(f"[overlap_script] missing {label} STL: {path}")
    if os.path.getsize(path) < 80:
        raise ValueError(f"[overlap_script] {label} STL too small or empty: {path}")

    # process=False keeps fragile browser ASCII STLs loadable; we clean in _stabilize_*.
    loaded = trimesh.load(path, file_type="stl", process=False)

    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError(f"[overlap_script] {label} STL produced empty Scene: {path}")
        try:
            merged = loaded.to_geometry()
        except Exception as e0:
            print(
                f"[overlap_script] to_geometry() failed for {label}, trying dump(concatenate): {e0}",
                file=sys.stderr,
            )
            try:
                merged = loaded.dump(concatenate=True)
            except Exception as e1:
                parts = [
                    m.copy()
                    for m in loaded.geometry.values()
                    if isinstance(m, trimesh.Trimesh) and len(getattr(m, "faces", [])) > 0
                ]
                if not parts:
                    raise RuntimeError(
                        f"[overlap_script] could not merge {label} Scene geometry: {e1}"
                    ) from e1
                merged = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
        if merged is None or getattr(merged, "is_empty", True) or len(merged.faces) < 1:
            raise RuntimeError(f"[overlap_script] merged {label} mesh is empty: {path}")
        return _finalize_mesh_vertices(merged)

    if isinstance(loaded, trimesh.Trimesh):
        if len(loaded.faces) < 1:
            raise RuntimeError(f"[overlap_script] {label} mesh has no faces: {path}")
        return _finalize_mesh_vertices(loaded)

    raise TypeError(f"[overlap_script] unexpected type for {label}: {type(loaded)} from {path}")


def _finalize_mesh_vertices(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    m = mesh.copy()
    try:
        m.merge_vertices()
        m.remove_unreferenced_vertices()
    except Exception as e:
        print(f"[overlap_script] merge_vertices warning: {e}", file=sys.stderr)
    return m


def _fmt_volume(m: trimesh.Trimesh) -> str:
    try:
        v = float(m.volume)
        if not np.isfinite(v):
            return "nan"
        return f"{v:.6g}"
    except Exception:
        return "n/a"


def _log_component(i: int, n: int, part: trimesh.Trimesh, note: str = "") -> None:
    nf = len(getattr(part, "faces", []))
    wt = getattr(part, "is_watertight", False)
    msg = (
        f"[overlap_script] logo part {i + 1}/{n}: faces={nf} "
        f"watertight={wt} volume={_fmt_volume(part)} {note}"
    ).rstrip()
    print(msg, file=sys.stderr)


def _stabilize_light(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Degenerates / winding only — safe before boolean."""
    m = mesh.copy()
    try:
        m.update_faces(m.nondegenerate_faces())
        m.update_faces(m.unique_faces())
        m.remove_unreferenced_vertices()
        m.fix_normals()
        try:
            if m.is_watertight and len(m.faces) > 0 and float(m.volume) < 0:
                m.invert()
                m.fix_normals()
        except Exception:
            pass
    except Exception as e:
        print(f"[overlap_script] stabilize_light warning: {e}", file=sys.stderr)
    return m


def _stabilize_heal(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Second-chance: close boundary loops (helps open extrusions) — per part only."""
    m = _stabilize_light(mesh)
    try:
        m.fill_holes()
        m.fix_normals()
        try:
            if m.is_watertight and len(m.faces) > 0 and float(m.volume) < 0:
                m.invert()
                m.fix_normals()
        except Exception:
            pass
    except Exception as e:
        print(f"[overlap_script] stabilize_heal warning: {e}", file=sys.stderr)
    return m


def _light_cleanup(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    m = mesh.copy()
    try:
        m.update_faces(m.nondegenerate_faces())
        m.update_faces(m.unique_faces())
        m.remove_unreferenced_vertices()
        m.fix_normals()
    except Exception:
        pass
    return m


def _intersect_manifold(model_mesh: trimesh.Trimesh, logo_part: trimesh.Trimesh) -> trimesh.Trimesh | None:
    if not _HAS_MANIFOLD:
        return None
    try:
        r = trimesh.boolean.intersection(
            [model_mesh, logo_part],
            engine="manifold",
            check_volume=False,
        )
        if r is not None and not r.is_empty and len(r.faces) > 0:
            return r
    except Exception as e:
        print(f"[overlap_script] manifold intersection failed: {e}", file=sys.stderr)
    return None


def _intersect_trimesh_default(model_mesh: trimesh.Trimesh, logo_part: trimesh.Trimesh) -> trimesh.Trimesh | None:
    try:
        r = model_mesh.intersection(logo_part)
        if r is not None and not r.is_empty and len(r.faces) > 0:
            return r
    except Exception as e2:
        print(f"[overlap_script] trimesh intersection failed: {e2}", file=sys.stderr)
    return None


def _intersect_pair(model_mesh: trimesh.Trimesh, logo_part: trimesh.Trimesh) -> trimesh.Trimesh | None:
    r = _intersect_manifold(model_mesh, logo_part)
    if r is not None:
        return r
    return _intersect_trimesh_default(model_mesh, logo_part)


def _intersect_with_variants(
    model_mesh: trimesh.Trimesh,
    part: trimesh.Trimesh,
    i: int,
    n: int,
) -> trimesh.Trimesh | None:
    """Try raw part, then stabilized, then hole-filled — log where it succeeds."""
    variants: list[tuple[str, Callable[[], trimesh.Trimesh]]] = [
        ("raw", lambda: part.copy()),
        ("stabilize_light", lambda: _stabilize_light(part)),
        ("stabilize_heal", lambda: _stabilize_heal(part)),
    ]
    for label, factory in variants:
        candidate = factory()
        if candidate is None or len(candidate.faces) < 4:
            continue
        r = _intersect_pair(model_mesh, candidate)
        if r is not None and not r.is_empty and len(r.faces) > 0:
            if label != "raw":
                print(
                    f"[overlap_script] component {i + 1}/{n}: intersection OK after '{label}'",
                    file=sys.stderr,
                )
            return r
    return None


def _safe_post_clean(r: trimesh.Trimesh) -> trimesh.Trimesh:
    """Cleanup that must not drop a valid result."""
    cleaned = _light_cleanup(r)
    if cleaned is None or cleaned.is_empty or len(cleaned.faces) < 1:
        return r
    return cleaned


def _intersect_all_parts(
    model_work: trimesh.Trimesh, parts: list[trimesh.Trimesh], logo_mesh: trimesh.Trimesh
) -> list[trimesh.Trimesh]:
    pieces: list[trimesh.Trimesh] = []
    dropped = 0
    n = len(parts)
    for i, part in enumerate(parts):
        if part is None or len(getattr(part, "faces", [])) < 4:
            _log_component(i, n, part or logo_mesh, note="SKIP (<4 faces)")
            dropped += 1
            continue
        _log_component(i, n, part)
        r = _intersect_with_variants(model_work, part, i, n)
        if r is None or r.is_empty or len(r.faces) < 1:
            print(
                f"[overlap_script] component {i + 1}/{n}: EMPTY after manifold+trimesh (all variants)",
                file=sys.stderr,
            )
            dropped += 1
            continue
        r_clean = _safe_post_clean(r)
        if r_clean is None or r_clean.is_empty or len(r_clean.faces) < 1:
            print(
                f"[overlap_script] component {i + 1}/{n}: post-clean stripped faces; keeping raw intersection",
                file=sys.stderr,
            )
            r_final = r
        else:
            r_final = r_clean
        pieces.append(r_final)
        print(f"[overlap_script] component {i + 1}/{n}: {len(r_final.faces)} faces", flush=True)

    if dropped:
        print(
            f"[overlap_script] summary: kept {len(pieces)}/{n} components, dropped={dropped}",
            file=sys.stderr,
        )
    return pieces


def run_overlap(model_path: str, logo_path: str, out_path: str) -> bool:
    model_raw = _load_stl_trimesh(model_path, "model")
    logo_mesh = _load_stl_trimesh(logo_path, "logo")
    print(
        f"[overlap_script] loaded model faces={len(model_raw.faces)} "
        f"logo faces={len(logo_mesh.faces)}",
        flush=True,
    )

    try:
        parts = logo_mesh.split()
    except Exception as e:
        print(f"[overlap_script] logo split failed, using whole mesh: {e}", file=sys.stderr)
        parts = []

    if not parts or len(parts) == 0:
        parts = [logo_mesh]

    print(f"[overlap_script] logo connected components: {len(parts)}", flush=True)

    model_light = _stabilize_light(model_raw)
    pieces = _intersect_all_parts(model_light, parts, logo_mesh)
    if not pieces:
        print(
            "[overlap_script] no hits with light-stabilized model; retrying with healed model",
            file=sys.stderr,
        )
        model_heal = _stabilize_heal(model_raw)
        pieces = _intersect_all_parts(model_heal, parts, logo_mesh)

    if not pieces:
        print(
            "[overlap_script] ERROR: no overlap geometry produced. For browser STLs use "
            "subtract_script.py --operation intersection (Find Overlap in the app), which pre-repairs "
            "the logo before booleans.",
            file=sys.stderr,
        )
        return False

    out = trimesh.util.concatenate(pieces) if len(pieces) > 1 else pieces[0]
    out = _safe_post_clean(out)
    out.export(out_path, file_type="stl_ascii")
    print(f"[overlap_script] wrote {out_path} faces={len(out.faces)}", flush=True)
    return True


def main() -> int:
    p = argparse.ArgumentParser(description="Minimal model ∩ logo overlap (STL).")
    p.add_argument("model_stl", help="Path to model STL")
    p.add_argument("logo_stl", help="Path to logo STL")
    p.add_argument("output_stl", help="Path to output ASCII STL")
    args = p.parse_args()
    return 0 if run_overlap(args.model_stl, args.logo_stl, args.output_stl) else 1


if __name__ == "__main__":
    sys.exit(main())

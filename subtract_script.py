import argparse
import sys
import trimesh
import numpy as np
import os
import tempfile

# Optional PyVista fallback for robust boolean operations / repairs
try:
    import pyvista as pv  # type: ignore
    _HAS_PYVISTA = True
except Exception:
    _HAS_PYVISTA = False

# Optional vtkbool robust boolean filter (Python-only, no Blender)
try:
    import vtk  # type: ignore
    import vtkbool  # type: ignore
    _HAS_VTKBOOL = True
except Exception:
    _HAS_VTKBOOL = False

# SciPy for morphological operations on voxel grids
try:
    from scipy import ndimage as _ndimage  # type: ignore
    _HAS_SCIPY = True
except Exception:
    _HAS_SCIPY = False

try:
    import manifold3d  # type: ignore
    _HAS_MANIFOLD3D = True
except Exception:
    _HAS_MANIFOLD3D = False

# Ensure stdout/stderr use a forgiving encoding on Windows consoles
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# Feature flag: avoid PyVista boolean intersection due to potential VTK crashes on some inputs
USE_PYVISTA_INTERSECTION = False

# Fast mode: reduce heavy operations to avoid timeouts (set by server)
FAST_MODE = os.environ.get('B3D_FAST', '').strip() == '1'
REPAIR_CYCLES = 2 if FAST_MODE else 5
CLEAN_PASSES_PER_CYCLE = 2 if FAST_MODE else 5
STRICT_OVERLAP = os.environ.get('B3D_STRICT', '').strip() == '1'
INTERSECT_CONSERVATIVE = os.environ.get('B3D_INTERSECT_CONSERVATIVE', '').strip() == '1'
print(f"[Boolean Script] B3D_STRICT mode: {STRICT_OVERLAP}")
print(f"[Boolean Script] B3D_INTERSECT_CONSERVATIVE mode: {INTERSECT_CONSERVATIVE}")
print(f"[Boolean Script] manifold3d available: {_HAS_MANIFOLD3D}")


def _load_stl_trimesh(path: str, label: str) -> "trimesh.Trimesh":
    """
    Browser / Three.js STLs may be multi-solid (Scene). load_mesh(..., force='mesh') often
    raises via Scene.to_mesh(). Load with process=False and merge like overlap_script.
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(f"[Boolean Script] missing {label} STL: {path}")
    if os.path.getsize(path) < 80:
        raise ValueError(f"[Boolean Script] {label} STL too small or empty: {path}")
    loaded = trimesh.load(path, file_type="stl", process=False)
    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError(f"[Boolean Script] {label} STL produced empty Scene: {path}")
        try:
            merged = loaded.to_geometry()
        except Exception as e0:
            print(
                f"[Boolean Script] to_geometry() failed for {label}, trying dump(concatenate): {e0}",
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
                        f"[Boolean Script] could not merge {label} Scene geometry: {e1}"
                    ) from e1
                merged = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
        if merged is None or getattr(merged, "is_empty", True) or len(merged.faces) < 1:
            raise RuntimeError(f"[Boolean Script] merged {label} mesh is empty: {path}")
        return _finalize_mesh_vertices(merged)
    if isinstance(loaded, trimesh.Trimesh):
        if len(loaded.faces) < 1:
            raise RuntimeError(f"[Boolean Script] {label} mesh has no faces: {path}")
        return _finalize_mesh_vertices(loaded)
    raise TypeError(f"[Boolean Script] unexpected type for {label}: {type(loaded)} from {path}")


def _finalize_mesh_vertices(mesh: "trimesh.Trimesh") -> "trimesh.Trimesh":
    """ASCII STLs from process=False are often unmerged (3 verts/face) — breaks watertight & booleans."""
    m = mesh.copy()
    try:
        m.merge_vertices()
        m.remove_unreferenced_vertices()
    except Exception as e:
        print(f"[Boolean Script] merge_vertices warning for mesh: {e}", file=sys.stderr)
    return m


def boolean_operation(model_file_path, logo_file_path, output_file_path, operation='subtraction', thickness_delta=1.0):
    """
    Loads model and logo STL files using Trimesh, performs a boolean operation:
    - subtraction: model - logo
    - intersection: model and logo overlap
    - thin_intersection: Two-stage process for thin logo creation:
      1. Find overlapping regions between logo STL and main STL
      2. Move result inward by thickness_delta
      3. Find overlapping regions between moved result and main STL
    """
    try:
        # Load model / logo STLs (Scene-safe for multi-solid browser exports)
        print(f"[Boolean Script] Loading model mesh with Trimesh: {model_file_path}")
        model_mesh = _load_stl_trimesh(model_file_path, "model")
        print(f"[Boolean Script] Loaded model mesh. Faces: {len(model_mesh.faces)}, Vertices: {len(model_mesh.vertices)}")
        print(f"[Boolean Script] Model mesh watertight: {model_mesh.is_watertight}")

        print(f"[Boolean Script] Loading logo mesh with Trimesh: {logo_file_path}")
        logo_mesh = _load_stl_trimesh(logo_file_path, "logo")
        print(f"[Boolean Script] Loaded logo mesh. Faces: {len(logo_mesh.faces)}, Vertices: {len(logo_mesh.vertices)}")
        print(f"[Boolean Script] Logo mesh watertight: {logo_mesh.is_watertight}")
        
        # Analyze logo complexity
        try:
            logo_volume = logo_mesh.volume
            logo_bounds = logo_mesh.bounds
            logo_center = logo_mesh.centroid
            print(f"[Boolean Script] Logo complexity analysis:")
            print(f"  Volume: {logo_volume:.6f}")
            print(f"  Bounds: {logo_bounds}")
            print(f"  Center: {logo_center}")
            
            # Check for potential issues
            if len(logo_mesh.faces) > 10000:
                print(f"[Boolean Script] ⚠️ WARNING: High face count ({len(logo_mesh.faces)}), may cause boolean operation issues")
            if logo_volume < 0.001:
                print(f"[Boolean Script] ⚠️ WARNING: Very small volume ({logo_volume:.6f}), may cause precision issues")
            
            # Analyze geometric characteristics
            logo_size = logo_bounds[1] - logo_bounds[0]
            aspect_ratio = max(logo_size) / min(logo_size) if min(logo_size) > 0 else 0
            print(f"[Boolean Script] Geometric characteristics:")
            print(f"  Size: {logo_size}")
            print(f"  Aspect ratio: {aspect_ratio:.2f}")
            
            # Check for problematic geometry
            if aspect_ratio > 10:
                print(f"[Boolean Script] ⚠️ WARNING: High aspect ratio ({aspect_ratio:.2f}), may cause precision issues")
            if any(dim < 0.1 for dim in logo_size):
                print(f"[Boolean Script] ⚠️ WARNING: Very thin dimension detected, may cause boolean issues")
            
            # Analyze geometric complexity for boolean operations
            print(f"[Boolean Script] Boolean operation analysis:")
            
            # Check for complex features that cause issues
            try:
                # Count edges and analyze topology
                edge_count = len(logo_mesh.edges_unique)
                face_count = len(logo_mesh.faces)
                vertex_count = len(logo_mesh.vertices)
                
                print(f"  Topology: {vertex_count} vertices, {edge_count} edges, {face_count} faces")
                
                # Calculate complexity metrics
                edge_face_ratio = edge_count / face_count if face_count > 0 else 0
                vertex_face_ratio = vertex_count / face_count if face_count > 0 else 0
                
                print(f"  Complexity ratios: Edge/Face={edge_face_ratio:.2f}, Vertex/Face={vertex_face_ratio:.2f}")
                
                # Check for problematic topology
                if edge_face_ratio > 3.0:
                    print(f"[Boolean Script] ⚠️ WARNING: High edge/face ratio ({edge_face_ratio:.2f}), complex topology may cause boolean issues")
                if vertex_face_ratio > 2.0:
                    print(f"[Boolean Script] ⚠️ WARNING: High vertex/face ratio ({vertex_face_ratio:.2f}), dense geometry may cause boolean issues")
                
                # Check for non-manifold edges (common cause of boolean failures)
                non_manifold_edges = logo_mesh.edges_unique[logo_mesh.edges_unique_length == 0]
                if len(non_manifold_edges) > 0:
                    print(f"[Boolean Script] ⚠️ WARNING: {len(non_manifold_edges)} non-manifold edges detected, likely to cause boolean failures")
                
                # Check for degenerate faces
                degenerate_faces = len(logo_mesh.faces) - len(logo_mesh.nondegenerate_faces())
                if degenerate_faces > 0:
                    print(f"[Boolean Script] ⚠️ WARNING: {degenerate_faces} degenerate faces detected, may cause boolean issues")
                    
            except Exception as topology_error:
                print(f"[Boolean Script] Could not analyze topology: {topology_error}")
                
        except Exception as analysis_error:
            print(f"[Boolean Script] Could not analyze logo complexity: {analysis_error}")

        # --- Enhanced Pre-repair meshes with Multi-Body Handling --- 
        print("[Boolean Script] Performing enhanced pre-repair on input meshes...")
        try:
            # Check initial state
            print(f"[Boolean Script] Initial state - Model: watertight={model_mesh.is_watertight}")
            print(f"[Boolean Script] Initial state - Logo: watertight={logo_mesh.is_watertight}")
            
            # Enhanced repair function for complex geometry
            def enhanced_repair_mesh(mesh, name, preserve_multibody=False):
                print(f"[Boolean Script] Enhanced repair for {name} mesh...")
                
                # Check for multiple bodies (intersection inputs like overlap STL must keep all bodies)
                if not preserve_multibody:
                    try:
                        bodies = mesh.split()
                        if len(bodies) > 1:
                            print(f"[Boolean Script] {name} has {len(bodies)} bodies, selecting largest...")
                            # Select the largest body by face count
                            largest_body = max(bodies, key=lambda b: len(b.faces))
                            if len(largest_body.faces) > len(mesh.faces) * 0.5:  # Must be >50% of original
                                mesh = largest_body
                                print(f"[Boolean Script] Selected largest body for {name}: {len(mesh.faces)} faces")
                            else:
                                print(f"[Boolean Script] Warning: Largest body only has {len(largest_body.faces)} faces vs {len(mesh.faces)} total")
                    except Exception as split_error:
                        print(f"[Boolean Script] Could not split {name} mesh: {split_error}")
                else:
                    try:
                        n_bodies = len(mesh.split())
                        if n_bodies > 1:
                            print(f"[Boolean Script] {name} has {n_bodies} bodies; preserving all (intersection mode)")
                    except Exception as split_error:
                        print(f"[Boolean Script] Could not count bodies for {name} mesh: {split_error}")
                    # In preserve_multibody mode, repair each body independently and re-concatenate.
                    # This avoids global cleanup on concatenated meshes, which can drop tiny components.
                    try:
                        bodies = mesh.split()
                        repaired = []
                        for i, body in enumerate(bodies):
                            work = body.copy()
                            for _ in range(3):
                                work.update_faces(work.nondegenerate_faces())
                                work.update_faces(work.unique_faces())
                                work.remove_unreferenced_vertices()
                                work.fill_holes()
                                work.fix_normals()
                                if work.is_watertight:
                                    break
                            if (not work.is_watertight) and len(work.faces) > 0:
                                try:
                                    work = _voxel_rebuild_watertight(work)
                                except Exception:
                                    pass
                            if len(work.faces) > 0:
                                repaired.append(work)
                            else:
                                print(f"[Boolean Script] {name} body {i + 1} became empty during repair and was skipped")
                        if len(repaired) > 0:
                            mesh = trimesh.util.concatenate(repaired) if len(repaired) > 1 else repaired[0]
                            print(f"[Boolean Script] {name} preserve-multibody repair complete: kept {len(repaired)}/{len(bodies)} bodies")
                    except Exception as per_body_repair_error:
                        print(f"[Boolean Script] Per-body preserve repair failed for {name}: {per_body_repair_error}")
                
                # Aggressive repair cycles
                for cycle in range(3):
                    print(f"[Boolean Script] {name} repair cycle {cycle + 1}/3...")
                    
                    # Basic cleanup
                    mesh.update_faces(mesh.nondegenerate_faces())
                    mesh.update_faces(mesh.unique_faces())
                    mesh.remove_unreferenced_vertices()
                    
                    # Fill holes aggressively
                    mesh.fill_holes()
                    
                    # Fix normals multiple times
                    mesh.fix_normals()
                    mesh.fix_normals()  # Double fix
                    
                    # Additional cleanup
                    mesh.update_faces(mesh.nondegenerate_faces())
                    mesh.fix_normals()
                    
                    if mesh.is_watertight:
                        print(f"[Boolean Script] {name} became watertight after cycle {cycle + 1}")
                        break
                
                # Final validation and cleanup for stray edges
                print(f"[Boolean Script] Final validation for {name}...")
                
                # Remove any remaining stray vertices
                mesh.remove_unreferenced_vertices()
                
                # Check for extremely thin parts that might cause stray edges
                try:
                    bbox = mesh.bounds
                    bbox_size = bbox[1] - bbox[0]
                    min_dimension = min(bbox_size)
                    if min_dimension < 0.01:  # Less than 0.01mm in any dimension
                        print(f"[Boolean Script] WARNING: {name} has extremely thin dimension ({min_dimension:.6f}mm)")
                        # Try to remove thin parts by filtering faces
                        face_areas = mesh.area_faces
                        if len(face_areas) > 0:
                            min_area = np.min(face_areas)
                            if min_area < 0.0001:  # Very small faces
                                print(f"[Boolean Script] Removing faces with area < 0.0001 from {name}")
                                valid_faces = face_areas > 0.0001
                                mesh.update_faces(mesh.faces[valid_faces])
                                mesh.remove_unreferenced_vertices()
                except Exception as bbox_error:
                    print(f"[Boolean Script] Could not check bounds for {name}: {bbox_error}")
                
                return mesh
            
            # Only repair if not already watertight
            if operation == 'intersection' and INTERSECT_CONSERVATIVE:
                print("[Boolean Script] Conservative intersection mode: skipping model pre-repair to preserve source geometry.")
            elif not model_mesh.is_watertight:
                model_mesh = enhanced_repair_mesh(model_mesh, "Model")
                print(f"[Boolean Script] Model repair complete. Watertight: {model_mesh.is_watertight}")
            else:
                print("[Boolean Script] Model mesh already watertight, skipping repair")
            
            if operation == 'intersection' and INTERSECT_CONSERVATIVE:
                print("[Boolean Script] Conservative intersection mode: skipping logo pre-repair to preserve source geometry.")
            elif not logo_mesh.is_watertight:
                logo_mesh = enhanced_repair_mesh(
                    logo_mesh,
                    "Logo",
                    preserve_multibody=(operation == "intersection"),
                )
                print(f"[Boolean Script] Logo repair complete. Watertight: {logo_mesh.is_watertight}")
            else:
                print("[Boolean Script] Logo mesh already watertight, skipping repair")
            
            print(f"[Boolean Script] Pre-repair complete. Model: {len(model_mesh.faces)} faces, Logo: {len(logo_mesh.faces)} faces")
            
            # Additional checks for volume operations
            print("[Boolean Script] Performing additional volume checks...")
            
            # Check if meshes have volume (not just surface)
            try:
                model_volume = model_mesh.volume
                logo_volume = logo_mesh.volume
                print(f"[Boolean Script] Model volume: {model_volume:.6f}, Logo volume: {logo_volume:.6f}")
                
                if model_volume <= 0 or logo_volume <= 0:
                    print(f"[Boolean Script] WARNING: One or both meshes have zero or negative volume!", file=sys.stderr)
                    print(f"[Boolean Script] Model volume: {model_volume}, Logo volume: {logo_volume}", file=sys.stderr)
                    
                    # For thin_intersection, we can work around volume issues by using fallback methods
                    # Don't fail the entire script - just log the warning and continue
                    print(f"[Boolean Script] Volume issues detected but continuing with robust fallbacks...", file=sys.stderr)
                    
                    # Try to fix negative volume by flipping normals
                    if model_volume <= 0:
                        print("[Boolean Script] Attempting to fix model mesh negative volume by flipping normals...")
                        try:
                            model_mesh.faces[:, [1, 2]] = model_mesh.faces[:, [2, 1]]  # Flip face winding
                            model_mesh.fix_normals()
                            model_volume = model_mesh.volume
                            print(f"[Boolean Script] Model volume after fix: {model_volume:.6f}")
                        except Exception as model_fix_error:
                            print(f"[Boolean Script] Model volume fix failed: {model_fix_error}")
                    
                    if logo_volume <= 0:
                        print("[Boolean Script] Attempting to fix logo mesh negative volume by flipping normals...")
                        try:
                            logo_mesh.faces[:, [1, 2]] = logo_mesh.faces[:, [2, 1]]  # Flip face winding
                            logo_mesh.fix_normals()
                            logo_volume = logo_mesh.volume
                            print(f"[Boolean Script] Logo volume after fix: {logo_volume:.6f}")
                        except Exception as logo_fix_error:
                            print(f"[Boolean Script] Logo volume fix failed: {logo_fix_error}")
                    
                    # If still negative volumes, log warning but don't fail
                    if model_mesh.volume <= 0 or logo_mesh.volume <= 0:
                        print(f"[Boolean Script] Volume issues persist but will attempt boolean operations with fallbacks", file=sys.stderr)
                        
            except Exception as vol_error:
                print(f"[Boolean Script] Could not calculate volume: {vol_error}")
            
            # Ensure normals are consistent
            print("[Boolean Script] Ensuring consistent normals...")
            model_mesh.fix_normals()
            logo_mesh.fix_normals()
            
            # Check for zero-thickness intersection
            print("[Boolean Script] Checking for zero-thickness intersection...")
            try:
                # Get bounding boxes
                model_bounds = model_mesh.bounds
                logo_bounds = logo_mesh.bounds
                
                # Check if logo is too close to model surface (potential zero-thickness)
                model_top = model_bounds[1][2]  # Model's top Z
                logo_bottom = logo_bounds[0][2]  # Logo's bottom Z
                logo_top = logo_bounds[1][2]     # Logo's top Z
                
                print(f"[Boolean Script] Model Z range: {model_bounds[0][2]:.3f} to {model_top:.3f}")
                print(f"[Boolean Script] Logo Z range: {logo_bottom:.3f} to {logo_top:.3f}")
                
                # Check if logo intersects with model surface
                if logo_bottom <= model_top and logo_top >= model_bounds[0][2]:
                    overlap = min(logo_top, model_top) - max(logo_bottom, model_bounds[0][2])
                    print(f"[Boolean Script] WARNING: Logo overlaps with model by {overlap:.3f}mm")
                    
                    if overlap < 0.1:  # Less than 0.1mm overlap
                        print("[Boolean Script] CRITICAL: Potential zero-thickness intersection detected!")
                        print("[Boolean Script] This will cause corruption and stray edges")
                        
                        # Suggest offset
                        suggested_offset = 0.2  # 0.2mm offset
                        print(f"[Boolean Script] SUGGESTION: Apply at least {suggested_offset}mm Z offset to logo")
                    else:
                        print(f"[Boolean Script] Overlap is acceptable ({overlap:.3f}mm)")
                else:
                    print("[Boolean Script] Logo does not overlap with model - good separation")
                    
            except Exception as check_error:
                print(f"[Boolean Script] Could not check intersection: {check_error}")
            
            # Final validation
            if not model_mesh.is_watertight:
                print(f"[Boolean Script] WARNING: Model mesh still not watertight after repair!", file=sys.stderr)
            if not logo_mesh.is_watertight:
                print(f"[Boolean Script] WARNING: Logo mesh still not watertight after repair!", file=sys.stderr)
                
        except Exception as repair_error:
            print(f"[Boolean Script] Warning: Error during pre-repair: {repair_error}", file=sys.stderr)

        # Helper: PyVista intersection fallback
        def _pyvista_intersection_fallback(model_path: str, logo_path: str):
            if not _HAS_PYVISTA or not USE_PYVISTA_INTERSECTION:
                print("[Boolean Script] PyVista not available, cannot use intersection fallback")
                return None
            try:
                print("[Boolean Script] PyVista fallback: reading inputs...")
                model_pv = pv.read(model_path)
                logo_pv = pv.read(logo_path)

                # Basic cleanups to improve boolean stability
                for name, m in (("Model", model_pv), ("Logo", logo_pv)):
                    try:
                        m.clean(inplace=True)
                        m.triangulate(inplace=True)
                        m = m.extract_surface()
                        print(f"[Boolean Script] PyVista {name} cleaned and triangulated")
                    except Exception as e:
                        print(f"[Boolean Script] PyVista {name} cleanup warning: {e}")

                print("[Boolean Script] PyVista performing boolean intersection...")
                result_pv = model_pv.boolean_intersection(logo_pv)
                if result_pv is None or result_pv.n_cells == 0:
                    print("[Boolean Script] PyVista boolean_intersection returned empty result", file=sys.stderr)
                    return None

                # Post-boolean cleanup to ensure watertightness
                try:
                    result_pv.triangulate(inplace=True)
                    result_pv.clean(inplace=True)
                    # Fill reasonably sized holes
                    try:
                        result_pv = result_pv.fill_holes(hole_size=100.0)
                    except Exception:
                        pass
                except Exception as e:
                    print(f"[Boolean Script] PyVista post-clean warning: {e}")

                # Save to a temp STL and reload via trimesh for unified pipeline
                with tempfile.TemporaryDirectory() as td:
                    temp_out = os.path.join(td, "pv_intersection.stl")
                    result_pv.save(temp_out, binary=False)
                    print("[Boolean Script] PyVista fallback saved interim STL; reloading via Trimesh...")
                    loaded = trimesh.load_mesh(temp_out, force='mesh')
                    return loaded
            except Exception as e:
                print(f"[Boolean Script] PyVista intersection fallback failed: {e}", file=sys.stderr)
                return None

        # Helper: ultimate watertight rebuild via voxelization (detail-preserving fallback)
        def _voxel_rebuild_watertight(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
            try:
                bounds = mesh.bounds
                bbox_size = bounds[1] - bounds[0]
                # pick pitch to target ~200 voxels along largest dimension, clamp to [0.05, 1.0]
                max_dim = float(np.max(bbox_size)) if np.all(np.isfinite(bbox_size)) else 50.0
                pitch = max(0.05, min(1.0, max_dim / 200.0))
                print(f"[Boolean Script] Voxel rebuild: pitch={pitch:.3f} (max_dim={max_dim:.3f})")
                # Use faster ray-based voxelization to avoid heavy subdivision
                vox = mesh.voxelized(pitch=pitch, method='ray')
                # Try trimesh marching_cubes (requires scikit-image). If unavailable, use PyVista fallback
                try:
                    rebuilt = vox.marching_cubes
                except Exception as e:
                    print(f"[Boolean Script] Trimesh marching_cubes unavailable, trying PyVista: {e}")
                    if not _HAS_PYVISTA:
                        # As a last resort without skimage/pyvista, return convex hull to ensure watertight
                        try:
                            return mesh.convex_hull
                        except Exception:
                            raise
                    mat = vox.matrix
                    if mat is None or not mat.any():
                        raise RuntimeError("Empty voxel matrix for rebuild")
                    try:
                        nx, ny, nz = mat.shape
                        grid = getattr(pv, 'UniformGrid', None) or getattr(pv, 'ImageData')()
                        grid.dimensions = (nx + 1, ny + 1, nz + 1)
                        grid.origin = tuple(vox.origin.tolist() if hasattr(vox, 'origin') else bounds[0].tolist())
                        grid.spacing = (pitch, pitch, pitch)
                        grid.cell_data['values'] = mat.astype(np.uint8).ravel(order='F')
                        # Convert cell data to point data for contour
                        try:
                            grid = grid.cell_data_to_point_data()
                        except Exception:
                            pass
                        surf = grid.contour([0.5], scalars='values')
                        surf.triangulate(inplace=True)
                        with tempfile.TemporaryDirectory() as td:
                            temp_out = os.path.join(td, "pv_voxel_rebuild.stl")
                            surf.save(temp_out, binary=False)
                            rebuilt = trimesh.load_mesh(temp_out, force='mesh')
                    except Exception as pv_err:
                        # Fallback: convex hull
                        print(f"[Boolean Script] PyVista voxel rebuild failed: {pv_err}")
                        try:
                            return mesh.convex_hull
                        except Exception:
                            raise RuntimeError(f"Voxel rebuild failed entirely: {pv_err}")
                # Clean up the rebuilt mesh a bit
                try:
                    rebuilt.remove_unreferenced_vertices()
                    rebuilt.update_faces(rebuilt.nondegenerate_faces())
                    rebuilt.fix_normals()
                except Exception:
                    pass
                print(f"[Boolean Script] Voxel rebuild complete. Watertight={rebuilt.is_watertight}")
                return rebuilt
            except Exception as e:
                print(f"[Boolean Script] Voxel rebuild failed: {e}", file=sys.stderr)
                return mesh

        # Helper: robust boolean intersection using vtkbool (if available)
        def _vtkbool_intersection(model_path: str, logo_path: str):
            if not _HAS_VTKBOOL:
                return None

        # Helper: write a trimesh mesh to a temporary ASCII STL file
        def _write_temp_mesh_ascii(mesh: trimesh.Trimesh) -> str:
            td = tempfile.mkdtemp()
            path = os.path.join(td, 'mesh.stl')
            try:
                mesh.export(path, file_type='stl_ascii')
                return path
            except Exception as e:
                raise e
            try:
                reader1 = vtk.vtkSTLReader()
                reader1.SetFileName(model_path)
                reader1.Update()
                reader2 = vtk.vtkSTLReader()
                reader2.SetFileName(logo_path)
                reader2.Update()

                def _prep(poly):
                    clean = vtk.vtkCleanPolyData()
                    clean.SetInputData(poly)
                    clean.Update()
                    tri = vtk.vtkTriangleFilter()
                    tri.SetInputData(clean.GetOutput())
                    tri.Update()
                    normals = vtk.vtkPolyDataNormals()
                    normals.SetInputData(tri.GetOutput())
                    normals.AutoOrientNormalsOn()
                    normals.ConsistencyOn()
                    normals.Update()
                    return normals.GetOutput()

                a = _prep(reader1.GetOutput())
                b = _prep(reader2.GetOutput())

                bf = vtkbool.vtkPolyDataBooleanFilter()
                bf.SetInputData(0, a)
                bf.SetInputData(1, b)
                bf.SetOperModeToIntersection()
                bf.Update()
                out = bf.GetOutput()
                if out is None or out.GetNumberOfCells() == 0:
                    return None

                with tempfile.TemporaryDirectory() as td:
                    temp_out = os.path.join(td, 'vtkbool_intersection.stl')
                    writer = vtk.vtkSTLWriter()
                    writer.SetFileName(temp_out)
                    writer.SetInputData(out)
                    writer.SetFileTypeToASCII()
                    writer.Write()
                    loaded = trimesh.load_mesh(temp_out, force='mesh')
                    return loaded
            except Exception as e:
                print(f"[Boolean Script] vtkbool intersection failed: {e}", file=sys.stderr)
                return None

        # Helper: morphological watertight rebuild for a single mesh (no boolean)
        def _mesh_morphological_repair(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
            if not _HAS_SCIPY:
                return mesh
            try:
                bounds = mesh.bounds
                bbox_size = bounds[1] - bounds[0]
                max_dim = float(np.max(bbox_size)) if np.all(np.isfinite(bbox_size)) else 50.0
                # Pick an initial pitch; we'll try a couple of refinements
                base_pitch = max(0.05, min(1.5, max_dim / 220.0))
                pitches = [base_pitch, base_pitch * 0.75, base_pitch * 0.5]
                from trimesh.voxel import ops as voxel_ops
                for pitch in pitches:
                    try:
                        vox = mesh.voxelized(pitch=pitch, method='ray')
                        mat = vox.matrix
                        if mat is None or not mat.any():
                            continue
                        # Morphological closing/opening
                        structure = np.ones((3, 3, 3), dtype=bool)
                        mat = _ndimage.binary_closing(mat, structure=structure, iterations=1)
                        mat = _ndimage.binary_opening(mat, structure=structure, iterations=1)
                        if not mat.any():
                            continue
                        try:
                            rebuilt = voxel_ops.matrix_to_marching_cubes(mat, pitch=pitch, origin=vox.origin)
                        except Exception as e:
                            print(f"[Boolean Script] matrix_to_marching_cubes unavailable, trying PyVista: {e}")
                            if not _HAS_PYVISTA:
                                continue
                            try:
                                nx, ny, nz = mat.shape
                                grid = getattr(pv, 'UniformGrid', None) or getattr(pv, 'ImageData')()
                                grid.dimensions = (nx + 1, ny + 1, nz + 1)
                                grid.origin = tuple(vox.origin.tolist() if hasattr(vox, 'origin') else bounds[0].tolist())
                                grid.spacing = (pitch, pitch, pitch)
                                grid.cell_data['values'] = mat.astype(np.uint8).ravel(order='F')
                                try:
                                    grid = grid.cell_data_to_point_data()
                                except Exception:
                                    pass
                                surf = grid.contour([0.5], scalars='values')
                                surf.triangulate(inplace=True)
                                with tempfile.TemporaryDirectory() as td:
                                    temp_out = os.path.join(td, "pv_morph_rebuild.stl")
                                    surf.save(temp_out, binary=False)
                                    rebuilt = trimesh.load_mesh(temp_out, force='mesh')
                            except Exception:
                                continue
                        if rebuilt is None or rebuilt.is_empty:
                            continue
                        try:
                            rebuilt.remove_unreferenced_vertices()
                            rebuilt.update_faces(rebuilt.nondegenerate_faces())
                            rebuilt.fix_normals()
                        except Exception:
                            pass
                        if rebuilt.is_watertight:
                            return rebuilt
                        # As a near-miss, return the best attempt
                        mesh = rebuilt
                    except Exception:
                        continue
                return mesh
            except Exception:
                return mesh

        # Helper: volumetric boolean AND (intersection) on shared grid
        def _volumetric_intersection(model_mesh: trimesh.Trimesh, logo_mesh: trimesh.Trimesh) -> trimesh.Trimesh:
            try:
                # Compute global bounds
                mmin, mmax = model_mesh.bounds
                lmin, lmax = logo_mesh.bounds
                bmin = np.minimum(mmin, lmin)
                bmax = np.maximum(mmax, lmax)
                extent = bmax - bmin
                max_dim = float(np.max(extent)) if np.all(np.isfinite(extent)) else 50.0
                # initial pitch targeting ~220 vox per longest axis
                pitch = max(0.05, min(2.0, max_dim / 220.0))

                # Limit matrix size; adjust pitch upward if needed
                def _estimate_shape(p):
                    shape = np.ceil(extent / p).astype(int) + 3
                    return shape
                shape = _estimate_shape(pitch)
                max_cells = int(256 * 256 * 256)
                while int(shape[0] * shape[1] * shape[2]) > max_cells and pitch < 5.0:
                    pitch *= 1.25
                    shape = _estimate_shape(pitch)

                origin = bmin - pitch  # small margin

                # Voxelize both meshes (get voxel centers)
                mv = model_mesh.voxelized(pitch=pitch)
                lv = logo_mesh.voxelized(pitch=pitch)
                mp = mv.points if hasattr(mv, 'points') else mv.points
                lp = lv.points if hasattr(lv, 'points') else lv.points
                if mp is None or len(mp) == 0 or lp is None or len(lp) == 0:
                    print("[Boolean Script] Volumetric: one voxel set empty")
                    return trimesh.Trimesh()

                # Map centers to global integer indices
                midx = np.floor((mp - origin) / pitch + 0.5).astype(np.int32)
                lidx = np.floor((lp - origin) / pitch + 0.5).astype(np.int32)

                # Intersect occupied indices
                mset = set(map(tuple, midx))
                lset = set(map(tuple, lidx))
                iset = np.array(list(mset.intersection(lset)), dtype=np.int32)
                if iset.size == 0:
                    print("[Boolean Script] Volumetric intersection produced no occupied voxels")
                    return trimesh.Trimesh()

                # Pack indices into a dense matrix
                mins = iset.min(axis=0)
                maxs = iset.max(axis=0)
                dense_shape = (maxs - mins + 1).astype(int)
                # Safety clamp
                if int(dense_shape[0] * dense_shape[1] * dense_shape[2]) > max_cells:
                    print("[Boolean Script] Volumetric dense matrix too large; aborting volumetric fallback")
                    return trimesh.Trimesh()
                matrix = np.zeros(dense_shape.tolist(), dtype=bool)
                packed = iset - mins
                matrix[packed[:, 0], packed[:, 1], packed[:, 2]] = True

                # Convert matrix to mesh
                grid_origin = origin + mins * pitch
                from trimesh.voxel import ops as voxel_ops
                vm = voxel_ops.matrix_to_marching_cubes(matrix, pitch=pitch, origin=grid_origin)
                if vm is None or vm.is_empty:
                    return trimesh.Trimesh()

                # Cleanup and return
                try:
                    vm.remove_unreferenced_vertices()
                    vm.update_faces(vm.nondegenerate_faces())
                    vm.fix_normals()
                except Exception:
                    pass
                print(f"[Boolean Script] Volumetric intersection mesh: faces={len(vm.faces)}, watertight={vm.is_watertight}")
                return vm
            except Exception as e:
                print(f"[Boolean Script] Volumetric intersection failed: {e}", file=sys.stderr)
                return trimesh.Trimesh()

        # Helper: volumetric AND + morphological cleanup on shared grid
        def _volumetric_morph_intersection(model_mesh: trimesh.Trimesh, logo_mesh: trimesh.Trimesh) -> trimesh.Trimesh:
            if not _HAS_SCIPY:
                print("[Boolean Script] SciPy not available, cannot use morphological volumetric fallback")
                return trimesh.Trimesh()
            try:
                mmin, mmax = model_mesh.bounds
                lmin, lmax = logo_mesh.bounds
                bmin = np.minimum(mmin, lmin)
                bmax = np.maximum(mmax, lmax)
                extent = bmax - bmin
                max_dim = float(np.max(extent)) if np.all(np.isfinite(extent)) else 50.0
                pitch = max(0.08, min(2.5, max_dim / 240.0))

                def _estimate_shape(p):
                    return (np.ceil(extent / p).astype(int) + 3)
                shape = _estimate_shape(pitch)
                max_cells = int(256 * 256 * 256)
                while int(shape[0] * shape[1] * shape[2]) > max_cells and pitch < 6.0:
                    pitch *= 1.25
                    shape = _estimate_shape(pitch)

                origin = bmin - pitch

                # Voxelize both to point indices (same as earlier)
                mv = model_mesh.voxelized(pitch=pitch)
                lv = logo_mesh.voxelized(pitch=pitch)
                mp = mv.points
                lp = lv.points
                if mp is None or len(mp) == 0 or lp is None or len(lp) == 0:
                    print("[Boolean Script] Morph volumetric: one voxel set empty")
                    return trimesh.Trimesh()

                midx = np.floor((mp - origin) / pitch + 0.5).astype(np.int32)
                lidx = np.floor((lp - origin) / pitch + 0.5).astype(np.int32)

                # Build dense occupancy grids for both
                mins = np.minimum(midx.min(axis=0), lidx.min(axis=0))
                maxs = np.maximum(midx.max(axis=0), lidx.max(axis=0))
                dense_shape = (maxs - mins + 1).astype(int)
                if int(dense_shape[0] * dense_shape[1] * dense_shape[2]) > max_cells:
                    print("[Boolean Script] Morph volumetric dense matrix too large; aborting")
                    return trimesh.Trimesh()
                m_mat = np.zeros(dense_shape.tolist(), dtype=bool)
                l_mat = np.zeros_like(m_mat)

                mpacked = midx - mins
                lpacked = lidx - mins
                m_mat[mpacked[:, 0], mpacked[:, 1], mpacked[:, 2]] = True
                l_mat[lpacked[:, 0], lpacked[:, 1], lpacked[:, 2]] = True

                inter = m_mat & l_mat

                # Morphological closing to seal pinholes; then opening to remove tiny noise
                structure = np.ones((3, 3, 3), dtype=bool)
                inter = _ndimage.binary_closing(inter, structure=structure, iterations=1)
                inter = _ndimage.binary_opening(inter, structure=structure, iterations=1)

                # Remove small components
                labels, num = _ndimage.label(inter)
                if num > 1:
                    sizes = _ndimage.sum(inter, labels, index=np.arange(1, num + 1))
                    max_size = sizes.max() if len(sizes) else 0
                    keep = np.zeros_like(sizes, dtype=bool)
                    # Keep components that are at least 5% of the largest component
                    keep[np.where(sizes >= max(50, 0.05 * max_size))[0]] = True
                    # Build mask of kept components
                    mask = np.isin(labels, np.where(keep)[0] + 1)
                    inter = inter & mask

                if not inter.any():
                    print("[Boolean Script] Morph volumetric produced empty occupancy")
                    return trimesh.Trimesh()

                # Marching cubes back to mesh
                from trimesh.voxel import ops as voxel_ops
                grid_origin = origin + mins * pitch
                vm = voxel_ops.matrix_to_marching_cubes(inter, pitch=pitch, origin=grid_origin)
                if vm is None or vm.is_empty:
                    return trimesh.Trimesh()

                try:
                    vm.remove_unreferenced_vertices()
                    vm.update_faces(vm.nondegenerate_faces())
                    vm.fix_normals()
                except Exception:
                    pass
                print(f"[Boolean Script] Morph volumetric result: faces={len(vm.faces)}, watertight={vm.is_watertight}")
                return vm
            except Exception as e:
                print(f"[Boolean Script] Morph volumetric intersection failed: {e}", file=sys.stderr)
                return trimesh.Trimesh()

        # --- Perform Boolean Operation with Trimesh ---
        if operation == 'intersection':
            print("[Boolean Script] Performing boolean intersection (model AND logo overlap) using Trimesh...")
            operation_name = "intersection"
            # When the server sets B3D_INTERSECT_CONSERVATIVE (Find Overlap / preserveTopology),
            # accept a non-watertight boolean shell and skip vtk/voxel/morph "healing" that merges
            # separate bodies into one blob.
            overlap_skip_blob_fallbacks = INTERSECT_CONSERVATIVE

            # Enhanced intersection with multiple fallback methods and better repair
            result_mesh = None
            goto_save = False  # Flag to skip post-processing in strict mode
            
            # Method 1: Prefer manifold engine for robust solid booleans
            try:
                if _HAS_MANIFOLD3D:
                    result_mesh = trimesh.boolean.intersection(
                        [model_mesh, logo_mesh],
                        engine='manifold',
                        check_volume=False,
                    )
                    print(f"[Boolean Script] Manifold intersection successful. Result faces: {len(result_mesh.faces)}")
                else:
                    result_mesh = model_mesh.intersection(logo_mesh)
                    print(f"[Boolean Script] Direct intersection successful. Result faces: {len(result_mesh.faces)}")
                
                # Enhanced post-intersection repair for better watertight results
                if result_mesh and not result_mesh.is_empty:
                    if INTERSECT_CONSERVATIVE:
                        print("[Boolean Script] Conservative intersection mode: skipping aggressive per-body repair to preserve glyph topology.")
                    else:
                        print("[Boolean Script] Performing enhanced post-intersection repair...")
                    if not INTERSECT_CONSERVATIVE:
                        # Check for multiple bodies and handle them
                        try:
                            bodies = result_mesh.split()
                            if len(bodies) > 1:
                                print(f"[Boolean Script] Intersection created {len(bodies)} bodies, analyzing...")
                                
                                # Find the largest body
                                largest_body = max(bodies, key=lambda b: len(b.faces))
                                largest_face_count = len(largest_body.faces)
                                total_face_count = len(result_mesh.faces)
                                
                                print(f"[Boolean Script] Largest body has {largest_face_count} faces out of {total_face_count} total")
                                
                                # For intersection, keep ALL bodies to preserve logo complexity
                                # Don't discard bodies based on size - combine them all
                                print(f"[Boolean Script] Keeping all {len(bodies)} bodies to preserve logo complexity")
                                print(f"[Boolean Script] Largest body: {largest_face_count/total_face_count*100:.1f}% of total faces")
                                # Don't change result_mesh here - let the multi-body repair handle everything
                                    
                        except Exception as split_error:
                            print(f"[Boolean Script] Could not analyze bodies: {split_error}")
                        
                        # Enhanced repair for intersection results with multi-body handling
                        print("[Boolean Script] Starting enhanced multi-body repair for intersection...")
                        
                        # Always perform multi-body analysis and repair for intersection results
                        # This is because intersection can create complex internal geometry that appears watertight but has issues
                        print("[Boolean Script] Performing mandatory multi-body analysis for intersection result...")
                        
                        try:
                            # Split into bodies and analyze each
                            bodies = result_mesh.split()
                            print(f"[Boolean Script] Found {len(bodies)} bodies in intersection result...")
                            
                            if len(bodies) > 1:
                                print("[Boolean Script] Multiple bodies detected, performing individual repair (keep ALL bodies)...")
                                
                                repaired_bodies = []
                                for i, body in enumerate(bodies):
                                    original_face_count = len(body.faces)
                                    try:
                                        bmin, bmax = body.bounds
                                        bsize = bmax - bmin
                                        bbox_sig = f"{bsize[0]:.3f}x{bsize[1]:.3f}x{bsize[2]:.3f}"
                                    except Exception:
                                        bbox_sig = "unknown"
                                    print(f"[Boolean Script] Analyzing body {i+1}/{len(bodies)} with {original_face_count} faces (bbox={bbox_sig})...")
                                    
                                    # Repair individual body aggressively
                                    for body_repair_cycle in range(5):
                                        body.update_faces(body.nondegenerate_faces())
                                        body.update_faces(body.unique_faces())
                                        body.remove_unreferenced_vertices()
                                        body.fill_holes()
                                        body.fix_normals()
                                        body.fix_normals()
                                        if body.is_watertight:
                                            print(f"[Boolean Script] ✅ Body {i+1} became watertight after cycle {body_repair_cycle + 1}")
                                            break
                                    # If still not watertight, try voxel/morph/hull
                                    if not body.is_watertight:
                                        body = _voxel_rebuild_watertight(body)
                                    if not body.is_watertight:
                                        body = _mesh_morphological_repair(body)
                                    if not body.is_watertight:
                                        try:
                                            body = body.convex_hull
                                        except Exception:
                                            pass
                                    # Keep every body with geometry (we ensure watertight via fallbacks)
                                    if len(body.faces) > 0:
                                        retained_faces = len(body.faces)
                                        retention_ratio = (retained_faces / original_face_count) if original_face_count > 0 else 0.0
                                        at_risk = (retention_ratio < 0.35) or (retained_faces < 120)
                                        repaired_bodies.append(body)
                                        print(
                                            f"[Boolean Script] ✅ Body {i+1} kept ({retained_faces} faces, "
                                            f"retention={retention_ratio:.3f}, at_risk={at_risk})"
                                        )
                                        if at_risk:
                                            print(
                                                f"[Boolean Script] ⚠️ Body {i+1} predicted unstable "
                                                f"(strong shrink or tiny face count)."
                                            )
                                
                                # Combine all repaired bodies
                                if len(repaired_bodies) > 0:
                                    if len(repaired_bodies) == 1:
                                        result_mesh = repaired_bodies[0]
                                        print(f"[Boolean Script] ✅ Using single repaired body ({len(result_mesh.faces)} faces)")
                                    else:
                                        # Combine multiple repaired bodies (all kept)
                                        print(f"[Boolean Script] Combining {len(repaired_bodies)} repaired bodies...")
                                        result_mesh = trimesh.util.concatenate(repaired_bodies)
                                        print(f"[Boolean Script] ✅ Combined result has {len(result_mesh.faces)} faces")
                                else:
                                    print("[Boolean Script] ⚠️ No bodies had faces; using original result")
                                    
                            else:
                                print("[Boolean Script] Single body detected, performing enhanced repair...")
                                
                                # Enhanced repair for single body
                                for repair_cycle in range(5):
                                    print(f"[Boolean Script] Single body repair cycle {repair_cycle + 1}/5...")
                                    
                                    # Basic cleanup
                                    result_mesh.update_faces(result_mesh.nondegenerate_faces())
                                    result_mesh.update_faces(result_mesh.unique_faces())
                                    result_mesh.remove_unreferenced_vertices()
                                    
                                    # Fill holes aggressively
                                    result_mesh.fill_holes()
                                    
                                    # Fix normals multiple times
                                    result_mesh.fix_normals()
                                    result_mesh.fix_normals()  # Double fix
                                    
                                    # Additional cleanup
                                    result_mesh.update_faces(result_mesh.nondegenerate_faces())
                                    result_mesh.fix_normals()
                                    
                                    if result_mesh.is_watertight:
                                        print(f"[Boolean Script] ✅ Single body became watertight after cycle {repair_cycle + 1}!")
                                        break
                                    
                        except Exception as multi_body_error:
                            print(f"[Boolean Script] Multi-body analysis failed: {multi_body_error}")
                            print("[Boolean Script] Falling back to standard repair...")
                        
                        # Fallback to standard repair
                        for repair_cycle in range(5):
                            print(f"[Boolean Script] Fallback repair cycle {repair_cycle + 1}/5...")
                            
                            result_mesh.update_faces(result_mesh.nondegenerate_faces())
                            result_mesh.update_faces(result_mesh.unique_faces())
                            result_mesh.remove_unreferenced_vertices()
                            result_mesh.fill_holes()
                            result_mesh.fix_normals()
                            result_mesh.fix_normals()
                            
                            if result_mesh.is_watertight:
                                print(f"[Boolean Script] ✅ Fallback repair successful after cycle {repair_cycle + 1}!")
                                break
                        
                        try:
                            # Split into bodies and repair each individually
                            bodies = result_mesh.split()
                            print(f"[Boolean Script] Found {len(bodies)} bodies, repairing each individually...")
                            
                            repaired_bodies = []
                            for i, body in enumerate(bodies):
                                print(f"[Boolean Script] Repairing body {i+1}/{len(bodies)} with {len(body.faces)} faces...")
                                
                                # Repair individual body
                                for body_repair_cycle in range(3):
                                    body.update_faces(body.nondegenerate_faces())
                                    body.update_faces(body.unique_faces())
                                    body.remove_unreferenced_vertices()
                                    body.fill_holes()
                                    body.fix_normals()
                                    body.fix_normals()
                                    
                                    if body.is_watertight:
                                        print(f"[Boolean Script] ✅ Body {i+1} became watertight after cycle {body_repair_cycle + 1}")
                                        break
                                
                                # Keep any body with geometry (same as primary multi-body path) so we do not drop components
                                if len(body.faces) > 0:
                                    repaired_bodies.append(body)
                                    print(f"[Boolean Script] ✅ Body {i+1} kept after repair attempt ({len(body.faces)} faces, watertight={body.is_watertight})")
                                else:
                                    print(f"[Boolean Script] ⚠️ Body {i+1} empty after repair, discarding")
                            
                            # Combine all repaired bodies
                            if len(repaired_bodies) > 0:
                                if len(repaired_bodies) == 1:
                                    result_mesh = repaired_bodies[0]
                                    print(f"[Boolean Script] ✅ Using single repaired body ({len(result_mesh.faces)} faces)")
                                else:
                                    # Combine multiple repaired bodies
                                    print(f"[Boolean Script] Combining {len(repaired_bodies)} repaired bodies...")
                                    result_mesh = trimesh.util.concatenate(repaired_bodies)
                                    print(f"[Boolean Script] ✅ Combined result has {len(result_mesh.faces)} faces")
                            else:
                                print("[Boolean Script] ⚠️ No bodies could be repaired, using original result")
                                
                        except Exception as multi_body_error:
                            print(f"[Boolean Script] Multi-body repair failed: {multi_body_error}")
                            print("[Boolean Script] Using original result")
                    
                    print(f"[Boolean Script] Post-intersection repair complete. Watertight: {result_mesh.is_watertight}")
                    print(f"[Boolean Script] Final result: {len(result_mesh.faces)} faces, {len(result_mesh.vertices)} vertices")
                    
                    # Final validation check for intersection results
                    try:
                        final_volume = result_mesh.volume
                        final_bounds = result_mesh.bounds
                        final_center = result_mesh.centroid
                        
                        print(f"[Boolean Script] Final validation:")
                        print(f"  Volume: {final_volume:.6f}")
                        print(f"  Bounds: {final_bounds}")
                        print(f"  Center: {final_center}")
                        
                        # Check for suspicious results
                        if final_volume < 0.001:
                            print("[Boolean Script] ⚠️ WARNING: Very small volume detected, result may be corrupted")
                        if len(result_mesh.faces) < 10:
                            print("[Boolean Script] ⚠️ WARNING: Very few faces detected, result may be incomplete")
                            
                    except Exception as validation_error:
                        print(f"[Boolean Script] Could not perform final validation: {validation_error}")
                
            except Exception as intersect_error:
                print(f"[Boolean Script] Primary intersection failed: {intersect_error}", file=sys.stderr)
                
                # Method 2: Union then difference approach
                print("[Boolean Script] Trying union-difference fallback approach...")
                try:
                    # Union the meshes
                    union_mesh = model_mesh.union(logo_mesh)
                    print(f"[Boolean Script] Union successful. Union faces: {len(union_mesh.faces)}")
                    
                    # Calculate the difference: union - (model + logo - intersection)
                    # This is equivalent to intersection
                    model_only = model_mesh.difference(logo_mesh)
                    logo_only = logo_mesh.difference(model_mesh)
                    
                    # The intersection is: union - model_only - logo_only
                    temp_result = union_mesh.difference(model_only)
                    result_mesh = temp_result.difference(logo_only)
                    
                    print(f"[Boolean Script] Union-difference fallback successful. Result faces: {len(result_mesh.faces)}")
                    
                except Exception as fallback_error:
                    print(f"[Boolean Script] Union-difference fallback failed: {fallback_error}", file=sys.stderr)
                    
                    # Method 3: Simplified approach with convex hull
                    print("[Boolean Script] Trying convex hull fallback approach...")
                    try:
                        # Create convex hulls for both meshes
                        model_hull = model_mesh.convex_hull
                        logo_hull = logo_mesh.convex_hull
                        
                        # Intersect the convex hulls
                        hull_intersection = model_hull.intersection(logo_hull)
                        
                        # Use the convex hull intersection as a base
                        result_mesh = hull_intersection
                        print(f"[Boolean Script] Convex hull fallback successful. Result faces: {len(result_mesh.faces)}")
                        
                    except Exception as hull_error:
                        print(f"[Boolean Script] Convex hull fallback failed: {hull_error}", file=sys.stderr)
                        
                        # Method 4: Try simplified intersection with repaired meshes
                        print("[Boolean Script] Trying simplified intersection with repaired meshes...")
                        try:
                            # Create simplified versions of both meshes
                            model_simplified = model_mesh.simplify_quadratic_decimation(target_ratio=0.5)
                            logo_simplified = logo_mesh.simplify_quadratic_decimation(target_ratio=0.5)
                            
                            # Repair simplified meshes
                            model_simplified.fill_holes()
                            model_simplified.fix_normals()
                            logo_simplified.fill_holes()
                            logo_simplified.fix_normals()
                            
                            # Try intersection with simplified meshes
                            result_mesh = model_simplified.intersection(logo_simplified)
                            print(f"[Boolean Script] Simplified intersection successful. Result faces: {len(result_mesh.faces)}")
                            
                        except Exception as simplified_error:
                            print(f"[Boolean Script] Simplified intersection failed: {simplified_error}", file=sys.stderr)
                            
                            # Method 5: Return empty result
                            print("[Boolean Script] All intersection methods failed, returning empty result", file=sys.stderr)
                            return False
            
            # If result not watertight after all above, try VTKBOOL robust intersection then PyVista
            _overlap_empty = (result_mesh is None) or result_mesh.is_empty
            _overlap_bad_wt = (not _overlap_empty) and (not result_mesh.is_watertight)
            # Find Overlap (intersection): only use vtk/PyVista when the primary pipeline returned
            # *nothing*. Otherwise VTK often spews errors and fails on the same meshes Manifold fixed.
            if operation == "intersection":
                _need_ext_surface_fallback = _overlap_empty
            else:
                _need_ext_surface_fallback = _overlap_empty or (
                    not overlap_skip_blob_fallbacks and _overlap_bad_wt
                )
            if _need_ext_surface_fallback:
                print("[Boolean Script] Result empty (or non-watertight non-intersection). Trying vtkbool fallback...")
                vb = _vtkbool_intersection(model_file_path, logo_file_path)
                if vb is not None and not vb.is_empty:
                    result_mesh = vb
                    print(f"[Boolean Script] vtkbool fallback produced mesh. Faces: {len(result_mesh.faces)} Watertight={result_mesh.is_watertight}")
                else:
                    print("[Boolean Script] vtkbool fallback did not produce a valid result; trying PyVista...")
                    pv_result = _pyvista_intersection_fallback(model_file_path, logo_file_path)
                    if pv_result is not None and not pv_result.is_empty:
                        result_mesh = pv_result
                        print(f"[Boolean Script] PyVista fallback produced mesh. Faces: {len(result_mesh.faces)} Watertight={result_mesh.is_watertight}")
                        # quick post-repair
                        try:
                            for _ in range(3):
                                result_mesh.update_faces(result_mesh.nondegenerate_faces())
                                result_mesh.update_faces(result_mesh.unique_faces())
                                result_mesh.remove_unreferenced_vertices()
                                result_mesh.fill_holes()
                                result_mesh.fix_normals()
                                if result_mesh.is_watertight:
                                    break
                        except Exception:
                            pass
                    else:
                        print("[Boolean Script] PyVista fallback did not produce a valid result", file=sys.stderr)

            # As a final resort before voxel rebuild, attempt volumetric boolean AND
            if (result_mesh is None) or result_mesh.is_empty:
                print("[Boolean Script] Applying volumetric boolean intersection (shared grid fallback)...")
                volm = _volumetric_intersection(model_mesh, logo_mesh)
                if volm is not None and not volm.is_empty:
                    result_mesh = volm

            # If still empty or not watertight, try morphological volumetric AND (heavier but robust)
            if not STRICT_OVERLAP:
                _m_empty = (result_mesh is None) or result_mesh.is_empty
                _m_bad_wt = (not _m_empty) and (not result_mesh.is_watertight)
                if operation == "intersection":
                    _need_morph = _m_empty
                else:
                    _need_morph = _m_empty or (not overlap_skip_blob_fallbacks and _m_bad_wt)
                if _need_morph:
                    print("[Boolean Script] Applying morphological volumetric intersection (final robust fallback)...")
                    morph = _volumetric_morph_intersection(model_mesh, logo_mesh)
                    if morph is not None and not morph.is_empty:
                        result_mesh = morph

            # Check for plastic bag effect and enable STRICT mode if needed
            plastic_bag_detected = False
            if result_mesh and not result_mesh.is_empty:
                try:
                    # Check for suspicious volume ratios that indicate plastic bag effect
                    result_volume = abs(result_mesh.volume)
                    model_volume = abs(model_mesh.volume)
                    logo_volume = abs(logo_mesh.volume)
                    
                    print(f"[Boolean Script] Volume analysis for plastic bag detection:")
                    print(f"  Model volume: {model_volume:.3f}")
                    print(f"  Logo volume: {logo_volume:.3f}")
                    print(f"  Result volume: {result_volume:.3f}")
                    
                    # If result volume is much larger than logo volume, might be plastic bag
                    if logo_volume > 0 and result_volume > logo_volume * 2:  # Lower threshold
                        print(f"[Boolean Script] PLASTIC BAG EFFECT DETECTED!")
                        print(f"  Volume ratio (result/logo): {result_volume/logo_volume:.1f}x")
                        plastic_bag_detected = True
                    
                    # Check for thin surfaces (high surface area to volume ratio)
                    if result_volume > 0:
                        surface_area = result_mesh.area
                        sa_vol_ratio = surface_area / result_volume
                        print(f"[Boolean Script] Surface-to-volume ratio: {sa_vol_ratio:.1f}")
                        if sa_vol_ratio > 30:  # Lower threshold for more sensitive detection
                            print(f"[Boolean Script] HIGH SURFACE-TO-VOLUME RATIO DETECTED!")
                            plastic_bag_detected = True
                    
                    # Check for excessive body count (another sign of corruption)
                    try:
                        bodies = result_mesh.split()
                        if len(bodies) > 10:  # Too many small bodies
                            print(f"[Boolean Script] EXCESSIVE BODY COUNT DETECTED: {len(bodies)} bodies")
                            plastic_bag_detected = True
                    except Exception:
                        pass
                            
                except Exception as bag_check_error:
                    print(f"[Boolean Script] Could not check for plastic bag effect: {bag_check_error}")
            
            # STRICT mode can reshape multi-body intersection results.
            # For overlap debugging where body count parity matters, disable STRICT for intersection.
            use_strict_mode = (operation != 'intersection') and (STRICT_OVERLAP or plastic_bag_detected)
            if plastic_bag_detected:
                print("[Boolean Script] ⚠️ AUTO-ENABLING STRICT MODE due to plastic bag detection!")
            elif STRICT_OVERLAP:
                print("[Boolean Script] STRICT mode explicitly enabled")
            elif operation == 'intersection':
                print("[Boolean Script] STRICT mode disabled for intersection to preserve initial body count")
            else:
                print("[Boolean Script] STRICT mode not needed - result appears normal")
            
            # STRICT mode: per-body intersection to ensure 1:1 mapping with logo bodies
            if use_strict_mode:
                try:
                    print("[Boolean Script] STRICT mode enabled - performing per-body intersections to preserve all logo bodies...")
                    # Split logo into bodies
                    logo_bodies = logo_mesh.split()
                    combined = []
                    for idx, lb in enumerate(logo_bodies):
                        # Write temp files for model and each logo body
                        try:
                            # Ensure body volume orientation is positive if possible
                            try:
                                if hasattr(lb, 'volume') and float(lb.volume) <= 0:
                                    lb.faces[:, [1, 2]] = lb.faces[:, [2, 1]]
                                    lb.fix_normals()
                                    if float(lb.volume) <= 0:
                                        # Rebuild pathological thin/invalid bodies before per-body intersection.
                                        lb = _voxel_rebuild_watertight(lb)
                            except Exception:
                                pass
                            lb_path = _write_temp_mesh_ascii(lb)
                            model_path = model_file_path
                            vb = _vtkbool_intersection(model_path, lb_path)
                            if (vb is None) or vb.is_empty:
                                # Try trimesh intersection fallback for this body
                                try:
                                    if _HAS_MANIFOLD3D:
                                        vb = trimesh.boolean.intersection(
                                            [model_mesh, lb],
                                            engine='manifold',
                                            check_volume=False,
                                        )
                                    else:
                                        vb = model_mesh.intersection(lb)
                                except Exception:
                                    vb = None
                            if (vb is None) or vb.is_empty:
                                # Last resort: volumetric per-body intersection to avoid dropping thin bodies.
                                try:
                                    vb = _volumetric_intersection(model_mesh, lb)
                                except Exception:
                                    vb = None
                            if vb is not None and not vb.is_empty and len(vb.faces) > 0:
                                # Minimal cleanup only; no voxel/hull in STRICT mode
                                try:
                                    vb.update_faces(vb.nondegenerate_faces())
                                    vb.update_faces(vb.unique_faces())
                                    vb.remove_unreferenced_vertices()
                                    vb.fix_normals()
                                except Exception:
                                    pass
                                combined.append(vb)
                        except Exception as per_body_err:
                            print(f"[Boolean Script] Per-body intersection failed for body {idx+1}: {per_body_err}")
                            continue
                    if len(combined) > 0:
                        result_mesh = trimesh.util.concatenate(combined)
                        print(f"[Boolean Script] STRICT per-body combine complete. Faces: {len(result_mesh.faces)}")
                        # Mild per-body sealing pass to avoid shell/zero-thickness artifacts
                        # while still preserving multi-body topology.
                        try:
                            strict_bodies = result_mesh.split()
                            sealed_bodies = []
                            for sidx, sb in enumerate(strict_bodies):
                                strict_original_faces = len(sb.faces)
                                wb = sb.copy()
                                for _ in range(2):
                                    wb.update_faces(wb.nondegenerate_faces())
                                    wb.update_faces(wb.unique_faces())
                                    wb.remove_unreferenced_vertices()
                                    wb.fill_holes()
                                    wb.fix_normals()
                                    if wb.is_watertight:
                                        break
                                if (not wb.is_watertight) and len(wb.faces) > 0:
                                    try:
                                        wb = _voxel_rebuild_watertight(wb)
                                    except Exception:
                                        pass
                                if len(wb.faces) > 0:
                                    strict_retained_faces = len(wb.faces)
                                    strict_retention_ratio = (
                                        strict_retained_faces / strict_original_faces
                                    ) if strict_original_faces > 0 else 0.0
                                    strict_at_risk = (strict_retention_ratio < 0.35) or (strict_retained_faces < 120)
                                    sealed_bodies.append(wb)
                                    print(
                                        f"[Boolean Script] STRICT body {sidx+1}/{len(strict_bodies)} kept "
                                        f"({strict_retained_faces} faces, retention={strict_retention_ratio:.3f}, "
                                        f"at_risk={strict_at_risk})"
                                    )
                                    if strict_at_risk:
                                        print(
                                            f"[Boolean Script] ⚠️ STRICT body {sidx+1} predicted unstable after sealing."
                                        )
                                else:
                                    print(
                                        f"[Boolean Script] ⚠️ STRICT body {sidx+1}/{len(strict_bodies)} dropped "
                                        f"(0 faces after sealing)."
                                    )
                            if len(sealed_bodies) > 0:
                                result_mesh = trimesh.util.concatenate(sealed_bodies) if len(sealed_bodies) > 1 else sealed_bodies[0]
                                print(f"[Boolean Script] STRICT sealing pass complete. Bodies kept: {len(sealed_bodies)}/{len(strict_bodies)}")
                        except Exception as strict_seal_error:
                            print(f"[Boolean Script] STRICT sealing pass failed: {strict_seal_error}")
                        # In STRICT mode, skip aggressive rebuilds to preserve individual bodies
                        print("[Boolean Script] STRICT mode: Skipping voxel rebuild to preserve multiple bodies")
                        # Just do minimal cleanup
                        try:
                            result_mesh.update_faces(result_mesh.nondegenerate_faces())
                            result_mesh.remove_unreferenced_vertices()
                            result_mesh.fix_normals()
                            print(f"[Boolean Script] STRICT mode final: {len(result_mesh.faces)} faces, {len(result_mesh.vertices)} vertices")
                        except Exception:
                            pass
                        # Save and exit early to avoid aggressive post-processing
                        print("[Boolean Script] STRICT mode: Proceeding to save result...")
                        # Skip all post-processing in strict mode
                        goto_save = True
                except Exception as strict_err:
                    print(f"[Boolean Script] STRICT mode failed: {strict_err}")

            # As a final resort, rebuild via voxelization to guarantee watertightness
            # Skip this in strict mode to preserve multiple bodies
            if (
                not STRICT_OVERLAP
                and not goto_save
                and result_mesh is not None
                and not result_mesh.is_empty
                and not result_mesh.is_watertight
                and not overlap_skip_blob_fallbacks
            ):
                print("[Boolean Script] Applying voxel-based watertight rebuild (final fallback)...")
                result_mesh = _voxel_rebuild_watertight(result_mesh)
            elif (
                overlap_skip_blob_fallbacks
                and result_mesh is not None
                and not result_mesh.is_empty
                and not result_mesh.is_watertight
            ):
                print(
                    "[Boolean Script] Conservative intersection: skipping final voxel rebuild "
                    "(non-watertight overlap preview is OK)."
                )

            # Log intersection result details
            if result_mesh and not result_mesh.is_empty:
                try:
                    intersection_bbox = result_mesh.bounds
                    intersection_center = result_mesh.centroid
                    print(f"[Boolean Script] Regular intersection bounds: {intersection_bbox}")
                    print(f"[Boolean Script] Regular intersection center: {intersection_center}")
                    print(f"[Boolean Script] Regular intersection Z range: {intersection_bbox[0][2]:.3f} to {intersection_bbox[1][2]:.3f}")
                except Exception as bbox_error:
                    print(f"[Boolean Script] Could not calculate intersection bounding box: {bbox_error}")
            else:
                print("[Boolean Script] Intersection resulted in empty mesh", file=sys.stderr)
                return False
                
        elif operation == 'thin_intersection':
            print(f"[Boolean Script] Performing thin intersection with {thickness_delta}mm thinning using Trimesh...")
            operation_name = "thin intersection"
            
            # Correct three-stage thin intersection process
            result_mesh = None
            
            print(f"[Boolean Script] Stage 1: Finding overlapping regions between logo and model...")
            try:
                # Stage 1: Get regular intersection (model ∩ logo)
                stage1_result = model_mesh.intersection(logo_mesh)
                print(f"[Boolean Script] Stage 1 complete. Intersection result faces: {len(stage1_result.faces)}")
                
                if stage1_result.is_empty or len(stage1_result.faces) == 0:
                    print("[Boolean Script] Stage 1 resulted in empty intersection - no overlap between logo and model", file=sys.stderr)
                    return False
                
                # Validate and repair stage 1 result
                print("[Boolean Script] Stage 1 validation and repair...")
                try:
                    stage1_result.update_faces(stage1_result.nondegenerate_faces())
                    stage1_result.remove_unreferenced_vertices()
                    stage1_result.fix_normals()
                    
                    # Check volume
                    stage1_volume = stage1_result.volume
                    print(f"[Boolean Script] Stage 1 volume: {stage1_volume:.6f}")
                    
                    if stage1_volume <= 0:
                        print("[Boolean Script] Stage 1 has negative volume, attempting fix...")
                        stage1_result.faces[:, [1, 2]] = stage1_result.faces[:, [2, 1]]
                        stage1_result.fix_normals()
                        stage1_volume = stage1_result.volume
                        print(f"[Boolean Script] Stage 1 volume after fix: {stage1_volume:.6f}")
                    
                    if not stage1_result.is_watertight:
                        print("[Boolean Script] Stage 1 result not watertight, attempting repair...")
                        stage1_result.fill_holes()
                        stage1_result.fix_normals()
                        
                except Exception as stage1_repair_error:
                    print(f"[Boolean Script] Stage 1 repair failed: {stage1_repair_error}")
                
                # Log stage 1 bounds
                stage1_bounds = stage1_result.bounds
                print(f"[Boolean Script] Stage 1 bounds: Z range {stage1_bounds[0][2]:.3f} to {stage1_bounds[1][2]:.3f}")
                
                print(f"[Boolean Script] Stage 2: Moving model inward by {thickness_delta}mm...")
                
                # Stage 2: Create model copy moved inward by thickness_delta
                model_moved = model_mesh.copy()
                translation_matrix = np.eye(4)
                translation_matrix[2, 3] = -thickness_delta  # Move in negative Z (inward)
                model_moved.apply_transform(translation_matrix)
                
                # Validate moved model
                try:
                    model_moved_volume = model_moved.volume
                    print(f"[Boolean Script] Stage 2 moved model volume: {model_moved_volume:.6f}")
                    
                    if model_moved_volume <= 0:
                        print("[Boolean Script] Moved model has negative volume, attempting fix...")
                        model_moved.faces[:, [1, 2]] = model_moved.faces[:, [2, 1]]
                        model_moved.fix_normals()
                        model_moved_volume = model_moved.volume
                        print(f"[Boolean Script] Moved model volume after fix: {model_moved_volume:.6f}")
                        
                except Exception as moved_model_error:
                    print(f"[Boolean Script] Could not validate moved model: {moved_model_error}")
                
                # Log moved model bounds
                moved_bounds = model_moved.bounds
                print(f"[Boolean Script] Stage 2 moved model bounds: Z range {moved_bounds[0][2]:.3f} to {moved_bounds[1][2]:.3f}")
                
                print(f"[Boolean Script] Stage 3: Finding intersection between stage 1 result and moved model...")
                
                # Stage 3: Intersect stage 1 result with moved model
                result_mesh = stage1_result.intersection(model_moved)
                print(f"[Boolean Script] Stage 3 complete. Final thin intersection faces: {len(result_mesh.faces)}")
                
                if result_mesh.is_empty or len(result_mesh.faces) == 0:
                    print("[Boolean Script] Stage 3 resulted in empty intersection - thickness_delta may be too large", file=sys.stderr)
                    
                    # Try with smaller thickness_delta
                    print(f"[Boolean Script] Retrying with half thickness_delta ({thickness_delta/2:.1f}mm)...")
                    model_moved = model_mesh.copy()
                    translation_matrix = np.eye(4)
                    translation_matrix[2, 3] = -thickness_delta / 2
                    model_moved.apply_transform(translation_matrix)
                    
                    result_mesh = stage1_result.intersection(model_moved)
                    
                    if result_mesh.is_empty or len(result_mesh.faces) == 0:
                        print("[Boolean Script] Even with reduced thickness_delta, no thin intersection possible", file=sys.stderr)
                        return False
                    else:
                        print(f"[Boolean Script] Reduced thickness successful. Final faces: {len(result_mesh.faces)}")
                
            except Exception as thin_error:
                print(f"[Boolean Script] Three-stage thin intersection failed: {thin_error}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                
                # Fallback Method 1: Try the old simplified method
                print("[Boolean Script] Fallback 1: Trying simplified model translation method...")
                try:
                    model_copy = model_mesh.copy()
                    translation_matrix = np.eye(4)
                    translation_matrix[2, 3] = -thickness_delta
                    model_copy.apply_transform(translation_matrix)
                    
                    result_mesh = model_copy.intersection(logo_mesh)
                    print(f"[Boolean Script] Fallback 1 successful. Result faces: {len(result_mesh.faces)}")
                    
                except Exception as fallback1_error:
                    print(f"[Boolean Script] Fallback 1 failed: {fallback1_error}", file=sys.stderr)
                    
                    # Fallback Method 2: Try logo translation method
                    print("[Boolean Script] Fallback 2: Trying logo translation method...")
                    try:
                        logo_copy = logo_mesh.copy()
                        translation_matrix = np.eye(4)
                        translation_matrix[2, 3] = thickness_delta  # Move logo forward
                        logo_copy.apply_transform(translation_matrix)
                        
                        result_mesh = model_mesh.intersection(logo_copy)
                        print(f"[Boolean Script] Fallback 2 successful. Result faces: {len(result_mesh.faces)}")
                        
                    except Exception as fallback2_error:
                        print(f"[Boolean Script] Fallback 2 failed: {fallback2_error}", file=sys.stderr)
                        
                        # Fallback Method 3: Try scaling approach
                        print("[Boolean Script] Fallback 3: Trying scaling approach...")
                        try:
                            # Get regular intersection first
                            regular_intersection = model_mesh.intersection(logo_mesh)
                            
                            # Scale it to make it thinner
                            scale_factor = max(0.3, 1.0 - (thickness_delta / 10.0))  # Adaptive scaling
                            scale_matrix = np.eye(4)
                            scale_matrix[2, 2] = scale_factor  # Only scale in Z direction
                            
                            result_mesh = regular_intersection.copy()
                            result_mesh.apply_transform(scale_matrix)
                            
                            print(f"[Boolean Script] Fallback 3 successful with {scale_factor:.2f} Z-scaling. Result faces: {len(result_mesh.faces)}")
                            
                        except Exception as fallback3_error:
                            print(f"[Boolean Script] Fallback 3 failed: {fallback3_error}", file=sys.stderr)
                            
                            # Final fallback: return regular intersection
                            print("[Boolean Script] Final fallback: Using regular intersection as thin intersection...")
                            try:
                                result_mesh = model_mesh.intersection(logo_mesh)
                                print(f"[Boolean Script] Final fallback successful. Result faces: {len(result_mesh.faces)}")
                            except Exception as final_error:
                                print(f"[Boolean Script] All thin intersection methods failed: {final_error}", file=sys.stderr)
                                return False
            
            # Log thin intersection result details
            if result_mesh and not result_mesh.is_empty:
                try:
                    thin_bbox = result_mesh.bounds
                    thin_center = result_mesh.centroid
                    print(f"[Boolean Script] Thin intersection bounds: {thin_bbox}")
                    print(f"[Boolean Script] Thin intersection center: {thin_center}")
                    print(f"[Boolean Script] Thin intersection Z range: {thin_bbox[0][2]:.3f} to {thin_bbox[1][2]:.3f}")
                except Exception as bbox_error:
                    print(f"[Boolean Script] Could not calculate thin intersection bounding box: {bbox_error}")
            else:
                print("[Boolean Script] Thin intersection resulted in empty mesh", file=sys.stderr)
                return False
                
        else:  # default to subtraction
            print("[Boolean Script] Performing boolean difference (model MINUS logo) using Trimesh...")
            operation_name = "subtraction"
            
            try:
                result_mesh = model_mesh.difference(logo_mesh)
            except ValueError as volume_error:
                if "Not all meshes are volumes" in str(volume_error):
                    print(f"[Boolean Script] Volume error in subtraction, attempting repair approach: {volume_error}", file=sys.stderr)
                    
                    # Alternative approach 1: Try to repair logo mesh to make it watertight
                    print("[Boolean Script] Attempting to repair logo mesh for subtraction...")
                    try:
                        # More aggressive repair for logo mesh
                        logo_mesh.update_faces(logo_mesh.nondegenerate_faces())
                        logo_mesh.update_faces(logo_mesh.unique_faces())
                        logo_mesh.remove_unreferenced_vertices()
                        
                        # Fill holes and fix normals
                        logo_mesh.fill_holes()
                        logo_mesh.fix_normals()
                        
                        # Try subtraction again after repair
                        result_mesh = model_mesh.difference(logo_mesh)
                        print("[Boolean Script] Subtraction completed using logo mesh repair approach")
                        
                    except Exception as repair_error:
                        print(f"[Boolean Script] Logo mesh repair failed: {repair_error}", file=sys.stderr)
                        
                        # Alternative approach 2: Use union with minimal mesh to force watertightness
                        print("[Boolean Script] Attempting union-based repair for subtraction...")
                        try:
                            # Create a minimal mesh to union with logo
                            min_vertices = np.array([[0, 0, 0], [0.01, 0, 0], [0, 0.01, 0]])
                            min_faces = np.array([[0, 1, 2]])
                            min_mesh = trimesh.Trimesh(vertices=min_vertices, faces=min_faces)
                            
                            # Union logo with minimal mesh to force watertightness
                            logo_repaired = logo_mesh.union(min_mesh)
                            
                            # Try subtraction with repaired logo
                            result_mesh = model_mesh.difference(logo_repaired)
                            print("[Boolean Script] Subtraction completed using union-based repair")
                            
                        except Exception as union_error:
                            print(f"[Boolean Script] Union-based repair failed: {union_error}", file=sys.stderr)
                            
                            # Alternative approach 3: Return error instead of corrupted geometry
                            print("[Boolean Script] All repair attempts failed, subtraction cannot be performed safely", file=sys.stderr)
                            print("[Boolean Script] Error: Cannot perform subtraction with non-manifold geometry", file=sys.stderr)
                            return False  # Indicate failure rather than return corrupted geometry
                else:
                    # Re-raise if it's a different error
                    raise volume_error
            
        print(f"[Boolean Script] Boolean {operation_name} complete. Result Faces: {len(result_mesh.faces)}, Vertices: {len(result_mesh.vertices)}")

        # --- Check if the result is empty ---
        if result_mesh.is_empty or len(result_mesh.faces) == 0:
            print(f"[Boolean Script] Error: Trimesh boolean {operation_name} resulted in an empty mesh.", file=sys.stderr)
            return False # Indicate failure
        # --- End Check ---

        # For intersection output, preserve the per-body repaired result as-is.
        # The global post-repair stage below can collapse or remove small components
        # (observed in logs as body-count drops, e.g. 18 -> 11/13).
        if operation == 'intersection':
            goto_save = True
            print("[Boolean Script] Intersection mode: skipping global post-repair to preserve body count and component separation.")

        # --- Enhanced Post-repair result with Multi-Body Handling ---
        print("[Boolean Script] Enhanced post-repairing result to ensure watertight geometry...")
        try:
            print(f"[Boolean Script] Pre-post-repair state - Watertight: {result_mesh.is_watertight}")
            
            # Log detailed geometry information before repair
            print(f"[Boolean Script] Pre-repair geometry details:")
            print(f"  Faces: {len(result_mesh.faces)}")
            print(f"  Vertices: {len(result_mesh.vertices)}")
            print(f"  Volume: {result_mesh.volume:.6f}")
            print(f"  Bounds: {result_mesh.bounds}")
            print(f"  Centroid: {result_mesh.centroid}")
            
            # Check for multiple bodies and handle them
            try:
                bodies = result_mesh.split()
                if len(bodies) > 1:
                    print(f"[Boolean Script] Result has {len(bodies)} bodies, analyzing...")
                    
                    if operation == "intersection":
                        print("[Boolean Script] Intersection: keeping all result bodies (no largest-body discard)")
                    else:
                        # Find the largest body
                        largest_body = max(bodies, key=lambda b: len(b.faces))
                        largest_face_count = len(largest_body.faces)
                        total_face_count = len(result_mesh.faces)
                        
                        print(f"[Boolean Script] Largest body has {largest_face_count} faces out of {total_face_count} total")
                        
                        # If largest body is significant (>80% of faces), use it
                        if largest_face_count > total_face_count * 0.8:
                            print("[Boolean Script] Using largest body as primary result")
                            result_mesh = largest_body
                        else:
                            print(f"[Boolean Script] Warning: Largest body only {largest_face_count/total_face_count*100:.1f}% of total faces")
                        
            except Exception as split_error:
                print(f"[Boolean Script] Could not analyze bodies: {split_error}")
            
            # Check for specific geometry issues
            try:
                # Check for degenerate faces
                degenerate_faces = result_mesh.nondegenerate_faces()
                if len(degenerate_faces) != len(result_mesh.faces):
                    print(f"  ⚠️ Found {len(result_mesh.faces) - len(degenerate_faces)} degenerate faces")
                
                # Check for duplicate faces
                unique_faces = result_mesh.unique_faces()
                if len(unique_faces) != len(result_mesh.faces):
                    print(f"  ⚠️ Found {len(result_mesh.faces) - len(unique_faces)} duplicate faces")
                
                # Skip vertex_defects indexing — trimesh versions disagree and it raised IndexError.
                    
            except Exception as check_error:
                print(f"  ⚠️ Could not perform detailed geometry checks: {check_error}")
            
            # Enhanced aggressive cleanup cycles to ensure watertight result
            # Skip aggressive post-repair in strict mode to preserve multiple bodies
            if not goto_save:
                for cycle in range(5):  # Increased to 5 cycles
                    print(f"[Boolean Script] Post-repair cycle {cycle + 1}/5...")
                    
                    # Multiple repair passes per cycle with enhanced methods
                    for pass_num in range(5):  # 5 passes per cycle
                        # Basic cleanup
                        result_mesh.update_faces(result_mesh.nondegenerate_faces())
                        result_mesh.update_faces(result_mesh.unique_faces())
                        result_mesh.remove_unreferenced_vertices()
                        
                        # Fill holes aggressively
                        result_mesh.fill_holes()
                        
                        # Fix normals multiple times
                        result_mesh.fix_normals()
                        result_mesh.fix_normals()  # Double fix
                        
                        # Additional aggressive cleanup
                        result_mesh.update_faces(result_mesh.nondegenerate_faces())
                        result_mesh.fix_normals()
                        
                        # Try to remove any remaining issues
                        try:
                            result_mesh.remove_duplicate_faces()
                            result_mesh.remove_duplicate_vertices()
                        except:
                            pass  # These methods might not exist in all trimesh versions
                        
                        # Try to ensure consistent winding
                        try:
                            result_mesh.fix_normals()
                        except:
                            pass
                    
                    print(f"[Boolean Script] Cycle {cycle + 1} complete. Watertight: {result_mesh.is_watertight}")
                    
                    if result_mesh.is_watertight:
                        print(f"[Boolean Script] ✅ Result became watertight after cycle {cycle + 1}!")
                        break
            else:
                print("[Boolean Script] Skipping aggressive post-repair in strict mode to preserve multiple bodies")
            
            # Only do aggressive post-repair if not in strict mode
            if not goto_save:
                # Final attempt to make watertight if still not
                if not result_mesh.is_watertight:
                    print("[Boolean Script] Final aggressive repair attempt...")
                    try:
                        # Try to fix any remaining issues
                        result_mesh.update_faces(result_mesh.nondegenerate_faces())
                        result_mesh.fix_normals()
                        
                        # Try to ensure consistent winding
                        try:
                            result_mesh.fix_normals()
                            result_mesh.fix_normals()  # Triple fix for stubborn cases
                        except:
                            pass
                            
                        print(f"[Boolean Script] Final repair attempt complete. Watertight: {result_mesh.is_watertight}")
                    except Exception as final_error:
                        print(f"[Boolean Script] Final repair attempt failed: {final_error}")
                
                # Strict finalization: keep only watertight, significant-volume bodies; otherwise fall back morphologically
                try:
                    bodies = result_mesh.split()
                    repaired_bodies = []
                    for i, body in enumerate(bodies):
                        try:
                            # Aggressive multi-pass repair per body
                            for _ in range(4):
                                body.update_faces(body.nondegenerate_faces())
                                body.update_faces(body.unique_faces())
                                body.remove_unreferenced_vertices()
                                body.fill_holes()
                                body.fix_normals()
                                if body.is_watertight:
                                    break
                            # Voxel rebuild
                            if not body.is_watertight:
                                body = _voxel_rebuild_watertight(body)
                            # Morphological repair
                            if not body.is_watertight:
                                body = _mesh_morphological_repair(body)
                            # Convex hull as ultimate per-body fallback
                            if not body.is_watertight:
                                try:
                                    body = body.convex_hull
                                except Exception:
                                    pass
                            # Validate minimal face count (avoid zero geometry)
                            if len(body.faces) > 0:
                                repaired_bodies.append(body)
                        except Exception as e:
                            print(f"[Boolean Script] Body {i+1} finalize warning: {e}")
                    if len(repaired_bodies) == 0:
                        print("[Boolean Script] No bodies after finalization; using morphological volumetric fallback result...")
                        morph = _volumetric_morph_intersection(model_mesh, logo_mesh)
                        if morph is not None and not morph.is_empty:
                            result_mesh = morph
                    elif len(repaired_bodies) == 1:
                        result_mesh = repaired_bodies[0]
                    else:
                        # Combine ALL repaired bodies so none are dropped
                        result_mesh = trimesh.util.concatenate(repaired_bodies)
                except Exception as e:
                    print(f"[Boolean Script] Strict finalization failed: {e}")

                # If still not watertight, try voxel rebuild before export (guarantee)
                if not result_mesh.is_watertight:
                    print("[Boolean Script] Still not watertight after finalization — voxel rebuild before export...")
                    result_mesh = _voxel_rebuild_watertight(result_mesh)

                # Log detailed geometry information after repair
                print(f"[Boolean Script] Post-repair geometry details:")
                print(f"  Faces: {len(result_mesh.faces)}")
                print(f"  Vertices: {len(result_mesh.vertices)}")
                print(f"  Volume: {result_mesh.volume:.6f}")
                print(f"  Bounds: {result_mesh.bounds}")
                print(f"  Centroid: {result_mesh.centroid}")
                
                print(f"[Boolean Script] Post-repair complete. Final Faces: {len(result_mesh.faces)}, Vertices: {len(result_mesh.vertices)}")
                print(f"[Boolean Script] Post-repair state - Watertight: {result_mesh.is_watertight}")
                
                # Check watertight status
                if result_mesh.is_watertight:
                    print("[Boolean Script] ✅ Result is watertight!")
                else:
                    print("[Boolean Script] ⚠️ Result is not watertight, but proceeding with export...")
            else:
                print("[Boolean Script] Strict mode: Skipping all aggressive post-repair to preserve multiple bodies")
                
        except Exception as repair_err:
            print(f"[Boolean Script] Warning: Error during post-repair: {repair_err}", file=sys.stderr)
        # --- End Post-repair ---

        # --- Save Result --- 
        print(f"[Boolean Script] Saving result mesh to {output_file_path}")
        # Save as ASCII STL 
        result_mesh.export(output_file_path, file_type='stl_ascii')
        print(f"[Boolean Script] Result saved successfully.")
        
        return True # Indicate success

    except Exception as e:
        print(f"[Boolean Script] Error during Trimesh {operation} operation: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False # Indicate failure

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Perform STL boolean operations using Trimesh.')
    parser.add_argument('model_stl', help='Path to the input model STL file.')
    parser.add_argument('logo_stl', help='Path to the input logo STL file.')
    parser.add_argument('output_stl', help='Path to save the output STL file.')
    parser.add_argument('--operation', choices=['subtraction', 'intersection', 'thin_intersection'], default='subtraction',
                        help='Boolean operation to perform (default: subtraction)')
    parser.add_argument('--thickness-delta', type=float, default=2.0,
                        help='Thickness delta in mm for thin_intersection operation (default: 2.0)')
    
    args = parser.parse_args()
    
    print(f"[Boolean Script] Starting Trimesh {args.operation}: Model='{args.model_stl}', Logo='{args.logo_stl}', Output='{args.output_stl}'")

    thickness_delta = args.thickness_delta
    success = boolean_operation(args.model_stl, args.logo_stl, args.output_stl, args.operation, thickness_delta)
    
    if success:
        print(f"[Boolean Script] Trimesh {args.operation} script finished successfully.")
        sys.exit(0)
    else:
        print(f"[Boolean Script] Trimesh {args.operation} script failed.", file=sys.stderr)
        sys.exit(1) 
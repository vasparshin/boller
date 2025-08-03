# SCRIPT_VERSION: 1.0.104
import argparse
import sys
import trimesh
import pyvista as pv
import numpy as np
from pymeshfix import MeshFix

def heal_mesh(mesh_trimesh, operation_name=""):
    """Heals a Trimesh object using PyMeshFix."""
    if not isinstance(mesh_trimesh, trimesh.Trimesh) or mesh_trimesh.is_empty:
        print(f"[Heal Mesh] Invalid or empty mesh for '{operation_name}'. Skipping.", file=sys.stderr)
        return mesh_trimesh
    print(f"[Heal Mesh] Healing '{operation_name}'. Faces: {len(mesh_trimesh.faces)}")
    try:
        meshfix = MeshFix(mesh_trimesh.vertices, mesh_trimesh.faces)
        meshfix.repair(verbose=False)
        healed_mesh = trimesh.Trimesh(vertices=meshfix.v, faces=meshfix.f)
        print(f"[Heal Mesh] Healing for '{operation_name}' complete. Faces: {len(healed_mesh.faces)}")
        return healed_mesh
    except Exception as e:
        print(f"[Heal Mesh] CRITICAL: PyMeshFix failed for '{operation_name}': {e}", file=sys.stderr)
        return mesh_trimesh

def convert_to_pyvista(mesh_trimesh):
    """Converts a Trimesh object to a PyVista PolyData object."""
    if mesh_trimesh is None or not hasattr(mesh_trimesh, 'vertices') or not hasattr(mesh_trimesh, 'faces'):
        return None
    return pv.PolyData(mesh_trimesh.vertices, np.hstack((np.full((len(mesh_trimesh.faces), 1), 3), mesh_trimesh.faces)))

def convert_to_trimesh(mesh_pyvista):
    """Converts a PyVista PolyData object back to a Trimesh object."""
    if mesh_pyvista is None or mesh_pyvista.n_points == 0 or mesh_pyvista.n_cells == 0:
        return trimesh.Trimesh()
    return trimesh.Trimesh(vertices=mesh_pyvista.points, faces=mesh_pyvista.faces.reshape(-1, 4)[:, 1:])

def boolean_operation_trimesh(model_mesh, logo_mesh, operation):
    """Attempts a boolean operation using Trimesh, returns None on failure."""
    print(f"[Trimesh Engine] Attempting {operation}...")
    try:
        if operation == 'intersection':
            result = model_mesh.intersection(logo_mesh)
        elif operation == 'difference':
            result = model_mesh.difference(logo_mesh)
        else:
            return None
        if result is None or result.is_empty:
            print("[Trimesh Engine] Result is empty or None.")
            return None
        return result
    except Exception as e:
        print(f"[Trimesh Engine] Failed with error: {e}", file=sys.stderr)
        return None

def boolean_operation_pyvista(model_mesh_pv, logo_mesh_pv, operation):
    """Attempts a boolean operation using PyVista."""
    print(f"[PyVista Engine] Attempting {operation}...")
    try:
        if operation == 'intersection':
            return model_mesh_pv.boolean_intersection(logo_mesh_pv)
        elif operation == 'difference':
            return model_mesh_pv.boolean_difference(logo_mesh_pv)
    except Exception as e:
        print(f"[PyVista Engine] Failed with error: {e}", file=sys.stderr)
    return None

def boolean_operation(model_file_path, logo_file_path, output_file_path, operation='subtraction', thickness_delta=1.0):
    try:
        model_mesh = heal_mesh(trimesh.load_mesh(model_file_path, force='mesh'), "initial_model")
        logo_mesh = heal_mesh(trimesh.load_mesh(logo_file_path, force='mesh'), "initial_logo")

        final_mesh = None
        
        if operation == 'thin_intersection':
            print("--- Starting Thin Intersection ---")
            # Stage 1
            print("\n[Stage 1] Performing initial intersection...")
            stage1_result_trimesh = boolean_operation_trimesh(model_mesh, logo_mesh, 'intersection')
            if stage1_result_trimesh is None:
                print("[Stage 1] Trimesh failed. Retrying with PyVista...")
                model_pv = convert_to_pyvista(model_mesh)
                logo_pv = convert_to_pyvista(logo_mesh)
                stage1_result_pv = boolean_operation_pyvista(model_pv, logo_pv, 'intersection')
                stage1_result_trimesh = convert_to_trimesh(stage1_result_pv)

            if stage1_result_trimesh is None or stage1_result_trimesh.is_empty:
                print("[Stage 1] Both engines failed. Aborting.", file=sys.stderr)
                return False
            
            stage1_healed = heal_mesh(stage1_result_trimesh, "stage1_result")

            # Stage 2
            print("\n[Stage 2] Creating offset model...")
            model_offset = model_mesh.copy()
            model_offset.apply_transform(trimesh.transformations.translation_matrix([0, 0, thickness_delta]))
            model_offset_healed = heal_mesh(model_offset, "stage2_offset_model")

            # Stage 3
            print("\n[Stage 3] Performing final intersection...")
            final_mesh = boolean_operation_trimesh(stage1_healed, model_offset_healed, 'intersection')
            if final_mesh is None:
                print("[Stage 3] Trimesh failed. Retrying with PyVista...")
                stage1_healed_pv = convert_to_pyvista(stage1_healed)
                model_offset_healed_pv = convert_to_pyvista(model_offset_healed)
                final_mesh_pv = boolean_operation_pyvista(stage1_healed_pv, model_offset_healed_pv, 'intersection')
                final_mesh = convert_to_trimesh(final_mesh_pv)

            if final_mesh is None or final_mesh.is_empty:
                print("[Stage 3] Both engines failed. Aborting.", file=sys.stderr)
                return False
        else:
            # Handle simple intersection and subtraction
            op_type = 'intersection' if operation == 'intersection' else 'difference'
            print(f"--- Starting Simple {op_type.capitalize()} ---")
            final_mesh = boolean_operation_trimesh(model_mesh, logo_mesh, op_type)
            if final_mesh is None:
                print(f"[Trimesh Engine] Failed for {op_type}. Retrying with PyVista...")
                model_pv = convert_to_pyvista(model_mesh)
                logo_pv = convert_to_pyvista(logo_mesh)
                final_mesh_pv = boolean_operation_pyvista(model_pv, logo_pv, op_type)
                final_mesh = convert_to_trimesh(final_mesh_pv)

        # Final validation and save
        if final_mesh is None or final_mesh.is_empty:
            print(f"Error: Final result for operation '{operation}' is empty after all attempts.", file=sys.stderr)
            return False

        final_healed_mesh = heal_mesh(final_mesh, "final_result")
        if final_healed_mesh.is_empty:
            print("Error: Mesh is empty after final healing.", file=sys.stderr)
            return False

        print(f"Saving final mesh to {output_file_path}")
        final_healed_mesh.export(output_file_path, file_type='stl_ascii')
        return True

    except Exception as e:
        print(f"A critical unexpected error occurred in boolean_operation: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False

if __name__ == "__main__":
    try:
        with open(__file__, 'r') as f:
            first_line = f.readline().strip()
            if "SCRIPT_VERSION" in first_line:
                print(f"[Boolean Script] Running {first_line}")
    except: pass
        
    parser = argparse.ArgumentParser(description='Perform STL boolean operations using Trimesh and PyVista.')
    parser.add_argument('model_stl', help='Path to the input model STL file.')
    parser.add_argument('logo_stl', help='Path to the input logo STL file.')
    parser.add_argument('output_stl', help='Path to save the output STL file.')
    parser.add_argument('--operation', choices=['subtraction', 'intersection', 'thin_intersection'], default='subtraction')
    parser.add_argument('--thickness-delta', type=float, default=1.0)
    
    args = parser.parse_args()
    
    success = boolean_operation(
        model_file_path=args.model_stl,
        logo_file_path=args.logo_stl,
        output_file_path=args.output_stl,
        operation=args.operation,
        thickness_delta=args.thickness_delta
    )

    if success:
        print(f"Script finished successfully.")
        sys.exit(0)
    else:
        print(f"Script failed.", file=sys.stderr)
        sys.exit(1)

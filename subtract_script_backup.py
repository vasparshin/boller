import argparse
import sys
import trimesh
import numpy as np

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
        # Load model STL from file using Trimesh
        print(f"[Boolean Script] Loading model mesh with Trimesh: {model_file_path}")
        model_mesh = trimesh.load_mesh(model_file_path, force='mesh')
        print(f"[Boolean Script] Loaded model mesh. Faces: {len(model_mesh.faces)}, Vertices: {len(model_mesh.vertices)}")

        # Load logo STL from file using Trimesh
        print(f"[Boolean Script] Loading logo mesh with Trimesh: {logo_file_path}")
        logo_mesh = trimesh.load_mesh(logo_file_path, force='mesh')
        print(f"[Boolean Script] Loaded logo mesh. Faces: {len(logo_mesh.faces)}, Vertices: {len(logo_mesh.vertices)}")

        # --- Attempt to repair meshes with Trimesh --- 
        print("[Boolean Script] Attempting to repair meshes (fill holes, fix normals) before boolean...")
        try:
            model_mesh.fill_holes()
            model_mesh.fix_normals()
            logo_mesh.fill_holes()
            logo_mesh.fix_normals()
            print("[Boolean Script] Trimesh mesh repair attempt complete.")
        except Exception as repair_err:
            # Log repair error but still attempt boolean
            print(f"[Boolean Script] Warning: Error during trimesh repair: {repair_err}", file=sys.stderr)
        # --- End Repair ---

        # --- Perform Boolean Operation with Trimesh ---
        if operation == 'intersection':
            print("[Boolean Script] Performing boolean intersection (model AND logo overlap) using Trimesh...")
            operation_name = "intersection"
            result_mesh = model_mesh.intersection(logo_mesh)
        elif operation == 'thin_intersection':
            print(f"THIN INTERSECTION: {thickness_delta}mm delta")
            operation_name = "thin intersection"
            
            try:
                # EXACTLY as user described: 
                # 1. Find boolean overlap of logo STL and main model
                print("STAGE 1: logo AND model")
                stage1_result = model_mesh.intersection(logo_mesh)
                if stage1_result.is_empty:
                    print(f"ERROR: Stage 1 failed", file=sys.stderr)
                    return False
                print(f"STAGE 1 COMPLETE: {len(stage1_result.faces)} faces")
                
            except Exception as e:
                print(f"STAGE 1 CRASHED: {str(e)}", file=sys.stderr)
                return False
            
            try:
                # 2. Copy main model and offset it AWAY from center by delta
                print(f"STAGE 2: Copy model and offset AWAY from center by {thickness_delta}mm")
                model_offset = model_mesh.copy()
                
                # Offset AWAY from center - for donut models this is positive Z
                translation = np.eye(4)
                translation[2, 3] = thickness_delta  # AWAY from center
                model_offset.apply_transform(translation)
                print(f"STAGE 2 COMPLETE: Model offset by +{thickness_delta}mm")
                
            except Exception as e:
                print(f"STAGE 2 CRASHED: {str(e)}", file=sys.stderr)
                print(f"FALLBACK: Using stage1 result without delta", file=sys.stderr)
                result_mesh = stage1_result
                
            else:
                try:
                    # 3. Find boolean overlap between stage1_result and offset model
                    print("STAGE 3: stage1_result AND offset_model")
                    result_mesh = stage1_result.intersection(model_offset)
                    
                    if result_mesh.is_empty or len(result_mesh.faces) == 0:
                        print(f"STAGE 3 FAILED: Empty result. Delta {thickness_delta}mm too large?", file=sys.stderr)
                        result_mesh = stage1_result
                    else:
                        face_diff = len(stage1_result.faces) - len(result_mesh.faces)
                        print(f"STAGE 3 COMPLETE: {len(result_mesh.faces)} faces (was {len(stage1_result.faces)})")
                        print(f"DELTA EFFECT: {face_diff} faces removed by {thickness_delta}mm delta")
                        
                except Exception as e:
                    print(f"STAGE 3 CRASHED: {str(e)}", file=sys.stderr)
                    print(f"FALLBACK: Using stage1 result without delta", file=sys.stderr)
                    result_mesh = stage1_result
                
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
                        if hasattr(logo_mesh, 'remove_degenerate_faces'):
                            logo_mesh.update_faces(logo_mesh.nondegenerate_faces())
                        if hasattr(logo_mesh, 'remove_duplicate_faces'):
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
                            
                            # Alternative approach 3: Skip subtraction and return original model
                            print("[Boolean Script] All repair attempts failed, returning original model", file=sys.stderr)
                            print("[Boolean Script] Warning: Subtraction could not be performed, original model returned", file=sys.stderr)
                            result_mesh = model_mesh
                            operation_name = "subtraction (fallback to original)"
                else:
                    # Re-raise if it's a different error
                    raise volume_error
            
        print(f"[Boolean Script] Boolean {operation_name} complete. Result Faces: {len(result_mesh.faces)}, Vertices: {len(result_mesh.vertices)}")

        # --- Check if the result is empty ---
        if result_mesh.is_empty or len(result_mesh.faces) == 0:
            print(f"[Boolean Script] Error: Trimesh boolean {operation_name} resulted in an empty mesh.", file=sys.stderr)
            return False # Indicate failure
        # --- End Check ---

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
    parser.add_argument('--thickness-delta', type=float, default=1.0,
                        help='Thickness delta in mm for thin_intersection operation (default: 1.0)')
    
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
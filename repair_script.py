import pyvista as pv
import sys
import argparse
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Helper function to check file existence and readability ---
def check_file(file_path, file_desc):
    if not os.path.exists(file_path):
        logging.error(f"{file_desc} file not found: {file_path}")
        return False
    if not os.access(file_path, os.R_OK):
         logging.error(f"{file_desc} file not readable: {file_path}")
         return False
    logging.info(f"{file_desc} file found and readable: {file_path}")
    return True

# --- Mesh Repair Function ---
def repair_mesh_pyvista(input_file, output_file):
    logging.info(f"Attempting to REPAIR mesh using PyVista: {input_file}")
    if not check_file(input_file, "Input"): sys.exit(1)

    try:
        mesh = pv.read(input_file)
        logging.info(f"Mesh loaded. N Points: {mesh.n_points}, N Cells: {mesh.n_cells}")

        # Clean the mesh
        logging.info("Cleaning mesh...")
        cleaned_mesh = mesh.clean()
        logging.info(f"Mesh cleaned. N Points: {cleaned_mesh.n_points}, N Cells: {cleaned_mesh.n_cells}")
        
        # Fill holes
        logging.info("Filling holes (hole_size=100.0)...") 
        repaired_mesh = cleaned_mesh.fill_holes(hole_size=100.0)
        logging.info(f"Hole filling complete. N Points: {repaired_mesh.n_points}, N Cells: {repaired_mesh.n_cells}")

        logging.info(f"Saving repaired mesh to: {output_file}")
        repaired_mesh.save(output_file, binary=False) # Save as ASCII STL
        logging.info(f"Repaired mesh saved.")

    except Exception as e:
        logging.exception(f"Error during PyVista mesh repair for {input_file}")
        sys.exit(1)

# --- Mesh Subtraction Function ---
def subtract_mesh_pyvista(model_file, tool_file, output_file):
    logging.info(f"Attempting to SUBTRACT tool mesh ({tool_file}) from model mesh ({model_file})")
    if not check_file(model_file, "Model"): sys.exit(1)
    if not check_file(tool_file, "Tool"): sys.exit(1)

    try:
        model_mesh = pv.read(model_file)
        logging.info(f"Model mesh loaded. N Points: {model_mesh.n_points}, N Cells: {model_mesh.n_cells}")
        tool_mesh = pv.read(tool_file)
        logging.info(f"Tool mesh loaded. N Points: {tool_mesh.n_points}, N Cells: {tool_mesh.n_cells}")

        # Perform boolean difference (Model - Tool)
        logging.info("Performing boolean difference...")
        # Ensure meshes are manifold (basic checks - might need more robust pre-processing)
        if not model_mesh.is_manifold:
            logging.warning("Model mesh may not be manifold, attempting repair...")
            model_mesh.fill_holes(hole_size=100.0, inplace=True)
            model_mesh.clean(inplace=True)
        if not tool_mesh.is_manifold:
            logging.warning("Tool mesh may not be manifold, attempting repair...")
            tool_mesh.fill_holes(hole_size=100.0, inplace=True)
            tool_mesh.clean(inplace=True)
            
        result_mesh = model_mesh.boolean_difference(tool_mesh)
        logging.info(f"Subtraction complete. Result N Points: {result_mesh.n_points}, N Cells: {result_mesh.n_cells}")

        logging.info(f"Saving subtracted mesh to: {output_file}")
        result_mesh.save(output_file, binary=False) # Save as ASCII STL
        logging.info(f"Subtracted mesh saved.")

    except Exception as e:
        logging.exception(f"Error during PyVista mesh subtraction (Model: {model_file}, Tool: {tool_file})")
        sys.exit(1)

# --- Main Execution --- 
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Perform mesh operations using PyVista.')
    parser.add_argument('operation', type=str, choices=['repair', 'subtract'], help='Operation to perform.')
    parser.add_argument('output_file', type=str, help='Path to save the resulting STL file.')
    parser.add_argument('--input_file', type=str, help='Path to the input STL file (for repair operation).')
    parser.add_argument('--model_file', type=str, help='Path to the main model STL file (for subtract operation).')
    parser.add_argument('--tool_file', type=str, help='Path to the tool/logo STL file (for subtract operation).')
    
    args = parser.parse_args()
    
    logging.info(f"Starting PyVista script. Operation: {args.operation}")

    if args.operation == 'repair':
        if not args.input_file:
            logging.error("Missing --input_file argument for 'repair' operation.")
            sys.exit(1)
        repair_mesh_pyvista(args.input_file, args.output_file)
        
    elif args.operation == 'subtract':
        if not args.model_file or not args.tool_file:
            logging.error("Missing --model_file or --tool_file argument for 'subtract' operation.")
            sys.exit(1)
        subtract_mesh_pyvista(args.model_file, args.tool_file, args.output_file)
        
    else:
        logging.error(f"Unknown operation: {args.operation}")
        sys.exit(1)

    # Final check if output file was created successfully
    if not os.path.exists(args.output_file):
         logging.error(f"Output file was not created: {args.output_file}")
         sys.exit(1)
    logging.info(f"Output file successfully created: {args.output_file}")
    
    logging.info("PyVista script finished successfully.")
    sys.exit(0) # Indicate success 
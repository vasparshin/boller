# Boller3D

## Project Overview
Boller3D is a web-based 3D model customization tool that allows users to personalize models with custom logos. The application enables users to upload SVG logos, position and scale them on 3D models, and convert these logos to 3D STL files for download.

Key features include:
- Interactive 3D model viewer with controls for rotating and zooming
- SVG logo upload and placement on 3D models
- Logo customization (color, scale, position, mirroring)
- SVG to STL conversion with precision control
- STL export functionality
- Real-time price calculation based on quantity

The tool is specifically designed for customizing Boller brand sports equipment, with built-in support for both racquetball and squash equipment models.

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher recommended)
- Web browser with modern JavaScript support
- Python (v3.6 or higher recommended, for server-side repair and subtraction scripts)
- Python Libraries: See `requirements.txt` (includes `pyvista` for repair, `trimesh` for subtraction, `numpy`, `scipy`, `numpy-stl`, `ipython`)

### Dependencies
```json
{
  "dependencies": {
    "body-parser": "^2.2.0",
    "express": "^5.1.0",
    "nodemon": "^3.1.9",
    "three-bvh-csg": "^0.0.17"
  }
}
```

### Installation
1. Clone the repository
2. Install Node.js dependencies:
```bash
npm install
```
3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

### Running the Application

**Only the Node.js server is needed now.**

Start the Node.js server (serves frontend, handles repair and subtraction via Python script execution):
```bash
node main-server.js
```

The application will be available at http://localhost:3000.

### Troubleshooting

**Issues during "Repair STL" or "Cut Out Logo":**

These operations rely on the Node.js server executing Python scripts (`repair_script.py`, `subtract_script.py`) in the background. Check the following:

1.  **Node.js Server Logs:** Look for errors in the terminal where `node main-server.js` is running. It will show messages like "Executing Python script..." and any errors from the Python script (STDERR).
2.  **Python Installation:** Is Python correctly installed and accessible in your system's PATH? The Node.js server runs the command `python ...`. If `python` isn't recognized, you might need to use `python3` or the full path to your Python executable in `main-server.js`.
3.  **Python Dependencies:** Have the required Python packages been installed? Run `pip install -r requirements.txt` in the project directory.
4.  **Temporary Files:** Check the `temp_repair/` and `temp_subtract/` directories (if they exist). Input files are kept temporarily (cleanup is disabled) for debugging. Are the input files being created correctly? If the script fails, the output file might be missing or empty.

## Usage

### Basic Workflow
1. **Select a 3D Model**: Choose from available models in the dropdown menu
2. **Upload a Logo**: Click "Browse" to select an SVG file for your logo
3. **Preview the Logo**: Click "Preview Logo" to place the logo on the 3D model
4. **Customize the Logo**:
   - Adjust the position using the arrow buttons
   - Scale the logo with the slider
   - Change logo and model colors
   - Choose whether to mirror the logo with the "Double-Sided Logo" option
5. **Convert to 3D**: Click "Logo STL" to convert and position the 3D logo
6. **Cut to Model (Optional)**: Click "Cut Logo" to trim the logo to the model's boundaries
7. **Download STL**: Save the 3D logo as an STL file

### Advanced Options
- **STL Options**:
  - Size (mm): Set the size of the STL output
  - Precision: Control the detail level (higher values = more detail)
  - STL Thickness: Adjust the depth of the 3D logo
  - STL Color: Set the color for the 3D representation (defaults to orange)
  - Mirror STL: Option to create a mirrored version of the STL

- **Visualization Controls**:
  - Toggle BBox: Show/hide the model's bounding box
  - Toggle Logo BBox: Show/hide the logo's bounding box
  - Toggle Place Area: Show/hide the placement area boundaries
  - Toggle Logo STL BBox: Show/hide the STL bounding box



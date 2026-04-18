// -----------------------------------------------------------------
// SVGtoSTL.js - Version 0.109 (2023-07-26)
// Direct STL generation from SVG with optimized codebase
// -----------------------------------------------------------------

// *** BOLLER3D MASTER VERSION 1.0.75 - First log message for the entire application ***
console.log('[MASTER] Boller3D v1.0.75 - SVGtoSTL Module v0.109');

// Log THREE.js version for debugging
console.log(`[SVGtoSTL.js] Using THREE.js version: ${THREE.REVISION}`);

// Configurable parameters
const LOG_LEVEL = 1; // 0=minimal, 1=normal, 2=verbose
const ENABLE_FILE_LOGGING = true; // Enable logging to file for PowerShell/CMD viewing

// Stats for quality tracking
let totalTriangles = 0;
let totalVertices = 0;
let totalEdges = 0;

// Diagnostics to track where corruption occurs
const diagnostics = {
    paths: [],
    shapes: [],
    meshes: [],
    
    // Clear all diagnostics
    clear() {
        this.paths = [];
        this.shapes = [];
        this.meshes = [];
    },
    
    // Add path diagnostics
    addPath(pathInfo) {
        this.paths.push(pathInfo);
    },
    
    // Add shape diagnostics
    addShape(shapeInfo) {
        this.shapes.push(shapeInfo);
    },
    
    // Add mesh diagnostics
    addMesh(meshInfo) {
        this.meshes.push(meshInfo);
    },
    
    // Special letter detection for common letters with holes
    isSpecialLetter(path) {
        if (!path || typeof path !== 'string') return false;
        
        // For Edmonton Squash Club logo and other common letters
        const letterPatterns = {
            // Letters that commonly have holes
            'B': /[bB]|([A-Za-z0-9]\s*[bB])|([bB]\s*[A-Za-z0-9])/,
            'e': /[eE]|([A-Za-z0-9]\s*[eE])|([eE]\s*[A-Za-z0-9])/,
            'A': /[aA]|([A-Za-z0-9]\s*[aA])|([aA]\s*[A-Za-z0-9])/,
            'R': /[rR]|([A-Za-z0-9]\s*[rR])|([rR]\s*[A-Za-z0-9])/,
            'D': /[dD]|([A-Za-z0-9]\s*[dD])|([dD]\s*[A-Za-z0-9])/,
            'O': /[oO0]|([A-Za-z0-9]\s*[oO0])|([oO0]\s*[A-Za-z0-9])/,
            'P': /[pP]|([A-Za-z0-9]\s*[pP])|([pP]\s*[A-Za-z0-9])/,
            'Q': /[qQ]|([A-Za-z0-9]\s*[qQ])|([qQ]\s*[A-Za-z0-9])/,
            '8': /[8]|([A-Za-z0-9]\s*[8])|([8]\s*[A-Za-z0-9])/,
            '9': /[9]|([A-Za-z0-9]\s*[9])|([9]\s*[A-Za-z0-9])/,
            '0': /[0]|([A-Za-z0-9]\s*[0])|([0]\s*[A-Za-z0-9])/,
            '6': /[6]|([A-Za-z0-9]\s*[6])|([6]\s*[A-Za-z0-9])/,
            'g': /[gG]|([A-Za-z0-9]\s*[gG])|([gG]\s*[A-Za-z0-9])/
        };
        
        for (const [letter, pattern] of Object.entries(letterPatterns)) {
            if (pattern.test(path)) {
                return { isSpecial: true, letter };
            }
        }
        
        return { isSpecial: false };
    }
};

// In-memory log storage (for browser viewing)
const memoryLogs = [];
const MAX_MEMORY_LOGS = 1000;

// File logging helper - can be viewed in PowerShell/CMD
function logToFile(message) {
    if (!ENABLE_FILE_LOGGING) return;
    
    // Store log in memory first
    memoryLogs.push({
        timestamp: new Date().toISOString(),
        message: message
    });
    
    // Trim if too many logs
    if (memoryLogs.length > MAX_MEMORY_LOGS) {
        memoryLogs.shift();
    }
    
    // Skip server logging if fetch not available
    if (typeof fetch === 'undefined') return;
    
    try {
        // Use fetch to send log to server endpoint that writes to file
        fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        }).catch(err => {
            // Silent catch - don't output error to avoid infinite loop
            console.warn("Log server not available");
        });
    } catch (e) {
        // Silently fail if fetch is not available or server endpoint doesn't exist
    }
}

// Console function for viewing logs directly in browser
window.viewLogs = function(count = 20, filter = "") {
    console.clear();
    console.log("%c===== BOLLER3D LOGS =====", "font-size: 16px; font-weight: bold; color: blue;");
    
    const filtered = filter ? 
        memoryLogs.filter(log => log.message.includes(filter)) : 
        memoryLogs;
    
    const toShow = filtered.slice(-count);
    
    if (toShow.length === 0) {
        console.log("No logs found" + (filter ? " matching filter: " + filter : ""));
        return;
    }
    
    toShow.forEach(log => {
        console.log(`[${log.timestamp.split('T')[1].split('.')[0]}] ${log.message}`);
    });
    
    console.log(`\nShowing ${toShow.length} of ${filtered.length} logs` + 
                (filter ? ` (filtered by "${filter}")` : ""));
    console.log("\nUsage:");
    console.log(" - viewLogs() - Show last 20 logs");
    console.log(" - viewLogs(50) - Show last 50 logs");
    console.log(" - viewLogs(100, 'STL') - Show last 100 logs containing 'STL'");
    
    return `Displayed ${toShow.length} logs`;
};

// Export first message to memory logs
logToFile("SVGtoSTL.js initialized");

// Logging helper
const log = {
    debug: (msg) => { 
        if (LOG_LEVEL >= 2) {
            console.log(`[DEBUG] ${msg}`);
            logToFile(`[DEBUG] ${msg}`);
        }
    },
    info: (msg) => { 
        if (LOG_LEVEL >= 1) {
            console.log(msg);
            logToFile(msg);
        }
    },
    warn: (msg) => {
        console.warn(msg);
        logToFile(`[WARN] ${msg}`);
    },
    error: (msg) => {
        console.error(msg);
        logToFile(`[ERROR] ${msg}`);
    },
    group: (title, items) => {
        if (LOG_LEVEL >= 1) {
            console.groupCollapsed(title);
            items.forEach(item => console.log(item));
            console.groupEnd();
            logToFile(`${title} - ${items.join(' | ')}`);
        }
    },
    debugGroup: (title, items) => {
        if (LOG_LEVEL >= 2) {
            console.groupCollapsed(`[DEBUG] ${title}`);
            items.forEach(item => console.log(item));
            console.groupEnd();
            logToFile(`[DEBUG] ${title} - ${items.join(' | ')}`);
        }
    },
    summary: (title, content) => {
        const message = `[SUMMARY] ${title}: ${content}`;
        console.log(message);
        logToFile(message);
    }
};

// Removes all children from a three.js group
function clearGroup(group) {
    while (group && group.children && group.children.length > 0) {
        group.remove(group.children[0]);
    }
}

// Check if a path might have holes based on its structure
function pathMightHaveHoles(pathString) {
    // Check for multiple sub-paths (indicated by multiple M commands)
    const moveCommands = (pathString.match(/M/g) || []).length;
    const closeCommands = (pathString.match(/Z/gi) || []).length;
    
    // If there are multiple move commands and close commands, it might have holes
    return moveCommands > 1 && closeCommands > 1;
}

// Extract sub-paths from a composite path string
function extractSubPaths(pathString) {
    const subpaths = [];
    let currentPath = "";
    let inPath = false;
    
    // Normalize the path string: ensure spaces after commands
    const normalized = pathString.replace(/([MLHVCSQTAZ])/gi, " $1 ")
                                .replace(/\s+/g, " ")
                                .trim();
    
    // Split by tokens
    const tokens = normalized.split(" ");
    let currentCommand = "";
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].trim();
        if (!token) continue;
        
        // Check if this is a command
        if (token.match(/^[MLHVCSQTAZ]$/i)) {
            currentCommand = token;
            
            // If we encounter a new M command, start a new subpath
            if (token.toUpperCase() === "M") {
                if (inPath && currentPath.length > 0) {
                    subpaths.push(currentPath.trim());
                }
                inPath = true;
                currentPath = "M";
            } else {
                currentPath += " " + token;
            }
    } else {
            // This is a parameter for the current command
            currentPath += " " + token;
            
            // If we just completed a Z command, end this subpath
            if (currentCommand.toUpperCase() === "Z") {
                if (inPath && currentPath.length > 0) {
                    subpaths.push(currentPath.trim());
                    currentPath = "";
                    inPath = false;
                }
            }
        }
    }
    
    // Add any remaining path
    if (inPath && currentPath.length > 0) {
        subpaths.push(currentPath.trim());
    }
    
    // Add extra validation to ensure proper closure of paths
    for (let i = 0; i < subpaths.length; i++) {
        // If a path doesn't end with Z, add it to ensure proper closure
        if (!subpaths[i].toUpperCase().endsWith('Z')) {
            subpaths[i] += ' Z';
        }
    }
    
    return subpaths;
}

// Analyze SVG path winding direction (CW or CCW)
function determineWinding(points) {
    // If fewer than 3 points, can't determine winding
    if (!points || points.length < 3) return null;
    
    // Compute the signed area using a more stable algorithm
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        // Use the shoelace formula with more stable computation
        const dx = points[j].x - points[i].x;
        const sy = points[j].y + points[i].y;
        area += dx * sy;
    }
    
    // Formula gives 2x the actual area
    area = -area / 2;
    
    return {
        isClockwise: area < 0,
        area: Math.abs(area)  // Actual area of the polygon
    };
}

// Create a shape directly from SVG path data
function processPathToShape(pathString, precision) {
    const pathPreview = pathString.substring(0, 50) + (pathString.length > 50 ? "..." : "");
    log.debugGroup(`Processing SVG path to shape`, [`Path: ${pathPreview}`, `Precision: ${precision}`]);
    
    // Check if this might be a special letter with holes that doesn't appear to have subpaths
    const specialLetterCheck = diagnostics.isSpecialLetter(pathString);
    if (specialLetterCheck.isSpecial && !pathMightHaveHoles(pathString)) {
        log.info(`Potential special letter detected: ${specialLetterCheck.letter}, using nested contours logic`);
    }
    
    // If this might have holes or is a special letter
    if (pathMightHaveHoles(pathString) || specialLetterCheck.isSpecial) {
        log.debug("Path might have holes, extracting sub-paths");
        
        const subpaths = extractSubPaths(pathString);
        if (subpaths.length <= 1) {
            log.debug("Only found one subpath, processing as simple shape");
            return createShapeFromSVGPath(pathString, precision);
        }
        
        log.debug(`Found ${subpaths.length} sub-paths, processing as complex shape`);
        
        // Process the first path as the main shape
        const mainShape = createShapeFromSVGPath(subpaths[0], precision);
        if (!mainShape) {
            log.warn("Failed to create main shape from first subpath");
            return null;
        }
        
        // Process the remaining paths as potential holes
        for (let i = 1; i < subpaths.length; i++) {
            try {
                const holePath = subpaths[i];
                // Create a shape from the hole path
                const holeShape = createShapeFromSVGPath(holePath, precision, true);
                
                if (holeShape && holeShape.points && holeShape.points.length >= 3) {
                    // Create a hole path from the shape points
                    const hole = new THREE.Path();
                    hole.moveTo(holeShape.points[0].x, holeShape.points[0].y);
                    
                    for (let j = 1; j < holeShape.points.length; j++) {
                        hole.lineTo(holeShape.points[j].x, holeShape.points[j].y);
                    }
                    
                    hole.closePath();
                    mainShape.holes.push(hole);
                    log.debug(`Added hole ${i} with ${holeShape.points.length} points`);
                } else {
                    log.warn(`Failed to create hole from subpath ${i}`);
                }
            } catch (e) {
                log.warn(`Error processing hole subpath ${i}: ${e.message}`);
            }
        }
        
        // Store diagnostic info for the shape with holes
        diagnostics.addShape({
            pointCount: mainShape.points.length,
            holeCount: mainShape.holes.length,
            area: mainShape.area || 0
        });
        
        return mainShape;
    } else {
        // Simple shape with no holes
        return createShapeFromSVGPath(pathString, precision);
    }
}

// Create a shape from a SVG path
function createShapeFromSVGPath(pathString, precision, isHole = false) {
    try {
        // Transform the SVG path using d3
        const pathData = d3.transformSVGPath(pathString);
        if (!pathData) {
            log.warn("Failed to transform SVG path with d3");
            return null;
        }
        
        // Generate points with appropriate density based on precision
        let points;
        if (precision > 100) {
            // High precision
            const extraPoints = Math.ceil(precision / 8);
            points = pathData.getPoints(extraPoints);
        } else if (precision > 20) {
            // Medium precision
            const mediumPoints = Math.ceil(precision / 4);
            points = pathData.getPoints(mediumPoints);
        } else {
            // Low precision
            points = pathData.getPoints(Math.max(5, Math.ceil(precision / 2)));
        }
        
        if (!points || points.length < 3) {
            log.warn("Not enough points in transformed path");
            return null;
        }
        
        log.debug(`Generated ${points.length} points for ${isHole ? 'hole' : 'shape'}`);
        
        // Analyze winding and area
        const windingInfo = determineWinding(points);
        let area = 0;
        
        if (windingInfo) {
            area = windingInfo.area;
            log.debug(`Path winding: ${windingInfo.isClockwise ? 'Clockwise' : 'Counter-clockwise'}, Area: ${area.toFixed(2)}`);
            
            // THREE.js convention:
            // - Shapes should be CCW (counter-clockwise)
            // - Holes should be CW (clockwise)
            
            const needReverse = (isHole && !windingInfo.isClockwise) || (!isHole && windingInfo.isClockwise);
            
            if (needReverse) {
                log.debug(`Reversing points to make ${isHole ? 'hole clockwise' : 'shape counter-clockwise'}`);
                points = points.slice().reverse();
            }
        }
        
        // Create a new shape
        const shape = new THREE.Shape();
        
        // Store the points for future reference
        shape.points = points;
        shape.area = area;
        
        // Create the shape geometry
        shape.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, points[i].y);
        }
        shape.closePath();
        
        // Only record diagnostic information if this is a main shape, not a hole
        if (!isHole) {
            diagnostics.addPath({
                pointCount: points.length,
                holeCount: 0,
                windingInfo: windingInfo
            });
        }
        
        return shape;
    } catch (e) {
        log.error(`Error creating shape from SVG path: ${e.message}`);
        return null;
    }
}

// Create extrusion with explicit triangulation and verification
function createExtrudedGeometry(shape, extrudeSettings) {
    try {
        // Use THREE.js ExtrudeGeometry
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Ensure normals are computed BEFORE any other operations
        geometry.computeVertexNormals();
        
        // Enhanced validation
        if (!geometry.index || geometry.index.count === 0) {
            log.debug("Attempting to fix missing indices");
            
            // Get position attribute
            const positions = geometry.attributes.position;
            if (positions && positions.count > 0) {
                // Create simple triangulation (every 3 vertices form a triangle)
                const indices = [];
                for (let i = 0; i < positions.count; i += 3) {
                    if (i + 2 < positions.count) {
                        indices.push(i, i + 1, i + 2);
                    }
                }
                
                if (indices.length > 0) {
                    geometry.setIndex(indices);
                    log.debug(`Fixed missing indices: added ${indices.length / 3} triangles`);
                }
            }
        }
        
        // Final recalculation of normals to ensure correct lighting
        geometry.computeVertexNormals();
        
        return geometry;
    } catch (e) {
        log.error(`Error creating extruded geometry: ${e.message}`);
        return null;
    }
}

// Count edges in a geometry (used for diagnostics)
function countEdges(geometry) {
    if (!geometry || !geometry.index) return 0;
    
    // Set to track unique edges (pairs of vertex indices)
    const edges = new Set();
    const indices = geometry.index.array;
    
    // Loop through triangles
    for (let i = 0; i < indices.length; i += 3) {
        // Get the three vertices of the triangle
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        
        // Add the three edges (making sure order is consistent)
        edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        edges.add(b < c ? `${b}-${c}` : `${c}-${b}`);
        edges.add(c < a ? `${c}-${a}` : `${a}-${c}`);
    }
    
    return edges.size;
}

// Takes an SVG string, and returns a scene to render as a 3D STL
function renderObject(paths, scene, group, options) {
    // Reset stats counters
    totalTriangles = 0;
    totalVertices = 0;
    totalEdges = 0;
    
    // Reset diagnostics
    diagnostics.clear();
    
    log.info(`Rendering 3D object from ${paths.length} SVG paths...`);
    
    console.groupCollapsed("[PROCESS] SVG to STL Conversion Process");
    
    // Always use higher quality geometry settings and scale them with precision
    const precision = Math.max(1, options.precision || 50);
    
    // Higher minimum quality settings to prevent corruption
    const curveSegments = Math.max(16, Math.ceil(precision / 3)); // Higher minimum for better curves
    const bevelSegments = Math.max(4, Math.ceil(precision / 12));
    const steps = Math.max(2, Math.ceil(precision / 30)); 
    
    log.info(`Quality settings - Precision: ${precision}, Curve segments: ${curveSegments}, Bevel segments: ${bevelSegments}, Steps: ${steps}`);
    
    // Solid Color Material
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(options.objectColor || 0xffffff),
        metalness: 0.1,
        roughness: 0.8,
        side: THREE.DoubleSide
    });

    try {
        // Clear existing group
        clearGroup(group);
        
        // Process each path to create shapes and meshes
        console.groupCollapsed("[PROCESS] Processing SVG Paths");
        
        // First, process all paths into shapes
        const processedShapes = [];
        
        for (let i = 0; i < paths.length; i++) {
            const shape = processPathToShape(paths[i], precision);
            if (shape) {
                processedShapes.push({
                    shape: shape,
                    index: i,
                    holes: shape.holes ? shape.holes.length : 0
                });
            }
        }
        
        console.groupEnd(); // End processing group
        
        log.summary("Shape Processing", `Created ${processedShapes.length} shapes with holes`);
        
        // Create meshes from processed shapes
        console.groupCollapsed("[PROCESS] Creating 3D Meshes");
        
        // Extrusion settings with higher minimum quality
        const extrudeSettings = {
            depth: options.typeDepth || 10,
            bevelEnabled: options.bevelEnabled || false,
            bevelThickness: options.bevelThickness || 0.1,
            bevelSize: options.bevelSize || 0.1,
            bevelOffset: 0,
            bevelSegments: bevelSegments,
            curveSegments: curveSegments,
            steps: steps
        };
        
        // For each shape, create a separate mesh
        for (const shapeData of processedShapes) {
            try {
                // Create extrusion geometry with verification
                const geometry = createExtrudedGeometry(shapeData.shape, extrudeSettings);
                
                if (!geometry) {
                    log.warn(`Failed to create geometry for shape ${shapeData.index}`);
                    continue;
                }
                
                // Calculate triangles, vertices, and edges
                const triangleCount = geometry.index ? geometry.index.count / 3 : 0;
                const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;
                const edgeCount = countEdges(geometry);
                
                // Update totals
                totalTriangles += triangleCount;
                totalVertices += vertexCount;
                totalEdges += edgeCount;
                
                // Create mesh
                const mesh = new THREE.Mesh(geometry, material.clone());
                group.add(mesh);
                
                // Add diagnostics
                diagnostics.addMesh({
                    index: shapeData.index,
                    triangles: triangleCount,
                    vertices: vertexCount,
                    edges: edgeCount,
                    holeCount: shapeData.holes
                });
                
                log.debug(`Created mesh for shape ${shapeData.index} with ${shapeData.holes} holes, ${triangleCount} triangles, ${vertexCount} vertices, ${edgeCount} edges`);
                
            } catch (e) {
                log.error(`Failed to create mesh for shape ${shapeData.index}: ${e.message}`);
            }
        }
        
        console.groupEnd(); // End mesh creation group
        
        // Apply final transforms to position the model correctly
        if (group.children.length > 0) {
            // Apply transformations
            applyFinalTransforms(group, options);
            
            log.summary("Geometry Stats", `Total: ${totalTriangles} triangles, ${totalVertices} vertices, ${totalEdges} edges across ${group.children.length} meshes`);
        } else {
            throw new Error("No valid meshes could be created");
        }
        
    } catch (error) {
        log.error(`Error rendering object: ${error.message}`);
        throw error;
    } finally {
        // Ensure we close the log group even if an error occurs
        console.groupEnd(); // End the process group
        log.summary("Rendering", "3D object processing completed");
    }
}

// Apply final transformations to the group
function applyFinalTransforms(group, options) {
    // --- Apply transformations --- 
    const combinedMatrix = new THREE.Matrix4(); // Start with Identity matrix
    const tempMatrix = new THREE.Matrix4();

    // *** COORDINATE SYSTEM CORRECTION MOVED TO matchLogoTransform ***
    // The coordinate correction is now applied in matchLogoTransform after all other transforms
    
    // --- DEBUG: Log state with no transformations ---
    const matrixInitial = combinedMatrix.clone();
    log.debugGroup("[applyFinalTransforms] Initial Matrix (No Coordinate Correction)", [
        `Matrix:\n${matrixInitial.elements.map(e => e.toFixed(2)).join(' ')}`
    ]);
    // --- End DEBUG ---

    // Calculate bounding box and size for proper scaling
    const bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());
    
    const maxDimension = Math.max(size.x, size.y);
    const typeSize = options.typeSize || 100; // Use default typeSize
    const scaleFactor = maxDimension > 0 ? typeSize / maxDimension : 1; 
    
    // Apply initial scaling to default size
    if (isFinite(scaleFactor) && scaleFactor > 0) {
        log.info(`[applyFinalTransforms] Applying initial scale factor: ${scaleFactor.toFixed(3)}`);
        combinedMatrix.multiply(tempMatrix.makeScale(scaleFactor, scaleFactor, 1)); // Apply scale
    } else {
         log.warn(`[applyFinalTransforms] Invalid scaleFactor calculated (${scaleFactor}). Applying identity scale.`);
         combinedMatrix.multiply(tempMatrix.makeScale(1, 1, 1)); 
    }
    
    // Center the object based on its bounding box *before* this transform
    const center = bbox.getCenter(new THREE.Vector3());
    if (isFinite(scaleFactor) && scaleFactor > 0) { 
        center.multiplyScalar(scaleFactor); 
    }
    combinedMatrix.multiply(tempMatrix.makeTranslation(-center.x, -center.y, 0)); // Apply translation to center

    // Apply the calculated transform (Scale + Centering only)
    group.applyMatrix4(combinedMatrix);
    
    // --- DEBUG: Log after applying matrix ---
    group.updateMatrixWorld(true); // Ensure world matrix is updated for logging
    const finalPos = new THREE.Vector3();
    const finalQuat = new THREE.Quaternion();
    const finalScale = new THREE.Vector3();
    group.matrixWorld.decompose(finalPos, finalQuat, finalScale);
    log.debugGroup("[applyFinalTransforms] After Apply", [
        `Group World Pos: ${finalPos.x.toFixed(2)}, ${finalPos.y.toFixed(2)}, ${finalPos.z.toFixed(2)}`,
        `Group World Quat: ${finalQuat.x.toFixed(2)}, ${finalQuat.y.toFixed(2)}, ${finalQuat.z.toFixed(2)}, ${finalQuat.w.toFixed(2)}`,
        `Group World Scale: ${finalScale.x.toFixed(2)}, ${finalScale.y.toFixed(2)}, ${finalScale.z.toFixed(2)}`
    ]);
    // --- End DEBUG ---

    // Compute vertex normals for all meshes to ensure proper lighting AFTER transform
    group.traverse(child => {
        if (child instanceof THREE.Mesh && child.geometry) {
            child.geometry.computeVertexNormals();
        }
    });
    
    group.updateMatrixWorld(true); // Update world matrix
    log.info("[applyFinalTransforms] Applied scale and centering only - coordinate correction handled in matchLogoTransform.");
}

// Function to save the STL file
function saveSTL(object, filename) {
    log.info("Saving STL file...");
    try {
        // Final validation before export
        validateObjectForExport(object);
        
        // Use STLExporter from global scope
        const exporter = window.STLExporter ? new window.STLExporter() : 
                         (window.THREE && window.THREE.STLExporter ? new window.THREE.STLExporter() : 
                         new THREE.STLExporter());
        
        // Parse with binary option for better quality
        const result = exporter.parse(object, { binary: true });

        if (!result) {
            throw new Error("STLExporter returned no result.");
        }

        // Check file size as a sanity check
        const fileSizeMB = result.byteLength / (1024 * 1024);
        log.debug(`STL file size: ${fileSizeMB.toFixed(2)} MB`);
        
        if (fileSizeMB < 0.001) {
            log.warn("Generated STL file is suspiciously small - possible corruption");
        }

        // Use FileSaver.js (already included)
        saveAs(new Blob([result], { type: 'application/octet-stream' }), filename + '.stl');
        
        log.summary("STL Export", `File generated with ${totalTriangles} triangles, ${totalVertices} vertices, ${totalEdges} edges, size: ${fileSizeMB.toFixed(2)} MB`);
    } catch (error) {
        log.error(`Error saving STL file: ${error.message}`);
        throw new Error(`Error saving STL file: ${error.message}`);
    }
}

// Final validation before STL export
function validateObjectForExport(object) {
    let issuesFixed = 0;
    
    // Traverse all meshes and fix common issues
    object.traverse(child => {
        if (child instanceof THREE.Mesh && child.geometry) {
            const geometry = child.geometry;
            
            // Ensure indices exist
            if (!geometry.index || geometry.index.count === 0) {
                log.warn("Found mesh without indices before export - attempting to triangulate");
                
                // Get position attribute
                const positions = geometry.attributes.position;
                if (!positions) return;
                
                const numVertices = positions.count;
                
                // Create basic triangulation
                const indices = [];
                for (let i = 0; i < numVertices; i += 3) {
                    if (i + 2 < numVertices) {
                        indices.push(i, i + 1, i + 2);
                    }
                }
                
                if (indices.length > 0) {
                    geometry.setIndex(indices);
                    issuesFixed++;
                }
            }
            
            // Final normal computation for all meshes
            geometry.computeVertexNormals();
        }
    });
    
    if (issuesFixed > 0) {
        log.debug(`Fixed issues in ${issuesFixed} meshes before export`);
    }
    
    return issuesFixed;
}

// Create a simple Express route for file logging (can be used if server supports it)
function setupFileLogging() {
    if (typeof window !== 'undefined') {
        // Log memory log viewing instructions
        console.log('%c[DEBUG HELP] Type viewLogs() to see logs', 'color: green; font-weight: bold');
        logToFile("SVGtoSTL.js file logging initialized - type viewLogs() in console to view logs");
    }
}

// Initialize file logging
if (ENABLE_FILE_LOGGING) {
    setupFileLogging();
}

// Make key functions globally available
window.renderObject = renderObject;
window.saveSTL = saveSTL;
window.clearGroup = clearGroup;
// Export additional functions for debugging
window.logToFile = logToFile;
window.diagnostics = diagnostics;

// Diagnostics viewer - analyze conversion stats (removing but keeping structure in comments for potential future use)
/* 
window.analyzeSTL = function() {
    console.clear();
    console.log("%c===== STL CONVERSION ANALYSIS =====", "font-size: 16px; font-weight: bold; color: green;");
    
    const summary = diagnostics.getSummary();
    
    console.log("%cSummary Statistics:", "font-weight: bold");
    console.log(`SVG Paths: ${summary.pathCount}`);
    console.log(`Shapes Created: ${summary.shapeCount}`);
    console.log(`Meshes Generated: ${summary.meshCount}`);
    console.log(`Triangles: ${summary.totalTriangles}`);
    console.log(`Vertices: ${summary.totalVertices}`);
    console.log(`Actual Edges: ${summary.totalEdges}`);
    console.log(`Theoretical Edges: ${summary.theoreticalEdges}`);
    
    // Check for discrepancies
    const edgeDiff = Math.abs(summary.totalEdges - summary.theoreticalEdges);
    const edgeRatio = summary.totalEdges / Math.max(1, summary.theoreticalEdges);
    
    console.log("\n%cAnalysis:", "font-weight: bold");
    if (edgeDiff > summary.meshCount * 3) {
        console.log(`%cPossible Corruption Detected: Edge count discrepancy of ${edgeDiff}`, "color: red");
        console.log(`Edge ratio: ${edgeRatio.toFixed(2)}x theoretical count`);
    } else {
        console.log(`%cMesh appears valid: Edge counts within expected range`, "color: green");
    }
    
    console.log("\n%cDetailed Path Analysis:", "font-weight: bold");
    diagnostics.paths.forEach((path, i) => {
        console.log(`Path ${i}: ${path.pointCount} points, ${path.holeCount} holes`);
    });
    
    console.log("\n%cDetailed Shape Analysis:", "font-weight: bold");
    diagnostics.shapes.forEach((shape, i) => {
        console.log(`Shape ${i}: ${shape.pointCount} points, ${shape.holeCount} holes`);
    });
    
    console.log("\n%cDetailed Mesh Analysis:", "font-weight: bold");
    diagnostics.meshes.forEach((mesh, i) => {
        console.log(`Mesh ${i}: ${mesh.triangles} triangles, ${mesh.vertices} vertices, ${mesh.edges} edges`);
        if (mesh.errors && mesh.errors.length > 0) {
            console.log(`  %cErrors: ${mesh.errors.join(", ")}`, "color: red");
        }
    });
    
    return "Analysis complete. Check console for results.";
};
*/

// Visualize mesh structure for debugging (removing but keeping structure in comments for potential future use)
/*
window.visualizeMesh = function(groupIndex = 0) {
    // Access the svgToStlGroup from the global scope
    const group = window.svgToStlGroup;
    if (!group) {
        console.error("svgToStlGroup not found in window");
        return;
    }
    
    // Get the requested mesh
    const mesh = group.children[groupIndex];
    if (!mesh) {
        console.error(`No mesh found at index ${groupIndex}`);
        return;
    }
    
    // Create visualization
    console.clear();
    console.log("%c===== MESH VISUALIZATION =====", "font-size: 16px; font-weight: bold; color: blue;");
    console.log(`Analyzing mesh ${groupIndex} of ${group.children.length}`);
    
    const geometry = mesh.geometry;
    
    if (!geometry) {
        console.error("No geometry in mesh");
        return;
    }
    
    const positionAttr = geometry.attributes.position;
    const indices = geometry.index ? geometry.index.array : null;
    
    if (!positionAttr) {
        console.error("No position attribute in geometry");
        return;
    }
    
    console.log(`Vertices: ${positionAttr.count}`);
    console.log(`Triangles: ${indices ? indices.length / 3 : 'Unknown'}`);
    
    // Sample some vertices for visualization
    console.log("\n%cVertex Sample:", "font-weight: bold");
    const maxSamples = Math.min(10, positionAttr.count);
    
    for (let i = 0; i < maxSamples; i++) {
        const idx = Math.floor(i * (positionAttr.count / maxSamples));
        const x = positionAttr.array[idx * 3];
        const y = positionAttr.array[idx * 3 + 1];
        const z = positionAttr.array[idx * 3 + 2];
        console.log(`Vertex ${idx}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
    
    // Sample some triangles
    if (indices) {
        console.log("\n%cTriangle Sample:", "font-weight: bold");
        const maxTriSamples = Math.min(5, indices.length / 3);
        
        for (let i = 0; i < maxTriSamples; i++) {
            const idx = Math.floor(i * (indices.length / 3 / maxTriSamples)) * 3;
            const a = indices[idx];
            const b = indices[idx + 1];
            const c = indices[idx + 2];
            console.log(`Triangle ${idx / 3}: Vertices ${a}, ${b}, ${c}`);
        }
    }
    
    return "Mesh visualization complete";
};
*/


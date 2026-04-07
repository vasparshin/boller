// js/vectorConverter.js
// Vector file converter for DXF and DWG files to SVG format

// Note: DXF library will be loaded via script tag in index.html
// The library exposes a global 'dxf' object with Helper, parseString, toSVG functions

/**
 * Maximum file size for vector files (10MB)
 * DXF/DWG files can be quite large, but we need reasonable limits
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Detects the type of vector file based on extension and content
 * @param {File} file - The uploaded file
 * @returns {string} - 'svg', 'dxf', 'dwg', or 'unknown'
 */
export function detectVectorFileType(file) {
    const fileName = file.name.toLowerCase();
    const extension = fileName.split('.').pop();
    
    switch (extension) {
        case 'svg':
            return 'svg';
        case 'dxf':
            return 'dxf';
        case 'dwg':
            return 'dwg';
        default:
            // Check MIME type as fallback
            if (file.type === 'image/svg+xml') {
                return 'svg';
            }
            return 'unknown';
    }
}

/**
 * Validates file size
 * @param {File} file - The file to validate
 * @returns {boolean} - true if file size is acceptable
 */
export function validateFileSize(file) {
    return file.size <= MAX_FILE_SIZE;
}

/**
 * Converts DXF file content to SVG using the dxf library
 * @param {string} fileContent - DXF file content as text
 * @returns {Promise<string>} - Promise resolving to SVG content
 */
export async function convertDxfToSvg(fileContent) {
    try {
        console.log('[vectorConverter] Starting DXF to SVG conversion...');
        
        // Check if the dxf library is available
        if (typeof window.dxf === 'undefined') {
            throw new Error('DXF library not loaded. Please ensure the script is included in HTML.');
        }
        
        // Create DXF helper instance using the global dxf object
        const helper = new window.dxf.Helper(fileContent);
        
        // Convert to SVG
        const svgContent = helper.toSVG();
        
        if (!svgContent || svgContent.trim() === '') {
            throw new Error('DXF conversion resulted in empty SVG');
        }
        
        console.log('[vectorConverter] DXF conversion successful');
        return svgContent;
        
    } catch (error) {
        console.error('[vectorConverter] DXF conversion failed:', error);
        throw new Error(`Failed to convert DXF file: ${error.message}`);
    }
}

/**
 * Converts DWG file content to SVG using libredwg-web
 * @param {ArrayBuffer} fileContent - DWG file content as ArrayBuffer
 * @returns {Promise<string>} - Promise resolving to SVG content
 */
export async function convertDwgToSvg(fileContent) {
    try {
        console.log('[vectorConverter] Starting DWG to SVG conversion...');
        
        // Dynamic import of libredwg-web since it's a heavy WebAssembly module
        const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web');
        
        // Create LibreDwg instance
        const libredwg = await LibreDwg.create();
        
        // Convert ArrayBuffer to Uint8Array
        const uint8Array = new Uint8Array(fileContent);
        
        // Read DWG data
        const dwg = libredwg.dwg_read_data(uint8Array, Dwg_File_Type.DWG);
        
        if (!dwg) {
            throw new Error('Failed to parse DWG file');
        }
        
        // Convert to database format
        const db = libredwg.convert(dwg);
        
        if (!db || !db.entities || db.entities.length === 0) {
            throw new Error('No entities found in DWG file');
        }
        
        // Convert entities to SVG
        const svgContent = convertDbToSvg(db);
        
        // Clean up memory
        libredwg.dwg_free(dwg);
        
        console.log('[vectorConverter] DWG conversion successful');
        return svgContent;
        
    } catch (error) {
        console.error('[vectorConverter] DWG conversion failed:', error);
        throw new Error(`Failed to convert DWG file: ${error.message}`);
    }
}

/**
 * Converts DWG database to SVG format
 * This is a simplified converter focusing on basic geometry
 * @param {Object} db - DWG database object
 * @returns {string} - SVG content
 */
function convertDbToSvg(db) {
    const entities = db.entities || [];
    const svgElements = [];
    
    // Calculate bounds for viewBox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    entities.forEach(entity => {
        try {
            let element = null;
            
            switch (entity.type?.toLowerCase()) {
                case 'line':
                    element = convertLineToSvg(entity);
                    break;
                case 'circle':
                    element = convertCircleToSvg(entity);
                    break;
                case 'arc':
                    element = convertArcToSvg(entity);
                    break;
                case 'lwpolyline':
                case 'polyline':
                    element = convertPolylineToSvg(entity);
                    break;
                default:
                    console.warn(`[vectorConverter] Unsupported DWG entity type: ${entity.type}`);
            }
            
            if (element) {
                svgElements.push(element);
                // Update bounds
                updateBounds(entity, { minX, minY, maxX, maxY });
            }
        } catch (error) {
            console.warn(`[vectorConverter] Failed to convert entity:`, error);
        }
    });
    
    // Set default bounds if none found
    if (minX === Infinity) {
        minX = minY = 0;
        maxX = maxY = 100;
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Create SVG document
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="${minX} ${minY} ${width} ${height}" 
     width="${width}" 
     height="${height}">
${svgElements.join('\n')}
</svg>`;
    
    return svg;
}

/**
 * Convert DWG line to SVG line element
 */
function convertLineToSvg(entity) {
    if (!entity.startPoint || !entity.endPoint) return null;
    
    return `<line x1="${entity.startPoint.x}" y1="${entity.startPoint.y}" 
                  x2="${entity.endPoint.x}" y2="${entity.endPoint.y}" 
                  stroke="black" stroke-width="1" fill="none"/>`;
}

/**
 * Convert DWG circle to SVG circle element
 */
function convertCircleToSvg(entity) {
    if (!entity.center || !entity.radius) return null;
    
    return `<circle cx="${entity.center.x}" cy="${entity.center.y}" 
                    r="${entity.radius}" 
                    stroke="black" stroke-width="1" fill="none"/>`;
}

/**
 * Convert DWG arc to SVG path element
 */
function convertArcToSvg(entity) {
    if (!entity.center || !entity.radius || entity.startAngle === undefined || entity.endAngle === undefined) {
        return null;
    }
    
    const cx = entity.center.x;
    const cy = entity.center.y;
    const r = entity.radius;
    const startAngle = entity.startAngle;
    const endAngle = entity.endAngle;
    
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    
    const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
    
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}" 
                  stroke="black" stroke-width="1" fill="none"/>`;
}

/**
 * Convert DWG polyline to SVG path element
 */
function convertPolylineToSvg(entity) {
    if (!entity.vertices || entity.vertices.length === 0) return null;
    
    let pathData = '';
    entity.vertices.forEach((vertex, index) => {
        if (index === 0) {
            pathData += `M ${vertex.x} ${vertex.y}`;
        } else {
            pathData += ` L ${vertex.x} ${vertex.y}`;
        }
    });
    
    if (entity.isClosed) {
        pathData += ' Z';
    }
    
    return `<path d="${pathData}" stroke="black" stroke-width="1" fill="none"/>`;
}

/**
 * Update bounds based on entity geometry
 */
function updateBounds(entity, bounds) {
    const points = [];
    
    if (entity.startPoint) points.push(entity.startPoint);
    if (entity.endPoint) points.push(entity.endPoint);
    if (entity.center) points.push(entity.center);
    if (entity.vertices) points.push(...entity.vertices);
    
    points.forEach(point => {
        if (point.x !== undefined && point.y !== undefined) {
            bounds.minX = Math.min(bounds.minX, point.x);
            bounds.maxX = Math.max(bounds.maxX, point.x);
            bounds.minY = Math.min(bounds.minY, point.y);
            bounds.maxY = Math.max(bounds.maxY, point.y);
        }
    });
}

/**
 * Main conversion function that routes to appropriate converter
 * @param {File} file - The vector file to convert
 * @returns {Promise<string>} - Promise resolving to SVG content
 */
export async function convertVectorFileToSvg(file) {
    // Validate file size
    if (!validateFileSize(file)) {
        throw new Error(`File too large. Maximum size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB`);
    }
    
    const fileType = detectVectorFileType(file);
    
    switch (fileType) {
        case 'svg':
            // SVG files don't need conversion, just return content
            return await readFileAsText(file);
            
        case 'dxf':
            const dxfContent = await readFileAsText(file);
            return await convertDxfToSvg(dxfContent);
            
        case 'dwg':
            const dwgContent = await readFileAsArrayBuffer(file);
            return await convertDwgToSvg(dwgContent);
            
        default:
            throw new Error(`Unsupported file type: ${file.name}. Supported formats: SVG, DXF, DWG`);
    }
}

/**
 * Helper function to read file as text
 * @param {File} file - File to read
 * @returns {Promise<string>} - Promise resolving to file content as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * Helper function to read file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>} - Promise resolving to file content as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
} 
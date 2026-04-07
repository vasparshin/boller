// Boller3D - Version 1.0.86 (2024-12-19) // Enhanced logging with bold colors and automatic bounding box display
// Main application module for 3D model customization

import * as THREE from 'three'; // Use bare specifier (resolved by import map)
// OrbitControls, STLLoader are now imported in threeSetup.js
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'; // Use addon path
import { STLExporter } from 'three/addons/exporters/STLExporter.js'; // Use addon path
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'; // Import for repair function
import * as ThreeMeshBVH from 'three-mesh-bvh'; // Import the BVH module
import * as ThreeBVHCSG from 'three-bvh-csg'; // Import the CSG module

// --- Import vector converter for DXF/DWG support ---
import { convertVectorFileToSvg, detectVectorFileType } from './js/vectorConverter.js';

// --- Import from our new module ---
import {
    scene,
    camera,
    renderer,
    controls,
    loader, // STLLoader instance
    raycaster,
    mouse,
    svgToStlGroup,
    setupThreeJS,
    onWindowResize
} from './modules/threeSetup.js';
// --------------------------------

// --- Make THREE globally accessible for older scripts --- (Keep this here for now)
window.THREE = THREE;
// -----------------------------------------------------

// Keep Chroma.js and jQuery/D3 assumed to be global via their script tags

// --- Constants ---
const PALETTE = [
    { name: 'Black', value: '#000000' },
    { name: 'White', value: '#FFFFFF' },
    { name: 'Orange', value: '#FFA500' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Cyan', value: '#00FFFF' },
    { name: 'Magenta', value: '#FF00FF' },
    { name: 'Gray', value: '#808080' },
    { name: 'Purple', value: '#800080' },
    { name: 'Brown', value: '#A52A2A' }
];

// --- DOM Elements ---
let viewerContainer, logoUploadInput;
let logoColorSelect, logoScaleInput;
let moveUpLgBtn, moveDownLgBtn, moveLeftLgBtn, moveRightLgBtn;
let moveUpSmBtn, moveDownSmBtn, moveLeftSmBtn, moveRightSmBtn;
let modelColorSelect, modelSelect;
let quantityInput, currencySelect, unitPriceSpan, totalPriceSpan;
let previewLogoBtn; // Renamed from showLogoBtn
let doubleSidedCheckbox;
let toggleBBoxBtn, toggleLogoBBoxBtn;
let togglePlacementAreaBtn;
let centerLogoBtn;
let toggleStlBboxBtn; // Added
let toggleLogoStlVisibilityBtn; // Bind new button
let toggleLogoDecalVisibilityBtn; // Bind new button
let toggleCutResultBtn; // Bind new button for toggling cut result visibility
let toggleAxisHelperBtn; // Added for coordinate system visualization
let debugModelsBtn; // Added for debugging available models
let stlThicknessInput; // Added
let logoThicknessDeltaInput; // Added for cut thin logo control
let cutResultZOffsetInput; // Added for cut result Z offset control
let toggleCutLogoResultBtn; // Added for toggling cut logo result visibility
let toggleCutThinLogoResultBtn; // Added for toggling cut thin logo result visibility
let stlColorSelect; // Added for STL color control
let booleanResultColorSelect; // Added for boolean operation result color control
let mirrorStlCheckbox; // Added for STL mirroring
let cutLogoBtn; // Button for intersecting logo with model (Ensure this is declared globally)

// --- NEW BUTTON --- 
let cutThinLogoBtn; // Button for thin intersection of logo with model
let cutoutLogoBtn; // Button for subtracting logo from model
let cutoutLogoResultBtn; // Button for subtracting logo result from model
let cutoutThinLogoResultBtn; // Button for subtracting thin logo result from model
let repairStlBtn; // ADDED: Button for server-side repair
let downloadModelStlBtn; // ADDED new unified download button variable
let repairBaseModelBtn; // ADDED: Button for repairing the base model
let reloadModelBtn; // ADDED: Button for reloading the original model
// let toggleMirrorLogoStlBtn; // REMOVED: Button to toggle mirror STL (removed from UI)

// --- Three.js Variables --- (Remove variables managed by threeSetup.js)
// let scene, camera, renderer, controls, loader, raycaster, mouse;
let model, logoMesh, logoMaterial, mirroredLogoMesh = null;
let mirroredStlGroup = null; // ADDED: Reference for mirrored STL copy
let logoTexture = null;
let bboxHelper = null, logoBBoxHelper = null, logoStlBboxHelper = null, placementAreaHelper = null;
let axesHelper = null;
let sceneAxisHelper = null; // Added for scene coordinate system visualization
let selectedLogoFile = null; // To store the file selected by the input
let loadedLogoImage = null;  // To store the successfully loaded and validated image
let animationId;

// --- Variables for SVG to STL --- 
// let svgToStlGroup; // Now imported from threeSetup.js
let svgFileName = ''; // Name of the SVG file being processed
let svgPaths = []; // Array to store SVG path data

// --- State Variables ---
let modelLoaded = false;
let currentModelFilename = null; // ADDED: Track the currently loaded model filename
let booleanResultMesh = null; // ADDED: Track the boolean operation result mesh
let lastPlacementPoint = null; // Store decal placement info
let lastPlacementNormal = null;

// --- Initialization ---
function init() {
    // Version and logging setup
    const BOLLER3D_VERSION = "1.0.99";

    // --- Initial Setup ---
    console.log(`%cBoller3D v${BOLLER3D_VERSION} - Clean logging with bold user interactions`, 'font-weight: bold;');
    bindDOMElements();
    // Ensure setupThreeJS is called with the container
    if (!setupThreeJS(viewerContainer)) {
        console.error("Failed to initialize Three.js setup. Aborting initialization.");
        alert("Critical error: Could not initialize 3D view.");
        return;
    }
    populateColorSelectors();
    setupEventListeners();
    fetchAndPopulateModels(); // Fetch models and load the first one
    updatePrice(); // Initial price calculation
    animate();
    console.log("Initialization Complete.");
}

function bindDOMElements() {
    viewerContainer = document.getElementById('viewer-container'); // Ensure viewerContainer is bound first
    logoUploadInput = document.getElementById('logo-upload');
    previewLogoBtn = document.getElementById('preview-logo-btn'); // Renamed
    logoColorSelect = document.getElementById('logo-color');
    logoScaleInput = document.getElementById('logo-scale');
    moveUpLgBtn = document.getElementById('move-up-lg');
    moveDownLgBtn = document.getElementById('move-down-lg');
    moveLeftLgBtn = document.getElementById('move-left-lg');
    moveRightLgBtn = document.getElementById('move-right-lg');
    moveUpSmBtn = document.getElementById('move-up-sm');
    moveDownSmBtn = document.getElementById('move-down-sm');
    moveLeftSmBtn = document.getElementById('move-left-sm');
    moveRightSmBtn = document.getElementById('move-right-sm');
    modelColorSelect = document.getElementById('model-color');
    modelSelect = document.getElementById('model-select');
    quantityInput = document.getElementById('quantity');
    currencySelect = document.getElementById('currency');
    unitPriceSpan = document.getElementById('unit-price');
    totalPriceSpan = document.getElementById('total-price');
    doubleSidedCheckbox = document.getElementById('double-sided-logo');
    toggleBBoxBtn = document.getElementById('toggle-bbox');
    togglePlacementAreaBtn = document.getElementById('toggle-placement-area');
    toggleLogoBBoxBtn = document.getElementById('toggle-logo-bbox');
    centerLogoBtn = document.getElementById('center-logo-btn');
    toggleStlBboxBtn = document.getElementById('toggle-stl-bbox-btn'); // Added
    toggleLogoStlVisibilityBtn = document.getElementById('toggle-logo-stl-visibility-btn'); // Bind new button
    toggleLogoDecalVisibilityBtn = document.getElementById('toggle-logo-decal-visibility-btn'); // Bind new button
    toggleCutResultBtn = document.getElementById('toggle-cut-result-btn'); // Bind new button for cut result visibility
    toggleAxisHelperBtn = document.getElementById('toggle-axis-helper-btn'); // Added for coordinate system visualization
    debugModelsBtn = document.getElementById('debug-models-btn'); // Added for debugging available models
    stlThicknessInput = document.getElementById('stl-thickness'); // Added
    logoThicknessDeltaInput = document.getElementById('logo-thickness-delta'); // Added for cut thin logo control
    stlColorSelect = document.getElementById('stl-color'); // Added for STL color control
    booleanResultColorSelect = document.getElementById('boolean-result-color'); // Added for boolean result color control
    mirrorStlCheckbox = document.getElementById('mirror-stl'); // Added for STL mirroring
    cutoutLogoBtn = document.getElementById('cutout-logo-btn'); // Added for new subtraction feature
    cutoutLogoResultBtn = document.getElementById('cutout-logo-result-btn'); // Added for cutting out logo result
    cutoutThinLogoResultBtn = document.getElementById('cutout-thin-logo-result-btn'); // Added for cutting out thin logo result
    cutLogoBtn = document.getElementById('cut-logo-btn'); // Ensure original Cut Logo button is bound globally
    cutThinLogoBtn = document.getElementById('cut-thin-logo-btn'); // Added for new thin intersection feature
    repairStlBtn = document.getElementById('repair-stl-btn'); // Ensure Repair STL button is bound globally
    downloadModelStlBtn = document.getElementById('download-model-stl-btn'); // ADDED binding for new button
    repairBaseModelBtn = document.getElementById('repair-base-model-btn'); // ADDED binding for new button
    reloadModelBtn = document.getElementById('reload-model-btn'); // ADDED binding for new button
    // toggleMirrorLogoStlBtn = document.getElementById('toggle-mirror-logo-stl-btn'); // REMOVED: button removed from UI

    cutResultZOffsetInput = document.getElementById('cut-result-z-offset'); // Added for cut result Z offset
    toggleCutLogoResultBtn = document.getElementById('toggle-cut-logo-result-btn'); // Added for toggling cut logo result visibility
    toggleCutThinLogoResultBtn = document.getElementById('toggle-cut-thin-logo-result-btn'); // Added for toggling cut thin logo result visibility

    // Basic check if elements exist
    if (!viewerContainer || !modelSelect || !logoUploadInput || !previewLogoBtn || !doubleSidedCheckbox || 
        !toggleBBoxBtn || !togglePlacementAreaBtn || !toggleLogoBBoxBtn || !centerLogoBtn || 
        !toggleStlBboxBtn || !toggleLogoStlVisibilityBtn || !toggleLogoDecalVisibilityBtn || !toggleCutResultBtn || // Check added buttons
        !toggleAxisHelperBtn || // Added axis helper button check
        !stlThicknessInput || !logoThicknessDeltaInput || !stlColorSelect || !booleanResultColorSelect || !mirrorStlCheckbox || !cutoutLogoBtn || !cutoutLogoResultBtn || !cutoutThinLogoResultBtn || !cutThinLogoBtn ||
        !downloadModelStlBtn || !repairBaseModelBtn || !reloadModelBtn || !debugModelsBtn || !cutResultZOffsetInput || !toggleCutLogoResultBtn || !toggleCutThinLogoResultBtn ) { // REMOVED check for toggleMirrorLogoStlBtn
         console.error("One or more essential DOM elements are missing!");
         alert("Initialization failed: Could not find essential page elements.");
         return; // Stop further execution if critical elements are missing
    }

    // Set initial logo scale properties
    if (logoScaleInput) {
        logoScaleInput.min = 1.0;
        logoScaleInput.max = 1.7;
        logoScaleInput.step = 0.1;
        logoScaleInput.value = 1.0;
    }
}

function populateColorSelectors() {
    const optionHeight = '20px'; // Define height for color swatch options
    PALETTE.forEach(color => {
        const optionLogo = document.createElement('option');
        optionLogo.value = color.value;
        // optionLogo.textContent = color.name; // REMOVED: Don't show text
        optionLogo.style.backgroundColor = color.value; // Add swatch color
        optionLogo.style.height = optionHeight; // Set fixed height
        optionLogo.style.minHeight = optionHeight; // Ensure height is applied
        optionLogo.setAttribute('title', color.name); // Add tooltip with color name

        // Basic text color contrast for readability - REMOVED in v1.0.61
        // const lum = chroma(color.value).luminance();
        // optionLogo.style.color = lum > 0.5 ? 'black' : 'white';
        logoColorSelect.appendChild(optionLogo);

        const optionModel = optionLogo.cloneNode(true); // Clone for the model selector
        modelColorSelect.appendChild(optionModel);
        
        // Add color option to STL color selector as well
        if (stlColorSelect) {
            const optionStl = optionLogo.cloneNode(true); // Clone for the STL color selector
            stlColorSelect.appendChild(optionStl);
        }
        
        // Add color option to Boolean Result color selector as well
        if (booleanResultColorSelect) {
            const optionBooleanResult = optionLogo.cloneNode(true); // Clone for the Boolean Result color selector
            booleanResultColorSelect.appendChild(optionBooleanResult);
        }
    });
     // Set default colors (optional, could be first in palette)
    modelColorSelect.value = '#808080'; // Default Gray
    logoColorSelect.value = '#FFFFFF';  // Default White
    if (stlColorSelect) {
        stlColorSelect.value = '#FFA500';  // Default Orange for STL
    }
    // Style the select elements themselves after populating
    styleColorSelect(modelColorSelect);
    styleColorSelect(logoColorSelect);
    if (stlColorSelect) styleColorSelect(stlColorSelect);
    if (booleanResultColorSelect) styleColorSelect(booleanResultColorSelect);

    // *** NEW: Update options based on initial defaults ***
    updateColorSelectorOptions(modelColorSelect, modelColorSelect.value);
    updateColorSelectorOptions(logoColorSelect, logoColorSelect.value);
    if (stlColorSelect) {
        updateColorSelectorOptions(stlColorSelect, stlColorSelect.value);
    }
    if (booleanResultColorSelect) {
        updateColorSelectorOptions(booleanResultColorSelect, booleanResultColorSelect.value);
    }

    // Add event listeners to update select background when changed
    // These listeners ONLY handle the background styling now
    modelColorSelect.addEventListener('change', (e) => styleColorSelect(e.target));
    logoColorSelect.addEventListener('change', (e) => styleColorSelect(e.target));
    if (stlColorSelect) stlColorSelect.addEventListener('change', (e) => styleColorSelect(e.target));
    if (booleanResultColorSelect) booleanResultColorSelect.addEventListener('change', (e) => styleColorSelect(e.target));
}

// *** NEW Helper Function: Update color options in other selectors ***
function updateColorSelectorOptions(changedSelector, newValue) {
    const selectors = [modelColorSelect, logoColorSelect, stlColorSelect, booleanResultColorSelect].filter(s => s); // Filter out nulls
    
    selectors.forEach(selector => {
        // Skip the selector that was just changed
        if (selector === changedSelector) return;

        // Determine which colors should be disabled in this selector
        const colorsToDisable = new Set();
        colorsToDisable.add(newValue); // Disable the newly selected color
        
        // Also disable the color selected in the *third* selector (if applicable)
        selectors.forEach(otherSel => {
            if (otherSel !== changedSelector && otherSel !== selector) {
                colorsToDisable.add(otherSel.value);
            }
        });

        // Enable all options first, then disable the conflicting ones
        for (let i = 0; i < selector.options.length; i++) {
            const option = selector.options[i];
            if (colorsToDisable.has(option.value)) {
                option.disabled = true;
                option.style.setProperty('text-decoration', 'line-through'); // Visual cue
                option.style.setProperty('opacity', '0.5');
            } else {
                option.disabled = false;
                option.style.removeProperty('text-decoration');
                option.style.removeProperty('opacity');
            }
        }
    });
}

// Helper function to style the select element based on the selected option's color
function styleColorSelect(selectElement) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption && selectedOption.style.backgroundColor) {
        selectElement.style.backgroundColor = selectedOption.style.backgroundColor;
        // Optionally set text color for contrast on the select itself
        // Since Chroma.js is removed, we can use a simple brightness check
        try {
            const hexColor = selectedOption.style.backgroundColor;
            // Basic check: if it's a dark color (sum of RGB < 382), use white text
            let r = 0, g = 0, b = 0;
            if (hexColor.startsWith('#')) {
                const bigint = parseInt(hexColor.substring(1), 16);
                r = (bigint >> 16) & 255;
                g = (bigint >> 8) & 255;
                b = bigint & 255;
            } else if (hexColor.startsWith('rgb')) {
                const parts = hexColor.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    r = parseInt(parts[0]);
                    g = parseInt(parts[1]);
                    b = parseInt(parts[2]);
                }
            }
            selectElement.style.color = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000000' : '#FFFFFF';
        } catch (e) {
            console.warn("Could not parse color for select contrast: ", selectedOption.style.backgroundColor)
            selectElement.style.color = 'black'; // Default
        }
    } else {
        // Fallback if no color found (e.g., initial state before selection)
        selectElement.style.backgroundColor = ''; // Use default background
        selectElement.style.color = ''; // Use default text color
    }
}

async function fetchAndPopulateModels() {
    try {
        const response = await fetch('/api/models');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const modelFiles = await response.json();

        console.log("Models received:", modelFiles);
        modelSelect.innerHTML = ''; // Clear existing options

        if (modelFiles && modelFiles.length > 0) {
            modelFiles.forEach(filename => {
                const option = document.createElement('option');
                option.value = filename;
                option.textContent = filename.replace('.stl', ''); // Display cleaner name
                modelSelect.appendChild(option);
            });
            // Load the first model by default
            loadModel(modelFiles[0]);
        } else {
            console.warn("No models found in /models directory.");
            // Optionally display a message to the user
            const option = document.createElement('option');
            option.textContent = "No models available";
            option.disabled = true;
            modelSelect.appendChild(option);
        }
    } catch (error) {
        console.error("Error fetching or parsing models:", error);
        // Optionally display an error to the user
        modelSelect.innerHTML = '<option disabled>Error loading models</option>';
        // Disable download button and reload button if model loading fails
        if (downloadModelStlBtn) downloadModelStlBtn.disabled = true;
        if (reloadModelBtn) reloadModelBtn.disabled = true;
    }
}

function loadModel(filename) {
    if (!filename) return;
    console.log(`Loading model: ${filename}`);

    // Track the current model filename
    currentModelFilename = filename;

    // Remove previous model
    if (model) {
        scene.remove(model);
        // Dispose geometry and material if necessary to free memory
        if(model.geometry) model.geometry.dispose();
        if(model.material) model.material.dispose();
        console.log("Previous model removed.");
    }
     // Remove previous logo if it exists when changing models
    if (logoMesh) {
        scene.remove(logoMesh);
        logoMesh = null; // Reset logo mesh reference
        console.log("Logo removed on model change.");
    }
    resetLogoState(); // Also reset logo selection state

    const modelPath = `/models/${filename}`; // Path relative to server root

    loader.load(modelPath, (geometry) => {
        console.log("Model geometry loaded.");
        geometry.center(); // Center the geometry

        const material = new THREE.MeshPhongMaterial({ // Use imported THREE
            color: new THREE.Color(modelColorSelect.value), // Use imported THREE
            specular: 0x111111,
            shininess: 50
        });

        model = new THREE.Mesh(geometry, material); // Use imported THREE

        // Optional: Adjust scale or rotation if needed
        // model.rotation.x = -Math.PI / 2; // Example: Rotate if model is oriented differently
        // model.scale.set(0.1, 0.1, 0.1); // Example: Scale down

        scene.add(model);
        console.log("Model mesh added to scene.");
        
        // Enable the model download button and reload model button
        if (downloadModelStlBtn) downloadModelStlBtn.disabled = false;
        if (reloadModelBtn) reloadModelBtn.disabled = false;

        // Remove existing helpers if loading a new model
        removeBBoxHelper();
        removePlacementAreaHelper();

        // Adjust camera to fit the model
        const box = new THREE.Box3().setFromObject(model); // Use imported THREE
        const size = box.getSize(new THREE.Vector3()).length(); // Use imported THREE
        const center = box.getCenter(new THREE.Vector3()); // Use imported THREE

        // controls.reset(); // Optional: reset controls state

        controls.target.copy(center); // Look at the center of the model
        camera.position.copy(center);
        // Increase multipliers to start further away (zoomed out by ~25%)
        // Original denominator: 1.0, 1.5, 1.0
        const distFactorX = 1.25;
        const distFactorY = 1.875;
        const distFactorZ = 1.25;
        camera.position.x += size / distFactorX;
        camera.position.y += size / distFactorY;
        camera.position.z += size / distFactorZ;
        camera.lookAt(center);

        // Calculate initial distance (which is now the max distance)
        const initialDistance = camera.position.distanceTo(center);
        controls.maxDistance = initialDistance;

        // Calculate min distance based on 5 zoom clicks from max distance
        const ZOOM_FACTOR = 0.8; // Same factor used for manual zoom
        controls.minDistance = initialDistance * Math.pow(ZOOM_FACTOR, 5); // maxDist * (0.8^5)

        // Clamp current camera position just in case (shouldn't be necessary here)
        // camera.position.clampLength(controls.minDistance, controls.maxDistance);

        console.log(`Zoom range set: min=${controls.minDistance.toFixed(2)}, max=${controls.maxDistance.toFixed(2)}`);

        controls.update(); // Important after changing camera or target

        console.log(`Model ${filename} loaded successfully.`);

    }, undefined, (error) => {
        console.error(`Error loading model ${filename}:`, error);
        alert(`Failed to load model: ${filename}. Please check the file and server console.`);
        // Disable buttons if model loading fails
        if (downloadModelStlBtn) downloadModelStlBtn.disabled = true;
        if (reloadModelBtn) reloadModelBtn.disabled = true;
        currentModelFilename = null; // Clear filename on failure
    });
}

// --- Reload Model Function ---
function reloadModel() {
    if (!currentModelFilename) {
        console.warn("[reloadModel] No current model filename to reload.");
        alert("No model to reload. Please select a model first.");
        return;
    }
    
    console.log(`[reloadModel] Reloading original model: ${currentModelFilename} while preserving boolean result`);
    
    // Store boolean result state before reloading (it will be preserved since loadModel doesn't touch it)
    const hasBooleanResult = booleanResultMesh !== null;
    if (hasBooleanResult) {
        console.log("[reloadModel] Boolean result mesh detected, will be preserved during model reload");
    }
    
    // Update the model selector to reflect the original model
    if (modelSelect) {
        modelSelect.value = currentModelFilename;
    }
    
    // Load the original model (this will only replace the main model, not the boolean result)
    loadModel(currentModelFilename);
    
    console.log(`[reloadModel] Model reload completed. Boolean result preserved: ${hasBooleanResult}`);
}

// --- Logo Handling ---

async function handleLogoSelection(event) {
     selectedLogoFile = event.target.files[0];
     
     // Reset filename and paths immediately
     svgFileName = null;
     svgPaths = [];
     const convertBtn = document.getElementById('svg-convert-btn');
     if (convertBtn) convertBtn.disabled = true; // Disable initially
     
     if (selectedLogoFile) {
         console.log("[handleLogoSelection] File selected:", selectedLogoFile.name);
         // Assign filename immediately after confirming file selection
         svgFileName = selectedLogoFile.name;
         console.log(`[handleLogoSelection] svgFileName assigned: ${svgFileName}`);
         
         // Reset other states
         resetLogoState(); // Calls previewBtn.disabled = false internally
         
         // Detect file type using our vector converter
         const fileType = detectVectorFileType(selectedLogoFile);
         console.log(`[handleLogoSelection] Detected file type: ${fileType}`);
         
         try {
             let svgContent = null;
             
             if (fileType === 'svg') {
                 console.log("[handleLogoSelection] Processing SVG file directly.");
                 svgContent = await readFileAsText(selectedLogoFile);
             } else if (fileType === 'dxf' || fileType === 'dwg') {
                 console.log(`[handleLogoSelection] Converting ${fileType.toUpperCase()} to SVG...`);
                 
                 // Show loading feedback for conversion
                 const originalText = previewLogoBtn ? previewLogoBtn.textContent : '';
                 if (previewLogoBtn) {
                     previewLogoBtn.textContent = `Converting ${fileType.toUpperCase()}...`;
                     previewLogoBtn.disabled = true;
                 }
                 
                 try {
                     svgContent = await convertVectorFileToSvg(selectedLogoFile);
                     console.log(`[handleLogoSelection] ${fileType.toUpperCase()} conversion successful`);
                 } finally {
                     // Restore button text and state
                     if (previewLogoBtn) {
                         previewLogoBtn.textContent = originalText;
                         previewLogoBtn.disabled = false;
                     }
                 }
             } else {
                 throw new Error(`Unsupported file type. Please select an SVG, DXF, or DWG file.`);
             }
             
             // Process the SVG content (either original or converted)
             if (svgContent) {
                 await processSvgContent(svgContent);
             }
             
         } catch (error) {
             console.error("[handleLogoSelection] Error processing file:", error);
             svgPaths = [];
             if (convertBtn) convertBtn.disabled = true;
             alert(`Error processing file: ${error.message}`);
             
             // Reset states on error
             resetLogoState();
             selectedLogoFile = null;
             logoUploadInput.value = '';
         }
         
     } else {
         console.log("[handleLogoSelection] Logo selection cancelled.");
         selectedLogoFile = null;
         resetLogoState();
         if (previewLogoBtn) previewLogoBtn.disabled = true; // Re-disable preview button
         // Button/paths/filename already cleared/disabled above
     }
}

/**
 * Helper function to read file as text
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
 * Process SVG content and extract paths
 */
async function processSvgContent(svgContent) {
    try {
        console.log("[processSvgContent] Processing SVG content...");
        
        // Parse SVG content
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
        
        // Check for parser errors
        const parserError = svgDoc.querySelector('parsererror');
        if (parserError) {
            console.error("SVG Parsing Error:", parserError.textContent);
            throw new Error("Failed to parse SVG content. Check its structure.");
        }

        if (!svgDoc.documentElement) {
            throw new Error("Invalid SVG document structure.");
        }
        
        // Flatten SVG transforms
        if (typeof flatten === 'function') {
            flatten(svgDoc.documentElement);
        } else {
            console.warn("[processSvgContent] flatten function not available, skipping SVG flattening");
        }
        
        // Extract path data
        const pathElements = svgDoc.querySelectorAll("path");
        svgPaths = Array.from(pathElements).map(pathElement => pathElement.getAttribute("d")).filter(d => d);

        console.log(`[processSvgContent] Found ${svgPaths.length} SVG paths.`);
        
        // Update UI based on results
        const convertBtn = document.getElementById('svg-convert-btn');
        if (convertBtn) {
            convertBtn.disabled = (svgPaths.length === 0);
            console.log(`[processSvgContent] SVG Convert button enabled: ${!convertBtn.disabled}`);
        }
        
        if (svgPaths.length === 0) {
            console.warn("[processSvgContent] No paths found in the SVG content.");
        }
        
    } catch (error) {
        console.error("[processSvgContent] Error processing SVG content:", error);
        throw error; // Re-throw to be handled by caller
    }
}

function resetLogoState() {
    if (previewLogoBtn) previewLogoBtn.disabled = (selectedLogoFile === null);
    if (doubleSidedCheckbox) doubleSidedCheckbox.checked = false; // Uncheck on reset
    removeMirroredLogo(); // Remove mirrored logo if it exists
    removeLogoBBoxHelper(); // Remove logo bounding box if it exists
    loadedLogoImage = null;
    
    // Reset logo scale data attributes
    if (logoScaleInput) {
        logoScaleInput.value = 1.0; // Reset scale slider to minimum
        logoScaleInput.setAttribute('data-current-scale', '1.0');
        logoScaleInput.setAttribute('data-max-usable-scale', '1.7'); // Reset to default max
        logoScaleInput.style.setProperty('--value', '1.0');
    }
    
    // Clear all stored max scale values
    const keysCleared = Object.keys(logoMaxScales).length;
    Object.keys(logoMaxScales).forEach(key => {
        delete logoMaxScales[key];
    });
    console.log(`Cleared ${keysCleared} saved logo scale values`);
    
    // Consider if logoMesh should be removed here or only on Visualize/ModelChange
    // if (logoMesh) {
    //     scene.remove(logoMesh);
    //     logoMesh = null;
    // }
    console.log("Logo state reset.");
}

function removeMirroredLogo() {
    if (mirroredLogoMesh) {
        scene.remove(mirroredLogoMesh);
        if (mirroredLogoMesh.geometry) mirroredLogoMesh.geometry.dispose();
        // Material is shared, no need to dispose here
        mirroredLogoMesh = null;
        console.log("Removed mirrored logo.");
    }
}

// --- Combined uploadAndPreviewLogo function ---
function uploadAndPreviewLogo() {
    if (!selectedLogoFile) {
        alert("Please select a logo file first.");
        return;
    }
    console.log("Uploading and previewing logo...");

    // Check if this is a converted vector file with SVG content available
    const fileType = detectVectorFileType(selectedLogoFile);
    if ((fileType === 'dxf' || fileType === 'dwg') && svgPaths && svgPaths.length > 0) {
        console.log("Creating preview from converted SVG content...");
        createPreviewFromSvgPaths();
        return;
    }

    // For SVG files or if no conversion happened, use the original file reading method
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            console.log("Logo image loaded in memory.");
            loadedLogoImage = img; // Store the loaded image
            
            // Check logo colors
            const validLogo = checkLogoColors(img); 
            
            if (validLogo) {
                // If logo is valid, proceed to show it
                showLogo();
            } else {
                alert("Logo must contain only one color (plus transparency). Please choose a different file.");
                resetLogoState();
                selectedLogoFile = null;
                logoUploadInput.value = '';
            }
        };
        img.onerror = function() {
            console.error("Error loading image data from file reader result.");
            alert("Could not load the selected image file. It might be corrupted or in an unsupported format.");
            resetLogoState();
            selectedLogoFile = null; // Clear selection on error
            logoUploadInput.value = ''; // Reset file input
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        console.error("FileReader error.");
        alert("Error reading the selected file.");
        resetLogoState();
        selectedLogoFile = null;
        logoUploadInput.value = '';
    };
    reader.readAsDataURL(selectedLogoFile);
}

/**
 * Create a preview image from converted SVG paths (for DXF/DWG files)
 */
function createPreviewFromSvgPaths() {
    if (!svgPaths || svgPaths.length === 0) {
        console.error("No SVG paths available for preview creation");
        alert("No paths found in the converted file.");
        resetLogoState();
        return;
    }

    try {
        console.log("Creating preview from", svgPaths.length, "SVG paths");
        console.log("Sample path data:", svgPaths[0].substring(0, 100) + "...");

        // Calculate bounding box of all paths
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidCoords = false;

        svgPaths.forEach(pathData => {
            // Extract coordinates from path data using regex
            const coords = pathData.match(/[-+]?[0-9]*\.?[0-9]+/g);
            if (coords) {
                for (let i = 0; i < coords.length; i += 2) {
                    const x = parseFloat(coords[i]);
                    const y = parseFloat(coords[i + 1]);
                    if (!isNaN(x) && !isNaN(y)) {
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                        hasValidCoords = true;
                    }
                }
            }
        });

        if (!hasValidCoords) {
            console.error("No valid coordinates found in SVG paths");
            alert("Could not extract coordinates from converted paths.");
            resetLogoState();
            return;
        }

        // Add padding around the content
        const padding = Math.max((maxX - minX), (maxY - minY)) * 0.1;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const width = maxX - minX;
        const height = maxY - minY;

        console.log(`Calculated bounds: X(${minX.toFixed(2)} to ${maxX.toFixed(2)}), Y(${minY.toFixed(2)} to ${maxY.toFixed(2)})`);
        console.log(`Dimensions: ${width.toFixed(2)} x ${height.toFixed(2)}`);

        // Create an SVG element with calculated viewBox
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "500");
        svg.setAttribute("height", "500");
        svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        // No background color - keep transparent for proper masking

        // Add all paths to the SVG with thick black strokes for visibility
        svgPaths.forEach(pathData => {
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", pathData);
            path.setAttribute("fill", "black");  // Use fill for better visibility in mask conversion
            path.setAttribute("stroke", "black");
            path.setAttribute("stroke-width", Math.max(width, height) * 0.01); // Thicker stroke for visibility
            svg.appendChild(path);
        });

        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(svg);
        console.log("Generated SVG preview:", svgData.substring(0, 200) + "...");
        
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);

        // Create image from SVG
        const img = new Image();
        img.onload = function() {
            console.log("Logo image created from converted SVG paths.");
            loadedLogoImage = img;
            
            // For converted vector files, skip color checking (assume single color)
            console.log("Skipping color check for converted vector file - proceeding directly to show logo.");
            showLogo();
            
            // Clean up the object URL
            URL.revokeObjectURL(svgUrl);
        };
        img.onerror = function() {
            console.error("Error creating image from converted SVG paths.");
            alert("Could not create preview from the converted file.");
            resetLogoState();
            URL.revokeObjectURL(svgUrl);
        };
        img.src = svgUrl;

    } catch (error) {
        console.error("Error in createPreviewFromSvgPaths:", error);
        alert("Error creating preview from converted file.");
        resetLogoState();
    }
}

function checkLogoColors(image) {
    console.log("Checking logo colors...");
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.naturalWidth; // Use natural dimensions
    canvas.height = image.naturalHeight;
    ctx.drawImage(image, 0, 0);

    try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const uniqueColors = new Set();

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Only consider non-transparent pixels
            if (a > 10) { // Use a threshold for transparency
                // Convert to hex for easier comparison (optional, could use rgb string)
                const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
                uniqueColors.add(hex);
            }
             // Stop checking if more than one color is found
             if (uniqueColors.size > 1) {
                 break;
             }
        }

        console.log("Unique colors found (excluding transparent):", uniqueColors);

        if (uniqueColors.size <= 1) {
            console.log("Color check passed (<= 1 color).");
            return true;
        } else {
            console.log("Color check failed (> 1 color).");
            return false;
        }
    } catch (e) {
         // This can happen due to CORS issues if loading images from different origins
         // Should not be an issue here as we use FileReader
         console.error("Error getting image data:", e);
         alert("Could not analyze image colors. Please try a different image or format.");
         return false;
    }
}

function visualizeLogo() {
    if (!loadedLogoImage) {
        console.error("visualizeLogo called without loadedLogoImage.");
        return false; // Indicate failure
    }
    if (!model) {
        console.error("visualizeLogo called without model.");
        return false; // Indicate failure
    }
    console.log("Visualizing logo (part of showLogo sequence)...");

                // Remove previous logo if it exists
                if (logoMesh) {
                    scene.remove(logoMesh);
        if (logoMesh.geometry) logoMesh.geometry.dispose(); // Dispose old geo
                }
    removeMirroredLogo(); // Ensure mirror is removed too

    // Process image on canvas (necessary for texture)
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

    // -- START SVG QUALITY FIX --
    // Define a higher resolution for better texture quality
    const targetWidth = 2048; // Increased from 1024 for better quality
    const sourceWidth = loadedLogoImage.naturalWidth;
    const sourceHeight = loadedLogoImage.naturalHeight;
    const aspect = sourceWidth / sourceHeight;

    // Calculate canvas dimensions based on target width and aspect ratio
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth / aspect); // Use Math.round to avoid fractional pixels

    // Enable high-quality image smoothing for better anti-aliasing
    ctx.imageSmoothingQuality = 'high';
    ctx.imageSmoothingEnabled = true; // Changed to true for better quality

    // Draw the SVG image onto the larger canvas
    ctx.drawImage(loadedLogoImage, 0, 0, canvas.width, canvas.height);
    // -- END SVG QUALITY FIX --

    // --- START FORCE TEXTURE WHITE (Enhanced for converted vector files) ---
    const fileType = selectedLogoFile ? detectVectorFileType(selectedLogoFile) : 'unknown';
    const isConvertedVectorFile = (fileType === 'dxf' || fileType === 'dwg');
    
    try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        if (isConvertedVectorFile) {
            // For converted vector files: convert any non-white, non-transparent pixels to white
            // This preserves the geometry while making it work with the material color system
            let pixelsConverted = 0;
            let totalNonTransparentPixels = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1]; 
                const b = data[i + 2];
                const alpha = data[i + 3];
                
                if (alpha > 20) {
                    totalNonTransparentPixels++;
                    
                    // Check if pixel is not already white
                    if (r < 240 || g < 240 || b < 240) {
                        // Convert dark/colored pixels to white, preserve transparency
                        data[i] = 255;     // R
                        data[i + 1] = 255; // G
                        data[i + 2] = 255; // B
                        // Keep original alpha: data[i + 3] = alpha;
                        pixelsConverted++;
                    }
                }
            }
            console.log(`Converted vector file content to white mask: ${pixelsConverted} pixels converted out of ${totalNonTransparentPixels} non-transparent pixels.`);
        } else {
            // Regular logic for SVG/image files
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                // If pixel is not transparent (alpha > threshold), force to white
                if (alpha > 20) { // Use a threshold like 20 out of 255
                    data[i] = 255;     // R
                    data[i + 1] = 255; // G
                    data[i + 2] = 255; // B
                    // Keep original alpha: data[i + 3] = alpha;
                }
            }
            console.log("Forced logo texture canvas to white mask.");
        }
        
        // Put the modified data back onto the canvas
        ctx.putImageData(imageData, 0, 0);
    } catch (e) {
        console.error("Error processing image data to force white mask:", e);
        // Proceed without mask if error occurs?
    }
    // --- END FORCE TEXTURE WHITE ---

    // Create texture from the potentially modified canvas
                logoTexture = new THREE.Texture(canvas); // Use imported THREE
    
    // Improve texture quality to reduce artifacts
    logoTexture.generateMipmaps = true;
    logoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    logoTexture.magFilter = THREE.LinearFilter;
    logoTexture.wrapS = THREE.ClampToEdgeWrap;
    logoTexture.wrapT = THREE.ClampToEdgeWrap;
    logoTexture.needsUpdate = true;

    // Create material with improved settings for better decal quality
                logoMaterial = new THREE.MeshBasicMaterial({ // Use imported THREE
                    map: logoTexture,
                    transparent: true,
        side: THREE.DoubleSide, // Use imported THREE
        color: new THREE.Color(logoColorSelect.value), // Use imported THREE
        alphaTest: 0.1, // Helps with transparency artifacts
        depthWrite: false, // Prevents z-fighting issues
        depthTest: true,
        polygonOffset: true, // Enable polygon offset for decals
        polygonOffsetFactor: -1, // Push decal forward
        polygonOffsetUnits: -1
    });
    console.log(`Created logo material with color: ${logoColorSelect.value}`);

    // Create geometry (PlaneGeometry)
    const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
    const modelSize = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
    const defaultLogoSize = Math.min(modelSize.x, modelSize.y) * 0.5;
    const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight; // Get aspect here
    const logoGeometry = new THREE.PlaneGeometry(defaultLogoSize * imgAspect, defaultLogoSize); // Use imported THREE

    // Create the mesh (initially flat plane)
                logoMesh = new THREE.Mesh(logoGeometry, logoMaterial); // Use imported THREE
    logoMesh.scale.set(parseFloat(logoScaleInput.value), parseFloat(logoScaleInput.value), 1); // Apply current scale

    // --- Initial Positioning (Centered) ---
    const modelCenter = modelBox.getCenter(new THREE.Vector3()); // Use imported THREE
    logoMesh.position.copy(modelCenter);
    logoMesh.position.z = modelBox.max.z + 0.01;
    logoMesh.rotation.set(0, 0, 0);
    logoMesh.updateMatrixWorld();

    // Add the initial flat mesh to the scene
                scene.add(logoMesh);
    console.log("Initial flat logo mesh created and added.");

    return true; // Indicate success
}

// --- NEW FUNCTION to combine visualize and place --- 
function showLogo() {
     console.log("'Show Logo' button clicked.");

     // First remove logo bounding box if it exists
     removeLogoBBoxHelper();

     // 1. Visualize (Create flat plane logo)
     if (!visualizeLogo()) { // visualizeLogo now returns true/false
         alert("Failed to create initial logo. Check console.");
         return; // Stop if visualization fails
     }

     // 2. Place on Surface (Create Decal)
     console.log("Proceeding to place logo as decal...");
     if (!model || !logoMesh || !camera || !raycaster || !logoMaterial) {
         alert("Cannot place logo on surface: Missing required elements.");
         console.warn("Cannot place logo on surface: Model, logo, camera, material or raycaster missing.");
         return;
     }

     // Raycast from camera center towards model
     raycaster.setFromCamera({ x: 0, y: 0 }, camera);
     const intersects = raycaster.intersectObject(model);

     if (intersects.length > 0) {
         const intersect = intersects[0];
         const point = intersect.point;
         const normal = intersect.face.normal.clone();

         // Transform normal to world space
         const rotationMatrix = new THREE.Matrix4(); // Use imported THREE
         rotationMatrix.extractRotation(model.matrixWorld);
         normal.applyMatrix4(rotationMatrix).normalize();

         console.log("Raycast hit model at:", point);
         console.log("Surface normal (world):", normal);

         // --- DECAL PLACEMENT LOGIC (moved from placeLogoOnSurface) ---
         scene.remove(logoMesh);
         if (logoMesh.geometry) logoMesh.geometry.dispose();

         // Store placement info before creating decal
         lastPlacementPoint = point.clone();
         lastPlacementNormal = normal.clone(); // World space normal

         const tempMatrix = new THREE.Matrix4(); // Use imported THREE
         tempMatrix.lookAt(point, point.clone().sub(normal), new THREE.Vector3(0, 1, 0)); // Use imported THREE
         const orientation = new THREE.Euler(); // Use imported THREE
         orientation.setFromRotationMatrix(tempMatrix);

         const currentScaleValue = parseFloat(logoScaleInput.value);
         if (!loadedLogoImage || isNaN(currentScaleValue)) {
              console.error("Cannot determine decal size."); return;
         }
         const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
         const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
         const modelSizeVec = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
         const baseSize = Math.min(modelSizeVec.x, modelSizeVec.y) * 0.5;
         const decalHeight = baseSize * currentScaleValue;
         const decalWidth = decalHeight * imgAspect;
         const decalDepth = Math.min(decalWidth, decalHeight) * 0.1;
         const size = new THREE.Vector3(decalWidth, decalHeight, decalDepth);

         // Add larger offset to prevent z-fighting (like cut logo offset)
         const offsetPoint = point.clone().add(normal.clone().multiplyScalar(0.1));
         
         const decalGeometry = new DecalGeometry(model, offsetPoint, orientation, size); // Use imported DecalGeometry

         if (!logoMaterial) {
              console.error("Cannot create decal mesh: logoMaterial is missing."); return;
         }
         logoMesh = new THREE.Mesh(decalGeometry, logoMaterial); // Use imported THREE
         
         // Set render order to help with depth sorting
         logoMesh.renderOrder = 1;

         scene.add(logoMesh);
         console.log("Logo placed as decal on surface.");

         // If double-sided is already checked, create mirror immediately
         if (doubleSidedCheckbox.checked) {
             createOrUpdateMirroredLogo();
         }
         // --- END DECAL PLACEMENT LOGIC ---

     } else {
         console.warn("Raycast did not hit the model from camera center. Logo remains flat.");
         // Clear previous placement info if raycast fails
         lastPlacementPoint = null;
         lastPlacementNormal = null;
         // Optionally alert user or just leave the flat logo placed initially by visualizeLogo
         // alert("Could not find surface. Logo shown flat.");
     }
     
     // First center the logo on the model after initial placement
     setTimeout(() => {
         console.log("Auto-centering logo after placement...");
         centerLogo();
         
         // Then automatically apply max scale after centering
         setTimeout(() => {
             console.log("Auto-applying max scale after centering...");
             
             // Check if we already have a saved maximum scale for this logo 
             const logoFilename = logoUploadInput ? logoUploadInput.files[0]?.name : null;
             const fileKey = createFilenameKey(logoFilename);
             const savedMaxScale = logoFilename ? logoMaxScales[fileKey] : null;
                 
             let maxScale;
             
             if (!isNaN(savedMaxScale) && savedMaxScale > 0) {
                 // Use the previously calculated max scale
                 console.log(`Using saved maximum scale for ${logoFilename}: ${savedMaxScale}`);
                 maxScale = savedMaxScale;
             } else {
                 // Calculate the max scale fresh
                 maxScale = findMaximumScale();
                 
                 // Save this max scale for future reference if we have a filename
                 if (logoFilename) {
                     logoMaxScales[fileKey] = maxScale;
                     console.log(`Saved maximum scale ${maxScale} for logo ${logoFilename}`);
                 }
             }
             
             // Get the slider's max value from its attribute (1.7)
             const sliderMaxValue = parseFloat(logoScaleInput.max);
             
             // Apply the maximum scale (actual scale, not the slider visual position)
             applyLogoScale(maxScale);
             
             // Store data about the actual scale vs. visual slider position
             logoScaleInput.setAttribute('data-current-scale', maxScale.toString());
             logoScaleInput.setAttribute('data-max-usable-scale', maxScale.toString());
             
             // Set slider visual position 
             if (maxScale <= 1.0) {
                 // For large logos that can't scale up, set slider to max position (represents full size)
                 logoScaleInput.value = sliderMaxValue;
                 console.log(`Large logo: slider positioned at maximum (${sliderMaxValue}) representing full size`);
             } else {
                 // For normal logos, set slider to maximum for UX consistency
                 logoScaleInput.value = sliderMaxValue;
                 console.log(`Logo automatically set to maximum scale: ${maxScale.toFixed(2)}`);
             }
             
             // Force the slider's appearance to update 
             logoScaleInput.style.setProperty('--value', logoScaleInput.value);
             void logoScaleInput.offsetWidth;
             
             // Don't dispatch events for large logos to avoid confusion
             if (maxScale > 1.0) {
                 logoScaleInput.dispatchEvent(new Event('input', { bubbles: true }));
                 logoScaleInput.dispatchEvent(new Event('change', { bubbles: true }));
             }
             
             console.log(`Slider visually positioned at: ${logoScaleInput.value}`);
             
             // Log boundary information for debugging
             logBoundaryInfo();
         }, 100);
     }, 100); // Slight delay to ensure everything is properly set up
}

// Create a global listener function for logo scale changes
function handleLogoScaleChange() {
    if (!logoMesh) {
        return;
    }
    
    // Get the current slider value
    const sliderValue = parseFloat(this.value);
    if (isNaN(sliderValue) || sliderValue < 1.0 || sliderValue > 1.7) {
        console.warn("Invalid scale value:", sliderValue);
        return;
    }
    
    // Get the maximum usable scale
    const maxUsableScale = parseFloat(this.getAttribute('data-max-usable-scale') || "1.7");
    
    // Calculate proportional scale
    const sliderMin = parseFloat(this.min);
    const sliderMax = parseFloat(this.max);
    const sliderRange = sliderMax - sliderMin;
    
    // Calculate desired scale based on slider position
    const proportion = (sliderValue - sliderMin) / sliderRange;
    
    let actualScale;
    if (maxUsableScale <= 1.0) {
        // For logos that can't scale up, allow scaling down from 1.0 to 0.3
        // Map slider range (1.0-1.7) to scale range (0.3-1.0)
        actualScale = 0.3 + (proportion * (1.0 - 0.3));
        console.log(`[LOGO SCALE] Large logo - scaling down: slider ${sliderValue.toFixed(2)} -> scale ${actualScale.toFixed(3)}`);
    } else {
        // Normal scaling: map slider range to scale range (1.0 to maxUsableScale)
        actualScale = 1.0 + (proportion * (maxUsableScale - 1.0));
    }
    
    // Important: Do boundary check before applying scale
    if (lastPlacementPoint) {
        const boundaryCheck = checkLogoBoundaries(lastPlacementPoint, actualScale);
        
        if (boundaryCheck.exceeds) {
            // Force to the maximum safe scale
            actualScale = maxUsableScale;
            
            // Update the visual slider to reflect the actual allowed scale
            const visualPosition = sliderMin + ((actualScale - 1.0) / (maxUsableScale - 1.0)) * sliderRange;
            
            // Only update if significantly different to avoid infinite loops
            if (Math.abs(this.value - visualPosition) > 0.01) {
                this.value = visualPosition;
                this.style.setProperty('--value', visualPosition);
            }
        }
    }
    
    // Update data attribute with the actual scale being used
    this.setAttribute('data-current-scale', actualScale.toString());
    
    // Log only the final applied scale
    console.log(`[LOGO SCALE] Applied scale: ${actualScale.toFixed(3)}`);
    
    // Directly call applyLogoScale with the properly constrained scale
    applyLogoScale(actualScale);
}

// This will be called after DOM binding
function attachLogoScaleListeners() {
    if (logoScaleInput) {
        logoScaleInput.addEventListener('input', handleLogoScaleChange);
        logoScaleInput.addEventListener('change', handleLogoScaleChange);
        console.log("Logo scale slider event listeners attached successfully.");
    } else {
        console.error("Logo scale input not found - slider will not work!");
    }
}

// Update applyLogoScale to ensure it works independently of position changes
function applyLogoScale(scaleValue) {
    if (!logoMesh || !model || !logoMaterial || !loadedLogoImage) {
        console.warn("Cannot apply scale: Missing required components");
        return;
    }
    
    // If we have valid placement info, use it
    if (lastPlacementPoint && lastPlacementNormal) {
        // Store current quaternion to preserve orientation
        const currentQuaternion = new THREE.Quaternion(); // Use imported THREE
        logoMesh.getWorldQuaternion(currentQuaternion);
        
        // Remove current logo
        scene.remove(logoMesh);
        if (logoMesh.geometry) logoMesh.geometry.dispose();
        
        // Calculate new dimensions
        const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
        const modelSizeVec = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
        const baseSize = Math.min(modelSizeVec.x, modelSizeVec.y) * 0.5;
        const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
        const decalHeight = baseSize * scaleValue;
        const decalWidth = decalHeight * imgAspect;
        const decalDepth = Math.min(decalWidth, decalHeight) * 0.5;
        const decalSize = new THREE.Vector3(decalWidth, decalHeight, decalDepth);
        
        // Create orientation matrix
        const tempMatrix = new THREE.Matrix4(); // Use imported THREE
        tempMatrix.lookAt(
            lastPlacementPoint.clone(),
            lastPlacementPoint.clone().add(lastPlacementNormal.clone()),
            new THREE.Vector3(0, 1, 0) // Use imported THREE
        );
        const orientation = new THREE.Euler(); // Use imported THREE
        orientation.setFromRotationMatrix(tempMatrix);
        
        // Create new decal geometry with improved positioning
        try {
                         // Add larger offset to prevent z-fighting (like cut logo offset)
             const offsetPoint = lastPlacementPoint.clone().add(lastPlacementNormal.clone().multiplyScalar(0.1));
            
            const decalGeometry = new DecalGeometry( // Use imported DecalGeometry
                model, 
                offsetPoint, 
                orientation, 
                decalSize
            );
            
            // Create new logo mesh
            logoMesh = new THREE.Mesh(decalGeometry, logoMaterial); // Use imported THREE
            
            // Apply stored orientation
            logoMesh.quaternion.copy(currentQuaternion);
            
            // Set render order to help with depth sorting
            logoMesh.renderOrder = 1;
            
            // Add to scene
            scene.add(logoMesh);
            
            // Update mirrored logo if needed
            if (doubleSidedCheckbox && doubleSidedCheckbox.checked) {
                createOrUpdateMirroredLogo();
            }
            
            // Update logo bounding box if needed
            if (logoBBoxHelper) {
                removeLogoBBoxHelper();
                const box = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
                logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000); // Use imported THREE
                scene.add(logoBBoxHelper);
            }
            
            renderer.render(scene, camera);
        } catch(error) {
            console.error("Error creating decal geometry:", error);
        }
    } else {
        // For direct flat logo scaling
        console.log("Using direct scaling for flat logo");
        if (logoMesh.geometry instanceof THREE.PlaneGeometry) { // Use imported THREE
            logoMesh.scale.set(scaleValue, scaleValue, 1);
            logoMesh.updateMatrix();
            renderer.render(scene, camera);
        }
    }
}

// --- Bounding Box Visualization ---
function removeBBoxHelper() {
    if (bboxHelper) {
        scene.remove(bboxHelper);
        // No need to dispose Box3Helper geometry/material specifically
        // bboxHelper.geometry.dispose();
        // bboxHelper.material.dispose();
        bboxHelper = null;
    }
    if (axesHelper) {
        scene.remove(axesHelper);
        axesHelper.geometry.dispose(); // AxesHelper needs disposal
        axesHelper.material.dispose();
        axesHelper = null;
    }
}

function toggleBoundingBox() {
    if (!model) {
        console.warn("Cannot toggle bounding box: No model loaded.");
        return;
    }

    if (bboxHelper) {
        // If helpers exist, remove them
        removeBBoxHelper();
        console.log("Bounding box and axes removed.");
    } else {
        // If helpers don't exist, create and add them
        const box = new THREE.Box3().setFromObject(model); // Use imported THREE
        bboxHelper = new THREE.Box3Helper(box, 0xffff00); // Use imported THREE
        scene.add(bboxHelper);

        // Add axes helper at the center of the bounding box
        const center = box.getCenter(new THREE.Vector3()); // Use imported THREE
        const sizeVec = box.getSize(new THREE.Vector3()); // Use imported THREE
        const axesSize = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) * 0.6; // Make axes size relative to model size
        axesHelper = new THREE.AxesHelper(axesSize); // Use imported THREE
        axesHelper.position.copy(center); // Position axes at the center
        scene.add(axesHelper);

        console.log("Bounding box and axes added.");
    }
}

// --- Logo Bounding Box Visualization ---
function removeLogoBBoxHelper() {
    if (logoBBoxHelper) {
        scene.remove(logoBBoxHelper);
        logoBBoxHelper = null;
    }
}

function toggleLogoBBox() {
    if (!logoMesh) {
        console.warn("Cannot toggle logo bounding box: No logo present.");
        return;
    }

    if (logoBBoxHelper) {
        // If helper exists, remove it
        removeLogoBBoxHelper();
        console.log("Logo bounding box removed.");
    } else {
        // Create a bounding box around the logo
        const box = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
        logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000); // Use imported THREE
        scene.add(logoBBoxHelper);
        console.log("Logo bounding box added.");
    }
}

// --- NEW: Logo STL Bounding Box Visualization ---
function removeLogoStlBboxHelper() {
    if (logoStlBboxHelper) {
        scene.remove(logoStlBboxHelper);
        logoStlBboxHelper = null;
    }
}

function toggleLogoStlBbox() {
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("Cannot toggle Logo STL bounding box: No SVG->STL object present.");
        return;
    }

    if (logoStlBboxHelper) {
        removeLogoStlBboxHelper();
        console.log("Logo STL bounding box removed.");
    } else {
        // Create a bounding box around the entire SVG group
        const box = new THREE.Box3().setFromObject(svgToStlGroup); // Use imported THREE
        if (box.isEmpty()) {
            console.warn("Cannot toggle Logo STL bounding box: Box is empty.");
            return;
        }
        logoStlBboxHelper = new THREE.Box3Helper(box, 0x0000ff); // Use imported THREE
        scene.add(logoStlBboxHelper);
        console.log("Logo STL bounding box added.");
    }
}

// --- Placement Area Visualization ---
function removePlacementAreaHelper() {
    if (placementAreaHelper) {
        scene.remove(placementAreaHelper);
        // If using multiple meshes, iterate and dispose
        if (placementAreaHelper.geometry) placementAreaHelper.geometry.dispose();
        if (placementAreaHelper.material) placementAreaHelper.material.dispose();
        placementAreaHelper = null;
    }
}

function togglePlacementArea() {
    if (!model) {
        console.warn("Cannot toggle placement area: No model loaded.");
        return;
    }

    if (placementAreaHelper) {
        removePlacementAreaHelper();
        console.log("Placement area helper removed.");
    } else {
        // Create a bounding box for the placement area
        const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
        const size = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
        const center = modelBox.getCenter(new THREE.Vector3()); // Use imported THREE
        
        // Create a new box with specified dimensions
        const placeBox = new THREE.Box3(); // Use imported THREE
        placeBox.min.set(
            center.x - (size.x * 0.75) / 2,
            center.y - (size.y * 0.75) / 2,
            center.z - (size.z * 1.1) / 2
        );
        placeBox.max.set(
            center.x + (size.x * 0.75) / 2,
            center.y + (size.y * 0.75) / 2,
            center.z + (size.z * 1.1) / 2
        );
        
        // Create a box helper (wireframe) instead of a solid mesh
        placementAreaHelper = new THREE.Box3Helper(placeBox, 0x00ff00); // Use imported THREE
        scene.add(placementAreaHelper);
        
        // Store the box for constraint checking
        placementAreaHelper.userData.box = placeBox;
        
        console.log("Placement area helper added as wireframe box.");
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    console.log("Setting up Event Listeners...");

    // Logo Workflow
    if (logoUploadInput) {
        logoUploadInput.addEventListener('change', handleLogoSelection);
    }
    
    if (previewLogoBtn) {
        previewLogoBtn.addEventListener('click', uploadAndPreviewLogo); // Use new combined function
    }

    // Model Selection
    if (modelSelect) {
        modelSelect.addEventListener('change', (event) => {
            loadModel(event.target.value);
        });
    }

    // Color Changes - *** REVISED LISTENERS ***
    if (logoColorSelect) {
        logoColorSelect.addEventListener('change', function(event) { // Use function for 'this'
            const newLogoColor = this.value;
            console.log(`Logo color changed to: ${newLogoColor}`);

            // Remove alert logic - Handled by disabling options
            // if (newLogoColor === modelColorSelect.value) { ... }

            // Update logo material color
            if (logoMaterial) {
                logoMaterial.color.setStyle(newLogoColor);
                console.log("Logo material color updated.");
            } else {
                console.log("Logo material not found for color update.");
            }
            
            // Update options in other selectors
            updateColorSelectorOptions(this, newLogoColor);
        });
    }
    
    if (modelColorSelect) {
        modelColorSelect.addEventListener('change', function(event) { // Use function for 'this'
            const newModelColor = this.value;
            console.log(`Model color changed to: ${newModelColor}`);

            // Remove alert logic - Handled by disabling options
            // if (newModelColor === (logoColorSelect ? logoColorSelect.value : '#FFFFFF')) { ... }

            // Update model material color
            if (model && model.material) {
                model.material.color.setStyle(newModelColor);
                console.log("Model material color updated.");
            }
            
            // Update options in other selectors
            updateColorSelectorOptions(this, newModelColor);
        });
    }

    // Add listener for STL Color Select
    if (stlColorSelect) {
        stlColorSelect.addEventListener('change', function(event) { // Use function for 'this'
            const newStlColor = this.value;
            console.log(`STL color changed to: ${newStlColor}`);
            
            // Update options in other selectors
            updateColorSelectorOptions(this, newStlColor);

            // --- Live Update STL Mesh Color --- 
            if (svgToStlGroup && svgToStlGroup.children.length > 0) {
                svgToStlGroup.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        // Ensure material is mutable (clone if shared, though unlikely here after repair)
                        // if (child.material === sharedMaterial) { 
                        //     child.material = child.material.clone(); 
                        // }
                        child.material.color.setStyle(newStlColor);
                        child.material.needsUpdate = true; // May not be strictly needed for color, but good practice
                    }
                });
                console.log(`Updated color of ${svgToStlGroup.children.length} mesh(es) in svgToStlGroup.`);
                // ALSO update mirrored copy if it exists
                if (mirroredStlGroup && mirroredStlGroup.children.length > 0) {
                     mirroredStlGroup.traverse((child) => {
                        if (child instanceof THREE.Mesh && child.material) {
                            // Assume same material or clone needed?
                            child.material.color.setStyle(newStlColor);
                            child.material.needsUpdate = true; 
                        }
                    });                   
                }
            } else {
                console.log("No STL mesh found in svgToStlGroup to update color.");
            }
            // --- End Live Update --- 
        });
    }

    // Add listener for Boolean Result Color Select
    if (booleanResultColorSelect) {
        booleanResultColorSelect.addEventListener('change', function(event) { // Use function for 'this'
            const newBooleanResultColor = this.value;
            console.log(`Boolean result color changed to: ${newBooleanResultColor}`);
            
            // Update options in other selectors
            updateColorSelectorOptions(this, newBooleanResultColor);

            // --- Live Update Boolean Result Mesh Color --- 
            if (booleanResultMesh && booleanResultMesh.material) {
                booleanResultMesh.material.color.setStyle(newBooleanResultColor);
                booleanResultMesh.material.needsUpdate = true;
                console.log(`Updated boolean result mesh color to: ${newBooleanResultColor}`);
            } else {
                console.log("No boolean result mesh found to update color.");
            }
            // --- End Live Update --- 
        });
    }

    // Add listener for Mirror STL Checkbox
    if (mirrorStlCheckbox) {
        mirrorStlCheckbox.addEventListener('change', handleMirrorStlToggle);
    }

    // Add listener for Reload Model Button
    if (reloadModelBtn) {
        reloadModelBtn.addEventListener('click', reloadModel);
    }

    // Logo Transform Controls - The slider is handled elsewhere

    // Logo Movement Listeners
    const MOVE_STEP_LG = 0.8; // Increased step x4
    const MOVE_STEP_SM = 0.08; // Increased step x4
    const applyLogoMove = (axis, step) => {
        console.log(`[LOGO MOVE] Attempting to move logo ${axis} by ${step}`);
        console.log(`[LOGO MOVE] logoMesh exists: ${!!logoMesh}`);
        console.log(`[LOGO MOVE] lastPlacementPoint exists: ${!!lastPlacementPoint}`);
        console.log(`[LOGO MOVE] lastPlacementNormal exists: ${!!lastPlacementNormal}`);
        
        if (logoMesh && logoMesh.geometry instanceof THREE.PlaneGeometry) {
            // For original flat plane geometry
            logoMesh.position[axis] += step;
            
            // Update logo bounding box if active
            if (logoBBoxHelper) {
                removeLogoBBoxHelper();
                const box = new THREE.Box3().setFromObject(logoMesh);
                logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000);
                scene.add(logoBBoxHelper);
            }
        } else if (logoMesh && lastPlacementPoint && lastPlacementNormal) {
            // Get the actual scale value from the data attribute, not the slider visual position
            // This is critical because we use the slider position for visual feedback only
            const actualScale = parseFloat(logoScaleInput.getAttribute('data-current-scale')) || 1.0;
            console.log(`Moving logo with fixed scale: ${actualScale}`);
            
            // Store current quaternion to preserve orientation exactly
            const currentQuaternion = new THREE.Quaternion();
            logoMesh.getWorldQuaternion(currentQuaternion);
            
            // For decal: calculate new position by moving in tangent plane
            const normal = lastPlacementNormal.clone().normalize();
            
            // Create a movement vector in the desired axis
            const moveVec = new THREE.Vector3();
            moveVec[axis] = step;
            
            // Project movement onto the tangent plane of the surface
            // by subtracting the component along the normal
            const dotProduct = moveVec.dot(normal);
            const normalComponent = normal.clone().multiplyScalar(dotProduct);
            const tangentComponent = moveVec.clone().sub(normalComponent);
            
            // Create a copy of the current point for boundary checking
            const newPoint = lastPlacementPoint.clone().add(tangentComponent);
            
            // Check if move would exceed placement area bounds - position only check
            const boundaryCheck = checkLogoBoundaries(newPoint, actualScale);
            
            if (boundaryCheck.exceeds) {
                console.log(`Move constrained: would exceed placement area on: ${boundaryCheck.details.join(', ')}`);
                // Allow small movements even if they exceed boundaries slightly
                const moveDistance = Math.sqrt(tangentComponent.x * tangentComponent.x + tangentComponent.y * tangentComponent.y + tangentComponent.z * tangentComponent.z);
                if (moveDistance > 2.0) { // Only block large movements
                    console.log(`Blocking large movement of ${moveDistance.toFixed(2)}mm`);
                    return; // Don't move if it would go out of bounds
                } else {
                    console.log(`Allowing small movement of ${moveDistance.toFixed(2)}mm despite boundary constraint`);
                }
            }
            
            // Update last placement point with new position
            lastPlacementPoint.copy(newPoint);
            
            // Record the current logo size before removing it
            const currentLogoBox = new THREE.Box3().setFromObject(logoMesh);
            const currentLogoSize = currentLogoBox.getSize(new THREE.Vector3());
            console.log(`Current logo size before move: X=${currentLogoSize.x.toFixed(3)}, Y=${currentLogoSize.y.toFixed(3)}, Z=${currentLogoSize.z.toFixed(3)}`);
            
            // Remove current logo
            scene.remove(logoMesh);
            if (logoMesh.geometry) logoMesh.geometry.dispose();
            
            // Calculate decal dimensions using the stored actual scale value
            const modelBox = new THREE.Box3().setFromObject(model);
            const modelSizeVec = modelBox.getSize(new THREE.Vector3());
            const baseSize = Math.min(modelSizeVec.x, modelSizeVec.y) * 0.5;
            const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
            const decalHeight = baseSize * actualScale;
            const decalWidth = decalHeight * imgAspect;
            const decalDepth = Math.min(decalWidth, decalHeight) * 0.5;
            const decalSize = new THREE.Vector3(decalWidth, decalHeight, decalDepth);
            
            // Use a consistent orientation calculation
            const tempMatrix = new THREE.Matrix4();
            tempMatrix.lookAt(
                newPoint, 
                newPoint.clone().add(normal), 
                new THREE.Vector3(0, 1, 0)
            );
            const orientation = new THREE.Euler();
            orientation.setFromRotationMatrix(tempMatrix);
            
            // Create new decal with the SAME scale as before
            const decalGeometry = new DecalGeometry(model, newPoint, orientation, decalSize);
            logoMesh = new THREE.Mesh(decalGeometry, logoMaterial);
            
            // Apply the stored quaternion to preserve orientation exactly
            logoMesh.quaternion.copy(currentQuaternion);
            logoMesh.updateMatrix();
            
            scene.add(logoMesh);
            
            // Check the logo size after moving to confirm scale is maintained
            const newLogoBox = new THREE.Box3().setFromObject(logoMesh);
            const newLogoSize = newLogoBox.getSize(new THREE.Vector3());
            console.log(`New logo size after move: X=${newLogoSize.x.toFixed(3)}, Y=${newLogoSize.y.toFixed(3)}, Z=${newLogoSize.z.toFixed(3)}`);
            
            // Update mirrored logo if double-sided is checked
            if (doubleSidedCheckbox && doubleSidedCheckbox.checked) {
                createOrUpdateMirroredLogo();
            }
            
            // Update logo bounding box if active
            if (logoBBoxHelper) {
                removeLogoBBoxHelper();
                const box = new THREE.Box3().setFromObject(logoMesh);
                logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000);
                scene.add(logoBBoxHelper);
            }
            
            // Force render to update the scene immediately
            renderer.render(scene, camera);
            
            console.log(`Moved decal logo ${axis}: ${step}, scale maintained at: ${actualScale}`);
        }
    };
    
    // Add movement button listeners
    if (moveUpLgBtn) moveUpLgBtn.addEventListener('click', () => applyLogoMove('y', MOVE_STEP_LG));
    if (moveDownLgBtn) moveDownLgBtn.addEventListener('click', () => applyLogoMove('y', -MOVE_STEP_LG));
    if (moveLeftLgBtn) moveLeftLgBtn.addEventListener('click', () => applyLogoMove('x', -MOVE_STEP_LG));
    if (moveRightLgBtn) moveRightLgBtn.addEventListener('click', () => applyLogoMove('x', MOVE_STEP_LG));
    if (moveUpSmBtn) moveUpSmBtn.addEventListener('click', () => applyLogoMove('y', MOVE_STEP_SM));
    if (moveDownSmBtn) moveDownSmBtn.addEventListener('click', () => applyLogoMove('y', -MOVE_STEP_SM));
    if (moveLeftSmBtn) moveLeftSmBtn.addEventListener('click', () => applyLogoMove('x', -MOVE_STEP_SM));
    if (moveRightSmBtn) moveRightSmBtn.addEventListener('click', () => applyLogoMove('x', MOVE_STEP_SM));

    // Model View Controls
    if (toggleBBoxBtn) toggleBBoxBtn.addEventListener('click', toggleBoundingBox);
    if (togglePlacementAreaBtn) togglePlacementAreaBtn.addEventListener('click', togglePlacementArea);
    if (toggleLogoBBoxBtn) toggleLogoBBoxBtn.addEventListener('click', toggleLogoBBox);
    if (toggleStlBboxBtn) toggleStlBboxBtn.addEventListener('click', toggleLogoStlBbox); // Added listener
    // Add listeners for the new toggle buttons
    if (toggleLogoStlVisibilityBtn) toggleLogoStlVisibilityBtn.addEventListener('click', toggleLogoStlVisibility);
    if (toggleLogoDecalVisibilityBtn) toggleLogoDecalVisibilityBtn.addEventListener('click', toggleLogoDecalVisibility);
    if (toggleCutResultBtn) toggleCutResultBtn.addEventListener('click', toggleCutResultVisibility);
    if (toggleAxisHelperBtn) toggleAxisHelperBtn.addEventListener('click', toggleSceneAxisHelper);
    if (debugModelsBtn) debugModelsBtn.addEventListener('click', debugAvailableModels);

    // Add listener for STL thickness adjustment
    if (stlThicknessInput) {
        stlThicknessInput.addEventListener('change', adjustStlThickness);
        console.log("Listener attached to STL Thickness input.");
    } else {
         console.warn("STL Thickness input not found during listener setup.");
    }

    // Order/Price Controls
    if (quantityInput) quantityInput.addEventListener('input', updatePrice);
    if (currencySelect) currencySelect.addEventListener('change', updatePrice);
    
    // Double-sided checkbox listener
    if (doubleSidedCheckbox) {
        doubleSidedCheckbox.addEventListener('change', function() {
            if (!logoMesh) return;
            
            if (this.checked) {
                // Create a mirrored logo if doesn't exist yet
                createOrUpdateMirroredLogo();
                
                // Update unit price when checkbox is checked
                updatePrice();
            } else {
                // Remove mirrored logo if checkbox is unchecked
                removeMirroredLogo();
                
                // Update unit price when checkbox is unchecked
                updatePrice();
            }
        });
    }

    // Logo special control buttons
    if (centerLogoBtn) centerLogoBtn.addEventListener('click', centerLogo);

    // Save/Export
    if (downloadModelStlBtn) downloadModelStlBtn.addEventListener('click', handleDownloadModelStl); // ADDED listener for new button
    // Add listener for the new Repair Base Model button
    if (repairBaseModelBtn) repairBaseModelBtn.addEventListener('click', repairBaseModel);
    // // Add listener for the new toggle mirror button (REMOVED: button removed from UI)
    // if (toggleMirrorLogoStlBtn) toggleMirrorLogoStlBtn.addEventListener('click', () => {
    //     if (mirrorStlCheckbox) {
    //         mirrorStlCheckbox.checked = !mirrorStlCheckbox.checked;
    //         handleMirrorStlToggle(); // Call the existing handler
    //     }
    // });

    console.log("Event Listeners Setup Complete.");
    
    // Attach logo scale listeners after DOM binding
    attachLogoScaleListeners();

    // Add debug boundary button listener
    const debugBoundaryBtn = document.getElementById('debug-boundary-btn');
    if (debugBoundaryBtn) {
        debugBoundaryBtn.addEventListener('click', debugBoundaryInfo);
    }

    if (toggleCutLogoResultBtn) toggleCutLogoResultBtn.addEventListener('click', function() {
        if (booleanResultMesh && booleanResultMesh.userData && booleanResultMesh.userData.operationType === 'cut-logo') {
            booleanResultMesh.visible = !booleanResultMesh.visible;
            console.log(`[TOGGLE CUT LOGO RESULT] Visibility set to: ${booleanResultMesh.visible}`);
        } else {
            console.warn('No Cut Logo result mesh to toggle.');
        }
    });
    if (toggleCutThinLogoResultBtn) toggleCutThinLogoResultBtn.addEventListener('click', function() {
        if (booleanResultMesh && booleanResultMesh.userData && booleanResultMesh.userData.operationType === 'cut-thin-logo') {
            booleanResultMesh.visible = !booleanResultMesh.visible;
            console.log(`[TOGGLE CUT THIN LOGO RESULT] Visibility set to: ${booleanResultMesh.visible}`);
        } else {
            console.warn('No Cut Thin Logo result mesh to toggle.');
        }
    });
    if (cutResultZOffsetInput) cutResultZOffsetInput.addEventListener('input', function() {
        const zOffset = parseFloat(this.value) || 0.0;
        if (booleanResultMesh) {
            booleanResultMesh.position.z = zOffset;
            console.log(`[CUT RESULT Z OFFSET] Set to: ${zOffset}mm`);
            if (renderer) renderer.render(scene, camera);
        }
    });
}

// --- Price Calculation ---
function updatePrice() {
    // Ensure all elements exist before proceeding (might be called early)
    if(!quantityInput || !currencySelect || !unitPriceSpan || !totalPriceSpan || !doubleSidedCheckbox) {
        return;
    }

    let quantity = parseInt(quantityInput.value) || 0;
    // --- Enforce Min/Max Quantity --- 
    const minQty = 10;
    const maxQty = 200;
    if (quantity < minQty) {
        quantity = minQty;
        quantityInput.value = quantity; // Update input field if adjusted
    }
    if (quantity > maxQty) {
        quantity = maxQty;
        quantityInput.value = quantity; // Update input field if adjusted
    }
    // --- End Enforce --- 

    const currency = currencySelect.value;
    const basePricePerUnit = 10; // Example base price in GBP

    // --- Currency Conversion for Surcharge ---
    // Define exchange rates relative to GBP (approx. avg over last year - early 2024)
    const rates = { GBP: 1, USD: 1.27, EUR: 1.17 };
    const baseRate = rates['GBP']; // Our base price currency
    const targetRate = rates[currency];
    const conversionFactor = targetRate / baseRate;
    const doubleSidedSurchargeGBP = 2;
    // Calculate surcharge in the target currency
    const doubleSidedSurcharge = doubleSidedSurchargeGBP * conversionFactor;
    // --- End Currency Conversion ---

    // Fix discount calculation: 2.5% per 10 units starting at 20 units, max 40%
    let discount = 0;
    if (quantity >= 20) {
        // Calculate how many 10-unit increments we have beyond the first 10 units
        const discountIncrements = Math.floor((quantity - 10) / 10);
        // Apply 2.5% per increment
        discount = discountIncrements * 2.5;
        // Cap at 40% maximum
        discount = Math.min(discount, 40);
        console.log(`Applying ${discount.toFixed(1)}% discount for quantity ${quantity}.`);
    }

    // Price per unit AFTER discount
    let discountedUnitPrice = basePricePerUnit * (1 - discount / 100);

    let finalUnitPrice = discountedUnitPrice;
    // Add surcharge if checked, converting it first to the base currency (GBP) for calculation relative to base price
    if (doubleSidedCheckbox.checked) {
        finalUnitPrice += doubleSidedSurcharge; // Add surcharge in target currency
    }

    let total = finalUnitPrice * quantity;

    // --- Minimum Total Price Check ---
    // Calculate minimum price (£10) in the target currency
    const minTotalPriceGBP = 10;
    const minTotalPrice = minTotalPriceGBP * conversionFactor;

    if (total < minTotalPrice && quantity > 0) { // Ensure total is at least min price if quantity > 0
        total = minTotalPrice;
        // Optional: Adjust unit price display to reflect the forced minimum total?
        // This might be confusing, maybe just show the minimum total.
        // finalUnitPrice = total / quantity;
    }
    // --- End Minimum Total Price Check ---

    const currencySymbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
    console.log(`Updating price display: Unit=${currencySymbol}${finalUnitPrice.toFixed(2)}, Total=${currencySymbol}${total.toFixed(2)}`); // DEBUG using finalUnitPrice
    // Display FINAL unit price (with discount/surcharge)
    unitPriceSpan.textContent = `${currencySymbol}${finalUnitPrice.toFixed(2)}`; // Use finalUnitPrice
    totalPriceSpan.textContent = `${currencySymbol}${total.toFixed(2)}`;
}

// +++ ADD NEW UNIFIED DOWNLOAD HANDLER FUNCTION +++
function handleDownloadModelStl() {
    console.log("%c--- Download Model STL button clicked ---", 'font-weight: bold;');
    let downloadsInitiated = 0;

    // --- Download Main Model --- 
    if (!model || !model.geometry) {
        alert("No model geometry available to download.");
        console.error("[handleDownloadModelStl] Model or model geometry is missing.");
        return; // Exit if no model
    }
    try {
        const exporter = new STLExporter();
        model.updateMatrixWorld(true); // Ensure world matrix is updated
        const modelStlString = exporter.parse(model, { binary: false }); // Export as ASCII
        
        // Generate filename
        const originalModelName = modelSelect.value ? modelSelect.value.replace(/\.stl$/i, '') : 'model';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const modelFilename = `${originalModelName}_${timestamp}.stl`;

        // Trigger download
        const blob = new Blob([modelStlString], { type: 'text/plain' });
        saveAs(blob, modelFilename); // Assumes FileSaver.js' saveAs is global
        console.log(`[handleDownloadModelStl] Triggered download for main model: ${modelFilename}`);
        downloadsInitiated++;
    } catch (error) {
        console.error("[handleDownloadModelStl] Error exporting or downloading main model:", error);
        alert("Error downloading the main model: " + error.message);
    }

    // --- Download Logo STL (if exists) --- 
    if (svgToStlGroup && svgToStlGroup.children.length > 0) {
        console.log("[handleDownloadModelStl] Logo STL group found, attempting download...");
        if (!svgFileName) {
            console.warn("[handleDownloadModelStl] Cannot download logo STL: SVG filename not recorded.");
        } else {
            try {
                const exporter = new STLExporter();
                svgToStlGroup.updateMatrixWorld(true); // Ensure world matrix is updated
                const logoStlString = exporter.parse(svgToStlGroup, { binary: false }); // Export as ASCII
                
                // Generate filename
                const originalModelName = modelSelect.value ? modelSelect.value.replace(/\.stl$/i, '') : 'model';
                const logoBaseName = svgFileName.replace(/\.[^.]*$/, '');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const logoFilename = `${originalModelName}_${logoBaseName}_${timestamp}.stl`;

                // Trigger download
                const blob = new Blob([logoStlString], { type: 'text/plain' });
                saveAs(blob, logoFilename); // Assumes FileSaver.js' saveAs is global
                console.log(`[handleDownloadModelStl] Triggered download for logo STL: ${logoFilename}`);
                downloadsInitiated++;
            } catch (error) {
                console.error("[handleDownloadModelStl] Error exporting or downloading logo STL:", error);
                alert("Error downloading the logo STL: " + error.message);
            }
        }
    } else {
        console.log("[handleDownloadModelStl] No logo STL found to download.");
    }

    // --- Download Cut Result (if exists) ---
    if (booleanResultMesh && booleanResultMesh.geometry) {
        console.log("[handleDownloadModelStl] Cut result found, attempting download...");
        try {
            const exporter = new STLExporter();
            booleanResultMesh.updateMatrixWorld(true); // Ensure world matrix is updated
            const cutResultStlString = exporter.parse(booleanResultMesh, { binary: false }); // Export as ASCII
            
            // Generate filename
            const originalModelName = modelSelect.value ? modelSelect.value.replace(/\.stl$/i, '') : 'model';
            const logoBaseName = svgFileName ? svgFileName.replace(/\.[^.]*$/, '') : 'logo';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            // Determine the operation type from mesh userData or use generic name
            const operationType = booleanResultMesh.userData?.operationType || 'cut-result';
            const cutFilename = `${originalModelName}_${logoBaseName}_${operationType}_${timestamp}.stl`;

            // Trigger download
            const blob = new Blob([cutResultStlString], { type: 'text/plain' });
            saveAs(blob, cutFilename);
            console.log(`[handleDownloadModelStl] Triggered download for cut result: ${cutFilename}`);
            downloadsInitiated++;
        } catch (error) {
            console.error("[handleDownloadModelStl] Error exporting or downloading cut result:", error);
            alert("Error downloading the cut result: " + error.message);
        }
    } else {
        console.log("[handleDownloadModelStl] No cut result found to download.");
    }

    // Provide summary feedback
    if (downloadsInitiated > 0) {
        console.log(`%c[handleDownloadModelStl] Successfully initiated ${downloadsInitiated} download(s).`, 'font-weight: bold;');
    } else {
        console.warn("[handleDownloadModelStl] No files were downloaded.");
    }
}

// --- Animation Loop ---
function animate() {
    // Check if animationId is already set to prevent multiple loops
    if (animationId === undefined || animationId === null) { 
        animationId = requestAnimationFrame(animate);
    }

    // If rotating (currently disabled based on removal of isRotating/rotationSpeed)
    // if (isRotating && model) {
    //     model.rotation.y += rotationSpeed;
    // }

    // --- Restore Real-time Scale Check --- 
    // Continuously check logo scale slider for changes if a logo exists
    // Real-time scale check disabled - now handled by event listeners only
    // This prevents infinite loops and excessive scaling operations

    // Update controls
    if (controls) {
        controls.update();
    }
    
    // Render scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }

    // Continue the loop only if it was started by this function call
    // Re-request animation frame if it wasn't cancelled elsewhere
    if (animationId !== undefined && animationId !== null) {
         // Re-queue the animation frame request
        requestAnimationFrame(animate);
    }
}

// --- Start the application ---
// Use DOMContentLoaded to ensure HTML is parsed, but resources like images might still be loading
// Use window.onload if you need to wait for all resources (images, etc.)
// DOMContentLoaded is generally preferred for starting JS logic.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOMContentLoaded has already fired
    init();
} 

// Function to create or update the mirrored logo based on the original logo
function createOrUpdateMirroredLogo() {
    if (!logoMesh || !model || !loadedLogoImage) {
        console.warn("Cannot create mirrored logo: Missing logo, model, or logo image.");
        return;
    }
    
    console.log("Creating/updating mirrored logo...");
    
    // Remove existing mirrored logo if it exists
    removeMirroredLogo();
    
    // Get the logo's current position and rotation
    const logoPosition = logoMesh.position.clone();
    const logoRotation = logoMesh.rotation.clone();
    
    // Get the actual scale value from the data attribute
    const actualScale = parseFloat(logoScaleInput.getAttribute('data-current-scale')) || 1.0;
    console.log(`Creating mirrored logo with fixed scale: ${actualScale}`);
    
    // Calculate dimensions for the mirrored logo using exact same scale
    const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
    const modelSizeVec = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
    const baseSize = Math.min(modelSizeVec.x, modelSizeVec.y) * 0.5;
    const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
    const decalHeight = baseSize * actualScale;
    const decalWidth = decalHeight * imgAspect;
    const decalDepth = Math.min(decalWidth, decalHeight) * 0.5;
    const decalSize = new THREE.Vector3(decalWidth, decalHeight, decalDepth);
    
    // Get the model center and create a ray in the opposite direction
    const modelCenter = modelBox.getCenter(new THREE.Vector3()); // Use imported THREE
    const direction = new THREE.Vector3(0, 0, -1); // Simple opposite direction
    
    // Cast ray from center
    const raycaster = new THREE.Raycaster(); // Use imported THREE
    raycaster.set(modelCenter, direction);
    
    const intersects = raycaster.intersectObject(model, true);
    
    if (intersects.length > 0) {
        // Get the hit point and normal
        const hit = intersects[0].point;
        const normal = intersects[0].face.normal.clone();
        normal.transformDirection(model.matrixWorld);
        
        // Calculate orientation based on the normal
        const matrix = new THREE.Matrix4(); // Use imported THREE
        matrix.lookAt(hit, hit.clone().add(normal), new THREE.Vector3(0, 1, 0)); // Use imported THREE
        const orientation = new THREE.Euler(); // Use imported THREE
        orientation.setFromRotationMatrix(matrix);
        
        // Add larger offset to prevent z-fighting (like cut logo offset)
        const offsetHit = hit.clone().add(normal.clone().multiplyScalar(0.1));
        
        // Create the mirrored decal with the SAME scale as the original
        const mirroredGeometry = new DecalGeometry(model, offsetHit, orientation, decalSize); // Use imported DecalGeometry
        mirroredLogoMesh = new THREE.Mesh(mirroredGeometry, logoMaterial); // Use imported THREE
        
        // Set render order to help with depth sorting
        mirroredLogoMesh.renderOrder = 1;
        
        scene.add(mirroredLogoMesh);
        
        console.log("Mirrored logo created successfully with scale:", actualScale);
    } else {
        console.warn("Could not find suitable position for mirrored logo.");
    }
    
    // Update logo bounding box if active
    if (logoBBoxHelper) {
        removeLogoBBoxHelper();
        const box = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
        logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000); // Use imported THREE
        scene.add(logoBBoxHelper);
    }
    
    // Force render to update the scene immediately
    renderer.render(scene, camera);
}

// --- Center Logo Function ---
function centerLogo() {
    if (!logoMesh || !model || !loadedLogoImage) {
        console.warn("Cannot center logo: Missing logo mesh, model, or logo image.");
        return false;
    }
    
    console.log("Centering logo on model (position only)...");
    
    // Get the ACTUAL scale value from the data attribute, not just the visual slider position
    const actualScale = parseFloat(logoScaleInput.getAttribute('data-current-scale')) || 1.0;
    console.log(`Current scale before centering: ${actualScale} (will preserve exactly)`);
    
    // Store the current orientation/rotation
    const currentQuaternion = new THREE.Quaternion(); // Use imported THREE
    logoMesh.getWorldQuaternion(currentQuaternion);
    
    // Find center of the model
    const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
    const modelCenter = modelBox.getCenter(new THREE.Vector3()); // Use imported THREE
    
    // Cast ray from center outward
    const raycaster = new THREE.Raycaster(); // Use imported THREE
    raycaster.set(
        modelCenter,
        new THREE.Vector3(0, 0, 1).normalize()
    );
    
    const intersects = raycaster.intersectObject(model, true);
    if (intersects.length === 0) {
        console.error("No intersection found with model when trying to center logo.");
        return false;
    }
    
    // Get the first intersection point and normal
    const hit = intersects[0].point;
    const normal = intersects[0].face.normal.clone();
    normal.transformDirection(model.matrixWorld);
    
    console.log(`Center raycast hit: x=${hit.x.toFixed(2)}, y=${hit.y.toFixed(2)}, z=${hit.z.toFixed(2)}`);
    console.log(`Surface normal: x=${normal.x.toFixed(2)}, y=${normal.y.toFixed(2)}, z=${normal.z.toFixed(2)}`);
    
    // Save the placement information for future use
    lastPlacementPoint = hit.clone();
    lastPlacementNormal = normal.clone();
    
    // IMPORTANT: No boundary checks or scale adjustments here
    // We're only updating position, not scale
    
    // Remove current logo
    scene.remove(logoMesh);
    if (logoMesh.geometry) logoMesh.geometry.dispose();
    
    // Calculate decal dimensions using the EXACT SAME scale
    const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
    const baseSize = Math.min(modelBox.getSize(new THREE.Vector3()).x, modelBox.getSize(new THREE.Vector3()).y) * 0.5;
    const decalHeight = baseSize * actualScale;
    const decalWidth = decalHeight * imgAspect;
    const decalDepth = Math.min(decalWidth, decalHeight) * 0.5;
    const decalSize = new THREE.Vector3(decalWidth, decalHeight, decalDepth);
    
    // Create new decal with correct orientation
    const tempMatrix = new THREE.Matrix4(); // Use imported THREE
    tempMatrix.lookAt(hit, hit.clone().add(normal), new THREE.Vector3(0, 1, 0)); // Use imported THREE
    const orientation = new THREE.Euler(); // Use imported THREE
    orientation.setFromRotationMatrix(tempMatrix);
    
    try {
        // Add larger offset to prevent z-fighting (like cut logo offset)
        const offsetHit = hit.clone().add(normal.clone().multiplyScalar(0.1));
        
        // Create new decal with EXACT same scale
        const newDecalGeometry = new DecalGeometry(model, offsetHit, orientation, decalSize); // Use imported DecalGeometry
        logoMesh = new THREE.Mesh(newDecalGeometry, logoMaterial); // Use imported THREE
        
        // Apply the stored quaternion to preserve orientation exactly
        logoMesh.quaternion.copy(currentQuaternion);
        logoMesh.updateMatrix();
        
        // Set render order to help with depth sorting
        logoMesh.renderOrder = 1;
        
        scene.add(logoMesh);
        
        // Update mirrored logo if double-sided is checked
        if (doubleSidedCheckbox && doubleSidedCheckbox.checked) {
            createOrUpdateMirroredLogo();
        }
        
        // Update logo bounding box if active
        if (logoBBoxHelper) {
            removeLogoBBoxHelper();
            const box = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
            logoBBoxHelper = new THREE.Box3Helper(box, 0xff0000); // Use imported THREE
            scene.add(logoBBoxHelper);
        }
        
        // Force immediate render to show changes
        renderer.render(scene, camera);
        
        // Track the logo size to verify scale is maintained
        const logoBox = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
        const logoSize = logoBox.getSize(new THREE.Vector3()); // Use imported THREE
        console.log(`Logo size after centering: X=${logoSize.x.toFixed(3)}, Y=${logoSize.y.toFixed(3)}, Z=${logoSize.z.toFixed(3)}`);
        
        console.log("Logo centered successfully. Scale maintained at:", actualScale);
        return true;
    } catch (error) {
        console.error("Error creating decal during centering:", error);
        // Try to restore previous state if possible
        if (lastPlacementPoint && lastPlacementNormal) {
            console.log("Attempting to restore previous logo state...");
            applyLogoScale(actualScale);
        }
        return false;
    }
}

// --- Max Scale Logo Function ---
function maxScaleLogo() {
    if (!logoMesh || !model) {
        console.warn("Cannot maximize logo scale: Missing logo mesh or model.");
        return;
    }
    
    console.log("Finding maximum scale for logo...");
    
    // Store original scale for comparison and restoration if needed
    const originalScale = parseFloat(logoScaleInput.value) || 1.0;
    
    // Center the logo before maximizing scale (using regular centerLogo to ensure it's positioned well)
    const centered = centerLogo();
    if (!centered) {
        console.error("Failed to center logo before maximizing scale.");
        return;
    }

    // Get placement area box (even if helper is not visible)
    const placeAreaBox = getPlacementAreaBox();
    if (!placeAreaBox) {
        console.error("Failed to determine placement area boundaries.");
        return;
    }
    
    // Initialize search parameters
    const minPossibleScale = 1.0;
    const maxPossibleScale = 2.0;
    let currentScale = originalScale;
    let bestScale = originalScale;
    let increment = 0.05;
    
    console.log(`Starting incremental search from scale ${currentScale} up to ${maxPossibleScale}`);
    
    // Try increasingly larger scales until we hit a boundary
    let scaleFound = false;
    let boundaryHit = false;
    
    // Use same tolerances as in the manual scale check, but with larger Z tolerance
    const toleranceXY = 0.3;
    const toleranceZ = 4.0; // Larger Z tolerance to match actual geometry boundaries
    
    // First try increasing the scale incrementally
    while (currentScale <= maxPossibleScale && !boundaryHit) {
        // Apply the test scale and get the actual geometry
        applyLogoScale(currentScale);
        console.log(`Testing scale ${currentScale.toFixed(2)}`);
        
        // Get the actual logo bounding box after scaling
        const logoBox = new THREE.Box3().setFromObject(logoMesh);
        
        // Check if it exceeds the placement area (with tolerances)
        const exceedsX = logoBox.min.x < placeAreaBox.min.x - toleranceXY || logoBox.max.x > placeAreaBox.max.x + toleranceXY;
        const exceedsY = logoBox.min.y < placeAreaBox.min.y - toleranceXY || logoBox.max.y > placeAreaBox.max.y + toleranceXY;
        const exceedsZ = logoBox.min.z < placeAreaBox.min.z - toleranceZ || logoBox.max.z > placeAreaBox.max.z + toleranceZ;
        
        // Log boundary check details
        console.log(`Boundary check at ${currentScale.toFixed(2)}:`);
        console.log(`  Logo box: min(${logoBox.min.x.toFixed(2)}, ${logoBox.min.y.toFixed(2)}, ${logoBox.min.z.toFixed(2)}), max(${logoBox.max.x.toFixed(2)}, ${logoBox.max.y.toFixed(2)}, ${logoBox.max.z.toFixed(2)})`);
        console.log(`  Placement box: min(${placeAreaBox.min.x.toFixed(2)}, ${placeAreaBox.min.y.toFixed(2)}, ${placeAreaBox.min.z.toFixed(2)}), max(${placeAreaBox.max.x.toFixed(2)}, ${placeAreaBox.max.y.toFixed(2)}, ${placeAreaBox.max.z.toFixed(2)})`);
        console.log(`  Tolerances: X/Y=${toleranceXY.toFixed(2)}, Z=${toleranceZ.toFixed(2)}`);
        console.log(`  Exceeds X: ${exceedsX}, Y: ${exceedsY}, Z: ${exceedsZ}`);
        
        if (exceedsX || exceedsY || exceedsZ) {
            boundaryHit = true;
            console.log(`Scale ${currentScale.toFixed(2)} exceeds boundaries.`);
            
            // Go back to the last known good scale
            currentScale -= increment;
            bestScale = currentScale;
            scaleFound = true;
        } else {
            console.log(`Scale ${currentScale.toFixed(2)} fits within boundaries.`);
            bestScale = currentScale;
            scaleFound = true;
            
            // Increase to the next scale
            currentScale += increment;
        }
    }
    
    // If we couldn't find a better scale, restore the original
    if (!scaleFound || bestScale <= originalScale) {
        console.log(`No better scale found than original (${originalScale.toFixed(2)}). Restoring original scale.`);
        applyLogoScale(originalScale);
        return;
    }
    
    // Apply the best scale found
    console.log(`Setting logo scale to maximum: ${bestScale.toFixed(2)}, increasing from ${originalScale.toFixed(2)}`);
    applyLogoScale(bestScale);
    
    // Update the slider UI
    logoScaleInput.value = bestScale;
    logoScaleInput.setAttribute('data-current-scale', bestScale.toString());
    
    // Force the slider to visually update its position
    logoScaleInput.style.setProperty('--value', bestScale);
    
    // Show detailed boundary information in console (even if helpers not visible)
    logBoundaryInfo();
}

// Function to log boundary information without requiring visible helpers
function logBoundaryInfo() {
    if (!logoMesh || !model) {
        console.warn("Cannot show boundary info: Missing logo or model.");
        return;
    }

    const logoBox = new THREE.Box3().setFromObject(logoMesh); // Use imported THREE
    const placeAreaBox = getPlacementAreaBox();
    
    if (!placeAreaBox) {
        console.warn("Cannot show boundary info: Unable to determine placement area.");
        return;
    }

    console.groupCollapsed("=== Detailed Boundary Information ===");
    
    console.group("Logo Box:");
    console.log(`  Min: (${logoBox.min.x.toFixed(2)}, ${logoBox.min.y.toFixed(2)}, ${logoBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${logoBox.max.x.toFixed(2)}, ${logoBox.max.y.toFixed(2)}, ${logoBox.max.z.toFixed(2)})`);
    console.groupEnd();
    
    console.group("Placement Area Box:");
    console.log(`  Min: (${placeAreaBox.min.x.toFixed(2)}, ${placeAreaBox.min.y.toFixed(2)}, ${placeAreaBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${placeAreaBox.max.x.toFixed(2)}, ${placeAreaBox.max.y.toFixed(2)}, ${placeAreaBox.max.z.toFixed(2)})`);
    console.groupEnd();
    
    console.group("Distances to Boundaries:");
    console.log(`X-axis: Left: ${(logoBox.min.x - placeAreaBox.min.x).toFixed(2)}, Right: ${(placeAreaBox.max.x - logoBox.max.x).toFixed(2)}`);
    console.log(`Y-axis: Bottom: ${(logoBox.min.y - placeAreaBox.min.y).toFixed(2)}, Top: ${(placeAreaBox.max.y - logoBox.max.y).toFixed(2)}`);
    console.log(`Z-axis: Front: ${(logoBox.min.z - placeAreaBox.min.z).toFixed(2)}, Back: ${(placeAreaBox.max.z - logoBox.max.z).toFixed(2)}`);
    console.groupEnd();
    
    console.group("Available Space:");
    console.log(`X-axis: ${(placeAreaBox.max.x - placeAreaBox.min.x).toFixed(2)}`);
    console.log(`Y-axis: ${(placeAreaBox.max.y - placeAreaBox.min.y).toFixed(2)}`);
    console.log(`Z-axis: ${(placeAreaBox.max.z - placeAreaBox.min.z).toFixed(2)}`);
    console.groupEnd();
    
    console.group("Logo Size:");
    console.log(`X-axis: ${(logoBox.max.x - logoBox.min.x).toFixed(2)}`);
    console.log(`Y-axis: ${(logoBox.max.y - logoBox.min.y).toFixed(2)}`);
    console.log(`Z-axis: ${(logoBox.max.z - logoBox.min.z).toFixed(2)}`);
    console.groupEnd();
    
    console.groupEnd(); // End of main group
}

// New helper function to center the logo without changing its scale
function centerLogoWithoutScaling() {
    if (!logoMesh || !model) {
        console.warn("Cannot center logo: Missing logo mesh or model.");
        return false;
    }
    
    console.log("Centering logo without changing scale...");
    
    // Store the current scale value
    const currentScale = parseFloat(logoScaleInput.value) || 1.0;
    console.log(`Current scale before centering: ${currentScale}`);
    
    // Store the current orientation
    const currentOrientation = logoMesh.rotation.clone();
    
    // Find center of the model
    const modelBox = new THREE.Box3().setFromObject(model);
    const modelCenter = modelBox.getCenter(new THREE.Vector3());
    
    // Cast ray from center outward
    const raycaster = new THREE.Raycaster();
    raycaster.set(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1).normalize()
    );
    
    const intersects = raycaster.intersectObject(model, true);
    if (intersects.length === 0) {
        console.error("No intersection found with model when trying to center logo.");
        return false;
    }
    
    // Get the first intersection point and normal
    const hit = intersects[0].point;
    const normal = intersects[0].face.normal.clone();
    normal.transformDirection(model.matrixWorld);
    
    console.log(`Center raycast hit: x=${hit.x.toFixed(2)}, y=${hit.y.toFixed(2)}, z=${hit.z.toFixed(2)}`);
    console.log(`Surface normal: x=${normal.x.toFixed(2)}, y=${normal.y.toFixed(2)}, z=${normal.z.toFixed(2)}`);
    
    // Move the logo to the hit point, aligning with normal
    const position = hit.clone();
    const orientation = new THREE.Euler();
    
    // Create a quaternion from the surface normal
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    orientation.setFromQuaternion(quaternion);
    
    // Restore the original orientation in the appropriate axis
    orientation.copy(currentOrientation);
    
    // Update logo mesh position and orientation
    logoMesh.position.copy(position);
    logoMesh.rotation.copy(orientation);
    
    // Save the placement information
    lastPlacementPoint = position.clone();
    lastPlacementNormal = normal.clone();
    
    return true;
}

// Add this new function after the maxScaleLogo function
function debugBoundaryInfo() {
    if (!logoMesh || !placementAreaHelper || !placementAreaHelper.userData.box) {
        console.warn("Cannot show boundary info: Missing logo or placement area.");
        return;
    }

    const logoBox = new THREE.Box3().setFromObject(logoMesh);
    const placeAreaBox = placementAreaHelper.userData.box;

    console.log("=== Detailed Boundary Information ===");
    console.log("Logo Box:");
    console.log(`  Min: (${logoBox.min.x.toFixed(2)}, ${logoBox.min.y.toFixed(2)}, ${logoBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${logoBox.max.x.toFixed(2)}, ${logoBox.max.y.toFixed(2)}, ${logoBox.max.z.toFixed(2)})`);
    console.log("Placement Area Box:");
    console.log(`  Min: (${placeAreaBox.min.x.toFixed(2)}, ${placeAreaBox.min.y.toFixed(2)}, ${placeAreaBox.min.z.toFixed(2)})`);
    console.log(`  Max: (${placeAreaBox.max.x.toFixed(2)}, ${placeAreaBox.max.y.toFixed(2)}, ${placeAreaBox.max.z.toFixed(2)})`);
    
    console.log("\nDistances to Boundaries:");
    console.log(`X-axis: Left: ${(logoBox.min.x - placeAreaBox.min.x).toFixed(2)}, Right: ${(placeAreaBox.max.x - logoBox.max.x).toFixed(2)}`);
    console.log(`Y-axis: Bottom: ${(logoBox.min.y - placeAreaBox.min.y).toFixed(2)}, Top: ${(placeAreaBox.max.y - logoBox.max.y).toFixed(2)}`);
    console.log(`Z-axis: Front: ${(logoBox.min.z - placeAreaBox.min.z).toFixed(2)}, Back: ${(placeAreaBox.max.z - logoBox.max.z).toFixed(2)}`);
    
    console.log("\nAvailable Space:");
    console.log(`X-axis: ${(placeAreaBox.max.x - placeAreaBox.min.x).toFixed(2)}`);
    console.log(`Y-axis: ${(placeAreaBox.max.y - placeAreaBox.min.y).toFixed(2)}`);
    console.log(`Z-axis: ${(placeAreaBox.max.z - placeAreaBox.min.z).toFixed(2)}`);
    
    console.log("\nLogo Size:");
    console.log(`X-axis: ${(logoBox.max.x - logoBox.min.x).toFixed(2)}`);
    console.log(`Y-axis: ${(logoBox.max.y - logoBox.min.y).toFixed(2)}`);
    console.log(`Z-axis: ${(logoBox.max.z - logoBox.min.z).toFixed(2)}`);
}

// Function to get the placement area box (even if not visible)
function getPlacementAreaBox() {
    // If placement area helper exists, use its box
    if (placementAreaHelper && placementAreaHelper.userData.box) {
        return placementAreaHelper.userData.box.clone();
    }
    
    // Otherwise, create a new box using the same logic
    if (!model) return null;
    
    const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
    const size = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
    const center = modelBox.getCenter(new THREE.Vector3()); // Use imported THREE
    
    // Create a new box with specified dimensions (same as in togglePlacementArea)
    const placeBox = new THREE.Box3(); // Use imported THREE
    placeBox.min.set(
        center.x - (size.x * 0.75) / 2,
        center.y - (size.y * 0.75) / 2,
        center.z - (size.z * 1.1) / 2
    );
    placeBox.max.set(
        center.x + (size.x * 0.75) / 2,
        center.y + (size.y * 0.75) / 2,
        center.z + (size.z * 1.1) / 2
    );
    
    return placeBox;
}

// Function to check if logo would exceed placement area
function checkLogoBoundaries(position, scale, toleranceXY = 0.3, toleranceZ = 4.0) {
    if (!logoMesh || !model || !loadedLogoImage) return { exceeds: true, details: ["Missing required elements"] };
    
    const placeAreaBox = getPlacementAreaBox();
    if (!placeAreaBox) return { exceeds: true, details: ["Cannot determine placement area"] };
    
    // Calculate dimensions at current scale
    const modelBox = new THREE.Box3().setFromObject(model); // Use imported THREE
    const modelSizeVec = modelBox.getSize(new THREE.Vector3()); // Use imported THREE
    const baseSize = Math.min(modelSizeVec.x, modelSizeVec.y) * 0.5;
    const imgAspect = loadedLogoImage.naturalWidth / loadedLogoImage.naturalHeight;
    const decalHeight = baseSize * scale;
    const decalWidth = decalHeight * imgAspect;
    const decalDepth = Math.min(decalWidth, decalHeight) * 0.5;
    
    // Create test box
    const testBox = new THREE.Box3(); // Use imported THREE
    testBox.min.set(
        position.x - decalWidth/2,
        position.y - decalHeight/2,
        position.z - decalDepth/2
    );
    testBox.max.set(
        position.x + decalWidth/2,
        position.y + decalHeight/2,
        position.z + decalDepth/2
    );
    
    // Check each dimension with tolerances
    const exceedsX = testBox.min.x < placeAreaBox.min.x - toleranceXY || testBox.max.x > placeAreaBox.max.x + toleranceXY;
    const exceedsY = testBox.min.y < placeAreaBox.min.y - toleranceXY || testBox.max.y > placeAreaBox.max.y + toleranceXY;
    const exceedsZ = testBox.min.z < placeAreaBox.min.z - toleranceZ || testBox.max.z > placeAreaBox.max.z + toleranceZ;
    
    const details = [];
    if (exceedsX) details.push("X-axis");
    if (exceedsY) details.push("Y-axis");
    if (exceedsZ) details.push("Z-axis");
    
    return {
        exceeds: exceedsX || exceedsY || exceedsZ,
        details: details
    };
}

// New helper function to find the maximum possible scale for the current logo position
function findMaximumScale() {
    if (!logoMesh || !model) {
        console.warn("Cannot find maximum scale: Missing logo mesh or model.");
        return 1.0; // Default fallback
    }
    
    console.log("Finding maximum scale for logo...");
    
    // Store original scale
    const originalScale = parseFloat(logoScaleInput.value) || 1.0;
    
    // Get placement area box
    const placeAreaBox = getPlacementAreaBox();
    if (!placeAreaBox) {
        console.error("Failed to determine placement area boundaries.");
        return originalScale;
    }
    
    // Initialize search parameters
    const minPossibleScale = 1.0;
    const maxPossibleScale = 1.7; // Match the slider's max value
    let currentScale = originalScale;
    let bestScale = originalScale;
    let increment = 0.05;
    
    console.log(`Starting incremental search from scale ${currentScale} up to ${maxPossibleScale}`);
    
    // Define tolerances - same as in maxScaleLogo function
    const toleranceXY = 0.3;
    const toleranceZ = 4.0;
    
    // Create a collapsible group for scale testing logs
    console.groupCollapsed("Logo Scale Testing");
    
    // Try increasingly larger scales until we hit a boundary
    while (currentScale <= maxPossibleScale) {
        // Test this scale
        const testPosition = lastPlacementPoint ? lastPlacementPoint.clone() : new THREE.Vector3();
        const boundaryCheck = checkLogoBoundaries(testPosition, currentScale, toleranceXY, toleranceZ);
        
        if (boundaryCheck.exceeds) {
            console.log(`Scale ${currentScale.toFixed(2)} exceeds boundaries: ${boundaryCheck.details.join(', ')}`);
            // Go back to the last known good scale
            break;
        } else {
            console.log(`Scale ${currentScale.toFixed(2)} fits within boundaries.`);
            bestScale = currentScale;
            
            // Increase to the next scale
            currentScale += increment;
        }
    }
    
    // Close the scale testing group
    console.groupEnd();
    
    console.log(`Found maximum scale: ${bestScale.toFixed(2)}`);
    return bestScale;
}

// --- SVG to STL Integration ---

// Utility function to clear all children from a Three.js group
// (Moved here from SVGtoSTL.js to avoid potential load order issues)
function clearGroup(group) {
    if (!group) return;
    // Iterate backwards to avoid issues with shifting indices
    for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i];
        group.remove(child);
        // Optionally dispose geometry/material if needed and safe
        // if (child.geometry) child.geometry.dispose();
        // if (child.material) child.material.dispose(); 
    }
}

// Get SVG-to-STL options from form inputs
function getSvgToStlOptions() {
    // Get settings from UI using the correct HTML element IDs
    const baseTypeDepth = parseFloat(document.getElementById('stl-thickness').value) || 3.0;
    
    // Automatically add 0.2mm thickness in the blue axis (X axis in project coordinates)
    const typeDepth = baseTypeDepth + 0.2;
    
    // Use dedicated STL color picker if available, otherwise fall back to model color
    const objectColor = stlColorSelect ? stlColorSelect.value : 
                       (modelColorSelect ? modelColorSelect.value : '#ffffff');
    
    // Use curve-segments value as quality factor, or default to 50 if not found
    const precision = parseInt(document.getElementById('curve-segments').value) || 50;
    
    console.log(`[getSvgToStlOptions] Settings - Base Depth: ${baseTypeDepth}mm, Final Depth: ${typeDepth}mm (+0.2mm auto-thickening), Precision: ${precision}, Color: ${objectColor}`);
    
    // Create options object
    return {
        typeDepth: typeDepth,
        // typeSize: typeSize, // Removed
        objectColor: objectColor,
        precision: precision,      // Quality factor (1-100)
        // wantInvertedType: document.getElementById('invert-type') ? document.getElementById('invert-type').checked : false, // Removed
        mirrorStl: mirrorStlCheckbox ? mirrorStlCheckbox.checked : false, // Add mirror STL option
        resetStlTransform: true, // New flag to reset transforms and prevent cumulative mirroring
        // bevelEnabled: document.getElementById('bevel-enabled') ? document.getElementById('bevel-enabled').checked : true, // Removed
        bevelThickness: 0.1, // Default, as bevelEnabled is removed
        bevelSize: 0.1,      // Default, as bevelEnabled is removed
        bevelSegments: 3     // Default, as bevelEnabled is removed
    };
}

// Reset STL group completely (clear and reset matrix)
function resetStlGroup() {
    if (!svgToStlGroup) return;
    
    // Clear all children
    clearGroup(svgToStlGroup);
    
    // Reset transformations
    svgToStlGroup.position.set(0, 0, 0);
    svgToStlGroup.rotation.set(0, 0, 0);
    svgToStlGroup.scale.set(1, 1, 1);
    svgToStlGroup.updateMatrix();
    svgToStlGroup.matrix.identity();
    svgToStlGroup.updateMatrixWorld(true);
    
    console.log("[resetStlGroup] SVG to STL group fully reset");
}

// Convert SVG to STL and show in visualizer
function convertSvgToStl() {
    try {
        const options = getSvgToStlOptions(); 

        if (!svgPaths || svgPaths.length === 0) {
            alert("No SVG paths loaded. Please select an SVG file first.");
            return;
        }
        
        // Check dependencies (renderObject and saveSTL are on window from SVGtoSTL.js)
        if (!window.d3 || !d3.transformSVGPath) {
            throw new Error("d3.transformSVGPath is not available");
        }
        if (!window.renderObject) {
             console.error("window.renderObject function is not available");
             throw new Error("window.renderObject is not defined");
        }
        
        // Ensure all paths are valid strings
        const validPaths = svgPaths.filter(p => typeof p === 'string' && p.trim() !== '');
        if (validPaths.length === 0) {
            throw new Error("No valid SVG path data found to convert.");
        }

        // Completely reset the SVG to STL group (geometry and transforms)
        resetStlGroup();
        
        // Call the function attached to window by SVGtoSTL.js
        window.renderObject(validPaths, scene, svgToStlGroup, options);
        
        // Enable download button
        const downloadBtn = document.getElementById('download-stl-btn');
        if (downloadBtn) downloadBtn.disabled = false;
        
    } catch (error) {
        console.error("[convertSvgToStl] Error converting SVG to STL:", error);
        alert(`Error converting SVG to STL: ${error.message}`);
        // Disable buttons on error
        const downloadBtnOnError = document.getElementById('download-stl-btn');
        if (downloadBtnOnError) downloadBtnOnError.disabled = true;
    }
}

// Download the STL file
function downloadStl() {
    console.log("--- Download STL button clicked ---");
    
    if (!svgFileName) { // Check svgFileName which should be set when SVG is selected
        alert("No SVG file name recorded. Please select an SVG file first.");
        return;
    }
    
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        alert("No 3D model has been generated yet. Please convert SVG to STL first.");
        return;
    }
    
    try {
        const filename = svgFileName.replace(/\.[^\.]*$/, ""); // Use svgFileName
        console.log(`[downloadStl] Saving STL as "${filename}.stl"`);
        
        // Use the saveSTL function attached to window by SVGtoSTL.js
        if (!window.saveSTL) {
             console.error("window.saveSTL function is not available");
             throw new Error("window.saveSTL is not defined");
        }
        window.saveSTL(svgToStlGroup, filename);

    } catch (error) {
        console.error("[downloadStl] Error downloading STL:", error);
        alert("Error downloading STL: " + error.message);
    }
}

// Match Logo Transform Function
function matchLogoTransform() {
    if (!logoMesh) {
        alert("Please place the logo on the model first using 'Preview Logo'.");
        return;
    }
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        alert("Please convert the SVG to STL first using 'Logo STL'.");
        return;
    }
    
    console.log("[matchLogoTransform] Attempting to match STL group to logo decal...");

    // --- DEBUG: Log initial state ---
    logTransformState("[matchLogoTransform] Initial State", svgToStlGroup);
    // --- End DEBUG ---

    // --- Ensure group is reset before applying new transforms --- 
    svgToStlGroup.position.set(0, 0, 0);
    svgToStlGroup.rotation.set(0, 0, 0);
    svgToStlGroup.scale.set(1, 1, 1);
    svgToStlGroup.matrix.identity(); // Also reset local matrix explicitly
    svgToStlGroup.updateMatrixWorld(true); 
    
    // --- DEBUG: Log after reset ---
    logTransformState("[matchLogoTransform] After Reset", svgToStlGroup);
    // --- End DEBUG ---

    // 1. Get Bounding Boxes (using world coordinates)
    const logoBox = new THREE.Box3().setFromObject(logoMesh);
    // Ensure STL group box is calculated based on its potentially transformed state AFTER renderObject
    const stlBoxInitial = new THREE.Box3().setFromObject(svgToStlGroup); 

    if (logoBox.isEmpty() || stlBoxInitial.isEmpty()) {
        console.error("[matchLogoTransform] Bounding box is empty for logo or initial STL.");
        alert("Error: Cannot get bounding box for logo or generated STL.");
        return;
    }

    // 2. Calculate Target Center and Size (from logo decal)
    const logoCenter = logoBox.getCenter(new THREE.Vector3());
    const logoSize = logoBox.getSize(new THREE.Vector3());

    // 3. Calculate Initial STL Size (before new scaling/positioning)
    const stlSizeInitial = stlBoxInitial.getSize(new THREE.Vector3());
    if (stlSizeInitial.x === 0 || stlSizeInitial.y === 0 || stlSizeInitial.z === 0) {
        console.warn("[matchLogoTransform] Initial STL bounding box has zero size in X, Y, or Z. Cannot calculate scale factors.");
        // Avoid division by zero, maybe return or apply default scale? For now, return.
        alert("Error: Generated STL has zero dimension, cannot match transform.");
        return;
    }

    // 4. Calculate Required Scale Factors 
    const scaleX = logoSize.x / stlSizeInitial.x;
    const scaleY = logoSize.y / stlSizeInitial.y;
    const scaleZ = logoSize.z / stlSizeInitial.z;
    // Use the smaller of X/Y scale factors for uniform scaling in XY plane
    const scaleXY = Math.min(scaleX, scaleY);

    console.log(`[matchLogoTransform] Calculated Scales - XY: ${scaleXY.toFixed(3)}, Z: ${scaleZ.toFixed(3)}`);

    // 5. Apply Scale DIRECTLY to the group
    svgToStlGroup.scale.set(scaleXY, scaleXY, scaleZ);
    svgToStlGroup.updateMatrixWorld(true); 

    // --- DEBUG: Log after scale ---
    logTransformState("[matchLogoTransform] After Scale Apply", svgToStlGroup);
    // --- End DEBUG ---

    // 6. Calculate Center of the SCALED STL Group
    const stlBoxScaled = new THREE.Box3().setFromObject(svgToStlGroup);
    const stlCenterScaled = stlBoxScaled.getCenter(new THREE.Vector3());

    // 7. Calculate Translation needed to move SCALED center to TARGET center
    const translation = new THREE.Vector3().subVectors(logoCenter, stlCenterScaled);
    console.log(`[matchLogoTransform] Calculated Translation: (${translation.x.toFixed(2)}, ${translation.y.toFixed(2)}, ${translation.z.toFixed(2)})`);

    // 8. Apply Translation DIRECTLY to the group position
    svgToStlGroup.position.add(translation); // Add translation to current position (which should be 0,0,0 after reset)
    
    // --- DEBUG: Log after position ---
    logTransformState("[matchLogoTransform] After Position Apply", svgToStlGroup);
    // --- End DEBUG ---
    
    // 9. Apply Rotation from Logo Decal to control final orientation
    const logoQuaternion = new THREE.Quaternion();
    logoMesh.getWorldQuaternion(logoQuaternion); // Get decal's world rotation
    // --- DEBUG: Log decal quaternion ---
    log.debugGroup("[matchLogoTransform] Applying Decal Rotation", [
        `Logo Decal Quat: ${logoQuaternion.x.toFixed(2)}, ${logoQuaternion.y.toFixed(2)}, ${logoQuaternion.z.toFixed(2)}, ${logoQuaternion.w.toFixed(2)}`
    ]);
    // --- End DEBUG ---
    svgToStlGroup.quaternion.copy(logoQuaternion); // Apply decal's rotation to STL group
    
    // 10. Update matrix world AFTER all transforms (scale, position, rotation) are set
    svgToStlGroup.updateMatrixWorld(true); 

    // --- DEBUG: Log after rotation ---
    logTransformState("[matchLogoTransform] After Rotation Apply", svgToStlGroup);
    // --- End DEBUG ---

    // *** COORDINATE SYSTEM CORRECTION ***
    // Project coordinate convention: Green=Z(height), Red=Y(width), Blue=X(length)
    // THREE.js default: Red=X, Green=Y, Blue=Z
    // Orientation is correct with Y-flip, but position is wrong due to 180° rotation - remove rotation
    // const rotationMatrix = new THREE.Matrix4().makeRotationY(Math.PI); // REMOVED: 180° rotation was causing wrong position
    const flipMatrix = new THREE.Matrix4().makeScale(1, -1, 1); // Keep Y-flip (Red axis) for correct orientation in Red-Blue plane
    const correctionMatrix = flipMatrix; // Apply only the flip, no rotation
    svgToStlGroup.applyMatrix4(correctionMatrix);
    svgToStlGroup.updateMatrixWorld(true);
    
    console.log("[matchLogoTransform] Applied coordinate system correction (Y flip only for Red-Blue plane orientation).");

    // --- Verification Log ---
    const finalStlBox = new THREE.Box3().setFromObject(svgToStlGroup);
    const finalStlCenter = finalStlBox.getCenter(new THREE.Vector3());
    const finalStlSize = finalStlBox.getSize(new THREE.Vector3());
    console.log(`[matchLogoTransform] Verification:`);
    console.log(`  Target Center: (${logoCenter.x.toFixed(2)}, ${logoCenter.y.toFixed(2)}, ${logoCenter.z.toFixed(2)})`);
    console.log(`  Final STL Center: (${finalStlCenter.x.toFixed(2)}, ${finalStlCenter.y.toFixed(2)}, ${finalStlCenter.z.toFixed(2)})`);
    console.log(`  Target Size: (${logoSize.x.toFixed(2)}, ${logoSize.y.toFixed(2)}, ${logoSize.z.toFixed(2)})`);
    console.log(`  Final STL Size: (${finalStlSize.x.toFixed(2)}, ${finalStlSize.y.toFixed(2)}, ${finalStlSize.z.toFixed(2)})`);
    // --- End Verification --- 

    // Update STL BBox helper if visible
    if (logoStlBboxHelper) {
        removeLogoStlBboxHelper();
        toggleLogoStlBbox();
    }
    console.log("[matchLogoTransform] Completed matching STL group transform.");
}

// Adjust STL Thickness Function
function adjustStlThickness() {
    console.log("--- Adjust STL Thickness called ---");
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("[adjustStlThickness] svgToStlGroup is empty.");
        return;
    }
    if (!stlThicknessInput) {
        console.error("[adjustStlThickness] stlThicknessInput is missing.");
        return;
    }
    
    const targetThickness = parseFloat(stlThicknessInput.value);
    if (isNaN(targetThickness) || targetThickness <= 0) {
        console.warn("[adjustStlThickness] Invalid target thickness value.");
        return;
    }

    console.log(`[adjustStlThickness] Adjusting STL thickness to: ${targetThickness}`);

    // Calculate current bounding box and center
    const currentBox = new THREE.Box3().setFromObject(svgToStlGroup);
    if (currentBox.isEmpty()) {
        console.error("[adjustStlThickness] Current bounding box is empty.");
        return;
    }
    const currentCenter = currentBox.getCenter(new THREE.Vector3());
    const currentSize = currentBox.getSize(new THREE.Vector3());

    if (currentSize.z === 0) {
        console.warn("[adjustStlThickness] Current Z size is zero. Cannot calculate scale factor.");
        alert("Cannot adjust thickness: Generated STL appears to be flat.");
        return;
    }

    // Calculate the required scale factor 
    const scaleFactorZ = targetThickness / currentSize.z;
    console.log(`[adjustStlThickness] Current Z: ${currentSize.z.toFixed(3)}, Target Z: ${targetThickness.toFixed(3)}, Scale Factor Z: ${scaleFactorZ.toFixed(4)}`);

    // Apply scaling around the center
    const moveToOriginMatrix = new THREE.Matrix4().makeTranslation(-currentCenter.x, -currentCenter.y, -currentCenter.z);
    const scaleMatrix = new THREE.Matrix4().makeScale(1, 1, scaleFactorZ); // Scale only Z
    const moveBackMatrix = new THREE.Matrix4().makeTranslation(currentCenter.x, currentCenter.y, currentCenter.z);
    
    const combinedMatrix = new THREE.Matrix4();
    combinedMatrix.multiply(moveBackMatrix);
    combinedMatrix.multiply(scaleMatrix);
    combinedMatrix.multiply(moveToOriginMatrix);

    svgToStlGroup.applyMatrix4(combinedMatrix);
    svgToStlGroup.updateMatrixWorld(true); 

    console.log("[adjustStlThickness] STL thickness adjusted.");

    // Update STL BBox helper if visible
    if (logoStlBboxHelper) {
        removeLogoStlBboxHelper();
        toggleLogoStlBbox();
    }
    
    // Re-render the scene
    if(renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Initialize the SVG to STL functionality
// MOVED TO DOMContentLoaded
/*
function initSvgToStl() {
    // ... (implementation moved to DOMContentLoaded handler, listener logic updated) ...
}
*/

// --- Event Listeners Setup --- 
// (Ensure this definition comes AFTER all the functions it uses, including SVG ones)

// --- Start the application --- 
// ... (init call logic) ...

// --- DOMContentLoaded Listener --- 
// (This should remain at the end)
document.addEventListener('DOMContentLoaded', function() {
    // Call initSvgToStl here ensures DOM is ready for button listeners
    initSvgToStl(); 
});

// Initialize the SVG to STL functionality
function initSvgToStl() {
    console.log("Initializing SVG to STL functionality...");
    
    // Get SVG to STL related DOM elements
    const logoStlBtn = document.getElementById('logo-stl-btn');
    const repairStlBtn = document.getElementById('repair-stl-btn');
    const cutLogoBtn = document.getElementById('cut-logo-btn'); 
    // const downloadStlBtn = document.getElementById('download-stl-btn'); // REMOVED reference
    
    // Initialize global SVG variables if they don't exist yet
    if (typeof svgPaths === 'undefined') {
        window.svgPaths = [];
    }
    
    if (typeof svgFileName === 'undefined') {
        window.svgFileName = '';
    }
    
    // Set up event listeners for SVG to STL buttons
    if (logoStlBtn) {
        logoStlBtn.addEventListener('click', convertAndMatchLogoStl);
    } else {
        console.warn("Logo STL button not found");
    }
    
    if (repairStlBtn) {
        repairStlBtn.addEventListener('click', repairStl);
    } else {
        console.warn("Repair STL button not found");
    }
    
    if (cutLogoBtn) { // This now refers to the global variable
        cutLogoBtn.addEventListener('click', cutLogoWithModel);
    } else {
        console.warn("Cut Logo button not found");
    }
    
    if (cutThinLogoBtn) {
        cutThinLogoBtn.addEventListener('click', cutThinLogoWithModel);
    } else {
        console.warn("Cut Thin Logo button not found");
    }
    
    // Add listener for the new Cut Out Logo button
    if (cutoutLogoBtn) {
        cutoutLogoBtn.addEventListener('click', cutoutLogoFromModel);
    } else {
        console.warn("Cut Out Logo button not found");
    }
    
    // Add listeners for the new Cut Out Result buttons
    if (cutoutLogoResultBtn) {
        cutoutLogoResultBtn.addEventListener('click', cutoutLogoResultFromModel);
    } else {
        console.warn("Cut Out Logo Result button not found");
    }
    
    if (cutoutThinLogoResultBtn) {
        cutoutThinLogoResultBtn.addEventListener('click', cutoutThinLogoResultFromModel);
    } else {
        console.warn("Cut Out Thin Logo Result button not found");
    }
    
    // REMOVED listener setup for downloadStlBtn
    // if (downloadStlBtn) {
    //     downloadStlBtn.addEventListener('click', downloadStl);
    // } else {
    //     console.warn("Download STL button not found"); // This warning is now removed as button is gone
    // }
    
    // REMOVED listener setup for downloadCurrentModelBtn
    // if (downloadCurrentModelBtn) {
    //     downloadCurrentModelBtn.addEventListener('click', downloadCurrentModel); // Renamed handler function
    // } else {
    //     console.warn("Download Current Model button not found"); // This warning is now removed
    // }
    
    // Initially disable these buttons until SVG is loaded/processed
    if (logoStlBtn) logoStlBtn.disabled = false; // Should be enabled if logo can be uploaded
    if (repairStlBtn) repairStlBtn.disabled = true; // Enabled after logo STL generated
    if (cutLogoBtn) cutLogoBtn.disabled = true; // Disabled until repair STL is pressed
    if (cutThinLogoBtn) cutThinLogoBtn.disabled = true; // Disabled until repair STL is pressed
    if (cutoutLogoBtn) cutoutLogoBtn.disabled = true; // Disabled until repair STL is pressed
    if (cutoutLogoResultBtn) cutoutLogoResultBtn.disabled = true; // Disabled until cut result is available
    if (cutoutThinLogoResultBtn) cutoutThinLogoResultBtn.disabled = true; // Disabled until thin cut result is available
    // REMOVED disable logic for old download buttons
    // if (downloadCurrentModelBtn) downloadCurrentModelBtn.disabled = true; 
    // if (downloadStlBtn) downloadStlBtn.disabled = true; 
}

// --- Utility functions --- 
// (Keep clampValue here or move earlier if needed)
function clampValue(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// Create a global object to store max scale values by filename hash
const logoMaxScales = {};

// Helper function to create a valid key from a filename
function createFilenameKey(filename) {
    if (!filename) return '';
    // Create a simple hash of the filename that's valid as an attribute name
    return 'file_' + btoa(filename).replace(/[^a-z0-9]/gi, '_');
}

// Combined function to convert SVG to STL and match to logo position
function convertAndMatchLogoStl() {
    // Convert SVG to STL
    convertSvgToStl();
    
    // Match the STL position to the logo
    setTimeout(() => {
        matchLogoTransform();
        
        // Enable the repair and cut buttons
        const repairStlBtn = document.getElementById('repair-stl-btn');
        if (repairStlBtn) repairStlBtn.disabled = false;
    }, 500);
}

// Function to repair STL meshes using the server-side Python script
async function repairStl() {
    console.log("Requesting server-side STL repair...");

    const repairStlBtn = document.getElementById('repair-stl-btn');
    const cutLogoBtn = document.getElementById('cut-logo-btn');
    const downloadStlBtn = document.getElementById('download-stl-btn');
    
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("No STL meshes available to repair.");
        alert("Please create a logo STL first by clicking the 'Logo STL' button.");
        return;
    }
    
    // Disable buttons during repair
    if (repairStlBtn) repairStlBtn.disabled = true;
    if (cutLogoBtn) cutLogoBtn.disabled = true;
    if (downloadStlBtn) downloadStlBtn.disabled = true;

    try {
        // 1. Ensure the group's world matrix is up-to-date for export
        svgToStlGroup.updateMatrixWorld(true);
        
        // 2. Export the entire group directly to a TEXT STL string
        console.log("Exporting SVG-to-STL group to TEXT STL...");
        const exporter = new STLExporter();
        const stlString = exporter.parse(svgToStlGroup, { binary: false }); // Use TEXT STL

        // No need for buffer check with text STL
        /*
        if (!stlBuffer || stlBuffer.byteLength <= 84) { 
            throw new Error("STLExporter failed to generate valid binary STL data.");
        }
        */
        
        // Remove Base64 encoding
        /*
        const stlBase64 = btoa(
            new Uint8Array(stlBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        */

        // 3. Send plain STL text data to the server endpoint
        console.log(`Sending Text STL data (${(stlString.length / 1024).toFixed(1)} KB) to /api/repair-stl...`);
        const response = await fetch('/api/repair-stl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send plain text string, remove isBinary flag
            body: JSON.stringify({ stlData: stlString }), 
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server repair failed:", errorData);
            throw new Error(`Server repair failed: ${errorData.error} - ${errorData.details || response.statusText}`);
        }

        const result = await response.json();
        console.log("Received repaired STL data (Text) from server.");
            
        // 4. Parse the repaired TEXT STL string back into geometry
        const repairedStlString = result.repairedStlData; // Expecting text string
        
        // Remove Base64 decoding
        /*
        const binaryString = atob(repairedStlBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const repairedBuffer = bytes.buffer; // Get the ArrayBuffer
        */
        
        // REMOVE local instantiation - use imported loader instance
        // const loader = new STLLoader(); // This line should be deleted
        const repairedGeometry = loader.parse(repairedStlString); // Parse the text string

        if (!repairedGeometry || repairedGeometry.type !== 'BufferGeometry') {
            throw new Error("Failed to parse repaired text STL from server.");
        }
        repairedGeometry.computeVertexNormals(); // Ensure normals are calculated
        repairedGeometry.computeBoundingSphere(); // Ensure bounding sphere is updated
        console.log("Repaired geometry parsed successfully.");

        // 5. Replace the content of svgToStlGroup with the single repaired mesh
        clearGroup(svgToStlGroup); // Clear existing children
        
        // Apply the original group transformation back to the group itself
        // as the repaired mesh is in world coordinates from the export/repair process
        // svgToStlGroup.matrix.identity(); // Reset group matrix first (might not be needed)
        // svgToStlGroup.applyMatrix4(originalGroupTransform); // We didn't save this, need group's original transform
        // **Correction:** The exporter applies world transforms. The python script repairs.
        // The loaded geometry is in world coords. We need to put it back into the *untransformed* group.
        // So, we need the INVERSE of the group's original world matrix.
        const originalMatrix = svgToStlGroup.matrix.clone(); // Assume group matrix holds the intended transform
        const inverseOriginalMatrix = new THREE.Matrix4().copy(originalMatrix).invert();
        
        // Get the STL color from the picker
        const stlColor = stlColorSelect ? stlColorSelect.value : '#FFA500';
        const repairedMaterial = new THREE.MeshPhongMaterial({
             color: stlColor, 
             side: THREE.DoubleSide // Add this line to render both front and back faces
        });
        
        const repairedMesh = new THREE.Mesh(repairedGeometry, repairedMaterial);
        
        // Apply inverse transform to the repaired mesh before adding to the group
        repairedMesh.applyMatrix4(inverseOriginalMatrix);
        repairedMesh.updateMatrixWorld(); // Update its matrix
        
        // Add the single repaired mesh back to the group (which should ideally have identity matrix now)
        // svgToStlGroup.matrix.identity(); // Reset group matrix
        svgToStlGroup.add(repairedMesh);
        svgToStlGroup.updateMatrixWorld(true); // Update group's world matrix
        console.log("Replaced group content with single repaired mesh.");

        console.log(`Server-side repair complete. Repaired mesh added to group.`);
        // alert("Logo STL successfully repaired using server-side tool."); // Removed this alert
        
         // --- Enable Cut buttons after successful repair ---
         if (cutLogoBtn) cutLogoBtn.disabled = false;
         if (cutThinLogoBtn) cutThinLogoBtn.disabled = false;
         if (cutoutLogoBtn) cutoutLogoBtn.disabled = false;
         // -----------------------------------------------------
         
         // Update STL BBox helper if visible
        if (logoStlBboxHelper) {
            removeLogoStlBboxHelper();
            toggleLogoStlBbox(); // This recalculates based on the new content
        }

    } catch (error) {
        console.error("Error during server-side STL repair process:", error);
        alert(`STL Repair failed: ${error.message}`);
    } finally {
        // Re-enable buttons
        if (repairStlBtn) repairStlBtn.disabled = false;
    if (cutLogoBtn) cutLogoBtn.disabled = false;
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false; // Ensure it's enabled here too
        if (cutoutLogoBtn) cutoutLogoBtn.disabled = false; // Ensure it's enabled here too
    if (downloadStlBtn) downloadStlBtn.disabled = false;
    
    // Update rendering
    if (renderer) renderer.render(scene, camera);
    if (controls) controls.update();
    }
}

// Cut the logo STL to keep only portions that intersect with the model
// MODIFIED: Now uses server-side intersection to keep only overlapping geometry
async function cutLogoWithModel() {
    console.log("Performing server-side intersection of logo STL with model (Cut Logo)...");

    // UI Feedback: Show loading state (e.g., disable buttons, show spinner)
    const cutLogoBtn = document.getElementById('cut-logo-btn');
    const downloadBtn = document.getElementById('download-model-stl-btn');
    if (cutLogoBtn) cutLogoBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    // TODO: Add a visual loading indicator if desired

    // 1. Pre-checks
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("No logo STL mesh available to use for intersection.");
        alert("Please create and repair a logo STL first.");
        if (cutLogoBtn) cutLogoBtn.disabled = false; // Re-enable button on failure
        return;
    }

    if (svgToStlGroup.children.length > 1) {
        console.warn("Multiple meshes found in logo STL group. Intersection requires a single logo mesh. Please repair first.");
        alert("Please use 'Repair STL' first to merge the logo into a single mesh before cutting.");
        if (cutLogoBtn) cutLogoBtn.disabled = false; // Re-enable button on failure
        return;
    }

    const logoMesh = svgToStlGroup.children[0];
    if (!logoMesh || !logoMesh.geometry) {
        console.error("Could not get valid logo mesh from group.");
         alert("Internal error: Could not find valid logo mesh geometry.");
        if (cutLogoBtn) cutLogoBtn.disabled = false;
         return;
    }
    
    if (!model || !model.geometry) {
        console.error("No model mesh or geometry available to perform intersection.");
        alert("Model is not loaded or has no geometry.");
        if (cutLogoBtn) cutLogoBtn.disabled = false;
        return;
    }
    
    // 2. Ensure Alignment (Optional but recommended)
    // matchLogoTransform(); // Consider if this should be called automatically or rely on user
    console.log("Assuming logo STL is aligned. Proceeding with export...");

    try {
        // 3. Export Meshes to Text STL Strings
        const exporter = new STLExporter();
        
        // Export Model (Apply world transform)
        model.updateMatrixWorld(true);
        const modelStlString = exporter.parse(model, { binary: false });
        console.log(`Exported model STL string (${(modelStlString.length / 1024).toFixed(1)} KB)`);

        // Export Logo (Apply world transform - group transform is needed)
        svgToStlGroup.updateMatrixWorld(true); // Ensure group's transform is up-to-date
        const logoStlString = exporter.parse(svgToStlGroup, { binary: false }); // Export the group
        console.log(`Exported logo STL string (${(logoStlString.length / 1024).toFixed(1)} KB)`);

        // 4. Send to Node.js Server Endpoint (which will run Python script with intersection operation)
        const nodeApiUrl = '/api/intersect-stl-scripted'; // Use the new intersection endpoint
        console.log(`Sending STL data to Node.js server at ${nodeApiUrl}...`);
        const response = await fetch(nodeApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                modelStlData: modelStlString,
                logoStlData: logoStlString 
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server intersection failed:", errorData);
            throw new Error(`Server intersection failed: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        const intersectedStlString = result.intersectedStlData;
        console.log("Received intersected STL data (Text) from server.");

        // 5. Parse Result and Update Model
        let intersectedGeometry;
        try {
            // Parse the STL string into geometry using the global loader
            intersectedGeometry = loader.parse(intersectedStlString);
            console.log("STL parsing completed successfully.");
        } catch (parseError) {
            console.error("Failed to parse intersected STL data:", parseError);
            throw new Error(`Failed to parse intersected STL: ${parseError.message}`);
        }

        // Check geometry validity AFTER successful parsing attempt
        if (!intersectedGeometry || intersectedGeometry.type !== 'BufferGeometry' || intersectedGeometry.attributes.position.count === 0) {
            console.error("Parsed geometry is invalid or empty.", intersectedGeometry);
            throw new Error("Parsed intersected STL geometry is invalid or empty.");
        }
        
        intersectedGeometry.computeVertexNormals();
        intersectedGeometry.computeBoundingSphere();
        console.log("Intersected geometry parsed successfully.");

        // 6. Create Boolean Result Mesh (instead of replacing model)
        // Remove previous boolean result if it exists
        if (booleanResultMesh) {
            console.log("Removing previous boolean result mesh...");
            scene.remove(booleanResultMesh);
            if (booleanResultMesh.geometry) booleanResultMesh.geometry.dispose();
            if (booleanResultMesh.material) booleanResultMesh.material.dispose();
            booleanResultMesh = null;
        }
        
        // Create new boolean result mesh with its own material
        const booleanResultMaterial = new THREE.MeshPhongMaterial({
            color: new THREE.Color(booleanResultColorSelect ? booleanResultColorSelect.value : '#00FF00'), // Default to bright green for better visibility
            specular: 0x111111,
            shininess: 100,
            transparent: false,
            opacity: 1.0
        });
        
        booleanResultMesh = new THREE.Mesh(intersectedGeometry, booleanResultMaterial);
        // Store operation type for download filename
        booleanResultMesh.userData = { operationType: 'cut-logo' };
        scene.add(booleanResultMesh);
        console.log("Boolean result mesh created and added to scene.");
        
        // Log bounding box information immediately after creation
        const bbox = new THREE.Box3().setFromObject(booleanResultMesh);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        console.log(`%c[CUT LOGO RESULT] Bounding Box - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`, 'font-weight: bold;');

        // 7. Update Helpers and UI
        if (bboxHelper) {
            removeBBoxHelper();
            toggleBoundingBox(); // Recreate with new geometry
        }
        
        // Enable related operations
        if (cutoutLogoResultBtn) cutoutLogoResultBtn.disabled = false; // Enable cut out using this result
        if (downloadBtn) downloadBtn.disabled = false; // Enable download for the result

        console.log("%c✅ Logo geometry successfully intersected with the model using server-side operation (Cut Logo).", 'font-weight: bold;'); // Log success

        // Force render update
        if (renderer) renderer.render(scene, camera);

    } catch (error) {
        console.error("Error during server-side logo intersection (Cut Logo):", error);
        alert(`Logo intersection failed: ${error.message}`);
        // Re-enable button on failure
        if (cutLogoBtn) cutLogoBtn.disabled = false;
    } finally {
        // Hide loading state
        // TODO: Hide visual loading indicator if added
        if (renderer) renderer.render(scene, camera); // Ensure scene updates
        if (controls) controls.update();
    }
}

// --- NEW Function: Cut Out Logo from Model (Server-Side) --- 
async function cutoutLogoFromModel() {
    console.log("Performing server-side subtraction of logo STL from model...");

    // UI Feedback: Show loading state (e.g., disable buttons, show spinner)
    const cutoutBtn = document.getElementById('cutout-logo-btn');
    const downloadBtn = document.getElementById('download-model-stl-btn');
    if (cutoutBtn) cutoutBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    // TODO: Add a visual loading indicator if desired

    // 1. Pre-checks
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("No logo STL mesh available to use as cutting tool.");
        alert("Please create and repair a logo STL first.");
        if (cutoutBtn) cutoutBtn.disabled = false; // Re-enable button on failure
        return;
    }

    if (svgToStlGroup.children.length > 1) {
        console.warn("Multiple meshes found in logo STL group. Subtraction requires a single logo mesh. Please repair first.");
        alert("Please use 'Repair STL' first to merge the logo into a single mesh before cutting out.");
        if (cutoutBtn) cutoutBtn.disabled = false; // Re-enable button on failure
        return;
    }

    const logoMesh = svgToStlGroup.children[0];
    if (!logoMesh || !logoMesh.geometry) {
        console.error("Could not get valid logo mesh from group.");
        alert("Internal error: Could not find valid logo mesh geometry.");
        if (cutoutBtn) cutoutBtn.disabled = false;
        return;
    }

    if (!model || !model.geometry) {
        console.error("No model mesh or geometry available to perform subtraction.");
        alert("Model is not loaded or has no geometry.");
        if (cutoutBtn) cutoutBtn.disabled = false;
        return;
    }

    // 2. Ensure Alignment (Optional but recommended)
    // matchLogoTransform(); // Consider if this should be called automatically or rely on user
    console.log("Assuming logo STL is aligned. Proceeding with export...");

    try {
        // 3. Export Meshes to Text STL Strings
        const exporter = new STLExporter();
        
        // Export Model (Apply world transform)
        model.updateMatrixWorld(true);
        const modelStlString = exporter.parse(model, { binary: false });
        console.log(`Exported model STL string (${(modelStlString.length / 1024).toFixed(1)} KB)`);

        // Export Logo (Apply world transform - group transform is needed)
        svgToStlGroup.updateMatrixWorld(true); // Ensure group's transform is up-to-date
        const logoStlString = exporter.parse(svgToStlGroup, { binary: false }); // Export the group
        console.log(`Exported logo STL string (${(logoStlString.length / 1024).toFixed(1)} KB)`);

        // 4. Send to Node.js Server Endpoint (which will run Python script)
        const nodeApiUrl = '/api/subtract-stl-scripted'; // Use the same reliable endpoint as cutout
        console.log(`Sending STL data to Node.js server at ${nodeApiUrl}...`);
        const response = await fetch(nodeApiUrl, { // Use the Node.js API URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                modelStlData: modelStlString,
                logoStlData: logoStlString 
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server subtraction failed:", errorData);
            throw new Error(`Server subtraction failed: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        const subtractedStlString = result.subtractedStlData;
        console.log("Received subtracted STL data (Text) from server.");

        // 5. Parse Result and Update Model
        // REMOVE local instantiation - use imported loader instance
        // const loader = new STLLoader();
        let subtractedGeometry;

        // --- Explicit Check for ASCII String --- 
        if (typeof subtractedStlString === 'string' && subtractedStlString.trim().startsWith('solid')) {
            console.log("Parsing received data as ASCII STL string.");
            try {
                // Pass the string directly to the loader
                subtractedGeometry = loader.parse(subtractedStlString);
            } catch (parseError) {
                console.error("STLLoader failed to parse ASCII string:", parseError);
                // Provide a hint if the known TypeError occurs
                if (parseError instanceof TypeError && parseError.message.includes('DataView constructor')) {
                    console.warn("Hint: The STLLoader might be incorrectly trying to treat the ASCII string as binary data internally.");
                }
                throw new Error("STLLoader failed to parse the received ASCII STL string.");
            }
        } else if (subtractedStlString instanceof ArrayBuffer) {
             // Handle unexpected binary data (shouldn't happen with current server setup)
             console.log("Parsing received data as ArrayBuffer (Binary STL).");
             try {
                 subtractedGeometry = loader.parse(subtractedStlString);
             } catch (parseError) {
                 console.error("STLLoader failed to parse ArrayBuffer:", parseError);
                 throw new Error("STLLoader failed to parse received Binary STL data.");
             }
        } else {
            // Handle other unexpected data types
             console.error("Received unexpected data format from server for subtraction result:", typeof subtractedStlString);
             throw new Error("Received unexpected data format from server for subtracted STL.");
        }
        // --- End Explicit Check --- 

        // Check geometry validity AFTER successful parsing attempt
        if (!subtractedGeometry || subtractedGeometry.type !== 'BufferGeometry' || subtractedGeometry.attributes.position.count === 0) {
            console.error("Parsed geometry is invalid or empty.", subtractedGeometry);
            throw new Error("Parsed subtracted STL geometry is invalid or empty.");
        }
        
        subtractedGeometry.computeVertexNormals();
        subtractedGeometry.computeBoundingSphere();
        console.log("Subtracted geometry parsed successfully.");

        // 6. Update Model Mesh
        model.geometry.dispose(); // Dispose old model geometry
        model.geometry = subtractedGeometry; // Assign new geometry
        model.geometry.needsUpdate = true; // Flag geometry update
        console.log("Model geometry updated with subtraction result.");

        // 7. Update Helpers and UI
        if (bboxHelper) {
            removeBBoxHelper();
            toggleBoundingBox(); // Recreate with new geometry
        }

        // Enable download for the result
        if (downloadBtn) downloadBtn.disabled = false; // Enable download for the result

        // REMOVED alert on success
        // alert("Logo geometry successfully subtracted from the model using server-side operation.");
        console.log("Logo geometry successfully subtracted from the model using server-side operation."); // Replaced with console log

    } catch (error) {
        console.error("Error during server-side logo subtraction:", error);
        alert(`Logo subtraction failed: ${error.message}`);
        // Re-enable button on failure
        if (cutoutBtn) cutoutBtn.disabled = false;
    } finally {
        // Hide loading state
        // TODO: Hide visual loading indicator if added
        if (renderer) renderer.render(scene, camera); // Ensure scene updates
        if (controls) controls.update();
    }
}

// --- NEW Function: Cut Out Logo Result from Model (Server-Side) ---
async function cutoutLogoResultFromModel() {
    console.log("Performing server-side subtraction of logo result from model...");

    if (!booleanResultMesh || !booleanResultMesh.userData || booleanResultMesh.userData.operationType !== 'cut-logo') {
        alert("No Cut Logo result available. Please perform 'Cut Logo' operation first.");
        return;
    }

    await performCutoutOperation('logo-result', booleanResultMesh, 'Cut Out Logo Result');
}

// --- NEW Function: Cut Out Thin Logo Result from Model (Server-Side) ---
async function cutoutThinLogoResultFromModel() {
    console.log("Performing server-side subtraction of thin logo result from model...");

    if (!booleanResultMesh || !booleanResultMesh.userData || booleanResultMesh.userData.operationType !== 'cut-thin-logo') {
        alert("No Cut Thin Logo result available. Please perform 'Cut Thin Logo' operation first.");
        return;
    }

    await performCutoutOperation('thin-logo-result', booleanResultMesh, 'Cut Out Thin Logo Result');
}

// --- Helper Function: Perform Cutout Operation ---
async function performCutoutOperation(operationType, meshToSubtract, operationName) {
    const downloadBtn = document.getElementById('download-model-stl-btn');
    if (downloadBtn) downloadBtn.disabled = true;

    // Pre-checks
    if (!meshToSubtract || !meshToSubtract.geometry) {
        console.error(`No valid mesh available for ${operationName}.`);
        alert(`Internal error: Could not find valid mesh geometry for ${operationName}.`);
        return;
    }

    if (!model || !model.geometry) {
        console.error("No model mesh or geometry available to perform subtraction.");
        alert("Model is not loaded or has no geometry.");
        return;
    }

    // Check if mirror STL is enabled and we need to subtract both
    const hasMirroredStl = mirrorStlCheckbox && mirrorStlCheckbox.checked && mirroredStlGroup && mirroredStlGroup.children.length > 0;
    
    if (hasMirroredStl) {
        console.log(`${operationName} will subtract both original and mirrored STL from model.`);
    } else {
        console.log(`${operationName} will subtract only the original mesh from model.`);
    }

    console.log(`Assuming ${operationName} mesh is aligned. Proceeding with export...`);

    try {
        // Export Meshes to Text STL Strings
        const exporter = new STLExporter();
        
        // Export Model (Apply world transform)
        model.updateMatrixWorld(true);
        let currentModelStlString = exporter.parse(model, { binary: false });
        console.log(`Exported model STL string (${(currentModelStlString.length / 1024).toFixed(1)} KB)`);

        // Export the result mesh (Apply world transform)
        meshToSubtract.updateMatrixWorld(true);
        const logoStlString = exporter.parse(meshToSubtract, { binary: false });
        console.log(`Exported ${operationName} STL string (${(logoStlString.length / 1024).toFixed(1)} KB)`);

        // First subtraction: subtract the main mesh
        console.log(`Performing first subtraction: model - main ${operationName}...`);
        let response = await fetch('/api/subtract-stl-scripted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                modelStlData: currentModelStlString,
                logoStlData: logoStlString 
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Server ${operationName} failed:`, errorData);
            throw new Error(`Server ${operationName} failed: ${errorData.error || response.statusText}`);
        }

        let result = await response.json();
        let subtractedStlString = result.subtractedStlData;
        console.log(`First subtraction completed.`);

        // If mirrored STL exists, perform second subtraction
        if (hasMirroredStl) {
            console.log(`Performing second subtraction: result - mirrored ${operationName}...`);
            
            // Export mirrored STL
            mirroredStlGroup.updateMatrixWorld(true);
            const mirroredStlString = exporter.parse(mirroredStlGroup, { binary: false });
            console.log(`Exported mirrored STL string (${(mirroredStlString.length / 1024).toFixed(1)} KB)`);

            // Second subtraction using the result from first subtraction
            response = await fetch('/api/subtract-stl-scripted', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    modelStlData: subtractedStlString, // Use result from first subtraction
                    logoStlData: mirroredStlString 
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Server mirrored ${operationName} failed:`, errorData);
                throw new Error(`Server mirrored ${operationName} failed: ${errorData.error || response.statusText}`);
            }

            result = await response.json();
            subtractedStlString = result.subtractedStlData;
            console.log(`Second subtraction (mirrored) completed.`);
        }

        console.log(`Received final ${operationName} STL data (Text) from server.`);

        // Parse Result and Update Model
        let subtractedGeometry;
        try {
            subtractedGeometry = loader.parse(subtractedStlString);
            console.log("STL parsing completed successfully.");
        } catch (parseError) {
            console.error(`Failed to parse ${operationName} STL data:`, parseError);
            throw new Error(`Failed to parse ${operationName} STL: ${parseError.message}`);
        }

        if (!subtractedGeometry || subtractedGeometry.type !== 'BufferGeometry' || subtractedGeometry.attributes.position.count === 0) {
            console.error("Parsed geometry is invalid or empty.", subtractedGeometry);
            throw new Error(`Parsed ${operationName} STL geometry is invalid or empty.`);
        }
        
        subtractedGeometry.computeVertexNormals();
        subtractedGeometry.computeBoundingSphere();
        console.log(`${operationName} geometry parsed successfully.`);

        // Update Model Mesh
        model.geometry.dispose(); // Dispose old model geometry
        model.geometry = subtractedGeometry; // Assign new geometry
        model.geometry.needsUpdate = true; // Flag geometry update
        console.log(`Model geometry updated with ${operationName} result.`);

        // Update Helpers and UI
        if (bboxHelper) {
            removeBBoxHelper();
            toggleBoundingBox(); // Recreate with new geometry
        }

        if (downloadBtn) downloadBtn.disabled = false; // Enable download for the result

        const operationSummary = hasMirroredStl ? 
            `${operationName} operation completed successfully (subtracted both original and mirrored).` :
            `${operationName} operation completed successfully.`;
        console.log(`✅ ${operationSummary}`);

    } catch (error) {
        console.error(`Error during server-side ${operationName}:`, error);
        alert(`${operationName} failed: ${error.message}`);
    } finally {
        // Update rendering
        if (renderer) renderer.render(scene, camera);
        if (controls) controls.update();
    }
}

// --- NEW Function: Debug Available Models ---
function debugAvailableModels() {
    console.group('%cDEBUG: Available Models', 'font-weight: bold; color: blue;');
    
    // Log main model
    if (model) {
        console.log('Main Model:', {
            geometry: model.geometry,
            material: model.material,
            visible: model.visible,
            position: model.position,
            rotation: model.rotation,
            scale: model.scale,
            boundingBox: new THREE.Box3().setFromObject(model)
        });
    } else {
        console.log('Main Model: Not loaded');
    }
    
    // Log logo STL group
    if (svgToStlGroup && svgToStlGroup.children.length > 0) {
        console.log('Logo STL Group:', {
            childrenCount: svgToStlGroup.children.length,
            visible: svgToStlGroup.visible,
            position: svgToStlGroup.position,
            rotation: svgToStlGroup.rotation,
            scale: svgToStlGroup.scale,
            boundingBox: new THREE.Box3().setFromObject(svgToStlGroup),
            children: svgToStlGroup.children.map((child, i) => ({
                index: i,
                geometry: child.geometry,
                material: child.material,
                visible: child.visible
            }))
        });
    } else {
        console.log('Logo STL Group: Empty or not created');
    }
    
    // Log boolean result mesh
    if (booleanResultMesh) {
        console.log('Boolean Result Mesh:', {
            operationType: booleanResultMesh.userData?.operationType,
            geometry: booleanResultMesh.geometry,
            material: booleanResultMesh.material,
            visible: booleanResultMesh.visible,
            position: booleanResultMesh.position,
            rotation: booleanResultMesh.rotation,
            scale: booleanResultMesh.scale,
            boundingBox: new THREE.Box3().setFromObject(booleanResultMesh)
        });
    } else {
        console.log('Boolean Result Mesh: Not available');
    }
    
    // Log logo decal
    if (logoMesh) {
        console.log('Logo Decal Mesh:', {
            geometry: logoMesh.geometry,
            material: logoMesh.material,
            visible: logoMesh.visible,
            position: logoMesh.position,
            rotation: logoMesh.rotation,
            scale: logoMesh.scale
        });
    } else {
        console.log('Logo Decal Mesh: Not available');
    }
    
    // Log scene children count
    console.log('Scene Total Children:', scene.children.length);
    console.log('Scene Children Types:', scene.children.map(child => child.constructor.name));
    
    console.groupEnd();
}

// --- Visibility Toggles (Re-added) ---
function toggleLogoStlVisibility() {
    console.log("%c[TOGGLE LOGO STL] Button clicked.", 'font-weight: bold;');
    if (svgToStlGroup) {
        svgToStlGroup.visible = !svgToStlGroup.visible;
        console.log(`%cLogo STL visibility set to: ${svgToStlGroup.visible}`, 'font-weight: bold;');
    } else {
        console.warn("%cCannot toggle Logo STL visibility: Group not found.", 'font-weight: bold;');
    }
}

function toggleLogoDecalVisibility() {
    console.log("%c[TOGGLE LOGO DECAL] Button clicked.", 'font-weight: bold;');
    if (logoMesh) {
        logoMesh.visible = !logoMesh.visible;
        console.log(`%cLogo Decal visibility set to: ${logoMesh.visible}`, 'font-weight: bold;');
        // Also toggle mirror if it exists
        if (mirroredLogoMesh) {
            mirroredLogoMesh.visible = logoMesh.visible;
            console.log(`%cMirrored Logo Decal visibility set to: ${mirroredLogoMesh.visible}`, 'font-weight: bold;');
        }
    } else {
        console.warn("%cCannot toggle Logo Decal visibility: Decal mesh not found.", 'font-weight: bold;');
    }
}

// --- Cut Result Visibility Toggle ---
function toggleCutResultVisibility() {
    console.log("%c[TOGGLE CUT RESULT] Button clicked.", 'font-weight: bold;');
    if (booleanResultMesh) {
        booleanResultMesh.visible = !booleanResultMesh.visible;
        console.log(`%cCut Result visibility set to: ${booleanResultMesh.visible}`, 'font-weight: bold;');
        
        // Log bounding box info for debugging
        if (booleanResultMesh.visible) {
            const bbox = new THREE.Box3().setFromObject(booleanResultMesh);
            const size = bbox.getSize(new THREE.Vector3());
            const center = bbox.getCenter(new THREE.Vector3());
            console.log(`%cCut Result Bounding Box - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`, 'font-weight: bold;');
        }
    } else {
        console.warn("%cCannot toggle Cut Result visibility: No boolean result mesh found.", 'font-weight: bold;');
    }
}

// --- Scene Axis Helper Toggle ---
function toggleSceneAxisHelper() {
    console.log("[toggleSceneAxisHelper] Button clicked.");
    if (sceneAxisHelper) {
        // Remove existing axis helper
        scene.remove(sceneAxisHelper);
        if (sceneAxisHelper.geometry) sceneAxisHelper.geometry.dispose();
        if (sceneAxisHelper.material) sceneAxisHelper.material.dispose();
        sceneAxisHelper = null;
        console.log("Scene axis helper removed.");
    } else {
        // Create and add axis helper at scene origin
        const axisSize = 50; // Large enough to be visible
        sceneAxisHelper = new THREE.AxesHelper(axisSize);
        sceneAxisHelper.position.set(0, 0, 0); // Place at scene origin
        scene.add(sceneAxisHelper);
        console.log("Scene axis helper added at origin (Red=X+, Green=Y+, Blue=Z+).");
    }
}

// *** NEW FUNCTION: Repair Base Model ***
async function repairBaseModel() {
    console.log("Requesting server-side BASE MODEL repair...");

    if (!model || !model.geometry) {
        console.warn("No base model mesh available to repair.");
        alert("Please load a model first.");
        return;
    }

    // Disable button during repair
    if (repairBaseModelBtn) repairBaseModelBtn.disabled = true;
    if (downloadModelStlBtn) downloadModelStlBtn.disabled = true; // Also disable download

    try {
        // 1. Ensure the model's world matrix is up-to-date for export
        model.updateMatrixWorld(true);
        
        // 2. Export the model to a TEXT STL string
        console.log("Exporting base model to TEXT STL...");
        const exporter = new STLExporter();
        const stlString = exporter.parse(model, { binary: false }); // Use TEXT STL

        // 3. Send plain STL text data to the server endpoint
        console.log(`Sending Base Model Text STL data (${(stlString.length / 1024).toFixed(1)} KB) to /api/repair-stl...`);
        const response = await fetch('/api/repair-stl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ stlData: stlString }), // Use the same API endpoint as logo repair
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server base model repair failed:", errorData);
            throw new Error(`Server repair failed: ${errorData.error} - ${errorData.details || response.statusText}`);
        }

        const result = await response.json();
        console.log("Received repaired base model STL data (Text) from server.");
            
        // 4. Parse the repaired TEXT STL string back into geometry
        const repairedStlString = result.repairedStlData; // Expecting text string
        const repairedGeometry = loader.parse(repairedStlString); // Use the global loader instance

        if (!repairedGeometry || repairedGeometry.type !== 'BufferGeometry' || repairedGeometry.attributes.position.count === 0) {
            throw new Error("Failed to parse repaired base model text STL from server.");
        }
        repairedGeometry.computeVertexNormals(); 
        repairedGeometry.computeBoundingSphere(); 
        console.log("Repaired base model geometry parsed successfully.");

        // 5. Replace the main model's geometry
        const originalMatrix = model.matrix.clone(); // Preserve original local matrix
        model.geometry.dispose(); // Dispose old geometry
        model.geometry = repairedGeometry;
        // Apply the original matrix back to ensure position/rotation/scale are maintained
        // model.matrix.copy(originalMatrix);
        // model.matrix.decompose(model.position, model.quaternion, model.scale);
        // Reset transforms as repaired geometry is likely in world space
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        model.updateMatrixWorld(true);

        console.log(`Base model repair complete. Model geometry updated.`);
        alert("Base model successfully repaired."); // Keep alert for this one?
        
        // Update BBox helper if visible
        if (bboxHelper) {
            removeBBoxHelper();
            toggleBoundingBox(); // Recreate with new geometry
        }

    } catch (error) {
        console.error("Error during server-side base model repair process:", error);
        alert(`Base Model Repair failed: ${error.message}`);
    } finally {
        // Re-enable buttons
        if (repairBaseModelBtn) repairBaseModelBtn.disabled = false;
        if (downloadModelStlBtn) downloadModelStlBtn.disabled = false;
    
        // Update rendering
        if (renderer) renderer.render(scene, camera);
        if (controls) controls.update();
    }
}

// *** NEW FUNCTION: Handle Mirror STL Toggle ***
function handleMirrorStlToggle() {
    // Update checkbox state based on button click if needed (already done in listener)
    if (!mirrorStlCheckbox) return;
    console.log(`Mirror Logo STL processed: ${mirrorStlCheckbox.checked}`);
    if (mirrorStlCheckbox.checked) {
        createOrUpdateMirroredStl();
    } else {
        removeMirroredStl();
    }
}

// *** NEW FUNCTION: Create/Update Mirrored STL Copy ***
function createOrUpdateMirroredStl() {
    // Check if we have a cut result to mirror (preferred) or fall back to logo STL
    let sourceToMirror = null;
    let sourceName = "";
    
    if (booleanResultMesh && booleanResultMesh.userData && booleanResultMesh.userData.operationType === 'cut-thin-logo') {
        sourceToMirror = booleanResultMesh;
        sourceName = "Cut Thin Logo Result";
        console.log("Mirroring Cut Thin Logo Result");
    } else if (svgToStlGroup && svgToStlGroup.children.length > 0) {
        sourceToMirror = svgToStlGroup;
        sourceName = "Logo STL";
        console.log("Mirroring Logo STL (no Cut Thin Logo Result available)");
    } else {
        console.warn("Cannot create mirrored STL: No suitable source found.");
        if (mirrorStlCheckbox) mirrorStlCheckbox.checked = false;
        return;
    }

    if (!model || !model.geometry) {
        console.warn("Cannot create mirrored STL: Base model not loaded.");
        if (mirrorStlCheckbox) mirrorStlCheckbox.checked = false;
        return;
    }

    removeMirroredStl(); // Remove existing mirror first
    console.log(`Creating mirrored copy of ${sourceName}...`);

    // 1. Clone the source
    if (sourceToMirror === booleanResultMesh) {
        // For boolean result mesh, create a new mesh with cloned geometry and material
        const clonedGeometry = sourceToMirror.geometry.clone();
        const clonedMaterial = sourceToMirror.material.clone();
        clonedMaterial.color.setHex(0x00FFFF); // Cyan color for mirror
        mirroredStlGroup = new THREE.Mesh(clonedGeometry, clonedMaterial);
        
        // Copy transform from source
        mirroredStlGroup.position.copy(sourceToMirror.position);
        mirroredStlGroup.rotation.copy(sourceToMirror.rotation);
        mirroredStlGroup.scale.copy(sourceToMirror.scale);
    } else {
        // For STL group, deep clone
        mirroredStlGroup = sourceToMirror.clone(true);
        mirroredStlGroup.traverse(child => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.color.setHex(0x00FFFF); // Cyan color for mirror
            }
        });
    }

    // 2. Use the same mirroring logic as double-sided logo decal
    // This ensures the mirror appears in the same position as the double-sided preview
    if (logoMesh && lastPlacementPoint && lastPlacementNormal) {
        // Get model center and calculate mirror position using the same logic as createOrUpdateMirroredLogo
        model.geometry.computeBoundingBox();
        const modelCenter = model.geometry.boundingBox.getCenter(new THREE.Vector3());
        
        // Calculate the mirror position using the same transform as double-sided logo
        const logoPosition = logoMesh.position.clone();
        const offsetFromCenter = logoPosition.clone().sub(modelCenter);
        
        // Mirror the offset across the model center (both X and Z axes for donut other side)
        const mirroredOffset = offsetFromCenter.clone();
        mirroredOffset.x *= -1; // Mirror across YZ plane
        mirroredOffset.z *= -1; // Mirror across XY plane (to get to other side of donut)
        
        const mirroredPosition = modelCenter.clone().add(mirroredOffset);
        
        // Apply the mirrored position
        mirroredStlGroup.position.copy(mirroredPosition);
        
        // Apply mirroring scale (both X and Z axes)
        const currentScale = mirroredStlGroup.scale.clone();
        currentScale.x *= -1; // Mirror across YZ plane
        currentScale.z *= -1; // Mirror across XY plane
        mirroredStlGroup.scale.copy(currentScale);
        
        console.log(`Mirrored ${sourceName} positioned using double-sided logo logic.`);
    } else {
        // Fallback: simple center-based mirroring
        model.geometry.computeBoundingBox();
        const modelCenter = model.geometry.boundingBox.getCenter(new THREE.Vector3());
        
        const originalPosition = sourceToMirror.position;
        const offsetFromCenter = originalPosition.x - modelCenter.x;
        mirroredStlGroup.position.copy(originalPosition);
        mirroredStlGroup.position.x = modelCenter.x - offsetFromCenter;
        mirroredStlGroup.scale.x *= -1;
        
        console.log(`Mirrored ${sourceName} using fallback center-based positioning.`);
    }

    scene.add(mirroredStlGroup);
    mirroredStlGroup.visible = true;
    
    console.log(`Mirrored ${sourceName} created and positioned.`);
}

// *** NEW FUNCTION: Remove Mirrored STL Copy ***
function removeMirroredStl() {
    if (mirroredStlGroup) {
        console.log("Removing mirrored STL copy...");
        scene.remove(mirroredStlGroup);
        // TODO: Proper disposal of geometry/materials if necessary
        mirroredStlGroup = null;
    }
}

// *** Add logging helper function ***
function logTransformState(prefix, obj3d) {
    if (!obj3d) {
        console.log(`${prefix}: Object is null`);
        return;
    }
    obj3d.updateMatrixWorld(true); // Ensure world matrix is up-to-date
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    obj3d.matrixWorld.decompose(pos, quat, scale);
    const euler = new THREE.Euler().setFromQuaternion(quat);

    console.groupCollapsed(`${prefix}`);
    console.log(` Local Pos: ${obj3d.position.x.toFixed(2)}, ${obj3d.position.y.toFixed(2)}, ${obj3d.position.z.toFixed(2)}`);
    console.log(` Local Quat: ${obj3d.quaternion.x.toFixed(2)}, ${obj3d.quaternion.y.toFixed(2)}, ${obj3d.quaternion.z.toFixed(2)}, ${obj3d.quaternion.w.toFixed(2)}`);
    console.log(` Local Scale: ${obj3d.scale.x.toFixed(2)}, ${obj3d.scale.y.toFixed(2)}, ${obj3d.scale.z.toFixed(2)}`);
    console.log(` World Pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
    console.log(` World Quat: ${quat.x.toFixed(2)}, ${quat.y.toFixed(2)}, ${quat.z.toFixed(2)}, ${quat.w.toFixed(2)}`);
    console.log(` World Scale: ${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}`);
    console.log(` World Euler (YXZ): ${THREE.MathUtils.radToDeg(euler.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(euler.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(euler.z).toFixed(1)}°`);
    console.log(` Matrix:\n${obj3d.matrix.elements.map(e => e.toFixed(2)).join(' ')}`);
    console.log(` MatrixWorld:\n${obj3d.matrixWorld.elements.map(e => e.toFixed(2)).join(' ')}`);
    console.groupEnd();
}

// --- NEW Function: Cut Thin Logo from Model (Server-Side Thin Intersection) --- 
async function cutThinLogoWithModel() {
    console.log("Performing server-side thin intersection of logo STL with model (Cut Thin Logo)...");

    // UI Feedback: Show loading state (e.g., disable buttons, show spinner)
    const cutThinLogoBtn = document.getElementById('cut-thin-logo-btn');
    const downloadBtn = document.getElementById('download-model-stl-btn');
    if (cutThinLogoBtn) cutThinLogoBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    // TODO: Add a visual loading indicator if desired

    // 1. Pre-checks
    if (!svgToStlGroup || svgToStlGroup.children.length === 0) {
        console.warn("No logo STL mesh available to use for thin intersection.");
        alert("Please create and repair a logo STL first.");
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false; // Re-enable button on failure
        return;
    }

    if (svgToStlGroup.children.length > 1) {
        console.warn("Multiple meshes found in logo STL group. Thin intersection requires a single logo mesh. Please repair first.");
        alert("Please use 'Repair STL' first to merge the logo into a single mesh before cutting.");
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false; // Re-enable button on failure
        return;
    }

    const logoMesh = svgToStlGroup.children[0];
    if (!logoMesh || !logoMesh.geometry) {
        console.error("Could not get valid logo mesh from group.");
        alert("Internal error: Could not find valid logo mesh geometry.");
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false;
        return;
    }

    if (!model || !model.geometry) {
        console.error("No model mesh or geometry available to perform thin intersection.");
        alert("Model is not loaded or has no geometry.");
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false;
        return;
    }

    // 2. Ensure Alignment (Optional but recommended)
    // matchLogoTransform(); // Consider if this should be called automatically or rely on user
    console.log("Assuming logo STL is aligned. Proceeding with export...");

    try {
        // 3. Export Meshes to Text STL Strings
        const exporter = new STLExporter();
        
        // Export Model (Apply world transform)
        model.updateMatrixWorld(true);
        const modelStlString = exporter.parse(model, { binary: false });
        console.log(`Exported model STL string (${(modelStlString.length / 1024).toFixed(1)} KB)`);

        // Export Logo (Apply world transform - group transform is needed)
        svgToStlGroup.updateMatrixWorld(true); // Ensure group's transform is up-to-date
        const logoStlString = exporter.parse(svgToStlGroup, { binary: false }); // Export the group
        console.log(`Exported logo STL string (${(logoStlString.length / 1024).toFixed(1)} KB)`);

        // 4. Get thickness delta from UI
        const thicknessDeltaInput = document.getElementById('logo-thickness-delta');
        const thicknessDelta = thicknessDeltaInput ? parseFloat(thicknessDeltaInput.value) || 1.0 : 1.0;
        console.log(`Using thickness delta: ${thicknessDelta}mm`);

        // 5. Send to Node.js Server Endpoint (which will run Python script with thin intersection operation)
        const nodeApiUrl = '/api/intersect-thin-stl-scripted'; // Use the new thin intersection endpoint
        console.log(`Sending STL data to Node.js server at ${nodeApiUrl}...`);
        const response = await fetch(nodeApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                modelStlData: modelStlString,
                logoStlData: logoStlString,
                thicknessDelta: thicknessDelta
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server thin intersection failed:", errorData);
            throw new Error(`Server thin intersection failed: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        const thinIntersectedStlString = result.thinIntersectedStlData;
        console.log("Received thin intersected STL data (Text) from server.");

        // 6. Parse Result and Update Model
        let thinIntersectedGeometry;
        try {
            // Parse the STL string into geometry using the global loader
            thinIntersectedGeometry = loader.parse(thinIntersectedStlString);
            console.log("STL parsing completed successfully.");
        } catch (parseError) {
            console.error("Failed to parse thin intersected STL data:", parseError);
            throw new Error(`Failed to parse thin intersected STL: ${parseError.message}`);
        }

        // Check geometry validity AFTER successful parsing attempt
        if (!thinIntersectedGeometry || thinIntersectedGeometry.type !== 'BufferGeometry' || thinIntersectedGeometry.attributes.position.count === 0) {
            console.error("Parsed geometry is invalid or empty.", thinIntersectedGeometry);
            throw new Error("Parsed thin intersected STL geometry is invalid or empty.");
        }
        
        thinIntersectedGeometry.computeVertexNormals();
        thinIntersectedGeometry.computeBoundingSphere();
        console.log("Thin intersected geometry parsed successfully.");

        // 7. Create Boolean Result Mesh (instead of replacing model)
        // Remove previous boolean result if it exists
        if (booleanResultMesh) {
            console.log("Removing previous boolean result mesh...");
            scene.remove(booleanResultMesh);
            if (booleanResultMesh.geometry) booleanResultMesh.geometry.dispose();
            if (booleanResultMesh.material) booleanResultMesh.material.dispose();
            booleanResultMesh = null;
        }
        
        // Create new boolean result mesh with its own material  
        const booleanResultMaterial = new THREE.MeshPhongMaterial({
            color: new THREE.Color(booleanResultColorSelect ? booleanResultColorSelect.value : '#00FF00'), // Default to green for Cut Thin Logo
            specular: 0x111111,
            shininess: 100,
            transparent: false,
            opacity: 1.0
        });
        
        booleanResultMesh = new THREE.Mesh(thinIntersectedGeometry, booleanResultMaterial);
        // Store operation type for download filename
        booleanResultMesh.userData = { operationType: 'cut-thin-logo' };
        
        // Auto-apply cut result Z offset
        const cutResultZOffsetInput = document.getElementById('cut-result-z-offset');
        const zOffset = cutResultZOffsetInput ? parseFloat(cutResultZOffsetInput.value) || 0.0 : 0.0;
        if (zOffset !== 0.0) {
            console.log(`Auto-applying cut result Z offset: ${zOffset}mm`);
            booleanResultMesh.position.z += zOffset;
        }
        
        scene.add(booleanResultMesh);
        console.log("Boolean result mesh created and added to scene (thin intersection).");
        
        // Log bounding box information immediately after creation
        const bbox = new THREE.Box3().setFromObject(booleanResultMesh);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        console.log(`%c[CUT THIN LOGO RESULT] Bounding Box - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`, 'font-weight: bold;');

        // 8. Update Helpers and UI
        if (bboxHelper) {
            removeBBoxHelper();
            toggleBoundingBox(); // Recreate with new geometry
        }

        // Enable related operations
        if (cutoutThinLogoResultBtn) cutoutThinLogoResultBtn.disabled = false; // Enable cut out using this result
        if (downloadBtn) downloadBtn.disabled = false; // Enable download for the result

        console.log("%c✅ Logo geometry successfully thin intersected with the model using server-side operation (Cut Thin Logo).", 'font-weight: bold;'); // Log success

        // Update mirror STL if checkbox is checked
        if (mirrorStlCheckbox && mirrorStlCheckbox.checked) {
            console.log("Mirror STL checkbox is checked - updating mirror with Cut Thin Logo result...");
            createOrUpdateMirroredStl();
        }

        // Force render update
        if (renderer) renderer.render(scene, camera);

    } catch (error) {
        console.error("Error during server-side logo thin intersection (Cut Thin Logo):", error);
        alert(`Logo thin intersection failed: ${error.message}`);
        // Re-enable button on failure
        if (cutThinLogoBtn) cutThinLogoBtn.disabled = false;
    } finally {
        // Hide loading state
        // TODO: Hide visual loading indicator if added
        if (renderer) renderer.render(scene, camera); // Ensure scene updates
        if (controls) controls.update();
    }
}

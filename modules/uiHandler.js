// modules/uiHandler.js

// --- DOM Element References (Exported) ---
export let viewerContainer, logoUploadInput;
export let logoColorSelect, logoScaleInput;
export let moveUpLgBtn, moveDownLgBtn, moveLeftLgBtn, moveRightLgBtn;
export let moveUpSmBtn, moveDownSmBtn, moveLeftSmBtn, moveRightSmBtn;
export let modelColorSelect, modelSelect;
export let quantityInput, currencySelect, unitPriceSpan, totalPriceSpan;
export let previewLogoBtn;
export let doubleSidedCheckbox;
export let toggleBBoxBtn, toggleLogoBBoxBtn;
export let togglePlacementAreaBtn;
export let centerLogoBtn;
export let toggleStlBboxBtn;
export let toggleLogoStlVisibilityBtn;
export let toggleLogoDecalVisibilityBtn;
export let stlThicknessInput;
export let stlColorSelect;
export let mirrorStlCheckbox;
export let cutLogoBtn;
export let cutoutLogoBtn;
export let repairStlBtn;
export let downloadModelStlBtn;

// --- Internal State/Helper Variables (Not Exported) ---
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

// Store references to functions passed from app.js
let appFunctions = {};

// --- Initialization & Setup (Exported) ---

/**
 * Binds DOM elements to their corresponding variables.
 * Must be called before setupEventListeners.
 */
export function bindDOMElements() {
    viewerContainer = document.getElementById('viewer-container');
    logoUploadInput = document.getElementById('logo-upload');
    previewLogoBtn = document.getElementById('preview-logo-btn');
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
    toggleStlBboxBtn = document.getElementById('toggle-stl-bbox-btn');
    toggleLogoStlVisibilityBtn = document.getElementById('toggle-logo-stl-visibility-btn');
    toggleLogoDecalVisibilityBtn = document.getElementById('toggle-logo-decal-visibility-btn');
    stlThicknessInput = document.getElementById('stl-thickness');
    stlColorSelect = document.getElementById('stl-color');
    mirrorStlCheckbox = document.getElementById('mirror-stl');
    cutoutLogoBtn = document.getElementById('cutout-logo-btn');
    cutLogoBtn = document.getElementById('cut-logo-btn');
    repairStlBtn = document.getElementById('repair-stl-btn');
    downloadModelStlBtn = document.getElementById('download-model-stl-btn');

    // Basic check if elements exist
    if (!viewerContainer || !modelSelect || !logoUploadInput || !previewLogoBtn || !doubleSidedCheckbox || 
        !toggleBBoxBtn || !togglePlacementAreaBtn || !toggleLogoBBoxBtn || !centerLogoBtn || 
        !toggleStlBboxBtn || !toggleLogoStlVisibilityBtn || !toggleLogoDecalVisibilityBtn ||
        !stlThicknessInput || !stlColorSelect || !mirrorStlCheckbox || !cutoutLogoBtn || !cutLogoBtn || !repairStlBtn ||
        !downloadModelStlBtn ) {
         console.error("One or more essential DOM elements are missing!");
         alert("Initialization failed: Could not find essential page elements.");
         return false; // Indicate failure
    }

    // Set initial logo scale properties
    if (logoScaleInput) {
        logoScaleInput.min = 1.0;
        logoScaleInput.max = 1.7;
        logoScaleInput.step = 0.1;
        logoScaleInput.value = 1.0;
    }
    console.log("[uiHandler] DOM Elements Bound.");
    return true; // Indicate success
}

/**
 * Populates color selector dropdowns.
 */
export function populateColorSelectors() {
    const optionHeight = '20px';
    PALETTE.forEach(color => {
        const optionLogo = document.createElement('option');
        optionLogo.value = color.value;
        optionLogo.style.backgroundColor = color.value;
        optionLogo.style.height = optionHeight;
        optionLogo.style.minHeight = optionHeight;
        optionLogo.setAttribute('title', color.name);
        logoColorSelect.appendChild(optionLogo);

        const optionModel = optionLogo.cloneNode(true);
        modelColorSelect.appendChild(optionModel);
        
        if (stlColorSelect) {
            const optionStl = optionLogo.cloneNode(true);
            stlColorSelect.appendChild(optionStl);
        }
    });
    modelColorSelect.value = '#808080'; // Default Gray
    logoColorSelect.value = '#FFFFFF';  // Default White
    if (stlColorSelect) {
        stlColorSelect.value = '#FFA500';  // Default Orange for STL
    }
    styleColorSelect(modelColorSelect);
    styleColorSelect(logoColorSelect);
    if (stlColorSelect) {
        styleColorSelect(stlColorSelect);
    }
    console.log("[uiHandler] Color Selectors Populated.");
}

/**
 * Sets up event listeners for all UI elements.
 * Requires DOM elements to be bound first.
 * Requires app logic functions to be passed in via setAppFunctions.
 */
export function setupEventListeners() {
    if (Object.keys(appFunctions).length === 0) {
        console.error("[uiHandler] Cannot setup listeners: App functions not set. Call setAppFunctions first.");
        return;
    }
    console.log("[uiHandler] Setting up Event Listeners...");

    // Model selection and color
    modelSelect.addEventListener('change', (event) => appFunctions.loadModel(event.target.value));
    modelColorSelect.addEventListener('change', appFunctions.updateModelColor);

    // Logo upload and preview
    logoUploadInput.addEventListener('change', appFunctions.handleLogoSelection);
    previewLogoBtn.addEventListener('click', appFunctions.uploadAndPreviewLogo);

    // Logo manipulation
    logoColorSelect.addEventListener('change', appFunctions.updateLogoColor);
    logoScaleInput.addEventListener('input', appFunctions.handleLogoScaleChange); // Real-time update
    doubleSidedCheckbox.addEventListener('change', appFunctions.handleDoubleSidedChange);

    // Logo movement buttons
    const applyLogoMove = (axis, step) => {
        if (appFunctions.applyLogoMove) {
            appFunctions.applyLogoMove(axis, step);
        } else {
            console.warn('[uiHandler] applyLogoMove function not provided by app.');
        }
    };
    moveUpLgBtn.addEventListener('click', () => applyLogoMove('y', 1));
    moveDownLgBtn.addEventListener('click', () => applyLogoMove('y', -1));
    moveLeftLgBtn.addEventListener('click', () => applyLogoMove('x', -1));
    moveRightLgBtn.addEventListener('click', () => applyLogoMove('x', 1));
    moveUpSmBtn.addEventListener('click', () => applyLogoMove('y', 0.1));
    moveDownSmBtn.addEventListener('click', () => applyLogoMove('y', -0.1));
    moveLeftSmBtn.addEventListener('click', () => applyLogoMove('x', -0.1));
    moveRightSmBtn.addEventListener('click', () => applyLogoMove('x', 0.1));
    centerLogoBtn.addEventListener('click', appFunctions.centerLogo);

    // Quantity and Pricing
    quantityInput.addEventListener('input', updatePrice);
    currencySelect.addEventListener('change', updatePrice);

    // Toggle Buttons
    toggleBBoxBtn.addEventListener('click', appFunctions.toggleBoundingBox);
    toggleLogoBBoxBtn.addEventListener('click', appFunctions.toggleLogoBBox);
    togglePlacementAreaBtn.addEventListener('click', appFunctions.togglePlacementArea);
    toggleStlBboxBtn.addEventListener('click', appFunctions.toggleLogoStlBbox); // Corrected function call
    toggleLogoStlVisibilityBtn.addEventListener('click', appFunctions.toggleLogoStlVisibility); // Bind new button
    toggleLogoDecalVisibilityBtn.addEventListener('click', appFunctions.toggleLogoDecalVisibility); // Bind new button

    // SVG to STL Controls
    if (appFunctions.initSvgToStl) {
        appFunctions.initSvgToStl(); // Call the SVG-to-STL specific init if it exists
    } else {
        console.warn("[uiHandler] initSvgToStl function not provided by app.");
    }
    // STL Thickness listener (ensure function exists)
    if (stlThicknessInput && appFunctions.adjustStlThickness) {
        stlThicknessInput.addEventListener('input', () => {
            console.log("Listener attached to STL Thickness input.");
            appFunctions.adjustStlThickness();
        });
    } else {
        console.warn("[uiHandler] STL Thickness input or adjustStlThickness function missing.");
    }
    // STL Color listener (TODO: Add logic to update existing STL mesh color)
    stlColorSelect.addEventListener('change', () => {
        console.warn("[uiHandler] STL Color change detected - visual update not yet implemented.");
        // TODO: Call a function in app.js to update the material color of svgToStlGroup children
    });
    // Mirror STL checkbox listener (TODO: Add effect)
    mirrorStlCheckbox.addEventListener('change', () => {
        console.warn("[uiHandler] Mirror STL checkbox changed - effect not yet implemented.");
        // TODO: Call a function in app.js to handle mirroring
    });

    // CSG and Repair Buttons
    cutLogoBtn.addEventListener('click', appFunctions.cutLogoWithModel);
    cutoutLogoBtn.addEventListener('click', appFunctions.cutoutLogoFromModel);
    repairStlBtn.addEventListener('click', appFunctions.repairStl); // Bind repair button

    // Download Button
    downloadModelStlBtn.addEventListener('click', appFunctions.handleDownloadModelStl);

    // Viewer Interaction (Raycasting for Decal Placement)
    viewerContainer.addEventListener('pointerdown', appFunctions.onPointerDown);
    viewerContainer.addEventListener('pointermove', appFunctions.onPointerMove);

    console.log("[uiHandler] Event Listeners Setup Complete.");
}

/**
 * Updates the displayed price based on quantity, currency, and potentially model.
 */
export function updatePrice() {
    const quantity = parseInt(quantityInput.value) || 10;
    const currency = currencySelect.value;
    // Placeholder pricing logic - replace with actual data fetching/calculation
    let unitPrice = 10.00;
    let symbol = '£';
    if (currency === 'USD') { unitPrice = 12.00; symbol = '$'; }
    if (currency === 'EUR') { unitPrice = 11.00; symbol = '€'; }

    const totalPrice = unitPrice * quantity;
    unitPriceSpan.textContent = `${symbol}${unitPrice.toFixed(2)}`;
    totalPriceSpan.textContent = `${symbol}${totalPrice.toFixed(2)}`;
    console.log(`[uiHandler] Updating price display: Unit=${symbol}${unitPrice.toFixed(2)}, Total=${symbol}${totalPrice.toFixed(2)}`);
}

/**
 * Allows the main app module to provide necessary callback functions.
 * @param {object} functions - An object containing function references from app.js.
 */
export function setAppFunctions(functions) {
    appFunctions = functions;
    console.log("[uiHandler] Received app functions.", Object.keys(appFunctions));
}

// --- Helper Functions (Internal) ---

/**
 * Styles a color select dropdown to show the selected color as its background.
 * @param {HTMLSelectElement} selectElement - The select element to style.
 */
function styleColorSelect(selectElement) {
    if (!selectElement) return;
    selectElement.style.backgroundColor = selectElement.value;
    selectElement.style.color = 'transparent'; // Hide the default text/arrow sometimes? Maybe not.
    // Add event listener to update background on change
    selectElement.addEventListener('change', (event) => {
        event.target.style.backgroundColor = event.target.value;
    });
} 
// modules/threeSetup.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// --- Three.js Core Components ---
let scene, camera, renderer, controls, loader, raycaster, mouse;
let svgToStlGroup; // Group for the SVG-to-STL object, managed within scene setup

// --- DOM Element Reference ---
// We need viewerContainer reference for size and attaching renderer
let viewerContainer;

function setupThreeJS(containerElement) {
    viewerContainer = containerElement; // Store container reference

    if (!viewerContainer) {
        console.error("setupThreeJS: viewerContainer element not provided or found!");
        return false; // Indicate failure
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Initialize SVG to STL Group here and add to scene
    svgToStlGroup = new THREE.Group();
    scene.add(svgToStlGroup);

    // Camera
    const aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(0, 1, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
    viewerContainer.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 50;

    // Loader
    loader = new STLLoader();

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Handle Resize listener setup within the module
    window.addEventListener('resize', onWindowResize, false);
    onWindowResize(); // Call once initially to set size

    console.log("Three.js setup complete within module.");
    return true; // Indicate success
}

function onWindowResize() {
    if(!camera || !renderer || !viewerContainer) return;
    camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
}

// Export necessary variables and functions
export {
    scene,
    camera,
    renderer,
    controls,
    loader,
    raycaster,
    mouse,
    svgToStlGroup,
    setupThreeJS,
    onWindowResize
}; 
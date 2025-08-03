/**
 * SimpleBooleanCSG.js - A lightweight CSG implementation for THREE.js
 * 
 * This is a simplified implementation that focuses on intersection operations
 * between meshes. It uses a combination of ray casting and triangle tests
 * to determine which parts of one mesh are inside another.
 */

class SimpleBooleanCSG {
    constructor() {
        console.log("SimpleBooleanCSG initialized for mesh cutting");
        this.OPERATIONS = {
            UNION: 0,
            SUBTRACT: 1,
            INTERSECT: 2
        };
    }

    /**
     * Creates a Brush object which is a wrapper around a THREE.js geometry
     * @param {THREE.BufferGeometry} geometry The geometry to wrap
     * @returns {Object} A Brush object
     */
    createBrush(geometry, position, rotation, scale) {
        // Create a temporary mesh to work with the geometry
        const material = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        // Apply transforms if provided
        if (position) mesh.position.copy(position);
        if (rotation) {
            if (rotation.isQuaternion) {
                mesh.quaternion.copy(rotation);
            } else {
                mesh.rotation.copy(rotation);
            }
        }
        if (scale) mesh.scale.copy(scale);
        
        // Update the world matrix
        mesh.updateMatrixWorld(true);
        
        return {
            geometry: geometry,
            mesh: mesh
        };
    }

    /**
     * Performs an intersection operation between two geometries
     * @param {THREE.Mesh} meshA The first mesh
     * @param {THREE.Mesh} meshB The second mesh
     * @returns {Object} Result containing the new geometry
     */
    intersect(meshA, meshB) {
        console.log(`SimpleBooleanCSG: Performing intersection on mesh with ${meshA.geometry.attributes.position.count} vertices`);
        
        try {
            // Initialize raycaster for inside/outside tests
            const raycaster = new THREE.Raycaster();
            
            // Ensure matrices are updated
            meshA.updateMatrixWorld(true);
            meshB.updateMatrixWorld(true);
            
            // Get vertices and faces from meshA
            const positionAttr = meshA.geometry.attributes.position;
            const normalAttr = meshA.geometry.attributes.normal;
            
            // Arrays to store the output data
            const newPositions = [];
            const newNormals = [];
            const newIndices = [];
            
            // Track triangles that are inside meshB
            const trianglesInside = [];
            
            // Check each triangle in meshA
            for (let i = 0; i < positionAttr.count; i += 3) {
                // Get triangle vertices
                const vA = new THREE.Vector3(
                    positionAttr.getX(i),
                    positionAttr.getY(i),
                    positionAttr.getZ(i)
                );
                const vB = new THREE.Vector3(
                    positionAttr.getX(i+1),
                    positionAttr.getY(i+1),
                    positionAttr.getZ(i+1)
                );
                const vC = new THREE.Vector3(
                    positionAttr.getX(i+2),
                    positionAttr.getY(i+2),
                    positionAttr.getZ(i+2)
                );
                
                // Transform vertices to world space
                vA.applyMatrix4(meshA.matrixWorld);
                vB.applyMatrix4(meshA.matrixWorld);
                vC.applyMatrix4(meshA.matrixWorld);
                
                // Calculate centroid
                const centroid = new THREE.Vector3()
                    .add(vA)
                    .add(vB)
                    .add(vC)
                    .multiplyScalar(1/3);
                
                // Test if centroid is inside meshB
                if (this.isPointInMesh(centroid, meshB)) {
                    trianglesInside.push(i / 3);
                }
            }
            
            // If no triangles are inside, return null
            if (trianglesInside.length === 0) {
                console.log("No triangles inside the mesh");
                return null;
            }
            
            console.log(`Found ${trianglesInside.length} triangles inside the target mesh`);
            
            // Create a new geometry with only the inside triangles
            for (const triIndex of trianglesInside) {
                const baseIndex = triIndex * 3;
                
                // For each vertex in the triangle
                for (let j = 0; j < 3; j++) {
                    const vertexIndex = baseIndex + j;
                    
                    // Copy position
                    newPositions.push(
                        positionAttr.getX(vertexIndex),
                        positionAttr.getY(vertexIndex),
                        positionAttr.getZ(vertexIndex)
                    );
                    
                    // Copy normal if available
                    if (normalAttr) {
                        newNormals.push(
                            normalAttr.getX(vertexIndex),
                            normalAttr.getY(vertexIndex),
                            normalAttr.getZ(vertexIndex)
                        );
                    }
                    
                    // Add index
                    newIndices.push(newPositions.length / 3 - 1);
                }
            }
            
            // Create new geometry
            const resultGeometry = new THREE.BufferGeometry();
            resultGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
            
            if (newNormals.length > 0) {
                resultGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
            } else {
                resultGeometry.computeVertexNormals();
            }
            
            resultGeometry.setIndex(newIndices);
            
            // Apply the original matrix to maintain position
            resultGeometry.applyMatrix4(meshA.matrixWorld);
            
            return {
                geometry: resultGeometry,
                userData: {
                    operation: 'intersect',
                    trianglesInside: trianglesInside.length,
                    totalTriangles: positionAttr.count / 3,
                    percentInside: (trianglesInside.length / (positionAttr.count / 3)) * 100
                }
            };
        } catch (error) {
            console.error("Error during intersection operation:", error);
            return null;
        }
    }
    
    /**
     * Tests if a point is inside a mesh using raycasting
     * @param {THREE.Vector3} point The point to test
     * @param {THREE.Mesh} mesh The mesh to test against
     * @returns {boolean} True if the point is inside the mesh
     */
    isPointInMesh(point, mesh) {
        const directions = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1)
        ];
        
        let insideCount = 0;
        const raycaster = new THREE.Raycaster();
        
        for (const dir of directions) {
            raycaster.set(point, dir);
            const intersects = raycaster.intersectObject(mesh);
            
            // Count intersections (odd number means inside)
            if (intersects.length % 2 === 1) {
                insideCount++;
            }
        }
        
        // Point is inside if majority of rays have odd number of intersections
        return insideCount > 3;
    }
    
    /**
     * Evaluator function that mimics the Evaluator API of three-bvh-csg
     */
    evaluate(brushA, brushB, operation) {
        // For SimpleBooleanCSG, we only support INTERSECT operation
        if (operation !== this.OPERATIONS.INTERSECT) {
            console.warn("Only INTERSECT operation is supported in SimpleBooleanCSG");
            return null;
        }
        
        // Extract meshes from brushes if they have been passed
        let meshA, meshB;
        
        if (brushA.isMesh) {
            meshA = brushA;
        } else if (brushA.mesh) {
            meshA = brushA.mesh;
        } else {
            console.error("Invalid brushA: Not a mesh or brush object");
            return null;
        }
        
        if (brushB.isMesh) {
            meshB = brushB;
        } else if (brushB.mesh) {
            meshB = brushB.mesh;
        } else {
            console.error("Invalid brushB: Not a mesh or brush object");
            return null;
        }
        
        // Perform intersection
        const result = this.intersect(meshA, meshB);
        
        if (!result) return null;
        
        // Create a brush-like object to return
        const resultBrush = {
            geometry: result.geometry,
            userData: result.userData
        };
        
        return resultBrush;
    }
}

// Make globally available
window.SimpleBooleanCSG = SimpleBooleanCSG;
console.log("SimpleBooleanCSG library loaded"); 
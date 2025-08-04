/*
	THREE.CSG
	@author Chandler Prall <chandler.prall@gmail.com> http://chandler.prallfamily.com
	
	Wrapper for Evan Wallace's CSG library (https://github.com/evanw/csg.js/)
	Provides CSG capabilities for Three.js models.
	
	Requires Three.js and Evan Wallace's CSG library.
*/

// Map THREE.js constructors to CSG equivalents
const EPSILON = 1e-5,
		COPLANAR = 0,
		FRONT = 1,
		BACK = 2,
		SPANNING = 3;
	
THREE.Vector3.prototype.clone = function() {
    return new THREE.Vector3(this.x, this.y, this.z);
};

THREE.Vector3.prototype.negate = function() {
    return this.multiplyScalar(-1);
};

THREE.Geometry.prototype.center = function() {
    this.computeBoundingSphere();
    var center = this.boundingSphere.center.clone().negate();
    this.applyMatrix4 = this.applyMatrix4 || this.applyMatrix; // Support both methods
    this.applyMatrix4(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
    return this;
};

// Holds a binary space partition tree representing a 3D solid. Two solids can
// be combined using the `union()`, `subtract()`, and `intersect()` methods.
class ThreeBSP {
    constructor(geometry) {
		// Convert THREE.Geometry to ThreeBSP
        var i, _length_i, face, vertex, faceVertexUvs, uvs, polygon, polygons = [];
        
        if (geometry instanceof THREE.Mesh) {
            this.matrix = new THREE.Matrix4().copy(geometry.matrix);
			geometry = geometry.geometry;
		} else {
            this.matrix = new THREE.Matrix4();
        }
        
        // Convert to geometry if needed
        if (geometry instanceof THREE.BufferGeometry) {
            geometry = new THREE.Geometry().fromBufferGeometry(geometry);
        }
        
        // Prepare faces
        for (i = 0, _length_i = geometry.faces.length; i < _length_i; i++) {
			face = geometry.faces[i];
			faceVertexUvs = geometry.faceVertexUvs[0][i];
            polygon = new Polygon();
            
            if (face instanceof THREE.Face3) {
                vertex = geometry.vertices[face.a];
                uvs = faceVertexUvs ? faceVertexUvs[0] : null;
                polygon.vertices.push(new Vertex(vertex.x, vertex.y, vertex.z, face.vertexNormals[0], uvs));
                
                vertex = geometry.vertices[face.b];
                uvs = faceVertexUvs ? faceVertexUvs[1] : null;
                polygon.vertices.push(new Vertex(vertex.x, vertex.y, vertex.z, face.vertexNormals[1], uvs));
                
                vertex = geometry.vertices[face.c];
                uvs = faceVertexUvs ? faceVertexUvs[2] : null;
                polygon.vertices.push(new Vertex(vertex.x, vertex.y, vertex.z, face.vertexNormals[2], uvs));
			} else {
                throw 'Invalid face type in geometry';
			}
			
			polygon.calculateProperties();
            polygons.push(polygon);
        }
        
        this.tree = new Node(polygons);
    }
    
    subtract(other_tree) {
		var a = this.tree.clone(),
			b = other_tree.tree.clone();
		
		a.invert();
        a.clipTo(b);
        b.clipTo(a);
		b.invert();
        b.clipTo(a);
		b.invert();
        a.build(b.allPolygons());
		a.invert();
        
        var result = new ThreeBSP();
        result.tree = a;
        return result;
    }
    
    union(other_tree) {
		var a = this.tree.clone(),
			b = other_tree.tree.clone();
		
        a.clipTo(b);
        b.clipTo(a);
		b.invert();
        b.clipTo(a);
		b.invert();
        a.build(b.allPolygons());
        
        var result = new ThreeBSP();
        result.tree = a;
        return result;
    }
    
    intersect(other_tree) {
		var a = this.tree.clone(),
			b = other_tree.tree.clone();
		
		a.invert();
        b.clipTo(a);
		b.invert();
        a.clipTo(b);
        b.clipTo(a);
        a.build(b.allPolygons());
		a.invert();
        
        var result = new ThreeBSP();
        result.tree = a;
        return result;
    }
    
    toGeometry() {
        var i, j, matrix = new THREE.Matrix4().copy(this.matrix),
			geometry = new THREE.Geometry(),
			polygons = this.tree.allPolygons(),
			polygon_count = polygons.length,
			polygon, polygon_vertice_count,
			vertice_dict = {},
			vertex_idx_a, vertex_idx_b, vertex_idx_c,
            vertex, face, verticeUvs;
	
        for (i = 0; i < polygon_count; i++) {
			polygon = polygons[i];
			polygon_vertice_count = polygon.vertices.length;
			
            for (j = 2; j < polygon_vertice_count; j++) {
				verticeUvs = [];
				
				vertex = polygon.vertices[0];
                vertex.position.applyMatrix4(matrix);
                var idx_a = addVertex(geometry, vertice_dict, vertex);
                if (vertex.uv) verticeUvs.push(vertex.uv);
				
				vertex = polygon.vertices[j-1];
                vertex.position.applyMatrix4(matrix);
                var idx_b = addVertex(geometry, vertice_dict, vertex);
                if (vertex.uv) verticeUvs.push(vertex.uv);
				
				vertex = polygon.vertices[j];
                vertex.position.applyMatrix4(matrix);
                var idx_c = addVertex(geometry, vertice_dict, vertex);
                if (vertex.uv) verticeUvs.push(vertex.uv);
                
                face = new THREE.Face3(idx_a, idx_b, idx_c);
                geometry.faces.push(face);
                
                if (verticeUvs.length > 0) {
                    geometry.faceVertexUvs[0].push(verticeUvs);
                }
            }
        }
        
        geometry.computeVertexNormals();
        return geometry;
    }
    
    toMesh(material) {
        var geometry = this.toGeometry();
        var mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.setFromMatrixPosition(this.matrix);
        mesh.rotation.setFromRotationMatrix(this.matrix);
		
		return mesh;
    }
}

function addVertex(geometry, vertice_dict, vertex) {
    var key = vertex.x + ',' + vertex.y + ',' + vertex.z;
    if (key in vertice_dict) return vertice_dict[key];
    
    geometry.vertices.push(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
    var id = geometry.vertices.length - 1;
    vertice_dict[key] = id;
    return id;
}

class Polygon {
    constructor(vertices) {
        this.vertices = vertices || [];
        this.plane = null;
    }
    
    clone() {
        var i, n = this.vertices.length, cloned = new Polygon();
        for (i = 0; i < n; i++) {
            cloned.vertices.push(this.vertices[i].clone());
        }
        cloned.calculateProperties();
        return cloned;
    }
    
    calculateProperties() {
		var a = this.vertices[0],
			b = this.vertices[1],
			c = this.vertices[2];
			
        this.plane = Plane.fromPoints(a.position, b.position, c.position);
    }
    
    flip() {
        this.vertices.reverse();
        this.plane.flip();
    }
}

class Vertex {
    constructor(x, y, z, normal, uv) {
        this.position = new THREE.Vector3(x, y, z);
        this.normal = normal || new THREE.Vector3();
        this.uv = uv;
    }
    
    clone() {
        return new Vertex(
            this.position.x, this.position.y, this.position.z,
            this.normal.clone(),
            this.uv
        );
    }
    
    flip() {
        this.normal.negate();
    }
    
    interpolate(other, t) {
        return new Vertex(
            this.position.x + (other.position.x - this.position.x) * t,
            this.position.y + (other.position.y - this.position.y) * t,
            this.position.z + (other.position.z - this.position.z) * t,
            new THREE.Vector3(
                this.normal.x + (other.normal.x - this.normal.x) * t,
                this.normal.y + (other.normal.y - this.normal.y) * t,
                this.normal.z + (other.normal.z - this.normal.z) * t
            ),
            this.uv
        );
    }
}

class Plane {
    constructor(normal, w) {
        this.normal = normal;
        this.w = w;
    }
    
    static fromPoints(a, b, c) {
        var n = new THREE.Vector3()
            .crossVectors(
                new THREE.Vector3().subVectors(b, a),
                new THREE.Vector3().subVectors(c, a)
            )
            .normalize();
            
        return new Plane(n, n.dot(a));
    }
    
    clone() {
        return new Plane(this.normal.clone(), this.w);
    }
    
    flip() {
        this.normal.negate();
        this.w = -this.w;
    }
    
    splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
        var COPLANAR = 0,
            FRONT = 1,
            BACK = 2,
            SPANNING = 3;
            
        // Classify each point as well as the entire polygon into one of the above four classes.
        var polygonType = 0,
            types = [],
            i, t, type, threshold = EPSILON, nV = polygon.vertices.length;
            
        for (i = 0; i < nV; i++) {
            t = this.normal.dot(polygon.vertices[i].position) - this.w;
            type = (t < -threshold) ? BACK : (t > threshold) ? FRONT : COPLANAR;
            polygonType |= type;
            types.push(type);
        }
        
        // Put the polygon in the correct list, splitting it when necessary.
        switch (polygonType) {
            case COPLANAR:
                (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
                break;
            case FRONT:
                front.push(polygon);
                break;
            case BACK:
                back.push(polygon);
                break;
            case SPANNING:
                var f = [], b = [], j, vi, vj, ti, tj, v;
                for (i = 0; i < nV; i++) {
                    j = (i + 1) % nV;
                    vi = polygon.vertices[i];
                    vj = polygon.vertices[j];
                    ti = types[i];
                    tj = types[j];
                    
                    if (ti != BACK) f.push(vi);
                    if (ti != FRONT) b.push(vi);
                    
                    if ((ti | tj) == SPANNING) {
                        t = (this.w - this.normal.dot(vi.position)) / this.normal.dot(new THREE.Vector3().subVectors(vj.position, vi.position));
                        v = vi.interpolate(vj, t);
                        f.push(v);
                        b.push(v);
                    }
                }
                
                if (f.length >= 3) front.push(new Polygon(f));
                if (b.length >= 3) back.push(new Polygon(b));
                break;
        }
    }
}

class Node {
    constructor(polygons) {
        this.plane = null;
        this.front = null;
        this.back = null;
        this.polygons = [];
        
        if (polygons) this.build(polygons);
    }
    
    clone() {
        var node = new Node();
        if (this.plane) node.plane = this.plane.clone();
        if (this.front) node.front = this.front.clone();
        if (this.back) node.back = this.back.clone();
        
        node.polygons = this.polygons.map(function(p) { return p.clone(); });
        return node;
    }
    
    invert() {
        var i, n = this.polygons.length;
        for (i = 0; i < n; i++) {
			this.polygons[i].flip();
		}
		
        if (this.plane) this.plane.flip();
        if (this.front) this.front.invert();
        if (this.back) this.back.invert();
        
        var temp = this.front;
		this.front = this.back;
		this.back = temp;
    }
    
    build(polygons) {
        var i, n = polygons.length, front = [], back = [];
        if (!n) return;
        
        if (!this.plane) this.plane = polygons[0].plane.clone();
        
        for (i = 0; i < n; i++) {
            this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
        }
        
        if (front.length) {
            if (!this.front) this.front = new Node();
            this.front.build(front);
        }
        
        if (back.length) {
            if (!this.back) this.back = new Node();
            this.back.build(back);
        }
    }
    
    allPolygons() {
        var polygons = this.polygons.slice();
        if (this.front) polygons = polygons.concat(this.front.allPolygons());
        if (this.back) polygons = polygons.concat(this.back.allPolygons());
        return polygons;
    }
    
    clipPolygons(polygons) {
        if (!this.plane) return polygons.slice();
        
        var i, n = polygons.length, front = [], back = [];
        for (i = 0; i < n; i++) {
            this.plane.splitPolygon(polygons[i], front, back, front, back);
        }
        
        if (this.front) front = this.front.clipPolygons(front);
        if (this.back) back = this.back.clipPolygons(back);
		else back = [];

        return front.concat(back);
    }
    
    clipTo(node) {
        this.polygons = node.clipPolygons(this.polygons);
        if (this.front) this.front.clipTo(node);
        if (this.back) this.back.clipTo(node);
    }
}

// Make classes globally available
// window.ThreeBSP = ThreeBSP;
// window.Polygon = Polygon;
// window.Vertex = Vertex;
// window.Plane = Plane;
// window.Node = Node;
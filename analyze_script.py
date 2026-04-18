import sys
import json
import traceback
import trimesh


def analyze_mesh(input_file: str):
    try:
        mesh = trimesh.load_mesh(input_file, force='mesh')
        result = {
            "watertight": bool(getattr(mesh, 'is_watertight', False)),
            "faces": int(len(mesh.faces)) if hasattr(mesh, 'faces') else 0,
            "vertices": int(len(mesh.vertices)) if hasattr(mesh, 'vertices') else 0,
            "volume": float(getattr(mesh, 'volume', 0.0)) if hasattr(mesh, 'volume') else 0.0,
            "bodies": []
        }

        try:
            bodies = mesh.split()
        except Exception:
            bodies = [mesh]

        for b in bodies:
            try:
                body_info = {
                    "faces": int(len(b.faces)) if hasattr(b, 'faces') else 0,
                    "vertices": int(len(b.vertices)) if hasattr(b, 'vertices') else 0,
                    "watertight": bool(getattr(b, 'is_watertight', False)),
                    "volume": float(getattr(b, 'volume', 0.0)) if hasattr(b, 'volume') else 0.0,
                }
                result["bodies"].append(body_info)
            except Exception:
                # best-effort, skip problematic body
                continue

        result["totalBodies"] = len(result["bodies"])
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: analyze_script.py <input_stl>"}))
        sys.exit(1)
    sys.exit(analyze_mesh(sys.argv[1]))



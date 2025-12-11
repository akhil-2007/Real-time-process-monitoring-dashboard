from flask import Flask, jsonify
import psutil
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)


@app.route("/stats")
def system_stats():
    # CPU and memory overall
    cpu = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()

    processes = []
    # Collect useful fields including create_time and username
    for p in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_percent', 'create_time', 'username']):
        try:
            info = p.info
            # ensure keys exist (psutil may return None for some)
            # keep create_time as float (seconds since epoch)
            processes.append({
                "pid": info.get("pid"),
                "name": info.get("name") or "",
                "status": (info.get("status") or "").lower(),
                "cpu_percent": info.get("cpu_percent") or 0.0,
                "memory_percent": info.get("memory_percent") or 0.0,
                "create_time": info.get("create_time") or None,
                "username": info.get("username") or ""
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            # skip processes we can't inspect
            continue
        except Exception:
            continue

    # Sort processes by cpu descending by default (makes UI nicer)
    try:
        processes.sort(key=lambda x: x.get("cpu_percent", 0), reverse=True)
    except Exception:
        pass

    return jsonify({
        "cpu_usage": round(cpu, 2),
        "memory_usage": round((mem.used / mem.total) * 100, 2),
        "memory_used": mem.used,
        "memory_total": mem.total,
        "processes": processes,
        "timestamp": time.time()
    })


@app.route("/kill/<int:pid>", methods=["POST"])
def kill_process(pid):
    try:
        p = psutil.Process(pid)
        p.kill()
        return jsonify({"status": "terminated", "pid": pid})
    except psutil.NoSuchProcess:
        return jsonify({"error": "Process not found"}), 404
    except psutil.AccessDenied:
        return jsonify({"error": "Access denied"}), 403
    except Exception as e:
        return jsonify({"error": "Failed to terminate", "detail": str(e)}), 500


if __name__ == "__main__":
    # Production hosts use gunicorn; this is for local/dev
    app.run(host="0.0.0.0", port=5000)

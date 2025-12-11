from flask import Flask, jsonify
import psutil
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow HTML dashboard to connect

@app.route("/stats")
def system_stats():
    cpu = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory().percent
    processes = []

    for p in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_percent']):
        try:
            processes.append(p.info)
        except:
            pass

    return jsonify({
        "cpu_usage": cpu,
        "memory_usage": memory,
        "processes": processes
    })

@app.route("/kill/<int:pid>", methods=["POST"])
def kill_process(pid):
    try:
        psutil.Process(pid).kill()
        return jsonify({"status": "terminated", "pid": pid})
    except psutil.NoSuchProcess:
        return jsonify({"error": "Process not found"}), 404
    except:
        return jsonify({"error": "Failed to terminate"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

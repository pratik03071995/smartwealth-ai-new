from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "message": "Test server is running"})

@app.route('/')
def home():
    return jsonify({"message": "Hello from test server"})

if __name__ == "__main__":
    print("Starting test Flask server...")
    app.run(host="0.0.0.0", port=5001, debug=True)



#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import datetime
import random
from urllib.parse import urlparse

HOST = '0.0.0.0'
PORT = 8000

class MockHandler(BaseHTTPRequestHandler):
    def _set_headers(self, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

    def log_message(self, format, *args):
        # reduce noisy logs
        print("[mock]", format % args)

    def do_GET(self):
        p = urlparse(self.path)
        if p.path == '/health':
            self._set_headers(200)
            resp = {
                'status': 'ok',
                'model': 'mock-kronos',
                'device': 'cpu'
            }
            self.wfile.write(json.dumps(resp).encode())
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({'error': 'not found'}).encode())

    def do_POST(self):
        p = urlparse(self.path)
        if p.path != '/forecast':
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'not found'}).encode())
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode() if length else ''

        try:
            payload = json.loads(body) if body else {}
        except Exception as e:
            self._set_headers(400)
            self.wfile.write(json.dumps({'success': False, 'detail': 'invalid json'}).encode())
            return

        history = payload.get('history', []) if isinstance(payload.get('history', []), list) else []
        pred_len = int(payload.get('pred_len', 12) or 12)

        # Determine cadence from history timestamps if possible
        def parse_iso(s):
            try:
                if s.endswith('Z'):
                    s = s[:-1] + '+00:00'
                return datetime.datetime.fromisoformat(s)
            except Exception:
                return None

        last_ts = None
        delta = None
        if len(history) >= 1:
            last_ts = parse_iso(history[-1].get('timestamp', ''))
        if len(history) >= 2:
            t1 = parse_iso(history[-2].get('timestamp', ''))
            t2 = parse_iso(history[-1].get('timestamp', ''))
            if t1 and t2:
                delta = t2 - t1

        if last_ts is None:
            last_ts = datetime.datetime.utcnow()
        if delta is None or delta.total_seconds() <= 0:
            # default to daily cadence for simplicity
            delta = datetime.timedelta(days=1)

        last_close = None
        if history and isinstance(history[-1], dict):
            try:
                last_close = float(history[-1].get('close', 100.0))
            except Exception:
                last_close = 100.0
        if last_close is None:
            last_close = 100.0

        forecast = []
        for i in range(pred_len):
            ts = (last_ts + delta * (i + 1)).replace(tzinfo=datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
            # small random walk
            change = (random.random() - 0.5) * 0.02 * last_close
            price = round(max(0.01, last_close + change), 4)
            o = round(price * (1 - 0.001), 4)
            h = round(price * (1 + 0.0015), 4)
            l = round(price * (1 - 0.002), 4)
            forecast.append({
                'timestamp': ts,
                'open': o,
                'high': h,
                'low': l,
                'close': price,
                'volume': int(1000 + random.random() * 1000),
                'amount': round(price * 1000, 2),
            })

        resp = {
            'success': True,
            'model': 'mock-kronos-v1',
            'device': 'cpu',
            'input_length': len(history),
            'pred_len': pred_len,
            'forecast': forecast,
        }

        self._set_headers(200)
        self.wfile.write(json.dumps(resp).encode())


if __name__ == '__main__':
    print(f"Starting mock Kronos service on http://{HOST}:{PORT}")
    server = HTTPServer((HOST, PORT), MockHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Shutting down mock service')
        server.server_close()

const http = require('http');

const HOST = '0.0.0.0';
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve(null);
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function makeForecast(history, pred_len) {
  const forecast = [];
  const last = history && history.length ? history[history.length - 1] : null;
  let lastTs = last && last.timestamp ? new Date(last.timestamp) : new Date();
  let lastClose = last && typeof last.close === 'number' ? last.close : 100.0;
  const deltaMs = history && history.length >= 2 ? (new Date(history[history.length-1].timestamp) - new Date(history[history.length-2].timestamp)) : 24*3600*1000;
  for (let i=0;i<pred_len;i++){
    lastTs = new Date(lastTs.getTime() + deltaMs);
    const change = (Math.random()-0.5)*0.02*lastClose;
    const price = Math.max(0.01, +(lastClose + change).toFixed(4));
    const o = +(price*(1-0.001)).toFixed(4);
    const h = +(price*(1+0.0015)).toFixed(4);
    const l = +(price*(1-0.002)).toFixed(4);
    forecast.push({
      timestamp: lastTs.toISOString().replace(/\.000Z$/, 'Z'),
      open: o, high: h, low: l, close: price,
      volume: Math.floor(1000 + Math.random()*1000),
      amount: +(price*1000).toFixed(2)
    });
    lastClose = price;
  }
  return forecast;
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({status:'ok', model:'node-mock-kronos', device:'cpu'}));
    return;
  }

  if (method === 'POST' && url === '/forecast') {
    try {
      const body = await parseJson(req) || {};
      const history = Array.isArray(body.history) ? body.history : [];
      const pred_len = Number(body.pred_len) || 12;
      const forecast = makeForecast(history, pred_len);
      const resp = { success:true, model:'node-mock-v1', device:'cpu', input_length: history.length, pred_len, forecast };
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(resp));
    } catch (err) {
      res.writeHead(400, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ success:false, detail: 'invalid json' }));
    }
    return;
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`Node mock Kronos service listening at http://${HOST}:${PORT}`);
});

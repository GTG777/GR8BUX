Run the mock Kronos service and test AIRA
======================================

This guide shows how to start the lightweight mock Kronos service and test the AIRA page locally.

Prerequisites
-------------
- Python 3.8+ on PATH (for the mock service)
- Node.js + npm (for the Next.js app)

Start mock service
------------------
From the repository root:

```powershell
cd C:\Users\Claw\Gr8bux
python python-kronos-service\mock_service.py
# or if your system uses the py launcher
py -3 python-kronos-service\mock_service.py
```

Verify:

```powershell
curl.exe http://localhost:8000/health
# expected: {"status":"ok","model":"mock-kronos","device":"cpu"}
```

Start Next.js app
-----------------
In another terminal:

```powershell
cd C:\Users\Claw\Gr8bux
npm run dev
```

Open the page
-------------
Visit: http://localhost:3000/aira

Test flow
---------
1. Enter `AAPL` in the Ticker field
2. Choose `Daily (D)` or an intraday option
3. Click `Load history` (this will populate the JSON textarea)
4. Click `Run AIRA Forecast` — the page will call `/api/forecast/kronos` which proxies to the mock service

Example forecast response (mock):

```json
{
  "success": true,
  "model": "mock-kronos-v1",
  "device": "cpu",
  "input_length": 16,
  "pred_len": 5,
  "forecast": [
    {"timestamp":"2026-05-22T09:30:00Z","open":99.5,"high":100.2,"low":98.9,"close":99.8,"volume":1500,"amount":99800},
    ...
  ]
}
```

If you want me to run these commands for you, grant me permission to run Python and Node here, or paste the output you see after running the helper script and I will finish validating the UI.

# Kronos Forecast Service

This service exposes a lightweight FastAPI wrapper for the Kronos Python model.

## Setup

1. Create a Python 3.10+ virtual environment in `kronos/`.
2. Install Python dependencies:

```bash
cd c:\Users\Claw\Gr8bux\kronos
pip install -r requirements.txt
pip install -r requirements-service.txt
```

3. Start the service:

```bash
cd c:\Users\Claw\Gr8bux\kronos
python service.py
```

By default the service listens on `http://0.0.0.0:8000`.

## API

- `GET /health` — service health check
- `POST /forecast` — run a Kronos forecast

### POST /forecast payload

```json
{
  "history": [
    {"timestamp":"2026-05-20T09:30:00Z","open":195.4,"high":196.8,"low":194.9,"close":196.2,"volume":1250000},
    ...
  ],
  "pred_len": 12,
  "T": 1.0,
  "top_p": 0.9,
  "sample_count": 1
}
```

## Next.js integration

The Next.js API route at `src/pages/api/forecast/kronos.ts` forwards requests to the Python service. Set `KRONOS_API_URL` in your environment if the service runs on a non-default host.

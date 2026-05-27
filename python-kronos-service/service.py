import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import List, Optional

import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).resolve().parent.parent
KRONOS_REPO_DIR = ROOT_DIR / 'kronos'
if str(KRONOS_REPO_DIR) not in sys.path:
    sys.path.insert(0, str(KRONOS_REPO_DIR))

from model import Kronos, KronosPredictor, KronosTokenizer

DEFAULT_TOKENIZER_ID = os.getenv('KRONOS_TOKENIZER', 'NeoQuasar/Kronos-Tokenizer-base')
DEFAULT_MODEL_ID = os.getenv('KRONOS_MODEL', 'NeoQuasar/Kronos-small')
DEFAULT_DEVICE = os.getenv('KRONOS_DEVICE')
if DEFAULT_DEVICE is None:
    if torch.cuda.is_available():
        DEFAULT_DEVICE = 'cuda:0'
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        DEFAULT_DEVICE = 'mps'
    else:
        DEFAULT_DEVICE = 'cpu'

app = FastAPI(title='Kronos Forecast Service')

_tokenizer: Optional[KronosTokenizer] = None
_model: Optional[Kronos] = None
_predictor: Optional[KronosPredictor] = None


def load_predictor() -> KronosPredictor:
    global _tokenizer, _model, _predictor
    if _predictor is not None:
        return _predictor

    _tokenizer = KronosTokenizer.from_pretrained(DEFAULT_TOKENIZER_ID)
    _model = Kronos.from_pretrained(DEFAULT_MODEL_ID)
    _predictor = KronosPredictor(_model, _tokenizer, device=DEFAULT_DEVICE, max_context=512)
    return _predictor


class KronosHistoryRow(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = 0.0
    amount: Optional[float] = None


class ForecastRequest(BaseModel):
    history: List[KronosHistoryRow]
    pred_len: int = Field(20, ge=1, le=120)
    T: float = Field(1.0, ge=0.0, le=2.0)
    top_p: float = Field(0.9, ge=0.0, le=1.0)
    top_k: int = Field(0, ge=0, le=50)
    sample_count: int = Field(1, ge=1, le=5)
    future_timestamps: Optional[List[str]] = None


class ForecastPoint(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float


class ForecastResponse(BaseModel):
    success: bool
    model: str
    device: str
    input_length: int
    pred_len: int
    forecast: List[ForecastPoint]


def parse_timestamps(rows: List[KronosHistoryRow]) -> pd.DatetimeIndex:
    return pd.to_datetime([row.timestamp for row in rows], utc=True)


def build_future_timestamps(
    history_timestamps: pd.DatetimeIndex,
    pred_len: int,
    future_timestamps: Optional[List[str]] = None,
) -> pd.DatetimeIndex:
    if future_timestamps:
        timestamps = pd.to_datetime(future_timestamps, utc=True)
        if len(timestamps) != pred_len:
            raise ValueError('future_timestamps length must equal pred_len')
        return timestamps

    if len(history_timestamps) < 2:
        raise ValueError('At least two historical timestamps are required to infer a prediction cadence.')

    delta = history_timestamps[-1] - history_timestamps[-2]
    if delta <= timedelta(0):
        raise ValueError('Historical timestamps must be strictly increasing.')

    return pd.DatetimeIndex([
        history_timestamps[-1] + delta * (i + 1)
        for i in range(pred_len)
    ])


@app.get('/health')
async def health() -> dict:
    return {'status': 'ok', 'model': DEFAULT_MODEL_ID, 'device': DEFAULT_DEVICE}


@app.post('/forecast', response_model=ForecastResponse)
async def forecast(request: ForecastRequest) -> ForecastResponse:
    if len(request.history) < 16:
        raise HTTPException(status_code=400, detail='history must contain at least 16 candles')

    try:
        history_index = parse_timestamps(request.history)
        future_index = build_future_timestamps(history_index, request.pred_len, request.future_timestamps)

        df = pd.DataFrame([
            {
                'open': row.open,
                'high': row.high,
                'low': row.low,
                'close': row.close,
                'volume': row.volume or 0.0,
                'amount': row.amount if row.amount is not None else None,
            }
            for row in request.history
        ], index=history_index)

        predictor = load_predictor()
        preds = predictor.predict(
            df=df,
            x_timestamp=pd.Series(history_index),
            y_timestamp=pd.Series(future_index),
            pred_len=request.pred_len,
            T=request.T,
            top_k=request.top_k,
            top_p=request.top_p,
            sample_count=request.sample_count,
            verbose=False,
        )

        forecast = [
            ForecastPoint(
                timestamp=ts.isoformat(),
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=float(row.volume),
                amount=float(row.amount),
            )
            for ts, row in preds.reset_index().iterrows()
        ]

        return ForecastResponse(
            success=True,
            model=DEFAULT_MODEL_ID,
            device=DEFAULT_DEVICE,
            input_length=len(request.history),
            pred_len=request.pred_len,
            forecast=forecast,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Forecast error: {exc}')


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('service:app', host='0.0.0.0', port=int(os.getenv('KRONOS_PORT', '8000')), reload=False)

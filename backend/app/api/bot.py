from fastapi import APIRouter
from pydantic import BaseModel
import ccxt

router = APIRouter()

# In-memory dictionary to store bot states and historical memory buffers
# Format: { user_id: { symbol: { config, memory_buffer: [] } } }
active_bots = {}

class ToggleBotRequest(BaseModel):
    user_id: str
    symbol: str
    is_active: bool
    risk_amount: float
    sl_percent: float
    tp_percent: float

@router.post("/toggle")
async def toggle_bot(req: ToggleBotRequest):
    if req.user_id not in active_bots:
        active_bots[req.user_id] = {}
    
    # Initialize an empty memory buffer
    memory_buffer = []
    
    # 🚀 WARM-UP FETCH: If turning ON, grab 1,000 historical candles instantly for the AI
    if req.is_active:
        try:
            exchange = ccxt.binance()
            # Fetch 1m candles to match the live stream
            klines = exchange.fetch_ohlcv(req.symbol.replace('/', ''), timeframe='1m', limit=1000)
            
            # Store just the closing prices in the buffer for the Quant Engine
            memory_buffer = [kline[4] for kline in klines]
            print(f"✅ Downloaded {len(memory_buffer)} historical candles for {req.symbol} AI warmup.")
        except Exception as e:
            print(f"⚠️ Failed to fetch historical warmup data: {e}")
    
    active_bots[req.user_id][req.symbol] = {
        "is_active": req.is_active,
        "risk_amount": req.risk_amount,
        "sl_percent": req.sl_percent,
        "tp_percent": req.tp_percent,
        "memory_buffer": memory_buffer
    }
    
    status = "ON" if req.is_active else "OFF"
    print(f"🤖 Bot Engine for {req.user_id} on {req.symbol} is now {status}")
    return {"status": "success", "state": status}
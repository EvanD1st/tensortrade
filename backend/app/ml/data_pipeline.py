import pandas as pd
from collections import deque
from typing import Dict

class DataPipeline:
    def __init__(self, max_length: int = 1000):
        # We will keep the last 'max_length' candles for our sliding window
        self.max_length = max_length
        
        # Dictionary to store a deque for each symbol_interval combination
        self.buffers: Dict[str, deque] = {}

    def add_candle(self, symbol: str, interval: str, candle_data: dict):
        """Adds a closed candle to the rolling window buffer."""
        # FIX: Force symbol to lowercase to prevent mismatched buffers!
        key = f"{symbol.lower()}_{interval}"
        
        if key not in self.buffers:
            self.buffers[key] = deque(maxlen=self.max_length)
        
        # Extract relevant OHLCV data
        processed_candle = {
            "timestamp": candle_data["t"],
            "open": float(candle_data["o"]),
            "high": float(candle_data["h"]),
            "low": float(candle_data["l"]),
            "close": float(candle_data["c"]),
            "volume": float(candle_data["v"])
        }
        self.buffers[key].append(processed_candle)
        
    def get_dataframe(self, symbol: str, interval: str) -> pd.DataFrame:
        """Returns the current buffer as a Pandas DataFrame for ML inference."""
        # FIX: Force symbol to lowercase here as well!
        key = f"{symbol.lower()}_{interval}"
        
        if key not in self.buffers or len(self.buffers[key]) == 0:
            return pd.DataFrame() # Return empty df if no data yet
        
        # Convert deque to DataFrame and format timestamp
        df = pd.DataFrame(list(self.buffers[key]))
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        # --- NEW: Calculate 200-EMA for Macro-Trend Anti-Spam Filter ---
        if len(df) >= 200:
            df['EMA_200'] = df['close'].ewm(span=200, adjust=False).mean()
        else:
            df['EMA_200'] = None # Not enough data yet
            
        return df
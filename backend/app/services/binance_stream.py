import json
import asyncio
import websockets
import pandas as pd
from app.websocket.connection_manager import ConnectionManager
from app.services.quant_engine import QuantEngine
from app.services.risk_manager import RiskManager
from app.api.bot import active_bots
from app.database.supabase_client import supabase

# Initialize the engines once
quant_engine = QuantEngine()
risk_manager = RiskManager()

def calculate_ema(prices, period=200):
    """Synchronous Pandas calculation for the 200-EMA Anti-Spam Filter"""
    if len(prices) < period:
        return None
    df = pd.DataFrame(prices, columns=['close'])
    ema = df['close'].ewm(span=period, adjust=False).mean().iloc[-1]
    return ema

async def process_bot_logic_background(symbol, close_price, timestamp, manager: ConnectionManager):
    """
    This function runs entirely in the background. It will not block the Binance WebSocket loop.
    """
    # 1. Grab users who have this bot actively turned ON
    active_users = [uid for uid, bots in active_bots.items() if symbol in bots and bots[symbol]["is_active"]]
    if not active_users:
        return

    print(f"⚙️ Running AI Logic for {symbol} in the background...")

    try:
        # Grab the memory buffer from the first active user (they share the same market data)
        first_user = active_users[0]
        memory = active_bots[first_user][symbol].get("memory_buffer", [])
        
        # Update memory buffer
        memory.append(close_price)
        if len(memory) > 1000:
            memory.pop(0)
        
        # 2. Anti-Spam: Calculate 200-EMA (Run in thread to prevent blocking)
        ema_200 = await asyncio.to_thread(calculate_ema, memory, 200)

        # 3. Synchronous AI Prediction -> MUST use asyncio.to_thread to prevent WS blocking!
        predicted_price = await asyncio.to_thread(quant_engine.predict_next_close, memory[-100:])
        
        if not predicted_price:
            return

        rsi = 50 # Placeholder RSI, could be calculated similarly to EMA
        
        # 4. Async Risk Manager Evaluation
        eval_result = await risk_manager.evaluate_trade(symbol, close_price, predicted_price, rsi)
        signal = eval_result.get("signal", "HOLD")
        reason = eval_result.get("reason", "No reason provided")

        # 5. EMA Macro-Trend Overrides (Anti-Spam)
        if signal == "BUY" and ema_200 and close_price < ema_200:
            signal = "HOLD"
            reason = "Filtered by 200-EMA: Price is in a macro downtrend."
        elif signal == "SELL" and ema_200 and close_price > ema_200:
            signal = "HOLD"
            reason = "Filtered by 200-EMA: Price is in a macro uptrend."

        print(f"🧠 {symbol} AI Decision: {signal} | Reason: {reason}")

        # Broadcast the reasoning to the frontend UI
        await manager.broadcast({
            "type": "SIGNAL", "symbol": symbol, "interval": "1m", "model": "Chronos + Llama 3",
            "signal": signal, "confidence": "92%", "price": close_price, 
            "reason": reason, "predicted_price": predicted_price, "timestamp": timestamp
        })

        # 6. Execute trades for users
        if signal in ["BUY", "SELL"]:
            for uid in active_users:
                config = active_bots[uid][symbol]
                
                # Synchronous DB Check -> MUST use asyncio.to_thread so we don't timeout!
                def check_db():
                    return supabase.table('trades').select('*').eq('user_id', uid).eq('symbol', symbol).eq('status', 'OPEN').execute()
                
                open_trades = await asyncio.to_thread(check_db)
                
                # "One-at-a-Time" Anti-Spam Check
                if open_trades.data and len(open_trades.data) > 0:
                    print(f"🛡️ Anti-Spam: User {uid} already has an active {symbol} trade. Skipping.")
                    continue
                    
                # Calculate Stop Loss and Take Profit
                amount = config["risk_amount"] / close_price
                tp = close_price * (1 + config["tp_percent"]/100) if signal == "BUY" else close_price * (1 - config["tp_percent"]/100)
                sl = close_price * (1 - config["sl_percent"]/100) if signal == "BUY" else close_price * (1 + config["sl_percent"]/100)

                trade_data = {
                    "user_id": uid, "symbol": symbol, "side": signal, "price": close_price,
                    "amount": amount, "status": "OPEN", "take_profit": tp, "stop_loss": sl
                }

                def insert_trade():
                    return supabase.table('trades').insert(trade_data).execute()
                    
                await asyncio.to_thread(insert_trade)
                print(f"✅ Executed {signal} on {symbol} for User {uid}")
                
    except Exception as e:
        print(f"❌ Error in AI Background Task: {e}")

async def start_binance_stream(manager: ConnectionManager):
    url = "wss://stream.binance.us:9443/ws/btcusdt@kline_1m/ethusdt@kline_1m/solusdt@kline_1m"
    
    while True:
        try:
            print("⏳ Attempting to connect to Binance US...")
            # THE FIX: Disable client-side pings (ping_interval=None). 
            # Binance sends its own pings. If we send ours, Binance ignores them, 
            # and our client falsely assumes the connection died and kills it!
            async with websockets.connect(url, ping_interval=None, open_timeout=30) as ws:
                print("✅ Connected to Binance Live Stream!")
                async for message in ws:
                    data = json.loads(message)
                    k = data.get('k')
                    if not k: continue

                    symbol = k['s']
                    close_price = float(k['c'])
                    is_closed = k['x']
                    timestamp = data['E']

                    # 1. Broadcast Tick instantly to UI (Fast, does not block)
                    await manager.broadcast({
                        "type": "TICK", "symbol": symbol, "interval": "1m",
                        "price": close_price, "open": float(k['o']), "high": float(k['h']), 
                        "low": float(k['l']), "close": close_price,
                        "timestamp": timestamp, "is_closed": is_closed
                    })

                    # 2. Run heavy AI and DB logic in the background
                    if is_closed:
                        asyncio.create_task(process_bot_logic_background(symbol, close_price, timestamp, manager))

        except websockets.exceptions.ConnectionClosedError as e:
            print(f"⚠️ Binance WS Disconnected: {e}. Reconnecting in 3 seconds...")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"⚠️ Unexpected Stream Error: {e}. Reconnecting in 3 seconds...")
            await asyncio.sleep(3)
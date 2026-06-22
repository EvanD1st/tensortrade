import os
from dotenv import load_dotenv
from app.database.supabase_client import supabase

load_dotenv()

class ExecutionEngine:
    def __init__(self):
        print("⚙️ Paper Trading Engine Online. Active SL/TP Monitoring.")

    def execute_order(self, user_id: str, symbol: str, side: str, current_price: float, risk_usdt: float = 125.0, sl_percent: float = 2.0, tp_percent: float = 4.0):
        """
        Opens a VIRTUAL MARKET order with strict SL and TP levels.
        Now supports Multi-Tenant User IDs and custom parameters from the UI!
        """
        try:
            formatted_symbol = symbol.upper().replace("USDT", "/USDT") if '/' not in symbol else symbol.upper()
            
            # 🚀 Apply 100x Leverage to match UI exactly
            leverage = 100
            amount = (risk_usdt * leverage) / current_price
            
            # Dynamic Stop Loss and Take Profit based on UI inputs
            if side.upper() == 'BUY':
                take_profit = current_price * (1 + tp_percent / 100)
                stop_loss = current_price * (1 - sl_percent / 100)
            else:
                take_profit = current_price * (1 - tp_percent / 100)
                stop_loss = current_price * (1 + sl_percent / 100)
                
            print(f"🚀 [PAPER TRADE] OPENING {side} {amount:.4f} {formatted_symbol} @ ${current_price}")
            print(f"🎯 TP: ${take_profit:.2f} | 🛡️ SL: ${stop_loss:.2f}")
            
            trade_data = {
                "user_id": user_id,
                "symbol": formatted_symbol,
                "side": side.upper(),
                "price": current_price,
                "amount": amount,
                "status": "OPEN",
                "take_profit": take_profit,
                "stop_loss": stop_loss
            }
            
            supabase.table("trades").insert(trade_data).execute()
            print(f"✅ VIRTUAL POSITION OPENED! Waiting for market to hit SL/TP.")
            
            return {"id": "PAPER-TRADE-OPEN", "status": "open"}
            
        except Exception as e:
            print(f"⚠️ Virtual Execution Engine Failed: {e}")
            return None

    def monitor_open_positions(self, symbol: str, live_price: float):
        """
        Called continuously on every live tick to check if an open trade hits SL or TP.
        """
        try:
            formatted_symbol = symbol.upper().replace("USDT", "/USDT") if '/' not in symbol else symbol.upper()
            
            # Fetch all OPEN trades for this specific asset
            res = supabase.table("trades").select("*").eq("status", "OPEN").eq("symbol", formatted_symbol).execute()
            
            for trade in res.data:
                side = trade['side']
                tp = float(trade['take_profit'])
                sl = float(trade['stop_loss'])
                entry_price = float(trade['price'])
                amount = float(trade['amount'])
                trade_id = trade['id']
                user_id = trade['user_id']
                
                close_trade = False
                reason = ""
                
                # Logic for Longs
                if side == 'BUY':
                    if live_price >= tp:
                        close_trade, reason = True, "TAKE_PROFIT"
                    elif live_price <= sl:
                        close_trade, reason = True, "STOP_LOSS"
                
                # Logic for Shorts
                elif side == 'SELL':
                    if live_price <= tp:
                        close_trade, reason = True, "TAKE_PROFIT"
                    elif live_price >= sl:
                        close_trade, reason = True, "STOP_LOSS"
                        
                if close_trade:
                    print(f"🔔 {reason} TRIGGERED for {formatted_symbol}! Closing @ ${live_price}")
                    
                    # Calculate Realized PnL (Profit/Loss)
                    if side == 'BUY':
                        pnl = (live_price - entry_price) * amount
                    else:
                        pnl = (entry_price - live_price) * amount
                        
                    # 1. Close trade in the database
                    supabase.table("trades").update({
                        "status": "CLOSED",
                        "close_price": live_price,
                        "realized_pnl": pnl
                    }).eq("id", trade_id).execute()
                    
                    # 2. Add PnL to User's Virtual Balance
                    user_data = supabase.table("user_settings").select("virtual_usdt_balance").eq("id", user_id).single().execute()
                    if user_data.data:
                        current_balance = float(user_data.data['virtual_usdt_balance'])
                        new_balance = current_balance + pnl
                        
                        supabase.table("user_settings").update({
                            "virtual_usdt_balance": new_balance
                        }).eq("id", user_id).execute()
                        
                        print(f"💰 POSITION CLOSED. Realized PnL: ${pnl:.2f} | New Balance: ${new_balance:.2f}")

        except Exception:
            # Catch silently so we don't spam the tick loop if the database stutters
            pass
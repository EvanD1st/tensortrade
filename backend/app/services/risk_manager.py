import os
from groq import Groq
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class RiskManager:
    def __init__(self):
        # Tier 1 & 2: Groq Clients (Fastest, but strict on VPNs)
        self.groq_primary = Groq(api_key=os.getenv("GROQ_PRIMARY_KEY"))
        self.groq_backup = Groq(api_key=os.getenv("GROQ_BACKUP_KEY"))
        self.groq_model = "llama-3.1-8b-instant"

        # Tier 3 & 4: OpenRouter Clients (VPN-friendly fallback)
        self.or_primary = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_PRIMARY_KEY"),
        )
        self.or_backup = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_BACKUP_KEY"),
        )
        # UPDATE: Switched to Zephyr 7B Beta (Hosted by HuggingFace, extremely high uptime)
        self.or_model = "huggingfaceh4/zephyr-7b-beta:free"

    async def evaluate_trade(self, symbol, current_price, predicted_price, rsi):
        prompt = f"""
        You are an expert prop-firm risk manager.
        Asset: {symbol}
        Current Price: ${current_price}
        Quant Engine Prediction: ${predicted_price}
        Current RSI: {rsi}
        
        Rules:
        - Strict max daily loss limits are in place.
        - Do not buy if RSI is > 70 (Overbought).
        - Do not sell if RSI is < 30 (Oversold).
        
        Based strictly on the quant prediction and RSI risk, respond with ONLY one word: BUY, SELL, or HOLD.
        Then, on a new line, provide a one-sentence reason.
        """

        # Tier 1: Groq Primary
        try:
            response = self.groq_primary.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.groq_model,
                temperature=0.1,
            )
            print("[Risk Manager] Evaluated using GROQ PRIMARY.")
            return self._parse_response(response.choices[0].message.content)

        except Exception as e1:
            print(f"[Risk Manager] Groq Primary failed: {e1}. Rerouting to GROQ BACKUP...")
            
            # Tier 2: Groq Backup
            try:
                response = self.groq_backup.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=self.groq_model,
                    temperature=0.1,
                )
                print("[Risk Manager] Evaluated using GROQ BACKUP.")
                return self._parse_response(response.choices[0].message.content)
            
            except Exception as e2:
                print(f"[Risk Manager] Groq Backup failed: {e2}. Rerouting to OPENROUTER PRIMARY...")
                
                # Tier 3: OpenRouter Primary
                try:
                    response = self.or_primary.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=self.or_model,
                        temperature=0.1,
                    )
                    print("[Risk Manager] Evaluated using OPENROUTER PRIMARY (VPN bypassed).")
                    return self._parse_response(response.choices[0].message.content)
                    
                except Exception as e3:
                    print(f"[Risk Manager] OpenRouter Primary failed: {e3}. Rerouting to OPENROUTER BACKUP...")
                    
                    # Tier 4: OpenRouter Backup
                    try:
                        response = self.or_backup.chat.completions.create(
                            messages=[{"role": "user", "content": prompt}],
                            model=self.or_model,
                            temperature=0.1,
                        )
                        print("[Risk Manager] Evaluated using OPENROUTER BACKUP (VPN bypassed).")
                        return self._parse_response(response.choices[0].message.content)
                        
                    except Exception as e4:
                        print(f"[Risk Manager] CRITICAL: All 4 API tiers failed! {e4}")
                        return {"signal": "HOLD", "reason": "Total API execution failure. Safety hold."}

    def _parse_response(self, content):
        # 1. Clean up the AI's response by splitting lines and completely removing blank lines
        lines = [line.strip() for line in content.strip().split('\n') if line.strip()]
        
        if not lines:
            return {"signal": "HOLD", "reason": "AI returned an empty response."}
            
        # 2. Safely extract the signal and strip any markdown asterisks (e.g., **BUY**)
        signal_raw = lines[0].upper().replace('*', '')
        if 'BUY' in signal_raw: 
            signal = 'BUY'
        elif 'SELL' in signal_raw: 
            signal = 'SELL'
        else: 
            signal = 'HOLD'
        
        # 3. Safely grab the reason (which is now guaranteed to be the next non-blank line)
        reason = lines[1] if len(lines) > 1 else "Risk parameters evaluated."
        
        return {"signal": signal, "reason": reason}
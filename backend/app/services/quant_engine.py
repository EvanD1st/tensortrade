import torch
from chronos import ChronosPipeline

class QuantEngine:
    def __init__(self):
        print("Booting up Neural Quant Engine (Chronos-T5-Tiny)...")
        # Load the model directly to CPU to prevent memory crashes
        self.pipeline = ChronosPipeline.from_pretrained(
            "amazon/chronos-t5-tiny",
            device_map="cpu",
            torch_dtype=torch.float32,
        )
        print("Quant Engine Online.")

    def predict_next_close(self, closing_prices_list):
        """
        Takes an array of recent closing prices and predicts the next candle.
        """
        try:
            # Convert python list to PyTorch tensor
            context = torch.tensor(closing_prices_list)
            
            # Predict the next 1 candle
            forecast = self.pipeline.predict(context, prediction_length=1)
            
            # Extract the median prediction value from the tensor
            predicted_value = forecast[0, 0].item() 
            
            return round(predicted_value, 2)
            
        except Exception as e:
            print(f"Quant Engine Error: {e}")
            return None
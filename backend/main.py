from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.api import bot
from app.websocket.connection_manager import ConnectionManager
from app.services.binance_stream import start_binance_stream

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting TensorTrade Backend...")
    # Run the Binance stream in the background so it doesn't block FastAPI
    asyncio.create_task(start_binance_stream(manager))
    yield
    # Any necessary cleanup logic would go here

app = FastAPI(lifespan=lifespan)

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the Bot Router (Toggle switch)
app.include_router(bot.router, prefix="/api/bot", tags=["Bot"])

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection open, the manager handles broadcasting
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
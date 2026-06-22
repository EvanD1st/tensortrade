from fastapi import WebSocket
from typing import List
import json

class ConnectionManager:
    def __init__(self):
        # List to keep track of active Next.js client connections
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📡 New client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"📡 Client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Sends a JSON message to all connected clients and cleans up dead ones."""
        if not self.active_connections:
            return
        
        json_message = json.dumps(message)
        dead_connections = []
        
        for connection in self.active_connections:
            try:
                await connection.send_text(json_message)
            except Exception as e:
                # If the frontend disconnected, mark it for removal
                dead_connections.append(connection)
                
        # Remove dead connections so they don't spam the console
        for dead in dead_connections:
            if dead in self.active_connections:
                self.active_connections.remove(dead)
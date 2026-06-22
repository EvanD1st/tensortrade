import { useEffect, useRef, useState } from 'react';

export interface TickData {
  type: string;
  symbol: string;
  interval: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
  is_closed: boolean;
}

export interface SignalData {
  type: string;
  symbol: string;
  interval: string;
  model: string;
  signal: string;
  confidence: string;
  price: number;
  reason: string;
  predicted_price: number;
}

// NEW: Interface for our CCXT Executions
export interface ExecutionData {
  type: string;
  symbol: string;
  side: string;
  price: number;
  status: string;
  timestamp: number;
}

export const useWebSocket = (url: string) => {
  const [latestTick, setLatestTick] = useState<TickData | null>(null);
  const [latestSignal, setLatestSignal] = useState<SignalData | null>(null);
  const [latestExecution, setLatestExecution] = useState<ExecutionData | null>(null); // NEW
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectInterval: NodeJS.Timeout;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      
      ws.onclose = () => {
        setIsConnected(false);
        console.log("WS Disconnected. Reconnecting in 3 seconds...");
        reconnectInterval = setTimeout(connect, 3000);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'TICK') {
            if (!data.timestamp) data.timestamp = Date.now();
            if (!data.open) data.open = data.price;
            if (!data.high) data.high = data.price;
            if (!data.low) data.low = data.price;
            if (!data.close) data.close = data.price;
            setLatestTick(data as TickData);
          } 
          else if (data.type === 'SIGNAL') {
            setLatestSignal(data as SignalData);
          }
          // NEW: Catch CCXT Executions!
          else if (data.type === 'EXECUTION') {
            if (!data.timestamp) data.timestamp = Date.now();
            setLatestExecution(data as ExecutionData);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectInterval);
      if (wsRef.current) {
        wsRef.current.onclose = null; 
        wsRef.current.close();
      }
    };
  }, [url]);

  return { latestTick, latestSignal, latestExecution, isConnected };
};
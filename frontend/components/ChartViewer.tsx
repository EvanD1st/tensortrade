import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { TickData } from '../hooks/useWebSocket';

interface ChartViewerProps {
  latestTick: TickData | null;
  selectedPair: string;
  timeframe: string;
}

export default function ChartViewer({ latestTick, selectedPair, timeframe }: ChartViewerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // 1. Initialize Chart Theme
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
      },
      grid: {
        vertLines: { color: '#1E2D4A', style: 1 }, 
        horzLines: { color: '#1E2D4A', style: 1 },
      },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#1E2D4A',
      },
      rightPriceScale: {
        borderColor: '#1E2D4A',
      }
    });

    // Create the MT5 Green/Red Candlestick Series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981', // MT5 Bullish Green
      downColor: '#FF2A55', // MT5 Bearish Red
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#FF2A55',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 2. Fetch Historical Data whenever Pair or Timeframe changes
  useEffect(() => {
    if (!seriesRef.current) return;

    const fetchHistory = async () => {
      try {
        // Clean formatting (e.g. "BTC/USDT" -> "BTCUSDT")
        const formattedPair = selectedPair.toUpperCase().replace('/', '');
        
        // 🚀 INCREASED TO 1000: Fetch deep historical candles instantly on load
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
        const data = await response.json();

        // Format the data for lightweight-charts
        const historicalData = data.map((d: any[]) => ({
          time: Math.floor(d[0] / 1000) as any, // Open time
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        // Set the full historical dataset on the chart
        seriesRef.current?.setData(historicalData);
      } catch (error) {
        console.error("Error fetching historical data:", error);
      }
    };

    fetchHistory();
  }, [selectedPair, timeframe]);

  // 3. Update chart only when the incoming live tick matches our dropdown selections!
  useEffect(() => {
    if (!seriesRef.current || !latestTick) return;

    const formattedPair = selectedPair.toLowerCase().replace('/', '');

    if (latestTick.interval === timeframe && latestTick.symbol.toLowerCase() === formattedPair) {
       // Lightweight charts requires time in seconds
       const timeInSeconds = Math.floor(latestTick.timestamp / 1000);

       seriesRef.current.update({
         time: timeInSeconds as any,
         open: latestTick.open,
         high: latestTick.high,
         low: latestTick.low,
         close: latestTick.close,
       });
    }
  }, [latestTick, selectedPair, timeframe]);

  return (
    <div ref={chartContainerRef} className="w-full h-full" />
  );
}
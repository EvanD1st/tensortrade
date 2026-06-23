import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

interface ChartViewerProps {
  latestTick: any;
  selectedPair: string;
  timeframe: string;
}

// Helper function to snap live timestamps to the exact candle start time
const getSnappedTime = (timestampMs: number, timeframe: string) => {
  let intervalSeconds = 60; // default 1m
  switch (timeframe) {
    case '1m': intervalSeconds = 60; break;
    case '3m': intervalSeconds = 180; break;
    case '5m': intervalSeconds = 300; break;
    case '15m': intervalSeconds = 900; break;
    case '30m': intervalSeconds = 1800; break;
    case '1h': intervalSeconds = 3600; break;
    case '4h': intervalSeconds = 14400; break;
    case '1d': intervalSeconds = 86400; break;
  }
  const currentSeconds = Math.floor(timestampMs / 1000);
  return currentSeconds - (currentSeconds % intervalSeconds);
};

export default function ChartViewer({ latestTick, selectedPair, timeframe }: ChartViewerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // --- 1. INITIALIZATION & HISTORICAL DATA FETCH ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create the chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
      },
      grid: {
        vertLines: { color: '#1E2D4A' },
        horzLines: { color: '#1E2D4A' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#FF2A55',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#FF2A55',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Fetch Historical Data from Binance US
    const fetchData = async () => {
      try {
        const formattedPair = selectedPair.toUpperCase().replace('/', '');
        
        const response = await fetch(`https://api.binance.us/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
        const data = await response.json();

        // Safety check: ensure Binance returned an array, not an error object
        if (!Array.isArray(data)) {
          console.error('Invalid data received from Binance API:', data);
          return;
        }

        // Map Binance array to lightweight-charts object format
        const formattedData = data.map((d: any) => ({
          time: Math.floor(d[0] / 1000) as any, 
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        // Safety check: sort chronologically just in case
        formattedData.sort((a: any, b: any) => a.time - b.time);

        candlestickSeries.setData(formattedData);
      } catch (error) {
        console.error('Error fetching historical chart data:', error);
      }
    };

    fetchData();

    // Handle window resizing smoothly
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [selectedPair, timeframe]);

  // --- 2. LIVE TICK UPDATES ---
  useEffect(() => {
    if (!latestTick || !seriesRef.current) return;
    
    const formattedPair = selectedPair.toUpperCase().replace('/', '');
    
    if (latestTick.symbol.toUpperCase() === formattedPair) {
      // THE FIX: Snap the live timestamp to the exact current candle start time!
      const snappedTime = getSnappedTime(latestTick.timestamp, timeframe);
      
      try {
        seriesRef.current.update({
          time: snappedTime as any,
          open: latestTick.open,
          high: latestTick.high,
          low: latestTick.low,
          close: latestTick.close,
        });
      } catch (e) {
        // Silently catch chronological update errors caused by slight websocket delays
      }
    }
  }, [latestTick, selectedPair, timeframe]);

  return <div ref={chartContainerRef} className="absolute inset-0" />;
}
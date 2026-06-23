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
        vertLines: { color: '#1E2D4A', style: 1 }, 
        horzLines: { color: '#1E2D4A', style: 1 },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      rightPriceScale: {
        autoScale: true,
        scaleMargins: {
          top: 0.1,    
          bottom: 0.1, 
        },
        borderVisible: false,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,    
        barSpacing: 12,    
        borderVisible: false,
        // THE FIX: Physically lock the chart from scrolling past the newest candle
        fixRightEdge: true, 
      },
      crosshair: {
        mode: 0, 
      }
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

    // Fetch Historical Data with Smart Geo-Routing Fallback
    const fetchData = async () => {
      try {
        const formattedPair = selectedPair.toUpperCase().replace('/', '');
        let data;

        try {
          const resCom = await fetch(`https://api.binance.com/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
          if (!resCom.ok) throw new Error('Global Blocked');
          data = await resCom.json();
        } catch (e) {
          console.log("Global Binance blocked, falling back to Binance US...");
          const resUs = await fetch(`https://api.binance.us/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
          data = await resUs.json();
        }

        if (!Array.isArray(data)) {
          console.error('Invalid data received from Binance API:', data);
          return;
        }

        const uniqueTimes = new Set();
        const formattedData: any[] = [];

        data.forEach((d: any) => {
          const timeSecs = Math.floor(d[0] / 1000);
          if (!uniqueTimes.has(timeSecs)) {
            uniqueTimes.add(timeSecs);
            formattedData.push({
              time: timeSecs,
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
            });
          }
        });

        // Ensure chronological order
        formattedData.sort((a: any, b: any) => a.time - b.time);
        candlestickSeries.setData(formattedData);
        
        // THE FIX: Removed the buggy 'logicalRange' math that created a ghost candle.
        // This strictly forces the chart to snap to the newest data with 0 offset.
        chart.timeScale().scrollToRealTime();
        
      } catch (error) {
        console.error('Error fetching historical chart data:', error);
      }
    };

    fetchData();

    // ResizeObserver cleanly recalculates width and snaps right when sidebar toggles
    const resizeObserver = new ResizeObserver((entries) => {
      if (!chartContainerRef.current || !chartRef.current) return;
      
      const { width, height } = entries[0].contentRect;
      chartRef.current.applyOptions({ width, height });
      chartRef.current.timeScale().scrollToRealTime();
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [selectedPair, timeframe]);

  // --- 2. LIVE TICK UPDATES ---
  useEffect(() => {
    if (!latestTick || !seriesRef.current) return;
    
    const formattedPair = selectedPair.toUpperCase().replace('/', '');
    
    if (latestTick.symbol.toUpperCase() === formattedPair) {
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
        // Silently catch chronological update errors
      }
    }
  }, [latestTick, selectedPair, timeframe]);

  return <div ref={chartContainerRef} className="absolute inset-0" />;
}
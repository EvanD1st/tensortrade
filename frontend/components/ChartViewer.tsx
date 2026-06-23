import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

interface ChartViewerProps {
  latestTick: any;
  selectedPair: string;
  timeframe: string;
}

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
          // CRITICAL: Force strict integer seconds using Math.floor to prevent rendering crashes
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

    // Cleanup when component unmounts OR when dependencies change
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [selectedPair, timeframe]); // CRITICAL: Re-run this effect when pair or timeframe changes!

  // --- 2. LIVE TICK UPDATES ---
  useEffect(() => {
    if (!latestTick || !seriesRef.current) return;
    
    const formattedPair = selectedPair.toUpperCase().replace('/', '');
    
    // ONLY update the chart candle if the incoming tick matches our current dropdown selection
    if (latestTick.symbol.toUpperCase() === formattedPair) {
      // Force strict integer seconds for the live tick as well
      const tickTime = Math.floor(latestTick.timestamp / 1000);
      
      try {
        seriesRef.current.update({
          time: tickTime as any,
          open: latestTick.open,
          high: latestTick.high,
          low: latestTick.low,
          close: latestTick.close,
        });
      } catch (e) {
        // Silently catch chronological update errors caused by slight websocket delays
      }
    }
  }, [latestTick, selectedPair]);

  return <div ref={chartContainerRef} className="absolute inset-0" />;
}
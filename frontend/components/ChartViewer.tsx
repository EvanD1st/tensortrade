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

    // Create the chart instance with MT5 styling
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
      },
      grid: {
        vertLines: { color: '#1E2D4A', style: 1 }, // Lighter grid lines
        horzLines: { color: '#1E2D4A', style: 1 },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      rightPriceScale: {
        autoScale: true,
        scaleMargins: {
          top: 0.1,    // 10% margin at the top (lets candles stretch more)
          bottom: 0.1, // 10% margin at the bottom
        },
        borderVisible: false,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 15,   // MT5 Style: Leave empty space on the right edge
        barSpacing: 12,    // MT5 Style: Make candles thicker by default
        borderVisible: false,
      },
      crosshair: {
        mode: 0, // Normal crosshair mode
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
          // 1. Try Global Binance First (Works for you / non-US users)
          const resCom = await fetch(`https://api.binance.com/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
          if (!resCom.ok) throw new Error('Global Blocked');
          data = await resCom.json();
        } catch (e) {
          console.log("Global Binance blocked, falling back to Binance US...");
          // 2. Fallback to Binance US (Works for US users / servers)
          const resUs = await fetch(`https://api.binance.us/api/v3/klines?symbol=${formattedPair}&interval=${timeframe}&limit=1000`);
          data = await resUs.json();
        }

        if (!Array.isArray(data)) {
          console.error('Invalid data received from Binance API:', data);
          return;
        }

        // Map Binance array to lightweight-charts format and deduplicate
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
        
        // MT5 Zoom: Focus on the last 50 candles so they look chunky
        const totalCandles = formattedData.length;
        if (totalCandles > 50) {
          chart.timeScale().setVisibleLogicalRange({
            from: totalCandles - 50,
            to: totalCandles,
          });
        } else {
          chart.timeScale().fitContent();
        }
        
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
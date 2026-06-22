"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, LineChart, Activity, PieChart, 
  Settings, ChevronDown, Info, User, Hexagon, 
  BrainCircuit, LogOut, AlertTriangle, Check, PlayCircle, StopCircle, Briefcase, XCircle
} from 'lucide-react';

import { useWebSocket } from '../hooks/useWebSocket';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import ChartViewer from '../components/ChartViewer';

export default function Dashboard() {
  const { latestTick, latestSignal, isConnected } = useWebSocket('wss://evand1st-tensortrade-api.hf.space/ws');
  const router = useRouter();

  // --- TOAST NOTIFICATION STATE ---
  const [toasts, setToasts] = useState<{id: number, msg: string, type: 'success' | 'error' | 'info'}[]>([]);
  
  const addToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // --- AUTH & DB STATE ---
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  const [riskSettings, setRiskSettings] = useState({ virtualBalance: 1000.00 });
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [closedPositions, setClosedPositions] = useState<any[]>([]);

  // --- UI & TRADING STATE ---
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [activeTab, setActiveTab] = useState('OPEN');
  const [isAutoTrade, setIsAutoTrade] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [riskAmountUsdt, setRiskAmountUsdt] = useState<number>(125.00);
  const [slPercent, setSlPercent] = useState<number>(2.0); 
  const [tpPercent, setTpPercent] = useState<number>(4.0); 
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  // Track the last executed signal so we don't spam duplicate trades
  const lastExecutedSignalRef = useRef<string | null>(null);

  // --- 1. DATA FETCHING ---
  const fetchUserData = async (uid: string) => {
    try {
      const { data: settings, error: settingsError } = await supabase.from('user_settings').select('*').eq('id', uid).single();
      
      if (settingsError && settingsError.code !== 'PGRST116') {
         console.error("Settings Fetch Error:", settingsError);
      }

      if (settings && settings.virtual_usdt_balance !== undefined && settings.virtual_usdt_balance !== null) {
        setRiskSettings({ virtualBalance: Number(settings.virtual_usdt_balance) });
      }

      const { data: trades, error: tradesError } = await supabase.from('trades').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      
      if (tradesError) {
          console.error("Trades Fetch Error:", tradesError);
      }

      if (trades) {
        setOpenPositions(trades.filter((t: any) => t.status === 'OPEN'));
        setClosedPositions(trades.filter((t: any) => t.status === 'CLOSED'));
      }
    } catch (err) {
      console.error("Error fetching DB data:", err);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (session) {
        setUserEmail(session.user.email || 'Trader');
        setUserId(session.user.id);
        fetchUserData(session.user.id);
        if (typeof window !== 'undefined' && !localStorage.getItem(`disclaimer_${session.user.id}`)) setShowDisclaimer(true);
        setAuthLoading(false);
      } else if (event === 'SIGNED_OUT') {
        router.push('/auth');
      }
    });

    const checkUser = async () => {
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) return; 
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/auth');
      else {
        setUserEmail(session.user.email || 'Trader');
        setUserId(session.user.id);
        fetchUserData(session.user.id);
        if (typeof window !== 'undefined' && !localStorage.getItem(`disclaimer_${session.user.id}`)) setShowDisclaimer(true);
        setAuthLoading(false);
      }
    };
    checkUser();

    // Polling to keep Open/Closed positions updated from DB
    const interval = setInterval(() => {
      if (userId) fetchUserData(userId);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [router, userId]);

  // --- 2. LIVE PRICE TRACKING & EQUITY MATH ---
  useEffect(() => {
    if (latestTick) {
      const symbolKey = latestTick.symbol.toUpperCase();
      setLivePrices(prev => ({ ...prev, [symbolKey]: latestTick.price }));
    }
  }, [latestTick]);

  const activePrice = livePrices[selectedPair.replace('/', '')] || latestTick?.price || 0;
  
  const floatingPnL = openPositions.reduce((acc, trade) => {
    const currentPrice = livePrices[trade.symbol] || trade.price;
    const pnl = trade.side === 'BUY' 
      ? (currentPrice - trade.price) * trade.amount 
      : (trade.price - currentPrice) * trade.amount;
    return acc + pnl;
  }, 0);

  const balance = riskSettings.virtualBalance;
  const equity = balance + floatingPnL;

  // --- 3. MANUAL VIRTUAL EXECUTION ---
  const executeManualTrade = async (side: 'BUY' | 'SELL') => {
    if (!userId || activePrice === 0) return;

    const formattedSymbol = selectedPair.replace('/', '');
    const leverage = 100; // 🚀 INJECTED 100x LEVERAGE FOR MASSIVE PNL SWINGS
    const amount = (riskAmountUsdt * leverage) / activePrice;
    
    // Custom Prop Firm Auto-SL/TP using user input percentages
    const takeProfit = side === 'BUY' ? activePrice * (1 + tpPercent / 100) : activePrice * (1 - tpPercent / 100);
    const stopLoss = side === 'BUY' ? activePrice * (1 - slPercent / 100) : activePrice * (1 + slPercent / 100);

    const tradeData = {
      user_id: userId,
      symbol: formattedSymbol,
      side: side,
      price: activePrice,
      amount: amount,
      status: 'OPEN',
      take_profit: takeProfit,
      stop_loss: stopLoss
    };

    // OPTIMISTIC UI: Instantly flash the new trade on screen so it doesn't feel dormant
    const tempId = Math.random().toString();
    setOpenPositions(prev => [{ ...tradeData, id: tempId, created_at: new Date().toISOString() }, ...prev]);

    try {
      const { error } = await supabase.from('trades').insert(tradeData);
      if (error) throw error;
      fetchUserData(userId); // Refresh silently from DB
      addToast(`Successfully opened ${side} on ${formattedSymbol}`, 'success');
    } catch (e) {
      console.error("Trade failed", e);
      fetchUserData(userId); // Revert on fail
      addToast(`Failed to open trade.`, 'error');
    }
  };

  // --- 4. CLOSE POSITION MANUALLY ---
  const closePosition = async (trade: any) => {
    if (!userId) return;
    
    const curPrice = livePrices[trade.symbol] || trade.price;
    const pnl = trade.side === 'BUY' 
      ? (curPrice - trade.price) * trade.amount 
      : (trade.price - curPrice) * trade.amount;

    // 1. Optimistic UI: Remove from Open, Add to Closed
    setOpenPositions(prev => prev.filter(t => t.id !== trade.id));
    setClosedPositions(prev => [{ ...trade, status: 'CLOSED', close_price: curPrice, realized_pnl: pnl }, ...prev]);
    
    // 2. Optimistic UI: Update Balance safely using functional state update
    let updatedBalance = 0;
    setRiskSettings(prev => {
      updatedBalance = prev.virtualBalance + pnl;
      return { virtualBalance: updatedBalance };
    });

    try {
      // 3. Mark trade as CLOSED in DB
      const { error: tradeErr } = await supabase.from('trades').update({
        status: 'CLOSED',
        close_price: curPrice,
        realized_pnl: pnl
      }).eq('id', trade.id);
      
      if (tradeErr) {
        console.error("Supabase Trade Update Error:", tradeErr);
        throw tradeErr;
      }

      // 4. Upsert new balance to DB using the captured updatedBalance
      // NOTE: Ensure your user_settings table has 'id' as the PRIMARY KEY
      const { error: balErr } = await supabase.from('user_settings').upsert({
        id: userId,
        virtual_usdt_balance: updatedBalance
      });

      if (balErr) {
          console.error("Supabase Balance Update Error:", balErr);
          throw balErr;
      }

      // 3. Refresh UI from source of truth silently
      fetchUserData(userId);

      // Show Toast!
      const profitFmt = pnl > 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      addToast(`Trade Closed. Realized PnL: ${profitFmt}`, pnl > 0 ? 'success' : 'error');

    } catch(e) {
      console.error("Failed to close position", e);
      fetchUserData(userId); // Revert UI if DB connection fails
      addToast(`Failed to close trade.`, 'error');
    }
  };

  // --- 5. AI AUTO-TRADE TOGGLE HANDLER ---
  const handleToggleAutoTrade = async () => {
    const newState = !isAutoTrade;
    setIsAutoTrade(newState);
    
    const action = newState ? 'ON' : 'OFF';
    addToast(`AI Auto-Trade flipped ${action} for ${selectedPair}`, 'info');

    // Notify FastAPI Backend to initialize/stop the live isolated trading loop
    try {
      await fetch('https://evand1st-tensortrade-api.hf.space/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          symbol: selectedPair.replace('/', ''),
          is_active: newState,
          risk_amount: riskAmountUsdt,
          sl_percent: slPercent,
          tp_percent: tpPercent
        })
      });
      console.log(`Backend notified: Auto-Trade is now ${newState ? 'ON' : 'OFF'}`);
    } catch (e) {
      console.log("Backend auto-trade API failed.", e);
    }
  };

  // --- 6. AI AUTO-TRADE DEMO EXECUTOR ---
  // (REMOVED: The FastAPI Backend is now officially in full control of the execution loop!)


  if (authLoading) return <div className="h-screen bg-[#080F1F] flex items-center justify-center text-white font-bold">Authenticating...</div>;

  return (
    <div className="flex h-screen bg-[#080F1F] text-gray-300 font-sans overflow-hidden selection:bg-[#00E5FF] selection:text-[#080F1F]">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className={`bg-[#111C35] border-r border-[#1E2D4A] flex flex-col flex-shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`h-16 flex items-center border-b border-[#1E2D4A] cursor-pointer hover:bg-[#1E2D4A]/50 transition-colors ${isSidebarOpen ? 'gap-3 px-6' : 'justify-center'}`}
        >
          <Hexagon className={`w-8 h-8 text-[#00E5FF] fill-[#00E5FF]/20 flex-shrink-0 transition-transform duration-500 ${isSidebarOpen ? 'rotate-0' : '-rotate-90'}`} />
          {isSidebarOpen && <span className="font-bold text-white text-xl tracking-wide whitespace-nowrap animate-in fade-in duration-300">TensorTrade</span>}
        </div>

        <nav className="flex-1 px-3 py-6 space-y-2 overflow-hidden">
          {[
            { name: 'Dashboard', icon: LayoutDashboard, active: true },
            { name: 'AI Models', icon: BrainCircuit, active: false },
            { name: 'Paper Trading', icon: Activity, active: false },
            { name: 'Performance', icon: LineChart, active: false },
            { name: 'Settings', icon: Settings, active: false },
          ].map((nav, idx) => (
            <button key={idx} className={`w-full flex items-center py-3 rounded-xl text-sm font-medium transition-all ${nav.active ? 'bg-[#1E2D4A] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-[#1E2D4A]/50'} ${isSidebarOpen ? 'gap-3 px-4' : 'justify-center'}`}>
              <nav.icon className={`w-5 h-5 flex-shrink-0 ${nav.active ? 'text-[#00E5FF]' : ''}`} />
              {isSidebarOpen && <span className="whitespace-nowrap">{nav.name}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#1E2D4A]">
          <button 
            onClick={async () => { await supabase.auth.signOut(); router.push('/auth'); }}
            className={`w-full flex items-center py-3 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors ${isSidebarOpen ? 'gap-3 px-4' : 'justify-center'}`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" /> 
            {isSidebarOpen && <span className="whitespace-nowrap">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative">
        
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00E5FF]/5 blur-[120px] rounded-full pointer-events-none"></div>

        {/* TOP HEADER */}
        <header className="h-16 border-b border-[#1E2D4A] flex items-center justify-between px-8 bg-[#080F1F]/80 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-xl font-bold text-white">Live Operations</h1>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#10B981]/10 rounded-full border border-[#10B981]/20">
              <span className="relative flex h-2 w-2">
                {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-[#10B981]' : 'bg-red-500'}`}></span>
              </span>
              <span className={`text-xs font-medium ${isConnected ? 'text-[#10B981]' : 'text-red-500'}`}>{isConnected ? 'Data Stream Active' : 'Offline'}</span>
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-[#1E2D4A]">
              <div className="w-8 h-8 rounded-full bg-[#1E2D4A] flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-400">{userEmail}</span>
                <span className="text-[10px] text-[#00E5FF] uppercase tracking-wider">Demo Tier</span>
              </div>
            </div>
          </div>
        </header>

        {/* DASHBOARD CONTENT */}
        <div className="p-8 space-y-6 max-w-7xl mx-auto w-full relative z-20">
          
          {/* STAT CARDS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Balance Card */}
            <div className="bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400">Virtual Balance</h3>
                <PieChart className="w-5 h-5 text-[#00E5FF]" />
              </div>
              <div className="text-3xl font-bold text-white font-mono">${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              <p className="text-xs text-gray-500 mt-2">Locked internal demo funds</p>
            </div>

            {/* Live Equity Card */}
            <div className="bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400">Live Equity</h3>
                <Activity className="w-5 h-5 text-[#10B981]" />
              </div>
              <div className={`text-3xl font-bold font-mono ${floatingPnL >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
                ${equity.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </div>
              <p className="text-xs text-gray-500 mt-2">Floating PnL: {floatingPnL >= 0 ? '+' : ''}${floatingPnL.toFixed(2)}</p>
            </div>

            {/* Active Trades Card */}
            <div className="bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400">Open Positions</h3>
                <Briefcase className="w-5 h-5 text-[#8B5CF6]" />
              </div>
              <div className="text-3xl font-bold text-white">{openPositions.length}</div>
              <p className="text-xs text-gray-500 mt-2">Monitored by AI Risk Engine</p>
            </div>
          </div>

          {/* MIDDLE ROW: Chart & AI Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* CHART SECTION (3/4 width) */}
            <div className="lg:col-span-3 bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-4 shadow-lg flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <select 
                    value={selectedPair} 
                    onChange={(e) => setSelectedPair(e.target.value)}
                    className="bg-[#1E2D4A] border-none text-white text-sm font-bold rounded-lg px-4 py-2 focus:ring-1 focus:ring-[#00E5FF] outline-none"
                  >
                    <option value="BTC/USDT">BTC / USDT</option>
                    <option value="ETH/USDT">ETH / USDT</option>
                    <option value="SOL/USDT">SOL / USDT</option>
                  </select>
                  <select 
                    value={timeframe} 
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="bg-[#1E2D4A] border-none text-white text-sm rounded-lg px-4 py-2 focus:ring-1 focus:ring-[#00E5FF] outline-none"
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1H</option>
                  </select>
                </div>
                <div className="text-lg font-bold text-white font-mono tracking-wider">
                  ${activePrice ? activePrice.toLocaleString(undefined, {minimumFractionDigits: 2}) : '...'}
                </div>
              </div>
              <div className="flex-1 min-h-[400px] relative rounded-xl overflow-hidden border border-[#1E2D4A]/50 bg-[#080F1F]">
                <ChartViewer latestTick={latestTick} selectedPair={selectedPair} timeframe={timeframe} />
              </div>
            </div>

            {/* AI ENGINE STATUS (1/4 width) */}
            <div className="flex flex-col gap-6 lg:col-span-1">
              <div className="bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-6 shadow-lg flex-1">
                <div className="flex items-center justify-between mb-6 border-b border-[#1E2D4A] pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-[#00E5FF]" /> Neural Engine
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">Chronos T5 + Llama 3</p>
                  </div>
                  <div className={`px-3 py-1 rounded text-xs font-bold ${
                    latestSignal?.signal === 'BUY' ? 'bg-[#10B981]/20 text-[#10B981]' :
                    latestSignal?.signal === 'SELL' ? 'bg-red-500/20 text-red-500' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {latestSignal?.signal || 'AWAITING SIGNAL'}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-6">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    {/* Glowing animated rings */}
                    <div className="absolute inset-0 rounded-full border border-[#00E5FF]/20 animate-ping"></div>
                    <div className="absolute inset-2 rounded-full border-2 border-[#00E5FF]/40 border-t-[#00E5FF] animate-spin" style={{ animationDuration: '3s' }}></div>
                    <div className="absolute inset-4 rounded-full bg-[#1E2D4A] shadow-[0_0_30px_rgba(0,229,255,0.2)] flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white">{latestSignal?.confidence || '...'}</span>
                      <span className="text-[10px] text-[#00E5FF] uppercase">Confidence</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-[#080F1F] p-4 rounded-xl border border-[#1E2D4A]">
                  <h4 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-2"><Info className="w-3 h-3"/> AI Reasoning</h4>
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "{latestSignal?.reason || 'Collecting sufficient market data to form a statistical hypothesis...'}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: Positions Table & Manual Override */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* POSITIONS TABLE (3/4 width) */}
            <div className="lg:col-span-3 bg-[#111C35] border border-[#1E2D4A] rounded-2xl flex flex-col overflow-hidden shadow-lg h-[350px]">
              <div className="flex border-b border-[#1E2D4A] bg-[#080F1F]">
                {['OPEN', 'CLOSED'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-8 py-4 text-sm font-bold flex items-center gap-2 transition-colors ${activeTab === tab ? 'text-white border-t-2 border-[#00E5FF] bg-[#111C35]' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {tab} POSITIONS
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="text-gray-500 sticky top-0 bg-[#111C35] border-b border-[#1E2D4A]">
                    <tr>
                      <th className="font-medium p-4 pl-6">Pair</th>
                      <th className="font-medium p-4">Side</th>
                      <th className="font-medium p-4">Entry</th>
                      {activeTab === 'OPEN' ? (
                        <>
                          <th className="font-medium p-4">Current</th>
                          <th className="font-medium p-4">SL / TP</th>
                          <th className="font-medium p-4 text-right">Floating PnL</th>
                          <th className="font-medium p-4 text-center pr-6">Action</th>
                        </>
                      ) : (
                        <>
                          <th className="font-medium p-4">Exit</th>
                          <th className="font-medium p-4 text-right pr-6">Realized PnL</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2D4A]">
                    {activeTab === 'OPEN' && openPositions.map((row) => {
                      const curPrice = livePrices[row.symbol] || row.price;
                      const pnl = row.side === 'BUY' ? (curPrice - row.price) * row.amount : (row.price - curPrice) * row.amount;
                      return (
                        <tr key={row.id} className="hover:bg-[#1E2D4A]/30 transition-colors">
                          <td className="p-4 pl-6 font-bold text-white">{row.symbol}</td>
                          <td className={`p-4 font-bold ${row.side === 'BUY' ? 'text-[#10B981]' : 'text-red-500'}`}>{row.side}</td>
                          <td className="p-4 text-gray-300 font-mono">${Number(row.price).toFixed(2)}</td>
                          <td className="p-4 text-white font-mono">${curPrice.toFixed(2)}</td>
                          <td className="p-4 text-gray-400 font-mono text-xs">SL: {Number(row.stop_loss).toFixed(2)}<br/>TP: {Number(row.take_profit).toFixed(2)}</td>
                          <td className={`p-4 text-right font-bold font-mono ${pnl >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
                            {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}
                          </td>
                          <td className="p-4 text-center pr-6">
                            <button 
                              onClick={() => closePosition(row)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-colors"
                              title="Close Position"
                            >
                              <XCircle className="w-5 h-5 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {activeTab === 'CLOSED' && closedPositions.map((row) => (
                      <tr key={row.id} className="hover:bg-[#1E2D4A]/30 transition-colors">
                        <td className="p-4 pl-6 font-bold text-white">{row.symbol}</td>
                        <td className={`p-4 font-bold ${row.side === 'BUY' ? 'text-[#10B981]' : 'text-red-500'}`}>{row.side}</td>
                        <td className="p-4 text-gray-300 font-mono">${Number(row.price).toFixed(2)}</td>
                        <td className="p-4 text-white font-mono">${Number(row.close_price).toFixed(2)}</td>
                        <td className={`p-4 text-right pr-6 font-bold font-mono ${row.realized_pnl >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
                          {row.realized_pnl > 0 ? '+' : ''}{Number(row.realized_pnl).toFixed(2)}
                        </td>
                      </tr>
                    ))}

                    {((activeTab === 'OPEN' && openPositions.length === 0) || (activeTab === 'CLOSED' && closedPositions.length === 0)) && (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-500 italic">No {activeTab.toLowerCase()} positions...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MANUAL OVERRIDE (1/4 width) */}
            <div className="lg:col-span-1 bg-[#111C35] border border-[#1E2D4A] rounded-2xl p-5 shadow-lg flex flex-col h-[350px]">
               <h3 className="text-lg font-bold text-white mb-6 flex items-center justify-between">
                 Terminal Controls
                 <div className="flex items-center gap-2 text-sm font-normal">
                   <span className="text-gray-400 text-xs">Auto AI</span>
                   <button 
                     onClick={handleToggleAutoTrade}
                     className={`w-10 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${isAutoTrade ? 'bg-[#00E5FF]' : 'bg-[#1E2D4A]'}`}
                   >
                     <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${isAutoTrade ? 'translate-x-5' : 'translate-x-0'}`}></div>
                   </button>
                 </div>
               </h3>

               <div className="bg-[#080F1F] rounded-xl p-3 border border-[#1E2D4A] mb-4 flex items-center justify-between">
                 <span className="text-gray-400 text-sm flex items-center">
                   Risk Amount 
                   <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20">100x Lev</span>
                 </span>
                 <div className="flex items-center gap-2">
                   <input 
                     type="number" 
                     value={riskAmountUsdt} 
                     onChange={(e) => setRiskAmountUsdt(Number(e.target.value))}
                     className="w-16 bg-transparent text-right text-white font-bold font-mono outline-none border-b border-transparent focus:border-[#00E5FF] transition-colors"
                   />
                   <span className="text-gray-500 text-xs">USDT</span>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className="bg-[#080F1F] rounded-xl p-2 border border-[#1E2D4A] flex flex-col justify-center items-center">
                   <span className="text-gray-500 text-[10px] uppercase mb-1">Stop Loss (%)</span>
                   <div className="flex items-center">
                     <input 
                       type="number" 
                       step="0.1"
                       value={slPercent} 
                       onChange={(e) => setSlPercent(Number(e.target.value))}
                       className="w-12 bg-transparent text-center text-red-400 font-bold font-mono outline-none border-b border-transparent focus:border-red-500 transition-colors"
                     />
                   </div>
                 </div>
                 <div className="bg-[#080F1F] rounded-xl p-2 border border-[#1E2D4A] flex flex-col justify-center items-center">
                   <span className="text-gray-500 text-[10px] uppercase mb-1">Take Profit (%)</span>
                   <div className="flex items-center">
                     <input 
                       type="number" 
                       step="0.1"
                       value={tpPercent} 
                       onChange={(e) => setTpPercent(Number(e.target.value))}
                       className="w-12 bg-transparent text-center text-[#10B981] font-bold font-mono outline-none border-b border-transparent focus:border-[#10B981] transition-colors"
                     />
                   </div>
                 </div>
               </div>

               {isAutoTrade ? (
                 <div className="flex-1 w-full bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-xl flex flex-col items-center justify-center animate-pulse mt-auto py-2">
                   <BrainCircuit className="w-8 h-8 text-[#00E5FF] mb-2" />
                   <span className="text-sm font-bold text-[#00E5FF] tracking-widest text-center">AI IS IN CONTROL</span>
                   <span className="text-[10px] text-[#00E5FF]/70 mt-1">Scanning real-time signals...</span>
                 </div>
               ) : (
                 <div className="flex gap-3 mt-auto">
                   <button 
                     onClick={() => executeManualTrade('SELL')}
                     className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 py-3 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-0.5 group"
                   >
                     <span className="text-base tracking-wide">SELL</span>
                     <span className="text-[10px] font-mono opacity-80 group-hover:opacity-100">{activePrice ? activePrice.toFixed(2) : '...'}</span>
                   </button>
                   <button 
                     onClick={() => executeManualTrade('BUY')}
                     className="flex-1 bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 text-[#10B981] py-3 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-0.5 group"
                   >
                     <span className="text-base tracking-wide">BUY</span>
                     <span className="text-[10px] font-mono opacity-80 group-hover:opacity-100">{activePrice ? activePrice.toFixed(2) : '...'}</span>
                   </button>
                 </div>
               )}
            </div>

          </div>
        </div>

        {/* TOAST NOTIFICATIONS */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
          {toasts.map(toast => (
            <div key={toast.id} className={`flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-right-8 fade-in duration-300 ${
              toast.type === 'success' ? 'bg-[#10B981]/20 border-[#10B981]/30 text-[#10B981]' : 
              toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-500' : 
              'bg-[#00E5FF]/20 border-[#00E5FF]/30 text-[#00E5FF]'
            }`}>
              {toast.type === 'success' ? <Check className="w-5 h-5" /> : toast.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              <span className="text-sm font-bold tracking-wide">{toast.msg}</span>
            </div>
          ))}
        </div>

      </main>

      {/* DISCLAIMER MODAL */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111C35] border border-[#1E2D4A] rounded-2xl max-w-lg w-full p-8 shadow-2xl relative animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 mb-4 text-yellow-500">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-2xl font-bold text-white">Important Disclaimer</h2>
            </div>
            
            <div className="space-y-4 text-sm text-gray-300 mb-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              <p>Welcome to <strong>TensorTrade</strong>. Before you begin, please read and acknowledge the following:</p>
              
              <div className="bg-[#1E2D4A]/50 p-4 rounded-lg border border-[#1E2D4A]">
                <h3 className="font-bold text-white mb-1">1. High Volatility Risk</h3>
                <p className="text-xs text-gray-400">Cryptocurrency markets are highly volatile. You can lose all of your invested capital. TensorTrade's AI models provide statistical probabilities, not financial advice.</p>
              </div>

              <div className="bg-[#1E2D4A]/50 p-4 rounded-lg border border-[#1E2D4A]">
                <h3 className="font-bold text-white mb-1">2. Non-Custodial Control</h3>
                <p className="text-xs text-gray-400">TensorTrade never holds your real funds. When trading live, we execute trades via the API keys you provide. You are solely responsible for securing your exchange accounts.</p>
              </div>

              <div className="bg-[#1E2D4A]/50 p-4 rounded-lg border border-[#1E2D4A]">
                <h3 className="font-bold text-white mb-1">3. Start with Demo Mode</h3>
                <p className="text-xs text-gray-400">We strongly advise all users to utilize our <strong>Internal Paper Trading Engine (Demo Mode)</strong> before risking real capital. You have been credited with 1,000 Virtual USDT to safely test the AI.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-6 group" htmlFor="disclaimer-checkbox">
              <div className="relative flex items-center mt-0.5">
                <input 
                  id="disclaimer-checkbox"
                  type="checkbox" 
                  className="sr-only" 
                  checked={disclaimerAccepted} 
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)} 
                />
                <div className={`w-5 h-5 border-2 rounded transition-all flex items-center justify-center ${disclaimerAccepted ? 'bg-[#00E5FF] border-[#00E5FF]' : 'bg-[#080F1F] border-gray-500'}`}>
                  <Check className={`w-3.5 h-3.5 text-[#080F1F] transition-opacity ${disclaimerAccepted ? 'opacity-100' : 'opacity-0'}`} strokeWidth={3} />
                </div>
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                I understand the risks, acknowledge that the crypto market is highly volatile, and agree that my funds are my own responsibility.
              </span>
            </label>

            <button
              disabled={!disclaimerAccepted}
              onClick={() => { if (userId) { localStorage.setItem(`disclaimer_${userId}`, 'true'); setShowDisclaimer(false); } }}
              className="w-full py-3 px-4 bg-[#00E5FF] hover:bg-[#00cce6] disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-[#080F1F] font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(0,229,255,0.2)] disabled:shadow-none"
            >
              Enter Trading Terminal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
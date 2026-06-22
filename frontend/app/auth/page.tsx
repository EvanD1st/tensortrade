"use client";

import React, { useState } from 'react';
import { Hexagon, Mail, Lock, ArrowRight, AlertCircle, Loader2, Eye, EyeOff, User, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  
  // Registration Details State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Account State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        // Handle Login via real Supabase Client
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        router.push('/');
        
      } else {
        // Handle Sign Up & Save Extra Details to Supabase
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              phone: phone
            }
          }
        });
        if (error) throw error;
        
        // Ask them to verify their email instead of redirecting instantly
        setMessage("Success! Please check your email for the confirmation link to complete registration.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E17] flex flex-col justify-center items-center p-4">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#131826] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden z-10 transition-all duration-300">
        
        {/* Header */}
        <div className="p-8 border-b border-[#1E293B] flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-blue-600/10 rounded-xl border border-blue-500/20 flex items-center justify-center mb-4">
            <Hexagon className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-sm text-gray-400">
            {isLogin 
              ? 'Enter your credentials to access your trading bots.' 
              : 'Join TensorTrade to automate your crypto portfolio.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="p-8 space-y-5">
          
          {/* Status Messages */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
          {message && (
            <div className="flex items-start gap-2 bg-[#10B981]/10 border border-[#10B981]/20 p-3 rounded-lg">
              <AlertCircle className="w-5 h-5 text-[#10B981] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#10B981]">{message}</p>
            </div>
          )}

          {/* EXTRA DETAILS: Only shows when "Sign Up" is active */}
          {!isLogin && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">First Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      required={!isLogin}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                      placeholder="John"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">Last Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      required={!isLogin}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                      placeholder="Doe"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300 ml-1">Phone Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-500" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </>
          )}

          {/* Email Input (Always Shows) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300 ml-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {/* Password Input (Always Shows) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center ml-1">
              <label className="text-sm font-medium text-gray-300">Password</label>
              {isLogin && <a href="#" className="text-xs text-blue-500 hover:text-blue-400">Forgot password?</a>}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-10 py-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#131826] focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {isLogin ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Login/Signup */}
        <div className="p-4 border-t border-[#1E293B] bg-[#0B0E17]/50 text-center">
          <p className="text-sm text-gray-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            
            {/* THIS IS THE BUTTON TO CLICK TO SHOW THE REGISTRATION FIELDS */}
            <button
              onClick={(e) => {
                e.preventDefault(); // Added this to prevent any default form actions
                setIsLogin(!isLogin);
                setError(null);
                setMessage(null);
              }}
              className="font-medium text-blue-500 hover:text-blue-400 transition-colors ml-1"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { Logo } from '../components/Logo';
import { User, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Operator } from '../types';

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<Operator | null>;
  loading?: boolean;
  error?: string | null;
}

const Login: React.FC<LoginProps> = ({ onLogin, loading: externalLoading, error: externalError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = externalError || localError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);

    try {
      const operator = await onLogin(email, password);
      if (!operator) {
        setLocalError('Credenziali non valide o account non attivo');
      }
    } catch {
      setLocalError('Errore durante il login');
    } finally {
      setIsLoading(false);
    }
  };

  const loading = isLoading || externalLoading;

  if (showForgot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark to-primary p-4">
        <div className="bg-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-md border border-white/20 text-white">
          <h2 className="text-2xl font-bold mb-4 text-center">Recupero Password</h2>
          <p className="text-gray-200 text-center mb-6 text-sm">
            Inserisci la tua email. Ti invieremo un link per reimpostare la password.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); alert('Email di recupero inviata!'); setShowForgot(false); }}>
            <div className="mb-6 relative">
              <User className="absolute left-3 top-3 text-gray-300" size={20} />
              <input
                type="email"
                required
                className="w-full bg-black/20 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                placeholder="Email"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-secondary hover:bg-accent text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center shadow-lg"
            >
              Invia Link
            </button>
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="w-full mt-3 text-sm text-gray-300 hover:text-white text-center underline"
            >
              Torna al login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark via-primary to-[#558b59] p-4 font-sans">
      <div className="w-full max-w-md">
        
        {/* Header Section: Logo Left, Text Right */}
        <div className="flex items-center justify-center gap-5 mb-10">
            <div className="bg-white/90 p-3 rounded-xl shadow-lg shrink-0">
               <Logo className="w-14 h-14" />
            </div>
            <div className="flex flex-col text-white">
                <h1 className="text-4xl font-bold tracking-tight drop-shadow-md leading-none">GestCert</h1>
                <span className="text-lg font-light text-gray-200 tracking-wide mt-1">Cassa Edile Agrigentina</span>
            </div>
        </div>

        <div className="bg-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-md border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Benvenuto</h2>
          <p className="text-gray-300 text-center mb-8 text-sm">Accedi per gestire le anagrafiche e i certificati</p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-200">
                <AlertCircle size={18} />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="text-gray-300 group-focus-within:text-accent transition-colors" size={20} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-black/20 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                placeholder="Email"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="text-gray-300 group-focus-within:text-accent transition-colors" size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-black/20 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                placeholder="Password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-secondary hover:bg-accent text-white font-bold py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="animate-pulse">Accesso in corso...</span>
              ) : (
                <>
                  ACCEDI <ArrowRight className="ml-2" size={20} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setShowForgot(true)}
              className="text-sm text-gray-300 hover:text-white transition-colors hover:underline"
            >
              Password dimenticata?
            </button>
          </div>
        </div>
        
        <div className="mt-8 text-center text-white/40 text-xs">
          Prodotto e gestito da PC8 srl - Build 1 beta 7
        </div>
      </div>
    </div>
  );
};

export default Login;

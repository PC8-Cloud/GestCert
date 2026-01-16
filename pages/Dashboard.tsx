import React, { useState, useEffect } from 'react';
import { AppSettings, User } from '../types';
import { Calendar as CalendarIcon, Clock, AlertTriangle, CheckCircle, FileText, AlertCircle } from 'lucide-react';

interface DashboardProps {
  user: { name: string };
  settings: AppSettings;
  users: User[];
}

const Dashboard: React.FC<DashboardProps> = ({ user, settings, users }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = time.getHours();
    if (hour < 12) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  };

  // Stats calculation
  const today = new Date();
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  let expiredCount = 0;
  let expiringTodayCount = 0;
  let expiringWeekCount = 0;
  let expiringMonthCount = 0;

  users.forEach(u => {
    u.certificates.forEach(c => {
      const exp = new Date(c.expiryDate);
      if (exp < today) {
        expiredCount++;
      } else if (exp.toDateString() === today.toDateString()) {
        expiringTodayCount++;
      } else if (exp <= weekFromNow) {
        expiringWeekCount++;
      } else if (exp <= monthFromNow) {
        expiringMonthCount++;
      }
    });
  });

  return (
    <div className="space-y-6">
      {settings.widgets.welcome && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div>
             <h1 className="text-3xl font-bold text-gray-800">{getGreeting()}, {user.name}</h1>
             <p className="text-gray-500 mt-1">Benvenuto nella dashboard di GestCert</p>
          </div>
          <div className="hidden md:block">
            <Clock className="text-primary/20 w-24 h-24" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {settings.widgets.clock && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center aspect-[4/2]">
              <Clock className="text-primary mb-2" size={32} />
              <div className="text-4xl font-mono font-bold text-gray-800">
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-gray-500 mt-1">
                {time.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
           </div>
        )}
        
        {settings.widgets.calendar && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10">
                   <CalendarIcon size={100} />
               </div>
               <h3 className="text-lg font-semibold text-gray-700 mb-2">Calendario</h3>
               <div className="grid grid-cols-7 gap-1 text-center text-sm">
                   {['L','M','M','G','V','S','D'].map(d => <span key={d} className="text-gray-400 font-bold">{d}</span>)}
                   {Array.from({length: 30}, (_, i) => i + 1).map(day => (
                      <div 
                        key={day} 
                        className={`p-1 rounded-full ${day === time.getDate() ? 'bg-primary text-white font-bold' : 'text-gray-600'}`}
                      >
                          {day}
                      </div>
                   ))}
               </div>
           </div>
        )}

        {settings.widgets.expiry && (
          <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
               <FileText className="mr-2 text-primary" size={20} />
               Stato Scadenze Certificati
             </h3>
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
               
               <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-center cursor-pointer hover:bg-red-100 transition-colors">
                  <div className="text-3xl font-bold text-red-600">{expiringTodayCount}</div>
                  <div className="text-xs font-semibold text-red-800 uppercase tracking-wide mt-1">Scadono Oggi</div>
               </div>

               <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 text-center cursor-pointer hover:bg-orange-100 transition-colors">
                  <div className="text-3xl font-bold text-orange-600">{expiringWeekCount}</div>
                  <div className="text-xs font-semibold text-orange-800 uppercase tracking-wide mt-1">Questa Settimana</div>
               </div>

               <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-center cursor-pointer hover:bg-yellow-100 transition-colors">
                  <div className="text-3xl font-bold text-yellow-600">{expiringMonthCount}</div>
                  <div className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mt-1">Questo Mese</div>
               </div>

               <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 text-center cursor-pointer hover:bg-gray-200 transition-colors">
                  <div className="text-3xl font-bold text-gray-600">{expiredCount}</div>
                  <div className="text-xs font-semibold text-gray-800 uppercase tracking-wide mt-1">Già Scaduti</div>
               </div>

             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Attività Recenti</h3>
            <ul className="space-y-3">
              {[1,2,3].map(i => (
                <li key={i} className="flex items-start pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <div className="bg-primary/10 p-2 rounded-full mr-3 text-primary">
                    <CheckCircle size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Certificato caricato per Mario Rossi</p>
                    <p className="text-xs text-gray-500">2 ore fa da Admin</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4 text-red-600 flex items-center">
              <AlertCircle size={20} className="mr-2"/>
              Problemi Rilevati
            </h3>
             <ul className="space-y-3">
              {[1].map(i => (
                <li key={i} className="flex items-start pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <div className="bg-red-50 p-2 rounded-full mr-3 text-red-600">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Email non consegnata a Luigi Verdi</p>
                    <p className="text-xs text-gray-500">Ieri alle 15:30</p>
                  </div>
                </li>
              ))}
              {/* Empty state placeholder */}
               <li className="text-sm text-gray-400 italic pt-2">Nessun altro problema rilevato.</li>
            </ul>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
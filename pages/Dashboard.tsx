import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSettings, User, Operator } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, FileText, ChevronLeft, ChevronRight, MessageSquare, Send, UserPlus, UserCheck, Award, LogIn, Upload, UserMinus, Check } from 'lucide-react';
import { NotaBacheca, Activity, ActivityType } from '../lib/hooks';
import { formatDate } from '../lib/date';

// Tipi di filtro per certificati
export type CertificateFilter = 'today' | 'week' | 'month' | 'expired' | null;

// Calcola la data di Pasqua (algoritmo di Gauss/Computus)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Festivi italiani per un dato anno
function getItalianHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  // Festivi fissi
  holidays.add(`${year}-01-01`); // Capodanno
  holidays.add(`${year}-01-06`); // Epifania
  holidays.add(`${year}-04-25`); // Festa della Liberazione
  holidays.add(`${year}-05-01`); // Festa del Lavoro
  holidays.add(`${year}-06-02`); // Festa della Repubblica
  holidays.add(`${year}-08-15`); // Ferragosto
  holidays.add(`${year}-11-01`); // Ognissanti
  holidays.add(`${year}-12-08`); // Immacolata Concezione
  holidays.add(`${year}-12-25`); // Natale
  holidays.add(`${year}-12-26`); // Santo Stefano

  // Pasqua e Pasquetta (variabili)
  const easter = getEasterDate(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  holidays.add(formatDate(easter));
  holidays.add(formatDate(easterMonday));

  return holidays;
}

interface BachecaHook {
  note: NotaBacheca[];
  loading: boolean;
  addNota: (contenuto: string, operatoreId: string, operatoreNome: string) => Promise<NotaBacheca>;
  toggleNota: (id: string, operatoreId: string, operatoreNome: string) => Promise<NotaBacheca>;
}

interface ActivitiesHook {
  activities: Activity[];
  loading: boolean;
}

interface DashboardProps {
  user: { name: string };
  settings: AppSettings;
  users: User[];
  bacheca: BachecaHook;
  activities: ActivitiesHook;
  currentOperator: Operator;
}

// Icona per ogni tipo di attività
const getActivityIcon = (type: ActivityType) => {
  switch (type) {
    case 'user_created':
      return <UserPlus size={14} />;
    case 'user_updated':
      return <UserCheck size={14} />;
    case 'user_deleted':
      return <UserMinus size={14} />;
    case 'user_imported':
      return <Upload size={14} />;
    case 'certificate_added':
    case 'certificate_deleted':
      return <Award size={14} />;
    case 'operator_created':
      return <UserPlus size={14} />;
    case 'operator_login':
      return <LogIn size={14} />;
    default:
      return <CheckCircle size={14} />;
  }
};

// Formatta tempo relativo
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Adesso';
  if (diffMins < 60) return `${diffMins} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;

  return formatDate(date);
};

const Dashboard: React.FC<DashboardProps> = ({ user, settings, users, bacheca, activities, currentOperator }) => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [nuovaNota, setNuovaNota] = useState('');
  const [invioInCorso, setInvioInCorso] = useState(false);

  // Naviga alla pagina utenti con filtro certificati
  const goToUsersWithFilter = (filter: CertificateFilter) => {
    navigate(`/users?certFilter=${filter}`);
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Navigazione calendario
  const prevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCalendarDate(new Date());
  };

  // Genera i giorni del mese corrente
  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Giorno della settimana del primo giorno (0=Dom, 1=Lun, ...)
    // Convertiamo per iniziare da Lunedi (0=Lun, 6=Dom)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const holidays = getItalianHolidays(year);
    const days: { day: number; isCurrentMonth: boolean; isToday: boolean; isWeekend: boolean; isHoliday: boolean; date: Date }[] = [];

    // Giorni vuoti prima del primo giorno
    for (let i = 0; i < startDay; i++) {
      const prevDate = new Date(year, month, -startDay + i + 1);
      days.push({
        day: prevDate.getDate(),
        isCurrentMonth: false,
        isToday: false,
        isWeekend: false,
        isHoliday: false,
        date: prevDate
      });
    }

    // Giorni del mese
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isHoliday = holidays.has(dateStr);
      const isToday = date.toDateString() === time.toDateString();

      days.push({
        day: d,
        isCurrentMonth: true,
        isToday,
        isWeekend,
        isHoliday,
        date
      });
    }

    return days;
  };

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
  let expiringWeekCount = 0;   // Cumulativo: include oggi
  let expiringMonthCount = 0;  // Cumulativo: include settimana

  // Reset time to start of day for accurate comparisons
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  users.forEach(u => {
    const certs = u.certificates || [];
    certs.forEach(c => {
      if (!c.expiryDate) return;
      const exp = new Date(c.expiryDate);
      const expStart = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());

      if (expStart < todayStart) {
        // Già scaduto
        expiredCount++;
      } else if (expStart <= monthFromNow) {
        // Scade entro 30 giorni (cumulativo)
        expiringMonthCount++;

        if (expStart <= weekFromNow) {
          // Scade entro 7 giorni (cumulativo)
          expiringWeekCount++;

          if (expStart.getTime() === todayStart.getTime()) {
            // Scade oggi
            expiringTodayCount++;
          }
        }
      }
    });
  });


  return (
    <div className="space-y-6">
      {settings.widgets.welcome && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div>
             <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
               {getGreeting()}, {currentOperator.firstName}
             </h1>
             <p className="text-gray-500 dark:text-gray-400 mt-1">Benvenuto nella dashboard di GestCert</p>
          </div>
          {settings.widgets.clock && (
            <div className="hidden md:flex items-center gap-3 bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-2">
              <Clock className="text-primary" size={20} />
              <div className="text-right">
                <div className="text-lg font-mono font-bold text-gray-800 dark:text-white">
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(time)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {settings.widgets.calendar && (
           <div className="md:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center relative overflow-hidden">
               {/* Header con navigazione */}
               <div className="flex items-center justify-between mb-3">
                 <button
                   onClick={prevMonth}
                   className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                 >
                   <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
                 </button>
                 <button
                   onClick={goToToday}
                   className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-primary dark:hover:text-primary transition-colors"
                 >
                   {formatDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1))}
                 </button>
                 <button
                   onClick={nextMonth}
                   className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                 >
                   <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
                 </button>
               </div>

               {/* Intestazione giorni */}
               <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
                 {['L','M','M','G','V','S','D'].map((d, i) => (
                   <span
                     key={i}
                     className={`font-bold ${i >= 5 ? 'text-red-400' : 'text-gray-400'}`}
                   >
                     {d}
                   </span>
                 ))}
               </div>

               {/* Griglia giorni */}
               <div className="grid grid-cols-7 gap-1 text-center text-sm">
                 {getCalendarDays().map((dayInfo, idx) => {
                   let className = 'p-1 rounded-full text-xs transition-colors ';

                   if (!dayInfo.isCurrentMonth) {
                     className += 'text-gray-300 dark:text-gray-600';
                   } else if (dayInfo.isToday) {
                     className += 'bg-primary text-white font-bold';
                   } else if (dayInfo.isHoliday) {
                     className += 'text-red-500 font-semibold bg-red-50 dark:bg-red-900/20';
                   } else if (dayInfo.isWeekend) {
                     className += 'text-red-400 dark:text-red-400';
                   } else {
                     className += 'text-gray-600 dark:text-gray-300';
                   }

                   return (
                     <div key={idx} className={className}>
                       {dayInfo.day}
                     </div>
                   );
                 })}
               </div>

               {/* Legenda */}
               <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 rounded-full bg-red-400"></span> Weekend
                 </span>
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 rounded-full bg-red-500"></span> Festivo
                 </span>
               </div>
           </div>
        )}

        {settings.widgets.expiry && (
          <div className="col-span-1 md:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
             <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
               <FileText className="mr-2 text-primary" size={20} />
               Stato Scadenze Certificati
             </h3>
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

               <div
                 onClick={() => goToUsersWithFilter('today')}
                 className="bg-red-50 p-4 rounded-lg border border-red-100 text-center cursor-pointer hover:bg-red-100 hover:scale-105 transition-all"
               >
                  <div className="text-3xl font-bold text-red-600">{expiringTodayCount}</div>
                  <div className="text-xs font-semibold text-red-800 uppercase tracking-wide mt-1">Oggi</div>
               </div>

               <div
                 onClick={() => goToUsersWithFilter('week')}
                 className="bg-orange-50 p-4 rounded-lg border border-orange-100 text-center cursor-pointer hover:bg-orange-100 hover:scale-105 transition-all"
               >
                  <div className="text-3xl font-bold text-orange-600">{expiringWeekCount}</div>
                  <div className="text-xs font-semibold text-orange-800 uppercase tracking-wide mt-1">Entro 7 giorni</div>
               </div>

               <div
                 onClick={() => goToUsersWithFilter('month')}
                 className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-center cursor-pointer hover:bg-yellow-100 hover:scale-105 transition-all"
               >
                  <div className="text-3xl font-bold text-yellow-600">{expiringMonthCount}</div>
                  <div className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mt-1">Entro 30 giorni</div>
               </div>

               <div
                 onClick={() => goToUsersWithFilter('expired')}
                 className="bg-gray-100 p-4 rounded-lg border border-gray-200 text-center cursor-pointer hover:bg-gray-200 hover:scale-105 transition-all"
               >
                  <div className="text-3xl font-bold text-gray-600">{expiredCount}</div>
                  <div className="text-xs font-semibold text-gray-800 uppercase tracking-wide mt-1">Già Scaduti</div>
               </div>

             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center">
              <Clock size={20} className="mr-2 text-primary" />
              Attività Recenti
            </h3>
            <ul className="space-y-3 max-h-40 overflow-y-auto">
              {activities.loading ? (
                <li className="text-sm text-gray-400 italic">Caricamento...</li>
              ) : activities.activities.length === 0 ? (
                <li className="text-sm text-gray-400 italic text-center py-4">
                  Nessuna attività registrata.
                  <br />
                  <span className="text-xs">Le attività appariranno quando crei o modifichi utenti e certificati.</span>
                </li>
              ) : (
                activities.activities.map(activity => (
                  <li key={activity.id} className="flex items-start pb-3 border-b border-gray-50 dark:border-gray-700 last:border-0 last:pb-0">
                    <div className="bg-primary/10 p-2 rounded-full mr-3 text-primary flex-shrink-0">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {activity.description}
                        {activity.targetName && (
                          <span className="font-semibold"> {activity.targetName}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(activity.createdAt)} · {activity.operatorName}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          
           <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary dark:text-primary flex items-center">
                <MessageSquare size={20} className="mr-2"/>
                Bacheca e Attività
              </h3>
            </div>

            {/* Form per nuova nota */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nuovaNota.trim() || invioInCorso) return;
                setInvioInCorso(true);
                try {
                  await bacheca.addNota(
                    nuovaNota.trim(),
                    currentOperator.id,
                    `${currentOperator.firstName} ${currentOperator.lastName}`
                  );
                  setNuovaNota('');
                } catch (err) {
                  console.error('Errore invio nota:', err);
                } finally {
                  setInvioInCorso(false);
                }
              }}
              className="mb-4 flex gap-2"
            >
              <input
                type="text"
                value={nuovaNota}
                onChange={(e) => setNuovaNota(e.target.value)}
                placeholder="Aggiungi nota o attività da fare..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!nuovaNota.trim() || invioInCorso}
                className="px-3 py-2 bg-primary hover:bg-secondary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </form>

            {/* Lista note */}
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {bacheca.loading ? (
                <li className="text-sm text-gray-400 italic">Caricamento...</li>
              ) : bacheca.note.length === 0 ? (
                <li className="text-sm text-gray-400 italic text-center py-4">
                  Nessuna nota in bacheca.
                  <br />
                  <span className="text-xs">Scrivi qualcosa per te o per il team!</span>
                </li>
              ) : (
                bacheca.note.map(nota => (
                  <li
                    key={nota.id}
                    className={`flex items-center gap-3 p-2 rounded-lg group transition-colors ${
                      nota.completed
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {/* Checkbox per completare */}
                    <button
                      onClick={() => bacheca.toggleNota(
                        nota.id,
                        currentOperator.id,
                        `${currentOperator.firstName} ${currentOperator.lastName}`
                      )}
                      className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        nota.completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-500 hover:border-primary'
                      }`}
                      title={nota.completed && nota.completedBy
                        ? `Completato da ${nota.completedBy}`
                        : 'Segna come fatto'
                      }
                    >
                      {nota.completed && <Check size={12} />}
                    </button>

                    {/* Contenuto nota */}
                    <div className="flex-1 min-w-0 relative group/text">
                      <p className={`text-sm break-words ${
                        nota.completed
                          ? 'text-gray-400 line-through'
                          : 'text-gray-800 dark:text-gray-200'
                      }`}>
                        {nota.contenuto}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {nota.operatoreNome} · {formatDate(nota.createdAt)}
                      </p>

                      {/* Tooltip chi ha completato */}
                      {nota.completed && nota.completedBy && (
                        <div className="absolute left-0 bottom-full mb-1 hidden group-hover/text:block z-10">
                          <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                            <CheckCircle size={12} className="inline mr-1" />
                            Fatto da <strong>{nota.completedBy}</strong>
                            <br />
                            {nota.completedAt && formatDate(nota.completedAt)}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>

            {/* Contatore */}
            {bacheca.note.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                <span>{bacheca.note.filter(n => !n.completed).length} da fare</span>
                <span>{bacheca.note.filter(n => n.completed).length} completate</span>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default Dashboard;

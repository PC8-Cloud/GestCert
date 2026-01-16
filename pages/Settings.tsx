import React from 'react';
import { AppSettings, Role } from '../types';
import { Monitor, Type, Layout, Server, Save } from 'lucide-react';

interface SettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  role: Role;
}

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, role }) => {
  
  const handleToggleWidget = (key: keyof AppSettings['widgets']) => {
    setSettings(prev => ({
      ...prev,
      widgets: {
        ...prev.widgets,
        [key]: !prev.widgets[key]
      }
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-800 border-b pb-4">Impostazioni</h1>

      {/* General Settings */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
          <Monitor className="mr-2" size={20} /> Aspetto e Interfaccia
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">Tema</label>
             <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                   <input type="radio" name="theme" checked={settings.theme === 'light'} onChange={() => setSettings({...settings, theme: 'light'})} className="mr-2 text-primary focus:ring-primary" />
                   <span className="text-sm">Chiaro</span>
                </label>
                <label className="flex items-center cursor-pointer">
                   <input type="radio" name="theme" checked={settings.theme === 'dark'} onChange={() => setSettings({...settings, theme: 'dark'})} className="mr-2 text-primary focus:ring-primary" />
                   <span className="text-sm">Scuro</span>
                </label>
             </div>
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Type size={16} className="mr-1"/> Dimensione Font</label>
             <select 
               value={settings.fontSize} 
               onChange={(e) => setSettings({...settings, fontSize: e.target.value as any})}
               className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 outline-none"
             >
               <option value="small">Piccolo</option>
               <option value="medium">Medio (Default)</option>
               <option value="large">Grande</option>
             </select>
          </div>
        </div>
      </section>

      {/* Dashboard Widgets */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
         <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
          <Layout className="mr-2" size={20} /> Widget Dashboard
        </h2>
        <div className="space-y-3">
           <label className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
              <span className="text-sm font-medium">Messaggio di Benvenuto</span>
              <input type="checkbox" checked={settings.widgets.welcome} onChange={() => handleToggleWidget('welcome')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
              <span className="text-sm font-medium">Orologio Digitale</span>
              <input type="checkbox" checked={settings.widgets.clock} onChange={() => handleToggleWidget('clock')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
              <span className="text-sm font-medium">Calendario Mensile</span>
              <input type="checkbox" checked={settings.widgets.calendar} onChange={() => handleToggleWidget('calendar')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
              <span className="text-sm font-medium">Riepilogo Scadenze</span>
              <input type="checkbox" checked={settings.widgets.expiry} onChange={() => handleToggleWidget('expiry')} className="rounded text-primary focus:ring-primary" />
           </label>
        </div>
      </section>

      {/* Admin Only SMTP */}
      {role === Role.ADMIN && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-full -mr-12 -mt-12"></div>
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center relative z-10">
            <Server className="mr-2 text-red-500" size={20} /> Configurazione Email (SMTP)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
             <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Server SMTP</label>
                <input type="text" placeholder="smtp.example.com" className="w-full p-2 border border-gray-300 rounded text-sm" />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Porta</label>
                <input type="number" placeholder="587" className="w-full p-2 border border-gray-300 rounded text-sm" />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email Mittente</label>
                <input type="email" placeholder="noreply@cassaedile.ag.it" className="w-full p-2 border border-gray-300 rounded text-sm" />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Crittografia</label>
                <select className="w-full p-2 border border-gray-300 rounded text-sm">
                   <option>TLS</option>
                   <option>SSL</option>
                   <option>Nessuna</option>
                </select>
             </div>
             <div className="md:col-span-2 pt-2 flex justify-end">
                <button className="px-4 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-700">Verifica Connessione</button>
             </div>
          </div>
        </section>
      )}

      <div className="flex justify-end pt-4">
         <button className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-6 py-3 rounded-lg shadow-lg transition-all font-semibold">
            <Save size={20} /> Salva Tutte le Impostazioni
         </button>
      </div>
    </div>
  );
};

export default Settings;
import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldCheck, Settings, LogOut, Menu, UserCircle } from 'lucide-react';
import { Logo } from './Logo';
import { Role } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  userRole: Role;
  onLogout: () => void;
  userName: string;
}

const Layout: React.FC<LayoutProps> = ({ children, userRole, onLogout, userName }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Utenti', path: '/users', icon: Users },
  ];

  if (userRole === Role.ADMIN) {
    navItems.push({ label: 'Operatori', path: '/operators', icon: ShieldCheck });
  }

  return (
    <div className="flex h-screen bg-light dark:bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-dark text-white transition-all duration-300 flex flex-col shadow-xl z-20`}
      >
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <Logo className="w-8 h-8 shrink-0" />
          {isSidebarOpen && (
            <div className="ml-3 overflow-hidden whitespace-nowrap">
              <h1 className="font-bold text-lg leading-none">GestCert</h1>
              <span className="text-xs text-gray-300">Cassa Edile Agrigentina</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-6 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-3 py-3 rounded-lg transition-colors
                  ${isActive ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}
                `}
                title={!isSidebarOpen ? item.label : ''}
              >
                <Icon size={24} className="shrink-0" />
                {isSidebarOpen && <span className="ml-3">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-2 border-t border-white/10 space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) => `
              flex items-center px-3 py-3 rounded-lg transition-colors
              ${isActive ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}
            `}
            title={!isSidebarOpen ? 'Impostazioni' : ''}
          >
            <Settings size={24} className="shrink-0" />
            {isSidebarOpen && <span className="ml-3">Impostazioni</span>}
          </NavLink>
          
          <button
            onClick={onLogout}
            className="w-full flex items-center px-3 py-3 rounded-lg text-red-300 hover:bg-red-900/20 hover:text-red-200 transition-colors"
            title={!isSidebarOpen ? 'Logout' : ''}
          >
            <LogOut size={24} className="shrink-0" />
            {isSidebarOpen && <span className="ml-3">Esci</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-between px-6 z-10">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              <Menu size={24} />
            </button>
            <h2 className="ml-4 text-xl font-semibold text-gray-800 dark:text-white">
               {navItems.find(i => i.path === location.pathname)?.label || 
               (location.pathname === '/settings' ? 'Impostazioni' : 
               (location.pathname.startsWith('/users') ? 'Gestione Utenti' : 'Gestione'))}
            </h2>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex flex-col items-end mr-2">
               <span className="text-sm font-medium text-gray-900 dark:text-white">{userName}</span>
               <span className="text-xs text-gray-500 dark:text-gray-400">{userRole}</span>
            </div>
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
               <UserCircle size={28} />
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-auto p-6 bg-light dark:bg-gray-900">
          {children}
          
          <footer className="mt-8 py-4 text-center text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700">
             GestCert &copy; 2026 Cassa Edile Agrigentina - Prodotto e gestito da PC8 srl, Build 2.0
          </footer>
        </main>
      </div>
    </div>
  );
};

export default Layout;

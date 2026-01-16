import React, { useState } from 'react';
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Operators from './pages/Operators';
import Settings from './pages/Settings';
import { Role, AppSettings, User, Operator } from './types';
import { MOCK_USERS, MOCK_OPERATORS } from './constants';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');
  
  // App State
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [operators, setOperators] = useState<Operator[]>(MOCK_OPERATORS);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'light',
    fontSize: 'medium',
    widgets: {
      welcome: true,
      clock: true,
      calendar: true,
      expiry: true,
    }
  });

  const handleLogin = (email: string, role: Role) => {
    setIsAuthenticated(true);
    setUserRole(role);
    setUserName(email.split('@')[0]); // Simple name extraction
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole(null);
    setUserName('');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className={settings.theme === 'dark' ? 'dark' : ''}>
        <Layout userRole={userRole!} onLogout={handleLogout} userName={userName}>
          <Routes>
            <Route path="/" element={<Dashboard user={{ name: userName }} settings={settings} users={users} />} />
            <Route path="/users" element={<Users users={users} setUsers={setUsers} currentUserRole={userRole!} />} />
            <Route 
              path="/operators" 
              element={userRole === Role.ADMIN ? <Operators operators={operators} /> : <Navigate to="/" />} 
            />
            <Route path="/settings" element={<Settings settings={settings} setSettings={setSettings} role={userRole!} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </div>
    </Router>
  );
};

export default App;
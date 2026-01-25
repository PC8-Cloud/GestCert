import React from 'react';
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Operators from './pages/Operators';
import Settings from './pages/Settings';
import { Role, Operator, User } from './types';
import { useUsers, useOperators, useAuth, useSettings, useInactivityTimeout, useBacheca, useActivities } from './lib/hooks';

const App: React.FC = () => {
  // Supabase Hooks
  const auth = useAuth();
  const { users, setUsers, loading: usersLoading, createUser, updateUser, deleteUser, deleteUsers } = useUsers();
  const { operators, loading: operatorsLoading, createOperator, updateOperator, deleteOperator } = useOperators();
  const { settings, setSettings } = useSettings(auth.currentOperator?.id || null);
  const bacheca = useBacheca();
  const activities = useActivities();

  const handleLogin = async (email: string, password: string): Promise<Operator | null> => {
    const operator = await auth.login(email, password);
    if (operator) {
      // Log login activity
      await activities.logActivity(
        'operator_login',
        'Accesso effettuato',
        operator.id,
        `${operator.firstName} ${operator.lastName}`
      );
    }
    return operator;
  };

  // Wrapper per setUsers che logga le attività
  const setUsersWithLogging = (updater: React.SetStateAction<User[]>) => {
    const currentOperator = auth.currentOperator;
    if (!currentOperator) {
      setUsers(updater);
      return;
    }

    const operatorName = `${currentOperator.firstName} ${currentOperator.lastName}`;

    // Determina se è una funzione o un valore diretto
    if (typeof updater === 'function') {
      setUsers(prevUsers => {
        const newUsers = updater(prevUsers);

        // Rileva il tipo di operazione
        if (newUsers.length > prevUsers.length) {
          // Utenti aggiunti
          const addedUsers = newUsers.filter(nu => !prevUsers.some(pu => pu.id === nu.id));

          if (addedUsers.length === 1) {
            // Singolo utente creato
            const added = addedUsers[0];
            activities.logActivity(
              'user_created',
              'Nuovo utente creato:',
              currentOperator.id,
              operatorName,
              `${added.firstName} ${added.lastName}`
            );
          } else if (addedUsers.length > 1) {
            // Importazione multipla
            activities.logActivity(
              'user_imported',
              `Importati ${addedUsers.length} utenti`,
              currentOperator.id,
              operatorName
            );
          }
        } else if (newUsers.length < prevUsers.length) {
          // Utenti eliminati
          const deletedUsers = prevUsers.filter(pu => !newUsers.some(nu => nu.id === pu.id));

          if (deletedUsers.length === 1) {
            const deleted = deletedUsers[0];
            activities.logActivity(
              'user_deleted',
              'Utente eliminato:',
              currentOperator.id,
              operatorName,
              `${deleted.firstName} ${deleted.lastName}`
            );
          } else if (deletedUsers.length > 1) {
            activities.logActivity(
              'user_deleted',
              `Eliminati ${deletedUsers.length} utenti`,
              currentOperator.id,
              operatorName
            );
          }
        } else {
          // Utente modificato (stesso numero, ma dati diversi)
          const modifiedUser = newUsers.find((nu, i) => {
            const pu = prevUsers.find(p => p.id === nu.id);
            return pu && JSON.stringify(pu) !== JSON.stringify(nu);
          });

          if (modifiedUser) {
            // Controlla se è stato aggiunto/rimosso un certificato
            const oldUser = prevUsers.find(p => p.id === modifiedUser.id);
            if (oldUser) {
              const oldCerts = oldUser.certificates || [];
              const newCerts = modifiedUser.certificates || [];

              if (newCerts.length > oldCerts.length) {
                const addedCert = newCerts.find(nc => !oldCerts.some(oc => oc.id === nc.id));
                if (addedCert) {
                  activities.logActivity(
                    'certificate_added',
                    `Certificato "${addedCert.name}" aggiunto a`,
                    currentOperator.id,
                    operatorName,
                    `${modifiedUser.firstName} ${modifiedUser.lastName}`
                  );
                }
              } else if (newCerts.length < oldCerts.length) {
                activities.logActivity(
                  'certificate_deleted',
                  'Certificato rimosso da',
                  currentOperator.id,
                  operatorName,
                  `${modifiedUser.firstName} ${modifiedUser.lastName}`
                );
              } else {
                activities.logActivity(
                  'user_updated',
                  'Utente modificato:',
                  currentOperator.id,
                  operatorName,
                  `${modifiedUser.firstName} ${modifiedUser.lastName}`
                );
              }
            }
          }
        }

        return newUsers;
      });
    } else {
      setUsers(updater);
    }
  };

  const handleLogout = () => {
    auth.logout();
  };

  // Wrapper per createUser che logga l'attività e scrive su Supabase
  const createUserWithLogging = async (user: Omit<User, 'id'>, skipEmailCheck?: boolean) => {
    const newUser = await createUser(user, skipEmailCheck);
    if (auth.currentOperator) {
      await activities.logActivity(
        'user_created',
        'Nuovo utente creato:',
        auth.currentOperator.id,
        `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
        `${newUser.firstName} ${newUser.lastName}`
      );
    }
    return newUser;
  };

  // Wrapper per updateUser che logga l'attività e scrive su Supabase
  const updateUserWithLogging = async (id: string, user: Partial<User>) => {
    const existingUser = users.find(u => u.id === id);
    const updatedUser = await updateUser(id, user);
    if (auth.currentOperator && existingUser) {
      // Controlla se è stato aggiunto/rimosso un certificato
      const oldCerts = existingUser.certificates || [];
      const newCerts = updatedUser.certificates || [];

      if (newCerts.length > oldCerts.length) {
        const addedCert = newCerts.find(nc => !oldCerts.some(oc => oc.id === nc.id));
        if (addedCert) {
          await activities.logActivity(
            'certificate_added',
            `Certificato "${addedCert.name}" aggiunto a`,
            auth.currentOperator.id,
            `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
            `${updatedUser.firstName} ${updatedUser.lastName}`
          );
        }
      } else if (newCerts.length < oldCerts.length) {
        await activities.logActivity(
          'certificate_deleted',
          'Certificato rimosso da',
          auth.currentOperator.id,
          `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
          `${updatedUser.firstName} ${updatedUser.lastName}`
        );
      } else {
        await activities.logActivity(
          'user_updated',
          'Utente modificato:',
          auth.currentOperator.id,
          `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
          `${updatedUser.firstName} ${updatedUser.lastName}`
        );
      }
    }
    return updatedUser;
  };

  // Wrapper per deleteUser che logga l'attività e elimina da Supabase
  const deleteUserWithLogging = async (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    await deleteUser(id);
    if (auth.currentOperator && userToDelete) {
      await activities.logActivity(
        'user_deleted',
        'Utente eliminato:',
        auth.currentOperator.id,
        `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
        `${userToDelete.firstName} ${userToDelete.lastName}`
      );
    }
  };

  // Wrapper per deleteUsers (multipli) che logga l'attività
  const deleteUsersWithLogging = async (ids: string[]) => {
    const usersToDelete = users.filter(u => ids.includes(u.id));
    await deleteUsers(ids);
    if (auth.currentOperator) {
      await activities.logActivity(
        'user_deleted',
        `Eliminati ${usersToDelete.length} utenti`,
        auth.currentOperator.id,
        `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`
      );
    }
  };

  // Wrapper per createOperator che logga l'attività
  const createOperatorWithLogging = async (operator: Omit<Operator, 'id'> & { password?: string }) => {
    const newOperator = await createOperator(operator);
    if (auth.currentOperator) {
      await activities.logActivity(
        'operator_created',
        'Nuovo operatore creato:',
        auth.currentOperator.id,
        `${auth.currentOperator.firstName} ${auth.currentOperator.lastName}`,
        `${newOperator.firstName} ${newOperator.lastName}`
      );
    }
    return newOperator;
  };

  // Logout automatico per inattività (2 minuti)
  useInactivityTimeout(handleLogout, auth.isAuthenticated);

  // Mostra schermata di login se non autenticato
  if (!auth.isAuthenticated) {
    return <Login onLogin={handleLogin} loading={auth.loading} error={auth.error} />;
  }

  // Mostra loading durante il caricamento iniziale
  if (usersLoading || operatorsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark to-primary">
        <div className="text-white text-xl animate-pulse">Caricamento dati...</div>
      </div>
    );
  }

  const currentOperator = auth.currentOperator!;
  const userRole = currentOperator.role === 'Amministratore' ? Role.ADMIN : Role.SECRETARY;
  const userName = `${currentOperator.firstName} ${currentOperator.lastName}`;

  return (
    <Router>
      <div className={settings.theme === 'dark' ? 'dark' : ''}>
        <Layout userRole={userRole} onLogout={handleLogout} userName={userName}>
          <Routes>
            <Route path="/" element={<Dashboard user={{ name: userName }} settings={settings} users={users} bacheca={bacheca} activities={activities} currentOperator={currentOperator} />} />
            <Route path="/users" element={<Users users={users} setUsers={setUsersWithLogging} createUser={createUserWithLogging} updateUser={updateUserWithLogging} deleteUser={deleteUserWithLogging} deleteUsers={deleteUsersWithLogging} currentUserRole={userRole} />} />
            <Route
              path="/operators"
              element={userRole === Role.ADMIN ? <Operators operators={operators} createOperator={createOperatorWithLogging} updateOperator={updateOperator} deleteOperator={deleteOperator} /> : <Navigate to="/" />}
            />
            <Route path="/settings" element={<Settings settings={settings} setSettings={setSettings} role={userRole} users={users} operators={operators} bacheca={bacheca} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </div>
    </Router>
  );
};

export default App;

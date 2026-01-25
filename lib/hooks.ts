import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Operator, AppSettings } from '../types';
import { STORAGE_MODE } from './config';
import { usersService, operatorsService, settingsService, bachecaService, NotaBacheca } from './services';
import {
  localUsersService,
  localOperatorsService,
  localSettingsService,
  localBachecaService,
  localActivitiesService,
  localCertificateTypesService,
  Activity,
  ActivityType,
  CertificateType
} from './localServices';
import { hashPassword, verifyPassword } from './password';

// Seleziona i servizi in base alla modalita' di storage
const usersApi = STORAGE_MODE === 'local' ? localUsersService : usersService;
const operatorsApi = STORAGE_MODE === 'local' ? localOperatorsService : operatorsService;
const settingsApi = STORAGE_MODE === 'local' ? localSettingsService : settingsService;
const bachecaApi = STORAGE_MODE === 'local' ? localBachecaService : bachecaService;
const activitiesApi = localActivitiesService; // Sempre locale per semplicità

// ============ USERS HOOK ============

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento utenti');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const createUser = async (user: Omit<User, 'id'>, skipEmailCheck?: boolean) => {
    try {
      const newUser = await usersApi.create(user, skipEmailCheck);
      setUsers(prev => [...prev, newUser]);
      return newUser;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nella creazione utente');
      throw err;
    }
  };

  const updateUser = async (id: string, user: Partial<User>) => {
    try {
      const updatedUser = await usersApi.update(id, user);
      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      return updatedUser;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'aggiornamento utente');
      throw err;
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await usersApi.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'eliminazione utente');
      throw err;
    }
  };

  const deleteUsers = async (ids: string[]) => {
    try {
      await usersApi.deleteMany(ids);
      setUsers(prev => prev.filter(u => !ids.includes(u.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'eliminazione utenti');
      throw err;
    }
  };

  return {
    users,
    setUsers,
    loading,
    error,
    refresh: fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    deleteUsers
  };
}

// ============ OPERATORS HOOK ============

export function useOperators() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOperators = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await operatorsApi.getAll();
      setOperators(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento operatori');
      console.error('Error fetching operators:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const createOperator = async (operator: Omit<Operator, 'id'> & { password?: string }) => {
    try {
      const newOperator = await operatorsApi.create(operator);
      setOperators(prev => [...prev, newOperator]);
      return newOperator;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nella creazione operatore');
      throw err;
    }
  };

  const updateOperator = async (id: string, operator: Partial<Operator> & { password?: string }) => {
    try {
      const updatedOperator = await operatorsApi.update(id, operator);
      setOperators(prev => prev.map(o => o.id === id ? updatedOperator : o));
      return updatedOperator;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'aggiornamento operatore');
      throw err;
    }
  };

  const deleteOperator = async (id: string) => {
    try {
      await operatorsApi.delete(id);
      setOperators(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'eliminazione operatore');
      throw err;
    }
  };

  return {
    operators,
    loading,
    error,
    refresh: fetchOperators,
    createOperator,
    updateOperator,
    deleteOperator
  };
}

// ============ AUTH HOOK ============

export function useAuth() {
  const [currentOperator, setCurrentOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const login = async (email: string, password: string): Promise<Operator | null> => {
    try {
      setLoading(true);
      setError(null);

      const operator = await withTimeout(
        operatorsApi.getByEmail(email),
        12000,
        'Timeout durante il login. Verifica la connessione o riprova.'
      );

      if (!operator) {
        setError('Email o password non validi');
        return null;
      }

      if (operator.status !== 'Attivo') {
        setError('Account non attivo');
        return null;
      }

      let resolvedOperator = operator;

      // Verifica password o inizializza password hash se mancante
      if (resolvedOperator.passwordHash) {
        const isValid = await verifyPassword(password, resolvedOperator.passwordHash);
        if (!isValid) {
          setError('Email o password non validi');
          return null;
        }
      } else {
        // Prima impostazione password per operatori legacy (senza hash)
        if (!password || password.length < 6) {
          setError('Password non valida (minimo 6 caratteri)');
          return null;
        }
        const newHash = await hashPassword(password);
        const updated = await withTimeout(
          operatorsApi.update(operator.id, { passwordHash: newHash }),
          12000,
          'Timeout durante il salvataggio della password. Riprova.'
        );
        resolvedOperator = updated || { ...operator, passwordHash: newHash };
      }

      // Aggiorna ultimo accesso
      await withTimeout(
        operatorsApi.updateLastAccess(resolvedOperator.id),
        12000,
        'Timeout durante l\'aggiornamento ultimo accesso.'
      );

      setCurrentOperator(resolvedOperator);
      return resolvedOperator;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel login');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCurrentOperator(null);
  };

  return {
    currentOperator,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!currentOperator
  };
}

// ============ SETTINGS HOOK ============

export function useSettings(operatorId: string | null) {
  const [settings, setSettingsState] = useState<AppSettings>({
    theme: 'light',
    fontSize: 'medium',
    widgets: {
      welcome: true,
      clock: true,
      calendar: true,
      expiry: true,
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!operatorId) return;

    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await settingsApi.get(operatorId);
        if (data) {
          setSettingsState(data);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [operatorId]);

  const updateSettings = async (newSettings: AppSettings) => {
    setSettingsState(newSettings);

    if (operatorId) {
      try {
        await settingsApi.upsert(operatorId, newSettings);
      } catch (err) {
        console.error('Error saving settings:', err);
      }
    }
  };

  return {
    settings,
    setSettings: updateSettings,
    loading
  };
}

// ============ BACHECA HOOK ============

export type { NotaBacheca } from './services';

export function useBacheca() {
  const [note, setNote] = useState<NotaBacheca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNote = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await bachecaApi.getAll();
      setNote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento note');
      console.error('Error fetching bacheca:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const addNota = async (contenuto: string, operatoreId: string, operatoreNome: string) => {
    try {
      const newNota = await bachecaApi.create(contenuto, operatoreId, operatoreNome);
      setNote(prev => [newNota, ...prev].slice(0, 20));
      return newNota;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nella creazione nota');
      throw err;
    }
  };

  const updateNota = async (id: string, contenuto: string) => {
    try {
      const updated = await bachecaApi.update(id, contenuto);
      setNote(prev => prev.map(n => n.id === id ? updated : n));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'aggiornamento nota');
      throw err;
    }
  };

  const deleteNota = async (id: string) => {
    try {
      await bachecaApi.delete(id);
      setNote(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nell\'eliminazione nota');
      throw err;
    }
  };

  return {
    note,
    loading,
    error,
    refresh: fetchNote,
    addNota,
    updateNota,
    deleteNota
  };
}

// ============ INACTIVITY TIMEOUT HOOK ============

const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minuti in millisecondi

export function useInactivityTimeout(onTimeout: () => void, isActive: boolean = true) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Mantieni la callback aggiornata senza causare re-render
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onTimeoutRef.current();
    }, INACTIVITY_TIMEOUT);
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Eventi da monitorare per rilevare attività
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetTimer();
    };

    // Registra listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Avvia timer iniziale
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer, isActive]);

  return { resetTimer };
}

// ============ ACTIVITIES HOOK ============

export type { Activity, ActivityType, CertificateType };

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await activitiesApi.getRecent(10);
      setActivities(data);
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const logActivity = async (
    type: ActivityType,
    description: string,
    operatorId: string,
    operatorName: string,
    targetName?: string
  ) => {
    try {
      const newActivity = await activitiesApi.log(type, description, operatorId, operatorName, targetName);
      setActivities(prev => [newActivity, ...prev].slice(0, 10));
      return newActivity;
    } catch (err) {
      console.error('Error logging activity:', err);
      throw err;
    }
  };

  return {
    activities,
    loading,
    refresh: fetchActivities,
    logActivity
  };
}

// ============ CERTIFICATE TYPES HOOK ============

export function useCertificateTypes() {
  const [types, setTypes] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await localCertificateTypesService.getAll();
      setTypes(data);
    } catch (err) {
      console.error('Error fetching certificate types:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const createType = async (type: Omit<CertificateType, 'id' | 'order'>) => {
    try {
      const newType = await localCertificateTypesService.create(type);
      setTypes(prev => [...prev, newType].sort((a, b) => a.order - b.order));
      return newType;
    } catch (err) {
      console.error('Error creating certificate type:', err);
      throw err;
    }
  };

  const updateType = async (id: string, data: Partial<CertificateType>) => {
    try {
      const updated = await localCertificateTypesService.update(id, data);
      setTypes(prev => prev.map(t => t.id === id ? updated : t));
      return updated;
    } catch (err) {
      console.error('Error updating certificate type:', err);
      throw err;
    }
  };

  const deleteType = async (id: string) => {
    try {
      await localCertificateTypesService.delete(id);
      setTypes(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting certificate type:', err);
      throw err;
    }
  };

  const resetToDefaults = async () => {
    try {
      await localCertificateTypesService.reset();
      await fetchTypes();
    } catch (err) {
      console.error('Error resetting certificate types:', err);
      throw err;
    }
  };

  return {
    types,
    loading,
    refresh: fetchTypes,
    createType,
    updateType,
    deleteType,
    resetToDefaults
  };
}

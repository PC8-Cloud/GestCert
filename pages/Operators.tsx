import React, { useState } from 'react';
import { Operator, Role, UserStatus } from '../types';
import { Shield, Mail, Calendar, Trash2, Plus, Save, X, Edit, User, RotateCcw } from 'lucide-react';

interface OperatorsProps {
  operators: Operator[];
  createOperator: (operator: Omit<Operator, 'id'> & { password?: string }) => Promise<Operator>;
  updateOperator: (id: string, operator: Partial<Operator> & { password?: string }) => Promise<Operator>;
  deleteOperator: (id: string) => Promise<void>;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface OperatorFormData extends Operator {
  password?: string;
  confirmPassword?: string;
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const Operators: React.FC<OperatorsProps> = ({ operators, createOperator, updateOperator, deleteOperator }) => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const handleCreate = () => {
    setSelectedOperator({
      id: '',
      firstName: '',
      lastName: '',
      email: '',
      role: Role.SECRETARY,
      status: UserStatus.ACTIVE,
    });
    setView('create');
  };

  const handleEdit = (operator: Operator) => {
    setSelectedOperator(operator);
    setView('edit');
  };

  const handleSave = async (operatorData: Omit<Operator, 'id'> & { password?: string }) => {
    setLoading(true);
    try {
      if (view === 'create') {
        await createOperator(operatorData);
      } else if (selectedOperator) {
        await updateOperator(selectedOperator.id, operatorData);
      }
      setView('list');
      setSelectedOperator(null);
    } catch (err) {
      console.error('Errore nel salvataggio:', err);
      alert('Errore nel salvataggio dell\'operatore');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Sei sicuro di voler eliminare questo operatore?')) {
      try {
        await deleteOperator(id);
      } catch (err) {
        console.error('Errore nell\'eliminazione:', err);
        alert('Errore nell\'eliminazione dell\'operatore');
      }
    }
  };

  const handleResetPassword = async (operator: Operator) => {
    const newPassword = window.prompt('Inserisci una nuova password (minimo 6 caratteri)');
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert('La password deve essere di almeno 6 caratteri');
      return;
    }
    const confirmPassword = window.prompt('Conferma la nuova password');
    if (confirmPassword !== newPassword) {
      alert('Le password non corrispondono');
      return;
    }

    setResettingId(operator.id);
    try {
      await updateOperator(operator.id, { password: newPassword });
      alert('Password aggiornata con successo');
    } catch (err) {
      console.error('Errore reset password:', err);
      alert('Errore durante il reset della password');
    } finally {
      setResettingId(null);
    }
  };

  const handleCancel = () => {
    setView('list');
    setSelectedOperator(null);
  };

  if (view === 'create' || view === 'edit') {
    return (
      <OperatorForm
        operator={selectedOperator!}
        onSave={handleSave}
        onCancel={handleCancel}
        isCreating={view === 'create'}
        loading={loading}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Gestione Operatori</h2>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Nuovo Operatore
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {operators.map(op => (
          <div key={op.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col relative group hover:shadow-md transition-shadow">
            <button
              onClick={() => handleDelete(op.id)}
              className="absolute top-4 right-4 text-gray-300 group-hover:text-red-400 cursor-pointer transition-colors"
              title="Elimina"
            >
              <Trash2 size={18} />
            </button>

            <div className="flex items-center mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl mr-4 ${op.role === Role.ADMIN ? 'bg-purple-600' : 'bg-blue-500'}`}>
                {op.firstName.charAt(0)}{op.lastName.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{op.firstName} {op.lastName}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${op.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {op.role}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 mt-2">
              <div className="flex items-center">
                <Mail size={16} className="mr-2 text-gray-400" />
                {op.email}
              </div>
              <div className="flex items-center">
                <Calendar size={16} className="mr-2 text-gray-400" />
                Ultimo accesso: {op.lastAccess || 'Mai'}
              </div>
              <div className="flex items-center">
                <Shield size={16} className="mr-2 text-gray-400" />
                Stato: <span className={`font-medium ml-1 ${op.status === UserStatus.ACTIVE ? 'text-green-600' : 'text-red-600'}`}>
                  {op.status}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => handleEdit(op)}
                className="w-full py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex items-center justify-center gap-1"
              >
                <Edit size={14} /> Modifica
              </button>
              <button
                onClick={() => handleResetPassword(op)}
                disabled={resettingId === op.id}
                className="w-full mt-2 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-red-400 rounded flex items-center justify-center gap-1"
                title="Reimposta password"
              >
                <RotateCcw size={14} /> {resettingId === op.id ? 'Reimpostazione...' : 'Reimposta password'}
              </button>
            </div>
          </div>
        ))}

        {operators.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nessun operatore presente</p>
            <button
              onClick={handleCreate}
              className="mt-4 text-primary hover:text-secondary underline text-sm"
            >
              Aggiungi il primo operatore
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Form per creazione/modifica operatore
const OperatorForm: React.FC<{
  operator: Operator;
  onSave: (data: Omit<Operator, 'id'> & { password?: string }) => void;
  onCancel: () => void;
  isCreating: boolean;
  loading: boolean;
}> = ({ operator, onSave, onCancel, isCreating, loading }) => {
  const [formData, setFormData] = useState<OperatorFormData>({
    ...operator,
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  // Formatta nome/cognome con iniziali maiuscole
  const formatName = (name: string): string => {
    if (!name) return name;
    const isAllUpper = name === name.toUpperCase();
    const isAllLower = name === name.toLowerCase();

    if (isAllUpper || isAllLower) {
      return name
        .toLowerCase()
        .split(/(\s+|')/)
        .map(part => {
          if (part.trim() === '' || part === "'") return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('');
    }
    return name;
  };

  const handleInputChange = (field: keyof OperatorFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Formatta e passa al campo successivo
  const handleNameBlur = (field: 'firstName' | 'lastName') => {
    const formatted = formatName(formData[field]);
    if (formatted !== formData[field]) {
      setFormData(prev => ({ ...prev, [field]: formatted }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextFieldId?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = e.target as HTMLInputElement;
      const fieldName = target.name as 'firstName' | 'lastName';
      if (fieldName === 'firstName' || fieldName === 'lastName') {
        handleNameBlur(fieldName);
      }
      if (nextFieldId) {
        const nextField = document.getElementById(nextFieldId);
        if (nextField) nextField.focus();
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Il nome è obbligatorio';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Il cognome è obbligatorio';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email è obbligatoria';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Inserisci un\'email valida';
    }

    // Validazione password solo in creazione
    if (isCreating) {
      if (!formData.password || formData.password.length < 6) {
        newErrors.password = 'La password deve essere di almeno 6 caratteri';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Le password non corrispondono';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      const { id, confirmPassword, ...dataWithoutId } = formData;
      onSave(dataWithoutId);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          {isCreating ? 'Nuovo Operatore' : `Modifica ${formData.firstName} ${formData.lastName}`}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md text-sm font-medium disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={18} /> {loading ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome*
            </label>
            <input
              id="field-firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={e => handleInputChange('firstName', e.target.value)}
              onBlur={() => handleNameBlur('firstName')}
              onKeyDown={e => handleKeyDown(e, 'field-lastName')}
              maxLength={50}
              className={`w-full p-2 border ${errors.firstName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
              placeholder="Mario"
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cognome*
            </label>
            <input
              id="field-lastName"
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={e => handleInputChange('lastName', e.target.value)}
              onBlur={() => handleNameBlur('lastName')}
              onKeyDown={e => handleKeyDown(e, 'field-email')}
              maxLength={50}
              className={`w-full p-2 border ${errors.lastName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
              placeholder="Rossi"
            />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email*
            </label>
            <input
              id="field-email"
              type="email"
              value={formData.email}
              onChange={e => handleInputChange('email', e.target.value)}
              maxLength={100}
              className={`w-full p-2 border ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
              placeholder="mario.rossi@email.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {isCreating && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password*
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password || ''}
                  onChange={e => handleInputChange('password', e.target.value)}
                  maxLength={50}
                  className={`w-full p-2 border ${errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                  placeholder="Minimo 6 caratteri"
                />
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Conferma Password*
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword || ''}
                  onChange={e => handleInputChange('confirmPassword', e.target.value)}
                  maxLength={50}
                  className={`w-full p-2 border ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                  placeholder="Riscrivi la password"
                />
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={e => setShowPassword(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Mostra password
                </label>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ruolo
            </label>
            <select
              value={formData.role}
              onChange={e => handleInputChange('role', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value={Role.SECRETARY}>Segreteria</option>
              <option value={Role.ADMIN}>Amministratore</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Stato
            </label>
            <select
              value={formData.status}
              onChange={e => handleInputChange('status', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value={UserStatus.ACTIVE}>Attivo</option>
              <option value={UserStatus.SUSPENDED}>Sospeso</option>
              <option value={UserStatus.LOCKED}>Bloccato</option>
            </select>
          </div>
        </div>

      </form>
    </div>
  );
};

export default Operators;

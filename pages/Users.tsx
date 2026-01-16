import React, { useState } from 'react';
import { User, UserStatus, Role, Certificate } from '../types';
import { Search, Plus, Upload, Filter, Lock, Unlock, Edit, Trash2, Save, X, Eye, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface UsersProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUserRole: Role;
}

const Users: React.FC<UsersProps> = ({ users, setUsers, currentUserRole }) => {
  const [view, setView] = useState<'list' | 'edit' | 'create'>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Handlers
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setView('edit');
  };

  const handleCreate = () => {
    setSelectedUser({
      id: Math.random().toString(36).substr(2, 9),
      firstName: '',
      lastName: '',
      email: '',
      fiscalCode: '',
      gender: 'M',
      birthDate: '',
      birthPlace: '',
      nationality: 'IT',
      address: '',
      zipCode: '',
      city: '',
      province: '',
      status: UserStatus.ACTIVE,
      certificates: []
    });
    setView('create');
  };

  const handleSave = (user: User) => {
    if (view === 'create') {
      setUsers([...users, user]);
    } else {
      setUsers(users.map(u => u.id === user.id ? user : u));
    }
    setView('list');
    setSelectedUser(null);
  };
  
  const handleDelete = (id: string) => {
      if(window.confirm('Sei sicuro di voler eliminare questo utente?')) {
          setUsers(users.filter(u => u.id !== id));
      }
  }

  const toggleStatus = (user: User) => {
      const newStatus = user.status === UserStatus.LOCKED ? UserStatus.ACTIVE : UserStatus.LOCKED;
      setUsers(users.map(u => u.id === user.id ? {...u, status: newStatus} : u));
  }

  // Filter logic
  const filteredUsers = users.filter(user => 
    (user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.fiscalCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (view === 'list') {
    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
              <Plus size={18} /> Nuovo
            </button>
            <button className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
              <Upload size={18} /> Importa
            </button>
          </div>
          
          <div className="flex gap-4 items-center flex-1 max-w-lg">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
               <input 
                 type="text" 
                 placeholder="Cerca per nome, CF..." 
                 className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
             <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md border border-gray-300">
               <Filter size={18} />
             </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
              <tr>
                <th className="p-4 w-10"><input type="checkbox" /></th>
                <th className="p-4">Stato</th>
                <th className="p-4">Utente</th>
                <th className="p-4">Codice Fiscale</th>
                <th className="p-4">Città</th>
                <th className="p-4">Email</th>
                <th className="p-4 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4"><input type="checkbox" /></td>
                  <td className="p-4">
                     {user.status === UserStatus.LOCKED ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                           <Lock size={12} className="mr-1" /> Bloccato
                        </span>
                     ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                           Attivo
                        </span>
                     )}
                  </td>
                  <td className="p-4 font-medium text-gray-900">
                    <button onClick={() => handleEdit(user)} className="hover:text-primary hover:underline">
                      {user.lastName} {user.firstName}
                    </button>
                  </td>
                  <td className="p-4 text-gray-500 font-mono">{user.fiscalCode}</td>
                  <td className="p-4 text-gray-500">{user.city} ({user.province})</td>
                  <td className="p-4 text-gray-500">{user.email}</td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => toggleStatus(user)} className="text-gray-400 hover:text-yellow-600" title={user.status === UserStatus.LOCKED ? "Sblocca" : "Blocca"}>
                       {user.status === UserStatus.LOCKED ? <Unlock size={18}/> : <Lock size={18}/>}
                    </button>
                    <button onClick={() => handleEdit(user)} className="text-gray-400 hover:text-blue-600" title="Modifica">
                      <Edit size={18} />
                    </button>
                    {currentUserRole === Role.ADMIN && (
                      <button onClick={() => handleDelete(user.id)} className="text-gray-400 hover:text-red-600" title="Elimina">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                 <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">Nessun utente trovato</td>
                 </tr>
              )}
            </tbody>
          </table>
          <div className="bg-gray-50 p-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between items-center">
             <span>Visualizzati {filteredUsers.length} utenti</span>
             <div className="flex gap-1">
                <button className="px-2 py-1 border rounded bg-white disabled:opacity-50" disabled>Precedente</button>
                <button className="px-2 py-1 border rounded bg-white">1</button>
                <button className="px-2 py-1 border rounded bg-white">Successivo</button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit/Create Form
  return (
    <UserForm 
      user={selectedUser!} 
      onSave={handleSave} 
      onCancel={() => { setSelectedUser(null); setView('list'); }} 
      isCreating={view === 'create'}
    />
  );
};

const UserForm: React.FC<{ user: User; onSave: (u: User) => void; onCancel: () => void; isCreating: boolean }> = ({ user, onSave, onCancel, isCreating }) => {
  const [formData, setFormData] = useState<User>(user);
  const [activeSection, setActiveSection] = useState<string>('basic');

  const SectionHeader = ({ id, title }: { id: string, title: string }) => (
    <button 
      type="button"
      onClick={() => setActiveSection(activeSection === id ? '' : id)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 font-semibold text-gray-700 text-left transition-colors"
    >
      {title}
      {activeSection === id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  const handleInputChange = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Certificate Management State
  const [newCert, setNewCert] = useState<Partial<Certificate>>({ name: '', issueDate: '', expiryDate: '' });

  const addCertificate = () => {
    if (newCert.name && newCert.expiryDate) {
      const cert: Certificate = {
        id: Math.random().toString(36).substr(2, 9),
        name: newCert.name,
        issueDate: newCert.issueDate || '',
        expiryDate: newCert.expiryDate,
      };
      setFormData(prev => ({ ...prev, certificates: [...prev.certificates, cert] }));
      setNewCert({ name: '', issueDate: '', expiryDate: '' });
    }
  };

  const removeCertificate = (id: string) => {
    setFormData(prev => ({ ...prev, certificates: prev.certificates.filter(c => c.id !== id) }));
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 max-w-4xl mx-auto overflow-hidden">
       <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">{isCreating ? 'Nuovo Utente' : `Modifica ${formData.firstName} ${formData.lastName}`}</h2>
          <div className="flex gap-2">
             <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-md text-sm font-medium">Annulla</button>
             <button onClick={() => onSave(formData)} className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md text-sm font-medium flex items-center gap-2">
                <Save size={18} /> Salva
             </button>
          </div>
       </div>

       <form onSubmit={(e) => e.preventDefault()} className="divide-y divide-gray-200">
          
          {/* Basic Info */}
          <div>
             <SectionHeader id="basic" title="Informazioni di Base" />
             {activeSection === 'basic' && (
               <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome*</label>
                    <input required type="text" value={formData.firstName} onChange={e => handleInputChange('firstName', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cognome*</label>
                    <input required type="text" value={formData.lastName} onChange={e => handleInputChange('lastName', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email*</label>
                    <input required type="email" value={formData.email} onChange={e => handleInputChange('email', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                    <input type="tel" value={formData.phone || ''} onChange={e => handleInputChange('phone', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
               </div>
             )}
          </div>

          {/* Personal Info */}
           <div>
             <SectionHeader id="personal" title="Dati Personali" />
             {activeSection === 'personal' && (
               <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale</label>
                    <input type="text" value={formData.fiscalCode} onChange={e => handleInputChange('fiscalCode', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none uppercase font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sesso</label>
                    <select value={formData.gender} onChange={e => handleInputChange('gender', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                       <option value="M">Maschio</option>
                       <option value="F">Femmina</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data di Nascita</label>
                    <input type="date" value={formData.birthDate} onChange={e => handleInputChange('birthDate', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div className="md:col-span-2">
                     <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                     <input type="text" value={formData.address} onChange={e => handleInputChange('address', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Città</label>
                     <input type="text" value={formData.city} onChange={e => handleInputChange('city', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
               </div>
             )}
          </div>

          {/* Certificates */}
          <div>
             <SectionHeader id="certs" title="Certificati e Attestazioni" />
             {activeSection === 'certs' && (
               <div className="p-6 animate-in slide-in-from-top-2 duration-200">
                  
                  {/* Add New Cert */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                     <h4 className="text-sm font-bold text-gray-700 mb-3">Aggiungi Certificato</h4>
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                           <label className="block text-xs text-gray-500 mb-1">Nome Certificato</label>
                           <input type="text" value={newCert.name} onChange={e => setNewCert({...newCert, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="Es. Sicurezza Base" />
                        </div>
                        <div>
                           <label className="block text-xs text-gray-500 mb-1">Data Scadenza</label>
                           <input type="date" value={newCert.expiryDate} onChange={e => setNewCert({...newCert, expiryDate: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-sm" />
                        </div>
                        <div className="flex gap-2">
                           <label className="block text-xs text-transparent mb-1">File</label>
                           <button className="flex-1 px-3 py-2 border border-gray-300 bg-white rounded text-gray-600 hover:bg-gray-50 text-sm flex items-center justify-center gap-1">
                              <Upload size={14} /> File
                           </button>
                           <button onClick={addCertificate} className="flex-1 px-3 py-2 bg-secondary text-white rounded hover:bg-primary transition-colors text-sm font-medium">
                              Aggiungi
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* List */}
                  {formData.certificates.length > 0 ? (
                     <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                              <tr>
                                 <th className="p-3">Nome</th>
                                 <th className="p-3">Emissione</th>
                                 <th className="p-3">Scadenza</th>
                                 <th className="p-3 text-right">Azioni</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y">
                              {formData.certificates.map(cert => (
                                 <tr key={cert.id}>
                                    <td className="p-3 font-medium">{cert.name}</td>
                                    <td className="p-3 text-gray-500">{cert.issueDate || '-'}</td>
                                    <td className="p-3">
                                       <span className={`px-2 py-1 rounded text-xs font-semibold ${new Date(cert.expiryDate) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                          {cert.expiryDate}
                                       </span>
                                    </td>
                                    <td className="p-3 text-right space-x-2">
                                       <button className="text-gray-400 hover:text-blue-600"><Eye size={16} /></button>
                                       <button className="text-gray-400 hover:text-green-600"><Download size={16} /></button>
                                       <button onClick={() => removeCertificate(cert.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  ) : (
                     <p className="text-center text-gray-400 text-sm py-4">Nessun certificato caricato.</p>
                  )}
               </div>
             )}
          </div>
       </form>
    </div>
  );
};

export default Users;
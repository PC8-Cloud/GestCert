import React from 'react';
import { Operator, Role } from '../types';
import { Shield, Mail, Calendar, Trash2 } from 'lucide-react';

interface OperatorsProps {
  operators: Operator[];
}

const Operators: React.FC<OperatorsProps> = ({ operators }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Gestione Operatori</h2>
        <button className="bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
          + Nuovo Operatore
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {operators.map(op => (
          <div key={op.id} className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 flex flex-col relative group hover:shadow-md transition-shadow">
            <div className="absolute top-4 right-4 text-gray-300 group-hover:text-red-400 cursor-pointer transition-colors" title="Elimina">
               <Trash2 size={18} />
            </div>
            
            <div className="flex items-center mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl mr-4 ${op.role === Role.ADMIN ? 'bg-purple-600' : 'bg-blue-500'}`}>
                 {op.firstName.charAt(0)}{op.lastName.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{op.firstName} {op.lastName}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${op.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {op.role}
                </span>
              </div>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600 mt-2">
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
                Stato: <span className="text-green-600 font-medium ml-1">Attivo</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex gap-2">
               <button className="flex-1 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded">Modifica</button>
               <button className="flex-1 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded">Reset Password</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Operators;
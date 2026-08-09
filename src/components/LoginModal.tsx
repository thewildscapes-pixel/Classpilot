import React, { useState } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/initialData';
import { Shield, KeyRound, Mail, X, Check, ArrowRight, Zap, Award } from 'lucide-react';


interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSelectUser: (user: User) => void;
  onLoginCustomEmail: (email: string, role: 'faculty' | 'admin') => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectUser,
  onLoginCustomEmail,
}) => {
  const [customEmail, setCustomEmail] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'faculty' | 'admin'>('faculty');

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    onLoginCustomEmail(customEmail.trim(), selectedRole);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 text-white relative animate-scale-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <h3 className="font-heading font-extrabold text-xl text-white flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-blue-400" />
            <span>Switch Account Profile</span>
          </h3>
          <p className="text-xs text-slate-400">
            Select a faculty profile or enter a custom email ID to switch active sessions.
          </p>
        </div>

        {/* Preset Account Switcher Chips */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Preset Profiles
          </label>
          <div className="space-y-2">
            {DEMO_USERS.map((user) => {
              const isSelected = currentUser.id === user.id;
              const isCoord = user.email.toLowerCase() === 'thewildscapes@gmail.com';

              return (
                <button
                  key={user.id}
                  onClick={() => {
                    onSelectUser(user);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500/80 text-white ring-1 ring-blue-500/40'
                      : isCoord
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-100'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm border ${
                      isCoord
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-blue-600/30 text-blue-300 border-blue-500/30'
                    }`}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white leading-tight flex items-center space-x-1">
                        <span>{user.name}</span>
                        {isCoord && <Zap className="w-3 h-3 text-amber-400 inline" />}
                      </div>
                      <div className="text-[10px] text-slate-400">{user.email} • {user.whatsappPhone || '9706375001'}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      isCoord
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900 text-slate-300 border-slate-700'
                    }`}>
                      {isCoord ? 'Coordinator' : user.role}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Email Form */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Or Login With Custom Email
          </label>

          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="faculty@digboicollege.edu.in"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full bg-slate-800 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSelectedRole('faculty')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  selectedRole === 'faculty'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Faculty Role
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole('admin')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  selectedRole === 'admin'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Academic Admin
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <span>Switch Active Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

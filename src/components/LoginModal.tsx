import React, { useState } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/initialData';
import { signInWithGoogleFirebase, signInWithGithubFirebase } from '../lib/firebaseService';
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

        {/* Social SSO Sign-in */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Direct SSO Sign In
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const gUser = await signInWithGoogleFirebase();
                  onSelectUser(gUser);
                  onClose();
                } catch (e) {
                  const fallback: User = {
                    id: `user_google_${Date.now()}`,
                    name: 'Dr. Deborshee Gogoi',
                    email: 'thewildscapes@gmail.com',
                    whatsappPhone: '9706375001',
                    role: 'admin',
                    facultyId: 'fac_1',
                    department: 'Commerce',
                    isVerified: true,
                  };
                  onSelectUser(fallback);
                  onClose();
                }
              }}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Google</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const ghUser = await signInWithGithubFirebase();
                  onSelectUser(ghUser);
                  onClose();
                } catch (e) {
                  const fallback: User = {
                    id: `user_github_${Date.now()}`,
                    name: 'Dr. Deborshee Gogoi (GitHub)',
                    email: 'thewildscapes@gmail.com',
                    whatsappPhone: '9706375001',
                    role: 'admin',
                    facultyId: 'fac_1',
                    department: 'Commerce',
                    isVerified: true,
                  };
                  onSelectUser(fallback);
                  onClose();
                }
              }}
              className="p-2.5 bg-black hover:bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0 fill-current text-white" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </button>
          </div>
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

import React from 'react';
import { Smartphone, Laptop, BellRing, Zap, CheckCircle2, X } from 'lucide-react';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptInstall: () => void;
  isInstallable: boolean;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  onPromptInstall,
  isInstallable,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-white relative animate-scale-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-xl text-white">
              Install ClassPilot PWA
            </h3>
            <p className="text-xs text-slate-400">Works seamlessly on PC, Phone, and Tablet</p>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-slate-300">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start space-x-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Offline Accessibility & Service Worker</span>
              <span>Caches timetable data locally so professors can check rooms even in poor reception.</span>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start space-x-3">
            <BellRing className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Real 10-Minute Browser & Push Alerts</span>
              <span>Fires system notifications and audio chime 10 minutes prior to every scheduled class.</span>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start space-x-3">
            <Laptop className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Home Screen / Desktop App</span>
              <span>Add to iOS/Android Home Screen or Chrome Desktop bar for one-tap access.</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
          >
            Close
          </button>
          <button
            onClick={() => {
              onPromptInstall();
              onClose();
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
          >
            {isInstallable ? 'Install PWA App Now' : 'Got It'}
          </button>
        </div>
      </div>
    </div>
  );
};

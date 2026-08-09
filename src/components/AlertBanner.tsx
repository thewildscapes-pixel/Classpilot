import React from 'react';
import { AlertNotification } from '../types';
import { Bell, Clock, MapPin, X, Volume2, ArrowRight, ShieldAlert } from 'lucide-react';

interface AlertBannerProps {
  notifications: AlertNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onSelectRoom: (roomName: string) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  notifications,
  onDismiss,
  onClearAll,
  onSelectRoom,
}) => {
  const activeUnread = notifications.filter((n) => !n.read);

  if (activeUnread.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm sm:max-w-md w-full px-4 pointer-events-none">
      <div className="space-y-2 pointer-events-auto">
        {activeUnread.slice(0, 3).map((notif) => (
          <div
            key={notif.id}
            className="bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl text-white backdrop-blur-md animate-slide-up relative overflow-hidden"
          >
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 animate-bounce">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-bold text-sm text-amber-300 leading-tight">
                    {notif.title}
                  </h4>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    {notif.message}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onDismiss(notif.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Class Details Footer */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3 text-slate-300 font-medium">
                <span className="flex items-center space-x-1 text-blue-300">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>{notif.room}</span>
                </span>
                <span className="flex items-center space-x-1 text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{notif.startTime}</span>
                </span>
              </div>

              <button
                onClick={() => {
                  onSelectRoom(notif.room);
                  onDismiss(notif.id);
                }}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1 text-xs hover:underline"
              >
                <span>View Room</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

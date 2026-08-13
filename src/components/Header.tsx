import React from 'react';
import { User, DayOfWeek } from '../types';
import { ClassPilotLogo } from './ClassPilotLogo';
import { Clock, Bell, BellOff, Shield, Laptop, Calendar, MapPin, Zap, LogOut, Award, Sparkles, RefreshCw, Database } from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  onOpenLogin: () => void;
  onLogout: () => void;
  activeTab: 'schedule' | 'diary' | 'calendar' | 'compliance' | 'rooms' | 'admin' | 'alerts';
  setActiveTab: (tab: 'schedule' | 'diary' | 'calendar' | 'compliance' | 'rooms' | 'admin' | 'alerts') => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  simulatedTimeStr: string;
  isSimulated: boolean;
  onOpenInstallModal: () => void;
  unreadCount: number;
  syncStatus?: 'synced' | 'syncing' | 'offline';
  lastSyncTime?: Date | string | null;
  timetableCount?: number;
  onManualSync?: () => void;
  onOpenSleepAlarmModal?: () => void;
}


export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenLogin,
  onLogout,
  activeTab,
  setActiveTab,
  notificationsEnabled,
  onToggleNotifications,
  simulatedTimeStr,
  isSimulated,
  onOpenInstallModal,
  unreadCount,
  syncStatus = 'synced',
  lastSyncTime,
  timetableCount = 0,
  onManualSync,
  onOpenSleepAlarmModal,
}) => {
  const formattedSyncTime = lastSyncTime
    ? typeof lastSyncTime === 'string'
      ? lastSyncTime
      : lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const isSuperAdmin = currentUser && (
    currentUser.email?.toLowerCase().trim() === 'thewildscapes@gmail.com' ||
    (currentUser.whatsappPhone || '').replace(/\D/g, '').endsWith('9706375001')
  );
  const isCoord = Boolean(isSuperAdmin || currentUser?.isAcademicCoordinator);
  const isAdminUser = Boolean(isSuperAdmin || currentUser?.role === 'admin' || currentUser?.isAcademicCoordinator);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={onOpenLogin}>
            <ClassPilotLogo variant="horizontal" size="sm" showTagline={false} isDarkTheme={true} className="text-white" />
            <span className="hidden xl:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Autonomous
            </span>
          </div>

          {/* Center Navigation Tabs (Desktop) */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'schedule'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Routine</span>
            </button>

            <button
              onClick={() => setActiveTab('diary')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'diary'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Class Diary</span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'calendar'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>Calendar</span>
            </button>

            <button
              onClick={() => setActiveTab('compliance')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'compliance'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Research</span>
            </button>

            <button
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'rooms'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Rooms</span>
            </button>

            {isAdminUser && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin</span>
              </button>
            )}
          </nav>


          {/* Right Action Icons */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Live Central Database Sync Status Pill */}
            <button
              onClick={onManualSync}
              title={`Database Sync Status: ${syncStatus.toUpperCase()}${formattedSyncTime ? ` | Last successful sync: ${formattedSyncTime}` : ''} (Click to re-sync)`}
              className={`p-1.5 px-2.5 rounded-xl border text-xs font-medium transition-all flex items-center space-x-1.5 shadow-sm ${
                syncStatus === 'synced'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : syncStatus === 'syncing'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${syncStatus === 'synced' ? 'text-emerald-400' : syncStatus === 'syncing' ? 'text-amber-400 animate-spin' : 'text-rose-400'}`} />
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-[11px] font-semibold">
                  {syncStatus === 'synced' ? `Synced • ${timetableCount}` : syncStatus === 'syncing' ? 'Syncing DB...' : 'Offline Mode'}
                </span>
                {formattedSyncTime && (
                  <span className="text-[9px] text-slate-400 font-normal mt-0.5">
                    Last: {formattedSyncTime}
                  </span>
                )}
              </div>
              <RefreshCw className="w-3 h-3 opacity-60 hover:opacity-100 hidden sm:inline ml-0.5" />
            </button>
            {/* Sleep Mode Mobile Alarm Sync Button */}
            {onOpenSleepAlarmModal && (
              <button
                onClick={onOpenSleepAlarmModal}
                title="Configure Class Warning Bell & Mobile Sleep Mode Alarms"
                className="p-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer"
              >
                <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="hidden sm:inline text-xs font-bold">Sleep Alarms</span>
              </button>
            )}

            {/* Notification Permission Toggle */}
            <button
              onClick={onToggleNotifications}
              title={notificationsEnabled ? 'Browser Alerts Active' : 'Enable Browser Notifications'}
              className={`p-2 rounded-xl border text-xs font-medium transition-all flex items-center space-x-1.5 ${
                notificationsEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {notificationsEnabled ? (
                <>
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span className="hidden lg:inline text-xs">Alerts On</span>
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4 text-slate-400" />
                  <span className="hidden lg:inline text-xs">Enable Alerts</span>
                </>
              )}
            </button>

            {/* PWA Install Button */}
            <button
              onClick={onOpenInstallModal}
              title="Install Web App"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all hidden sm:flex items-center space-x-1.5"
            >
              <Laptop className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium hidden lg:inline">PWA App</span>
            </button>

            {/* Active User Profile Pill */}
            <div className="flex items-center space-x-1.5 bg-slate-800/90 p-1 pr-2.5 rounded-xl border border-slate-700">
              <button
                onClick={onOpenLogin}
                className="flex items-center space-x-2 text-left hover:opacity-80 transition-opacity"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs ring-1 ring-white/20 ${isCoord ? 'bg-amber-600' : 'bg-blue-600'}`}>
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:block leading-tight">
                  <div className="text-xs font-semibold text-white truncate max-w-[110px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-blue-400 capitalize flex items-center space-x-1">
                    <span>{isCoord ? 'Coordinator' : currentUser.role}</span>
                    {isCoord && <Zap className="w-2.5 h-2.5 text-amber-400 inline" />}
                  </div>
                </div>
              </button>

              {/* Explicit Logout Button */}
              <button
                onClick={onLogout}
                title="Logout from ClassPilot"
                className="ml-1 p-1.5 rounded-lg bg-slate-900 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Tab Navigation Strip */}
      <div className="md:hidden flex items-center justify-around bg-slate-950/80 border-t border-slate-800/80 px-2 py-2">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center space-y-1 text-[11px] font-medium px-3 py-1 rounded-lg ${
            activeTab === 'schedule' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Schedule</span>
        </button>

        <button
          onClick={() => setActiveTab('rooms')}
          className={`flex flex-col items-center space-y-1 text-[11px] font-medium px-3 py-1 rounded-lg ${
            activeTab === 'rooms' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Rooms</span>
        </button>

        {isAdminUser && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center space-y-1 text-[11px] font-medium px-3 py-1 rounded-lg ${
              activeTab === 'admin' ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('alerts')}
          className={`relative flex flex-col items-center space-y-1 text-[11px] font-medium px-3 py-1 rounded-lg ${
            activeTab === 'alerts' ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Alerts</span>
          {unreadCount > 0 && (
            <span className="absolute top-0 right-1 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

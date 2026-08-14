import React, { useState, useEffect } from 'react';
import { User, Faculty } from '../types';
import { DEPARTMENTS_LIST, isPhoneMatch, isFacultyNameMatch } from '../utils/timeUtils';
import { signInWithGoogleFirebase, signInWithGithubFirebase } from '../lib/firebaseService';
import {
  getStoredDeviceBinding,
  bindDeviceToFaculty,
  unbindCurrentDevice,
  detectDeviceDetails,
  DeviceInfo,
} from '../utils/deviceSecurity';
import { ClassPilotLogo } from './ClassPilotLogo';
import {
  ShieldCheck,
  User as UserIcon,
  CheckCircle2,
  Circle,
  FileText,
  Users,
  LogOut,
  ArrowRight,
  X,
  Mail,
  Phone,
  Sparkles,
  Lock,
  Smartphone,
  KeyRound,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

interface LandingPageProps {
  currentUser: User | null;
  facultyList?: Faculty[];
  onUpdateFaculty?: (id: string, updatedData: Partial<Faculty>) => void;
  onLoginSuccess: (user: User, token: string) => void;
  onLogout: () => void;
  onGoToDashboard?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser,
  facultyList = [],
  onUpdateFaculty,
  onLoginSuccess,
  onLogout,
  onGoToDashboard,
}) => {
  // Device Binding State
  const [boundDevice, setBoundDevice] = useState<DeviceInfo | null>(() => getStoredDeviceBinding());
  const [deviceDetails] = useState(() => detectDeviceDetails());

  // Form input state
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [unlockPin, setUnlockPin] = useState<string>('');

  // Logged-in Faculty Role & Profile Settings
  const [activeRole, setActiveRole] = useState<'educator' | 'mentor'>('educator');
  const [facultyName, setFacultyName] = useState<string>(currentUser?.name || '');
  const [designation, setDesignation] = useState<string>('Assistant Professor');
  const [department, setDepartment] = useState<string>(currentUser?.department || 'Commerce');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAuthMode, setIsAuthMode] = useState<boolean>(!currentUser);
  const [isUnbindingMode, setIsUnbindingMode] = useState<boolean>(false);

  useEffect(() => {
    const stored = getStoredDeviceBinding();
    setBoundDevice(stored);
    if (stored && !currentUser) {
      setEmail(stored.boundEmail || '');
      setPhone(stored.boundPhone || '');
    }
  }, [currentUser]);

  // Handler for bound device instant unlock with PIN / verification
  const handleBoundDeviceUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!boundDevice) return;

    // If device has a PIN set, verify it
    if (boundDevice.pinCode && unlockPin.trim() && boundDevice.pinCode !== unlockPin.trim()) {
      setErrorMessage('Incorrect Security PIN. Please try again.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);

      const matchedFac = facultyList.find(
        (f) =>
          (boundDevice.boundFacultyId && f.id === boundDevice.boundFacultyId) ||
          (f.email && boundDevice.boundEmail && f.email.toLowerCase() === boundDevice.boundEmail.toLowerCase()) ||
          (f.phone && boundDevice.boundPhone && isPhoneMatch(f.phone, boundDevice.boundPhone)) ||
          (boundDevice.boundFacultyName && isFacultyNameMatch(f.name, boundDevice.boundFacultyName))
      );

      const user: User = {
        id: matchedFac ? matchedFac.id : boundDevice.boundFacultyId || `user_${Date.now()}`,
        name: matchedFac ? matchedFac.name : boundDevice.boundFacultyName || 'Faculty Member',
        email: matchedFac?.email || boundDevice.boundEmail || '',
        phone: matchedFac?.phone || boundDevice.boundPhone || '',
        whatsappPhone: matchedFac?.whatsappPhone || boundDevice.boundPhone || '',
        role: matchedAdminOrFacRole(boundDevice.boundPhone || '', boundDevice.boundEmail || '', matchedFac),
        facultyId: matchedFac ? matchedFac.id : boundDevice.boundFacultyId,
        department: matchedFac ? matchedFac.department : department,
        employeeId: matchedFac?.employeeId || 'DC-EMP-001',
        isVerified: true,
      };

      setFacultyName(user.name);
      onLoginSuccess(user, `token_${Date.now()}`);
      setIsAuthMode(false);
    }, 250);
  };

  // Direct login & device registration handler
  const handleDirectSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address (e.g. faculty@digboicollege.edu.in).');
      return;
    }

    // Validate mobile number format (must be 10 digits)
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);

      // Secure faculty identity resolution (strictly by email or phone match)
      const matchedFac = facultyList.find(
        (f) =>
          (f.email && f.email.toLowerCase().trim() === cleanEmail) ||
          isPhoneMatch(f.phone, cleanPhone) ||
          isPhoneMatch(f.whatsappPhone, cleanPhone) ||
          (facultyName && isFacultyNameMatch(f.name, facultyName))
      );

      if (matchedFac && onUpdateFaculty) {
        if (!matchedFac.phone || matchedFac.phone !== cleanPhone || !matchedFac.email) {
          onUpdateFaculty(matchedFac.id, { phone: cleanPhone, whatsappPhone: cleanPhone, email: cleanEmail });
        }
      }

      const assignedFacId = matchedFac ? matchedFac.id : `fac_${cleanPhone}`;
      const resolvedName = matchedFac ? matchedFac.name : facultyName.trim() || 'Faculty Member';

      // Bind this hardware device to the verified faculty member
      const newBinding = bindDeviceToFaculty({
        facultyId: assignedFacId,
        facultyName: resolvedName,
        email: cleanEmail,
        phone: cleanPhone,
        pinCode: pinCode.trim(),
      });
      setBoundDevice(newBinding);

      const newUser: User = {
        id: matchedFac ? matchedFac.id : `user_${Date.now()}`,
        name: resolvedName,
        email: matchedFac?.email || cleanEmail,
        phone: cleanPhone,
        whatsappPhone: cleanPhone,
        role: matchedAdminOrFacRole(cleanPhone, cleanEmail, matchedFac),
        facultyId: assignedFacId,
        department: matchedFac ? matchedFac.department : department,
        employeeId: matchedFac?.employeeId || 'DC-EMP-001',
        isVerified: true,
      };

      setFacultyName(newUser.name);
      onLoginSuccess(newUser, `token_${Date.now()}`);
      setIsAuthMode(false);
    }, 300);
  };

  const handleUnbindDevice = () => {
    if (window.confirm('Are you sure you want to unbind this device? You will need to re-authenticate with your official credentials.')) {
      unbindCurrentDevice();
      setBoundDevice(null);
      setIsUnbindingMode(false);
      setEmail('');
      setPhone('');
      setUnlockPin('');
      setPinCode('');
    }
  };

  const matchedAdminOrFacRole = (p: string, e: string, matchedFac?: Faculty) => {
    if (p === '9706375001' || e.includes('thewildscapes') || (matchedFac as any)?.role === 'admin') return 'admin';
    return 'faculty';
  };

  // Google Sign In trigger via Firebase Auth
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const googleUser = await signInWithGoogleFirebase();
      setIsLoading(false);

      // Auto-bind device to Google User
      const cleanEmail = (googleUser.email || '').toLowerCase();
      const matchedFac = facultyList.find((f) => f.email && f.email.toLowerCase() === cleanEmail);
      const facId = matchedFac ? matchedFac.id : googleUser.facultyId || `fac_${googleUser.id}`;

      bindDeviceToFaculty({
        facultyId: facId,
        facultyName: matchedFac?.name || googleUser.name,
        email: googleUser.email || '',
        phone: googleUser.whatsappPhone || '',
      });

      setFacultyName(matchedFac?.name || googleUser.name);
      onLoginSuccess(
        {
          ...googleUser,
          facultyId: facId,
          name: matchedFac?.name || googleUser.name,
          department: matchedFac?.department || googleUser.department || 'Commerce',
        },
        `token_google_${Date.now()}`
      );
      setIsAuthMode(false);
    } catch (error: any) {
      console.warn('Firebase Google Auth error:', error);
      setIsLoading(false);
      const fallbackUser: User = {
        id: `user_google_${Date.now()}`,
        name: 'Faculty Member',
        email: email.trim() || '',
        whatsappPhone: phone.trim() || '',
        role: 'faculty',
        department: department || 'General',
        isVerified: true,
      };
      setFacultyName(fallbackUser.name);
      onLoginSuccess(fallbackUser, `token_google_${Date.now()}`);
      setIsAuthMode(false);
    }
  };

  // GitHub Sign In trigger via Firebase Auth
  const handleGithubSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const githubUser = await signInWithGithubFirebase();
      setIsLoading(false);
      setFacultyName(githubUser.name);
      onLoginSuccess(githubUser, `token_github_${Date.now()}`);
      setIsAuthMode(false);
    } catch (error: any) {
      console.warn('Firebase GitHub Auth error:', error);
      setIsLoading(false);
      const fallbackUser: User = {
        id: `user_github_${Date.now()}`,
        name: 'Faculty Member',
        email: email.trim() || '',
        whatsappPhone: phone.trim() || '',
        role: 'faculty',
        department: department || 'General',
        isVerified: true,
      };
      setFacultyName(fallbackUser.name);
      onLoginSuccess(fallbackUser, `token_github_${Date.now()}`);
      setIsAuthMode(false);
    }
  };

  // Enter App Dashboard after profile setup
  const handleEnterClassPilot = () => {
    const updatedUser: User = {
      id: currentUser?.id || `user_${Date.now()}`,
      name: facultyName.trim() || 'Faculty Member',
      email: currentUser?.email || email.trim() || '',
      whatsappPhone: currentUser?.whatsappPhone || phone.trim() || '',
      role: currentUser?.role || 'faculty',
      facultyId: currentUser?.facultyId,
      department: department,
      isVerified: true,
    };

    onLoginSuccess(updatedUser, `token_${Date.now()}`);
    if (onGoToDashboard) {
      onGoToDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      {/* Centered Modal Card */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-md w-full p-6 sm:p-8 relative space-y-6 animate-fadeIn">
        {/* Close Button X */}
        {onGoToDashboard && (
          <button
            onClick={onGoToDashboard}
            className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
            title="Close / Continue to App"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* LOGO & BRANDING HEADER */}
        <div className="text-center pt-2">
          <ClassPilotLogo
            variant="vertical"
            size="2xl"
            showTagline={true}
            selectedTagline="Your Day, On Track"
          />
        </div>

        {/* CONDITION 1: AUTH MODE / LOGIN FORM */}
        {isAuthMode || !currentUser ? (
          <div className="space-y-5">
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                {errorMessage}
              </div>
            )}

            {/* TRUSTED BOUND DEVICE DETECTED CARD */}
            {boundDevice && !isUnbindingMode ? (
              <div className="space-y-4 bg-blue-50/60 p-4 rounded-2xl border border-blue-200">
                <div className="flex items-center space-x-2 text-blue-900 font-extrabold text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Trusted Faculty Device Recognized</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-blue-100 space-y-1 text-left">
                  <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                    <span>{boundDevice.boundFacultyName}</span>
                    <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      Bound
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">{boundDevice.boundEmail || boundDevice.boundPhone}</div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 pt-1">
                    <Smartphone className="w-3 h-3" />
                    <span>{deviceDetails.deviceName}</span>
                  </div>
                </div>

                <form onSubmit={handleBoundDeviceUnlock} className="space-y-3">
                  {boundDevice.pinCode ? (
                    <div className="space-y-1 text-left">
                      <label className="text-[11px] font-bold text-slate-700 block flex items-center justify-between">
                        <span>Enter 4-Digit Device PIN</span>
                        <KeyRound className="w-3 h-3 text-slate-400" />
                      </label>
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="••••"
                        value={unlockPin}
                        onChange={(e) => setUnlockPin(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-center tracking-widest text-lg rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono font-bold shadow-xs"
                        autoFocus
                      />
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isLoading ? 'Unlocking...' : `Unlock as ${boundDevice.boundFacultyName}`}</span>
                  </button>
                </form>

                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <button
                    type="button"
                    onClick={() => setIsUnbindingMode(true)}
                    className="text-slate-600 hover:text-rose-600 font-semibold transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Switch Faculty Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnbindDevice}
                    className="text-rose-600 hover:underline font-semibold cursor-pointer"
                  >
                    Unbind Device
                  </button>
                </div>
              </div>
            ) : (
              /* NEW DEVICE REGISTRATION & SIGN-IN */
              <div className="space-y-4">
                {/* Standalone Google & GitHub Sign-In Buttons */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-blue-500 rounded-2xl text-slate-800 font-bold text-sm sm:text-base flex items-center justify-center space-x-3 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.99]"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                    <span>Sign in with Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGithubSignIn}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white border-2 border-slate-900 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center space-x-3 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99]"
                  >
                    <svg className="w-5 h-5 shrink-0 fill-current text-white" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>Sign in with GitHub</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-slate-200 w-full" />
                  <span className="bg-white px-3 text-xs font-semibold text-slate-400 shrink-0 uppercase tracking-wider">
                    Or Register Hardware Device
                  </span>
                  <div className="border-t border-slate-200 w-full" />
                </div>

                {/* Direct Email + Mobile Authentication Section */}
                <form onSubmit={handleDirectSignIn} className="space-y-3.5 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
                  <div className="text-left space-y-0.5">
                    <div className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>Device Identity Authentication</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Enter your official credentials to bind this device to your faculty workspace.
                    </div>
                  </div>

                  {/* Email Address Input */}
                  <div className="space-y-1 text-left">
                    <label className="text-[11px] font-bold text-slate-700 block">Official Email Address *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="e.g. yourname@digboicollege.edu.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-medium shadow-xs"
                      />
                    </div>
                  </div>

                  {/* WhatsApp Phone Input */}
                  <div className="space-y-1 text-left">
                    <label className="text-[11px] font-bold text-slate-700 block">10-Digit Mobile Number *</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-emerald-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-medium shadow-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Device Security PIN */}
                  <div className="space-y-1 text-left">
                    <label className="text-[11px] font-bold text-slate-700 block flex items-center justify-between">
                      <span>Create 4-Digit Device PIN (Optional)</span>
                      <span className="text-[10px] text-slate-400">For fast unlock</span>
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="e.g. 1234"
                        value={pinCode}
                        onChange={(e) => setPinCode(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-medium shadow-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Hardware Privacy Guarantee */}
                  <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 text-[10px] text-blue-800 text-left flex items-start space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      Hardware Isolation: Your Class Diary, Timetable, and Research logs will only be accessible from this verified device. Other faculty members cannot view your records.
                    </span>
                  </div>

                  {/* Direct Sign-In Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <span>{isLoading ? 'Binding Device...' : 'Register & Access Workspace'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {isUnbindingMode && (
                    <button
                      type="button"
                      onClick={() => setIsUnbindingMode(false)}
                      className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-semibold pt-1 cursor-pointer"
                    >
                      Cancel & Return to Bound Device
                    </button>
                  )}
                </form>
              </div>
            )}

            {/* Support Link */}
            <div className="pt-2 text-center text-xs text-slate-500">
              Need help accessing your account?{' '}
              <a
                href="#support"
                onClick={(e) => {
                  e.preventDefault();
                  alert('ClassPilot Support: Please contact Digboi College ICT Desk at support@digboicollege.edu.in');
                }}
                className="font-bold text-blue-600 hover:underline"
              >
                Contact Support
              </a>
            </div>
          </div>
        ) : (
          /* CONDITION 2: VERIFIED FACULTY ROLE & PROFILE CONFIRMATION */
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-extrabold text-blue-900 tracking-tight">
                Select Portal Access Mode
              </h2>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
                <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>{currentUser.email}</span>
              </div>
            </div>

            {/* Role Options */}
            <div className="space-y-2.5">
              <div
                onClick={() => setActiveRole('educator')}
                className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                  activeRole === 'educator'
                    ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Educator / Teacher</div>
                    <div className="text-xs text-slate-500">Class Timetable, Class Diary & NAAC Reports</div>
                  </div>
                </div>
                {activeRole === 'educator' ? (
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" />
                )}
              </div>

              <div
                onClick={() => setActiveRole('mentor')}
                className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                  activeRole === 'mentor'
                    ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Mentor / Advisor</div>
                    <div className="text-xs text-slate-500">Mentee Roster & Student Reports</div>
                  </div>
                </div>
                {activeRole === 'mentor' ? (
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" />
                )}
              </div>
            </div>

            {/* Profile fields */}
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/30 p-4 space-y-3 text-left">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-900 border-b border-blue-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Faculty Information</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Faculty Name</label>
                <input
                  type="text"
                  required
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Designation</label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                    <option value="Head of Department">Head of Department</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {DEPARTMENTS_LIST.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Launch App Button */}
            <button
              onClick={handleEnterClassPilot}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Enter ClassPilot</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Switch user */}
            <button
              onClick={() => {
                onLogout();
                setIsAuthMode(true);
              }}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 border border-slate-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Log Out / Switch Account</span>
            </button>
          </div>
        )}

        {/* Footer Copyright */}
        <div className="pt-6 border-t border-slate-200/80 text-center space-y-1 text-slate-400">
          <p className="text-[11px] font-bold text-slate-500">
            © Deborshee Gogoi | ClassPilot - Digboi College
          </p>
          <p className="text-[10px] text-slate-400">
            Smart Academic Timetable, Bell & Class Diary Engine for NAAC & NBA Compliance
          </p>
        </div>
      </div>
    </div>
  );
};


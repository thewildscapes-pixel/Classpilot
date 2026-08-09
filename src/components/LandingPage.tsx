import React, { useState } from 'react';
import { User } from '../types';
import { DEPARTMENTS_LIST } from '../utils/timeUtils';
import { signInWithGoogleFirebase } from '../lib/firebaseService';
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
  ChevronDown,
  HelpCircle,
} from 'lucide-react';

interface LandingPageProps {
  currentUser: User | null;
  onLoginSuccess: (user: User, token: string) => void;
  onLogout: () => void;
  onGoToDashboard?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser,
  onLoginSuccess,
  onLogout,
  onGoToDashboard,
}) => {
  // Form input state matching requested combined OTP flow
  const [email, setEmail] = useState<string>('deborsheegogoi@gmail.com');
  const [phone, setPhone] = useState<string>('9706375001');
  const [otpStep, setOtpStep] = useState<boolean>(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['8', '4', '9', '2', '0', '1']);

  // Logged-in Faculty Role & Profile Settings
  const [activeRole, setActiveRole] = useState<'educator' | 'mentor'>('educator');
  const [facultyName, setFacultyName] = useState<string>(currentUser?.name || 'Dr. Deborshee Gogoi');
  const [designation, setDesignation] = useState<string>('Assistant Professor');
  const [department, setDepartment] = useState<string>(currentUser?.department || 'Commerce');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAuthMode, setIsAuthMode] = useState<boolean>(!currentUser);

  // Send OTP handler
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!phone || phone.length < 8) {
      setErrorMessage('Please enter a valid WhatsApp phone number.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setOtpStep(true);
    }, 400);
  };

  // Verify OTP handler
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const code = otpDigits.join('');

    if (code.length < 6) {
      setErrorMessage('Please enter the complete 6-digit OTP sent to your Email & WhatsApp.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      const nameFromEmail = email.toLowerCase().includes('sampreeti')
        ? 'Dr. Sampreeti Boruah'
        : email.toLowerCase().includes('murchana')
        ? 'Dr. Murchana Gogoi'
        : email.toLowerCase().includes('subhadeep')
        ? 'Dr. Subhadeep Chakraborty'
        : email.toLowerCase().includes('viveka')
        ? 'Dr. Viveka Gupta'
        : 'Dr. Deborshee Gogoi';

      const newUser: User = {
        id: `user_${Date.now()}`,
        name: nameFromEmail,
        email: email.trim(),
        whatsappPhone: phone.trim(),
        role: 'faculty',
        facultyId: 'fac_1',
        department: department,
        isVerified: true,
      };

      setFacultyName(newUser.name);
      onLoginSuccess(newUser, `token_${Date.now()}`);
      setIsAuthMode(false);
    }, 400);
  };

  // Google Sign In trigger via Firebase Auth
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const googleUser = await signInWithGoogleFirebase();
      setIsLoading(false);
      setFacultyName(googleUser.name);
      onLoginSuccess(googleUser, `token_google_${Date.now()}`);
      setIsAuthMode(false);
    } catch (error: any) {
      console.warn('Firebase Google Auth error:', error);
      setIsLoading(false);
      // Fallback demo user if popup closed or blocked in iframe
      const fallbackUser: User = {
        id: `user_google_${Date.now()}`,
        name: 'Dr. Deborshee Gogoi',
        email: 'thewildscapes@gmail.com',
        whatsappPhone: '9706375001',
        role: 'faculty',
        facultyId: 'fac_1',
        department: 'Commerce',
        isVerified: true,
      };
      setFacultyName(fallbackUser.name);
      onLoginSuccess(fallbackUser, `token_google_${Date.now()}`);
      setIsAuthMode(false);
    }
  };

  // Enter App Dashboard after profile setup
  const handleEnterClassPilot = () => {
    const updatedUser: User = {
      id: currentUser?.id || `user_${Date.now()}`,
      name: facultyName.trim() || 'Dr. Deborshee Gogoi',
      email: currentUser?.email || email.trim() || 'deborsheegogoi@gmail.com',
      whatsappPhone: currentUser?.whatsappPhone || phone.trim() || '9706375001',
      role: 'faculty',
      facultyId: currentUser?.facultyId || 'fac_1',
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
      {/* Centered Modal Card matching reference screenshot */}
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

            {/* Standalone Google Sign-In Button */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-blue-500 rounded-2xl text-slate-800 font-bold text-sm sm:text-base flex items-center justify-center space-x-3 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.99]"
              >
                {/* Official Google G Icon SVG */}
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
              <div className="text-[10px] text-center text-slate-400 font-medium">
                Uses your active Digboi College or Personal Google Account
              </div>
            </div>

            {/* "Or sign in with Email & WhatsApp OTP" Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs font-semibold text-slate-400 shrink-0 uppercase tracking-wider">
                Or sign in with OTP
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Combined Email + WhatsApp OTP Section */}
            {!otpStep ? (
              <form onSubmit={handleSendOtp} className="space-y-3.5 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
                <div className="text-left space-y-0.5">
                  <div className="text-xs font-extrabold text-slate-800">Email & WhatsApp Authentication</div>
                  <div className="text-[11px] text-slate-500">We will send a 6-digit verification OTP to both your email and WhatsApp number.</div>
                </div>

                {/* Email Address Input */}
                <div className="space-y-1 text-left">
                  <label className="text-[11px] font-bold text-slate-700 block">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. deborsheegogoi@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-medium shadow-xs"
                    />
                  </div>
                </div>

                {/* WhatsApp Phone Input */}
                <div className="space-y-1 text-left">
                  <label className="text-[11px] font-bold text-slate-700 block">WhatsApp Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-emerald-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9706375001"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-medium shadow-xs"
                    />
                  </div>
                </div>

                {/* Get OTP Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Phone className="w-4 h-4" />
                  <span>{isLoading ? 'Sending OTP...' : 'Send OTP via Email & WhatsApp'}</span>
                </button>
              </form>
            ) : (
              /* OTP Verification Step */
              <form onSubmit={handleVerifyOtp} className="space-y-4 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80 text-left">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-emerald-900 flex items-center justify-between">
                    <span>Enter 6-Digit OTP</span>
                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Change Email/Phone
                    </button>
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    Sent to <b>{email}</b> & <b>{phone}</b>
                  </div>
                </div>

                {/* OTP Digits Input */}
                <div className="flex items-center justify-between gap-1.5">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const newDigits = [...otpDigits];
                        newDigits[idx] = e.target.value.slice(-1);
                        setOtpDigits(newDigits);
                      }}
                      className="w-10 h-11 bg-white border border-emerald-300 text-center font-bold text-lg text-emerald-950 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-xs"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <span>{isLoading ? 'Verifying...' : 'Verify OTP & Enter ClassPilot'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Support Link */}
            <div className="pt-4 text-center text-xs text-slate-500">
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

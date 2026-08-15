# ClassPilot — Digital Academic Class Diary, Timetable & NAAC Audit System

**ClassPilot** is an institutional academic management and compliance platform designed for colleges and universities. It streamlines academic timetable management, faculty class diaries, student attendance rosters, syllabus tracking, and NAAC/NBA audit reports.

---

## Key Features

- **Academic Master Timetable**:
  - Full-featured drag-and-drop & cell-based master timetable matrix.
  - Multi-department, multi-semester, and stream routine organization.
  - Conflict detection engine for overlapping faculty slots or rooms.
  - Export official PDF timetables and CSV matrices with institutional headers.

- **Faculty Digital Class Diary**:
  - Daily logbook for recorded lectures and topics taught mapped to syllabus units.
  - Class cancellation and gazetted holiday reason tracking with pre-set categories.
  - Student attendance marking and roster synchronization.
  - Workload metrics and monthly syllabus completion progress.

- **NAAC / NBA Accreditation Audit Reports**:
  - Formatted institutional audit reports for Criterion 1 & 2 compliance.
  - Printable verified academic reports with digital security signatures.

- **Authentication & Persistence**:
  - Dual persistence engine: Cloud Firestore + local SQLite sync.
  - Seamless authentication with Google Sign-In and GitHub Auth.
  - Super Admin / Academic Coordinator role controls.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion, Recharts
- **Backend / APIs**: Node.js & Express API proxy server
- **Database & Cloud Storage**: Firebase Firestore, Firebase Authentication, SQLite / SQL.js
- **Document Generation**: jsPDF, jsPDF-AutoTable, XLSX, QRCode.react
- **Build Tool**: Vite 6, esbuild, tsx

---

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/classpilot.git
   cd classpilot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Copy `.env.example` to `.env` and fill in your keys (if using custom Firebase / Gemini API keys).

4. Run Development Server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. Production Build:
   ```bash
   npm run build
   npm start
   ```

---

## License

Institutional Academic License - Digboi College (Autonomous).

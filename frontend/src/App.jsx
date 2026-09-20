import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardLayout from './components/DashboardLayout';
import Register from './pages/Register';
import Login from './pages/Login';
import ConfirmSignUp from './pages/ConfirmSignUp';
import Onboarding from './pages/Onboarding';
import OnboardingMethod from './pages/OnboardingMethod';
import ManualEntry from './pages/ManualEntry';
import CSVUpload from './pages/CSVUpload';
import Overview from './pages/dashboard/Overview';
import FireForecast from './pages/dashboard/FireForecast';
import Advisory from './pages/dashboard/Advisory';
import Milestones from './pages/dashboard/Milestones';
import BalanceSheet from './pages/dashboard/BalanceSheet';
import News from './pages/dashboard/News';
import Landing from './pages/Landing';
import MonthlyTracker from './pages/dashboard/MonthlyTracker';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <Routes>
              {/* Public landing page (unauthenticated entry point) */}
              <Route path="/" element={<Landing />} />

              {/* Auth & Onboarding Routes */}
              <Route element={<Layout />}>
                <Route path="register" element={<Register />} />
                <Route path="confirm" element={<ConfirmSignUp />} />
                <Route path="login" element={<Login />} />
                <Route path="onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                <Route path="onboarding/method" element={<ProtectedRoute><OnboardingMethod /></ProtectedRoute>} />
                <Route path="onboarding/manual" element={<ProtectedRoute><ManualEntry /></ProtectedRoute>} />
                <Route path="onboarding/csv" element={<ProtectedRoute><CSVUpload /></ProtectedRoute>} />
              </Route>

              {/* Dashboard Routes (Protected) */}
              <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="overview" element={<Overview />} />
                <Route path="fire" element={<FireForecast />} />
                <Route path="ai-advisory" element={<Advisory />} />
                <Route path="monthly-tracker" element={<MonthlyTracker />} />
                <Route path="milestones" element={<Milestones />} />
                <Route path="balance-sheet" element={<BalanceSheet />} />
                <Route path="news" element={<News />} />
                {/* Redirect old dashboard path to overview */}
                <Route path="dashboard" element={<Navigate to="/overview" replace />} />
              </Route>
            </Routes>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

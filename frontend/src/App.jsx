import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardLayout from './components/DashboardLayout';
import Register from './pages/Register';
import Login from './pages/Login';
import OnboardingMethod from './pages/OnboardingMethod';
import ManualEntry from './pages/ManualEntry';
import CSVUpload from './pages/CSVUpload';
import Overview from './pages/dashboard/Overview';
import Advisory from './pages/dashboard/Advisory';
import Milestones from './pages/dashboard/Milestones';
import BalanceSheet from './pages/dashboard/BalanceSheet';
import News from './pages/dashboard/News';
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
              {/* Auth & Onboarding Routes */}
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/register" replace />} />
                <Route path="register" element={<Register />} />
                <Route path="login" element={<Login />} />
                {/* Note: In a real app, onboarding might be protected, but keeping it simple based on current flow */}
                <Route path="onboarding" element={<OnboardingMethod />} />
                <Route path="onboarding/manual" element={<ManualEntry />} />
                <Route path="onboarding/csv" element={<CSVUpload />} />
              </Route>

              {/* Dashboard Routes (Protected) */}
              <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="overview" element={<Overview />} />
                <Route path="ai-advisory" element={<Advisory />} />
                <Route path="milestones" element={<Milestones />} />
                <Route path="balance-sheet" element={<BalanceSheet />} />
                <Route path="news" element={<News />} />
                {/* Redirect old dashboard path or index to overview */}
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

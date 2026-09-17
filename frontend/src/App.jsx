import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Register from './pages/Register';
import Login from './pages/Login';
import OnboardingMethod from './pages/OnboardingMethod';
import ManualEntry from './pages/ManualEntry';
import CSVUpload from './pages/CSVUpload';
import Dashboard from './pages/Dashboard';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/register" replace />} />
            <Route path="register" element={<Register />} />
            <Route path="login" element={<Login />} />
            <Route path="onboarding" element={<OnboardingMethod />} />
            <Route path="onboarding/manual" element={<ManualEntry />} />
            <Route path="onboarding/csv" element={<CSVUpload />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;

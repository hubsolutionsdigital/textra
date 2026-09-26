import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Projects from './pages/Projects.jsx';
import ProjectAdmin from './pages/ProjectAdmin.jsx';
import AgencyScreen from './pages/AgencyScreen.jsx';
import ClientPortal from './pages/ClientPortal.jsx';
import TeamReview from './pages/TeamReview.jsx';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/r/:token/*" element={<ClientPortal />} />
          <Route path="/t/:teamToken" element={<TeamReview />} />
          <Route path="/t/:teamToken/screens/:screenId" element={<AgencyScreen />} />
          <Route element={<RequireAuth />}>
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectAdmin />} />
            <Route path="/projects/:projectId/screens/:screenId" element={<AgencyScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

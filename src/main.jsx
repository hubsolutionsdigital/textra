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
import EmailSettings from './pages/EmailSettings.jsx';
import QuizList from './quiz/QuizList.jsx';
import QuizEditor from './quiz/QuizEditor.jsx';
import HostGame from './quiz/HostGame.jsx';
import { JoinGame, PlayGame } from './quiz/PlayGame.jsx';
import Practice from './quiz/Practice.jsx';
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
          <Route path="/play" element={<JoinGame />} />
          <Route path="/play/:pin" element={<PlayGame />} />
          <Route path="/practice/:token" element={<Practice />} />
          <Route element={<RequireAuth />}>
            <Route path="/projects" element={<Projects />} />
            <Route path="/settings/email" element={<EmailSettings />} />
            <Route path="/projects/:projectId" element={<ProjectAdmin />} />
            <Route path="/projects/:projectId/screens/:screenId" element={<AgencyScreen />} />
            <Route path="/quizzes" element={<QuizList />} />
            <Route path="/quizzes/:quizId" element={<QuizEditor />} />
            <Route path="/live/:pin" element={<HostGame />} />
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

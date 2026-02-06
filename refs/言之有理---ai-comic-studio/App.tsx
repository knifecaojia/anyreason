import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ProjectList } from './pages/ProjectList';
import { Studio } from './pages/Studio';
import { AssetLibrary } from './pages/AssetLibrary';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { ScriptManager } from './pages/ScriptManager';
import { AssetExtraction } from './pages/AssetExtraction';
import { Settings } from './pages/Settings';
import { Storyboard } from './pages/Storyboard';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Application Routes */}
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        <Route path="/projects" element={<Layout><ProjectList /></Layout>} />
        <Route path="/scripts" element={<Layout><ScriptManager /></Layout>} />
        <Route path="/extraction" element={<Layout><AssetExtraction /></Layout>} />
        <Route path="/storyboard" element={<Layout><Storyboard /></Layout>} />
        <Route path="/studio" element={<Layout><Studio /></Layout>} />
        <Route path="/assets" element={<Layout><AssetLibrary /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        
        {/* Catch all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
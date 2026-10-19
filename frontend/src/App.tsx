import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './lib/api';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignWizardPage from './pages/CampaignWizardPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import TemplatesPage from './pages/TemplatesPage';
import TemplateEditorPage from './pages/TemplateEditorPage';
import SchedulePage from './pages/SchedulePage';
import AnalyticsPage from './pages/AnalyticsPage';
import LeadsPage from './pages/LeadsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import SettingsPage from './pages/SettingsPage';
import HelpPage from './pages/HelpPage';

export default function App() {
  const [user, setUser] = useState<{ email: string } | null | undefined>(undefined);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <Loading text="Opening your Marketing Center…" />;
  if (!user) return <LoginPage onLogin={(u) => setUser(u)} />;

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <Layout email={user.email} onLogout={logout}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerProfilePage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:id" element={<GroupDetailPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/new" element={<CampaignWizardPage />} />
        <Route path="/campaigns/:id/edit" element={<CampaignWizardPage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/new" element={<TemplateEditorPage />} />
        <Route path="/templates/:id" element={<TemplateEditorPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

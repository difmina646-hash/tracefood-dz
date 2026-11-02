import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { useAuth } from './lib/auth';
import { AppLayout } from './components/Layout';
import { Button, Card, EmptyState, SkeletonRows } from './components/ui';
import { ForgotPage, LoginPage, RegisterCompanyPage, RegisterConsumerPage, ResetPage } from './pages/Auth';
import { PublicHome, QrPage, ScanPage } from './pages/public/Public';
import Dashboard from './pages/Dashboard';
import { LocationsPage, MaterialsPage, ProductsPage, QualityParamsPage, RecipesPage, SuppliersPage, TransportersPage } from './pages/Master';
import { LotDetailPage, LotsPage, ReceptionNewPage, ReceptionsPage } from './pages/ops/Receptions';
import { BatchDetailPage, BatchNewPage, BatchesPage, OrdersPage } from './pages/ops/Batches';
import InventoryPage from './pages/ops/Inventory';
import { ShipmentDetailPage, ShipmentNewPage, ShipmentsPage } from './pages/ops/Shipments';
import TracePage from './pages/quality/Trace';
import { IncidentDetailPage, IncidentsPage } from './pages/quality/Incidents';
import { ComplaintsPage, RiskDetailPage, RiskListPage } from './pages/quality/Risk';
import { MarketPage, MessagesPage, OffersPage, PromotionsPage, ReceivedLookupPage, RequestsPage } from './pages/market/Market';
import { AdminAuditPage, AdminCertsPage, AdminCompaniesPage, AdminOffersPage, AdminUsersPage } from './pages/admin/Admin';
import { ConsumerPage, NotificationsPage, ProfilePage } from './pages/Account';

/** Client-side guard for UX only; the API re-checks every permission on the server. */
function Protected({ children }: { children: ReactNode }) {
  const { me, loading, company, logout } = useAuth(); const { t } = useTranslation(); const loc = useLocation();
  if (loading) return <div className="p-10"><SkeletonRows rows={6} /></div>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!me.isSuperAdmin && !me.isConsumer && company && company.status !== 'ACTIVE') {
    return (
      <div className="grid min-h-screen place-items-center p-4"><Card className="max-w-md p-8 text-center"><Clock className="mx-auto h-10 w-10 text-warn" />
        <h1 className="mt-3 text-xl font-bold">{company.status === 'PENDING' ? t('gate.pending') : t('gate.blocked')}</h1>
        <p className="mt-2 text-sm text-mutedfg">{company.status === 'PENDING' ? t('gate.pendingMsg') : t('gate.blockedMsg')}</p>
        <Button className="mt-4" variant="outline" onClick={() => logout()}>{t('auth.logout')}</Button></Card></div>);
  }
  return <>{children}</>;
}
function Need({ any, children }: { any: string[]; children: ReactNode }) {
  const { canAny } = useAuth(); const { t } = useTranslation();
  return canAny(...any) ? <>{children}</> : <Card><EmptyState title={t('gate.denied')} hint={t('gate.deniedMsg')} /></Card>;
}
const N = (any: string[], el: ReactNode) => <Need any={any}>{el}</Need>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/q/:id" element={<QrPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterCompanyPage />} />
        <Route path="/register-consumer" element={<RegisterConsumerPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/app" element={<Protected><AppLayout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="consumer" element={<ConsumerPage />} />
          <Route path="suppliers" element={N(['master:read'], <SuppliersPage />)} />
          <Route path="materials" element={N(['master:read'], <MaterialsPage />)} />
          <Route path="products" element={N(['master:read'], <ProductsPage />)} />
          <Route path="recipes" element={N(['master:read'], <RecipesPage />)} />
          <Route path="locations" element={N(['master:read', 'inventory:write'], <LocationsPage />)} />
          <Route path="transporters" element={N(['master:write'], <TransportersPage />)} />
          <Route path="quality-params" element={N(['quality:read'], <QualityParamsPage />)} />
          <Route path="receptions" element={N(['reception:read'], <ReceptionsPage />)} />
          <Route path="receptions/new" element={N(['reception:write'], <ReceptionNewPage />)} />
          <Route path="lots" element={N(['reception:read'], <LotsPage />)} />
          <Route path="lots/:id" element={N(['reception:read'], <LotDetailPage />)} />
          <Route path="orders" element={N(['production:read'], <OrdersPage />)} />
          <Route path="batches" element={N(['production:read'], <BatchesPage />)} />
          <Route path="batches/new" element={N(['production:write'], <BatchNewPage />)} />
          <Route path="batches/:id" element={N(['production:read'], <BatchDetailPage />)} />
          <Route path="inventory" element={N(['inventory:read'], <InventoryPage />)} />
          <Route path="shipments" element={N(['shipment:read'], <ShipmentsPage />)} />
          <Route path="shipments/new" element={N(['shipment:create'], <ShipmentNewPage />)} />
          <Route path="shipments/:id" element={N(['shipment:read'], <ShipmentDetailPage />)} />
          <Route path="trace" element={N(['trace:read'], <TracePage />)} />
          <Route path="received" element={N(['trace:read'], <ReceivedLookupPage />)} />
          <Route path="incidents" element={N(['incident:read'], <IncidentsPage />)} />
          <Route path="incidents/:id" element={N(['incident:read'], <IncidentDetailPage />)} />
          <Route path="risk" element={N(['incident:read'], <RiskListPage />)} />
          <Route path="risk/:id" element={N(['incident:read'], <RiskDetailPage />)} />
          <Route path="complaints" element={N(['complaint:read'], <ComplaintsPage />)} />
          <Route path="market" element={N(['request:write'], <MarketPage />)} />
          <Route path="offers" element={N(['offer:write'], <OffersPage />)} />
          <Route path="requests" element={N(['offer:write'], <RequestsPage />)} />
          <Route path="promotions" element={N(['promotion:write'], <PromotionsPage />)} />
          <Route path="messages" element={N(['message:write'], <MessagesPage />)} />
          <Route path="admin/companies" element={N(['admin:companies'], <AdminCompaniesPage />)} />
          <Route path="admin/users" element={N(['admin:users'], <AdminUsersPage />)} />
          <Route path="admin/certs" element={N(['admin:companies'], <AdminCertsPage />)} />
          <Route path="admin/offers" element={N(['admin:companies'], <AdminOffersPage />)} />
          <Route path="admin/audit" element={N(['admin:audit'], <AdminAuditPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

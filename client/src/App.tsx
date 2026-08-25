import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './api/AuthContext'
import { ToastProvider } from './components/Toast'
import type { ReactNode } from 'react'
import {
  AccountProfile, AccountPassword, LoginPage, SettingsGeneral,
} from './pages/Misc'
import RolesPermissions from './pages/settings/RolesPermissions'
import NotificationsSettings from './pages/settings/NotificationsSettings'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordReset'
import SsoCallback from './pages/SsoCallback'
import VehiclesList from './pages/vehicles/VehiclesList'
import VehicleDetail from './pages/vehicles/VehicleDetail'
import VehicleForm from './pages/vehicles/VehicleForm'
import PublicVehicle from './pages/vehicles/PublicVehicle'
import PublicCaptureForm from './pages/vehicles/PublicCaptureForm'
import VehicleEolDue from './pages/vehicles/VehicleEolDue'
import VehicleMastersPage from './pages/vehicles/VehicleMastersPage'
import { UsersList, UserDetail, UserForm } from './pages/users/Users'
import { DriversPage, DriverDetailPage } from './pages/drivers/Drivers'
import AuditPage from './pages/AuditPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="suite-page"><p style={{ padding: 40, textAlign: 'center' }}>Loading…</p></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <div className="suite-page"><p style={{ padding: 40, textAlign: 'center' }}>Loading…</p></div>
  if (!isAdmin) {
    return (
      <div className="suite-page">
        <p style={{ padding: 40, textAlign: 'center' }}>Only Admin users can access this page.</p>
      </div>
    )
  }
  return children
}

function RequirePerm({ permission, children }: { permission: string; children: ReactNode }) {
  const { can, loading } = useAuth()
  if (loading) return <div className="suite-page"><p style={{ padding: 40, textAlign: 'center' }}>Loading…</p></div>
  if (!can(permission)) {
    return (
      <div className="suite-page">
        <p style={{ padding: 40, textAlign: 'center' }}>You do not have access to this page.</p>
      </div>
    )
  }
  return children
}

function HomeRedirect() {
  const { can, loading } = useAuth()
  if (loading) return <div className="suite-page"><p style={{ padding: 40, textAlign: 'center' }}>Loading…</p></div>
  if (can('vehicles.view')) return <Navigate to="/vehicles" replace />
  if (can('drivers.view')) return <Navigate to="/drivers" replace />
  if (can('masters.view')) return <Navigate to="/masters" replace />
  if (can('people.view')) return <Navigate to="/users" replace />
  if (can('reports.view')) return <Navigate to="/audit" replace />
  return <Navigate to="/account/profile" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/sso/callback" element={<SsoCallback />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/vehicle/:token" element={<PublicVehicle />} />
            <Route path="/capture" element={<PublicCaptureForm />} />
            <Route path="/*" element={
              <RequireAuth>
                <Routes>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/vehicles" element={<RequirePerm permission="vehicles.view"><VehiclesList /></RequirePerm>} />
                  <Route path="/vehicles/create" element={<RequirePerm permission="vehicles.create"><VehicleForm /></RequirePerm>} />
                  <Route path="/vehicles/eol/due" element={<RequirePerm permission="reports.view"><VehicleEolDue /></RequirePerm>} />
                  <Route path="/vehicles/:id/edit" element={<RequirePerm permission="vehicles.edit"><VehicleForm /></RequirePerm>} />
                  <Route path="/vehicles/:id" element={<RequirePerm permission="vehicles.view"><VehicleDetail /></RequirePerm>} />
                  <Route path="/masters" element={<RequirePerm permission="masters.view"><VehicleMastersPage /></RequirePerm>} />
                  <Route path="/drivers" element={<RequirePerm permission="drivers.view"><DriversPage /></RequirePerm>} />
                  <Route path="/drivers/:id" element={<RequirePerm permission="drivers.view"><DriverDetailPage /></RequirePerm>} />
                  <Route path="/audit" element={<RequirePerm permission="reports.view"><AuditPage /></RequirePerm>} />
                  <Route path="/users" element={<RequirePerm permission="people.view"><UsersList /></RequirePerm>} />
                  <Route path="/users/create" element={<RequirePerm permission="people.create"><UserForm /></RequirePerm>} />
                  <Route path="/users/:id/edit" element={<RequirePerm permission="people.edit"><UserForm /></RequirePerm>} />
                  <Route path="/users/:id/clone" element={<RequirePerm permission="people.create"><UserForm /></RequirePerm>} />
                  <Route path="/users/:id" element={<RequirePerm permission="people.view"><UserDetail /></RequirePerm>} />
                  <Route path="/account/profile" element={<AccountProfile />} />
                  <Route path="/account/password" element={<AccountPassword />} />
                  <Route path="/settings" element={<RequireAdmin><SettingsGeneral /></RequireAdmin>} />
                  <Route path="/settings/roles" element={<RequireAdmin><RolesPermissions /></RequireAdmin>} />
                  <Route path="/settings/notifications" element={<RequireAdmin><NotificationsSettings /></RequireAdmin>} />
                  <Route path="*" element={<HomeRedirect />} />
                </Routes>
              </RequireAuth>
            }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

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
import VehicleEolDue from './pages/vehicles/VehicleEolDue'
import VehicleMastersPage from './pages/vehicles/VehicleMastersPage'
import { UsersList, UserDetail, UserForm } from './pages/users/Users'

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
            <Route path="/*" element={
              <RequireAuth>
                <Routes>
                  <Route path="/" element={<Navigate to="/vehicles" replace />} />
                  <Route path="/vehicles" element={<VehiclesList />} />
                  <Route path="/vehicles/create" element={<VehicleForm />} />
                  <Route path="/vehicles/eol/due" element={<VehicleEolDue />} />
                  <Route path="/vehicles/:id/edit" element={<VehicleForm />} />
                  <Route path="/vehicles/:id" element={<VehicleDetail />} />
                  <Route path="/masters" element={<VehicleMastersPage />} />
                  <Route path="/users" element={<UsersList />} />
                  <Route path="/users/create" element={<UserForm />} />
                  <Route path="/users/:id" element={<UserDetail />} />
                  <Route path="/users/:id/edit" element={<UserForm />} />
                  <Route path="/account/profile" element={<AccountProfile />} />
                  <Route path="/account/password" element={<AccountPassword />} />
                  <Route path="/settings" element={<RequireAdmin><SettingsGeneral /></RequireAdmin>} />
                  <Route path="/settings/roles" element={<RequireAdmin><RolesPermissions /></RequireAdmin>} />
                  <Route path="/settings/notifications" element={<RequireAdmin><NotificationsSettings /></RequireAdmin>} />
                  <Route path="*" element={<Navigate to="/vehicles" replace />} />
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

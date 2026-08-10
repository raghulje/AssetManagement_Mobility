import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, type FormEvent, type ReactNode } from 'react'
import { siteName } from '../data/mockData'
import { useAuth } from '../api/AuthContext'

type Props = { children: ReactNode; title: string; subtitle?: string }

type SectionTab = {
  to: string
  label: string
  /** Return true when this tab should look active */
  isActive: (pathname: string, search: string) => boolean
  /** Visual group: status filters vs tools (assets section) */
  group?: 'status' | 'tools'
}

type SectionKey = 'assets' | 'people' | 'masters' | 'settings' | 'reports'

const SECTION_TABS: Record<SectionKey, SectionTab[]> = {
  assets: [
    {
      to: '/hardware',
      label: 'List All',
      group: 'status',
      isActive: (p, s) => p === '/hardware' && !new URLSearchParams(s).has('status_type'),
    },
    {
      to: '/hardware?status_type=Assigned',
      label: 'Assigned',
      group: 'status',
      isActive: (p, s) => {
        if (p !== '/hardware') return false
        const t = new URLSearchParams(s).get('status_type')
        return t === 'Assigned' || t === 'Deployed'
      },
    },
    {
      to: '/hardware?status_type=RTD',
      label: 'In Stock',
      group: 'status',
      isActive: (p, s) => p === '/hardware' && new URLSearchParams(s).get('status_type') === 'RTD',
    },
    {
      to: '/hardware?status_type=Pending',
      label: 'Pending',
      group: 'status',
      isActive: (p, s) => p === '/hardware' && new URLSearchParams(s).get('status_type') === 'Pending',
    },
    {
      to: '/hardware?status_type=Deleted',
      label: 'Deleted',
      group: 'status',
      isActive: (p, s) => p === '/hardware' && new URLSearchParams(s).get('status_type') === 'Deleted',
    },
    {
      to: '/hardware/audit/due',
      label: 'Audit Due',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/audit/due'),
    },
    {
      to: '/hardware/eol/due',
      label: 'EOL Due',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/eol/due'),
    },
    {
      to: '/hardware/checkins/due',
      label: 'Due for Unassign',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/checkins/due'),
    },
    {
      to: '/hardware/quickscancheckin',
      label: 'Quickscan Unassign',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/quickscancheckin'),
    },
    {
      to: '/hardware/bulkcheckout',
      label: 'Bulk Assign',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/bulkcheckout'),
    },
    {
      to: '/maintenances',
      label: 'Maintenances',
      group: 'tools',
      isActive: (p) => p.startsWith('/maintenances'),
    },
    {
      to: '/hardware/bulkaudit',
      label: 'Bulk Audit',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/bulkaudit'),
    },
    {
      to: '/hardware/history',
      label: 'Import History',
      group: 'tools',
      isActive: (p) => p.startsWith('/hardware/history'),
    },
  ],
  people: [
    { to: '/employees', label: 'Employees', isActive: (p) => p.startsWith('/employees') && !p.startsWith('/employees/import') },
    { to: '/employees/import', label: 'Sync / Import HRMS', isActive: (p) => p.startsWith('/employees/import') },
    {
      to: '/users',
      label: 'App Users',
      isActive: (p, s) => {
        if (p !== '/users') return false
        const q = new URLSearchParams(s)
        return !q.has('superadmins') && !q.has('admins') && !q.has('status') && !q.has('activated')
      },
    },
    { to: '/users?superadmins=true', label: 'Superadmins', isActive: (p, s) => p === '/users' && new URLSearchParams(s).get('superadmins') === 'true' },
    { to: '/users?admins=true', label: 'Admins', isActive: (p, s) => p === '/users' && new URLSearchParams(s).get('admins') === 'true' },
    { to: '/users?status=deleted', label: 'Deleted Users', isActive: (p, s) => p === '/users' && new URLSearchParams(s).get('status') === 'deleted' },
    { to: '/users?activated=1', label: 'Login Enabled', isActive: (p, s) => p === '/users' && new URLSearchParams(s).get('activated') === '1' },
    { to: '/users?activated=0', label: 'Login Disabled', isActive: (p, s) => p === '/users' && new URLSearchParams(s).get('activated') === '0' },
  ],
  masters: [
    { to: '/companies', label: 'Companies', isActive: (p) => p.startsWith('/companies') },
    { to: '/departments', label: 'Departments', isActive: (p) => p.startsWith('/departments') },
    { to: '/locations', label: 'Locations', isActive: (p) => p.startsWith('/locations') },
    { to: '/suppliers', label: 'Suppliers / Vendors', isActive: (p) => p.startsWith('/suppliers') },
    { to: '/models', label: 'Asset Models', isActive: (p) => p.startsWith('/models') },
  ],
  settings: [
    { to: '/settings', label: 'General', isActive: (p) => p === '/settings' || p.startsWith('/settings/') },
    { to: '/categories', label: 'Categories', isActive: (p) => p.startsWith('/categories') },
    { to: '/statuslabels', label: 'Status Labels', isActive: (p) => p.startsWith('/statuslabels') },
    { to: '/manufacturers', label: 'Manufacturers', isActive: (p) => p.startsWith('/manufacturers') },
    { to: '/fields', label: 'Custom Fields', isActive: (p) => p.startsWith('/fields') },
    { to: '/depreciations', label: 'Depreciation', isActive: (p) => p.startsWith('/depreciations') },
  ],
  reports: [
    { to: '/reports', label: 'List All', isActive: (p) => p === '/reports' },
    { to: '/reports/activity', label: 'Activity Report', isActive: (p) => p.startsWith('/reports/activity') },
    { to: '/reports/custom', label: 'Custom Report', isActive: (p) => p.startsWith('/reports/custom') },
    { to: '/reports/audit', label: 'Audit Report', isActive: (p) => p.startsWith('/reports/audit') },
    { to: '/reports/depreciation', label: 'Depreciation Report', isActive: (p) => p.startsWith('/reports/depreciation') },
    { to: '/reports/licenses', label: 'License Report', isActive: (p) => p.startsWith('/reports/licenses') },
    { to: '/reports/maintenances', label: 'Asset Maintenance Report', isActive: (p) => p.startsWith('/reports/maintenances') },
    { to: '/reports/unaccepted', label: 'Unaccepted Assets', isActive: (p) => p.startsWith('/reports/unaccepted') },
    { to: '/reports/accessories', label: 'Accessory Report', isActive: (p) => p.startsWith('/reports/accessories') },
  ],
}

function resolveSection(pathname: string): SectionKey | null {
  if (pathname.startsWith('/hardware') || pathname.startsWith('/maintenances')) return 'assets'
  if (pathname.startsWith('/employees') || pathname.startsWith('/users')) return 'people'
  if (
    pathname.startsWith('/companies')
    || pathname.startsWith('/departments')
    || pathname.startsWith('/locations')
    || pathname.startsWith('/suppliers')
    || pathname.startsWith('/models')
  ) return 'masters'
  if (
    pathname.startsWith('/settings')
    || pathname.startsWith('/categories')
    || pathname.startsWith('/statuslabels')
    || pathname.startsWith('/manufacturers')
    || pathname.startsWith('/fields')
    || pathname.startsWith('/depreciations')
  ) return 'settings'
  if (pathname.startsWith('/reports')) return 'reports'
  return null
}

/**
 * Section tabs navigate between list / filter views.
 * Hide them on create, edit, and single-record view pages.
 */
function shouldShowSectionTabs(pathname: string): boolean {
  if (pathname.startsWith('/reports')) return true

  const listRoutes = [
    /^\/hardware\/?$/,
    /^\/hardware\/audit\/due\/?$/,
    /^\/hardware\/eol\/due\/?$/,
    /^\/hardware\/checkins\/due\/?$/,
    /^\/hardware\/quickscancheckin\/?$/,
    /^\/hardware\/bulkcheckout\/?$/,
    /^\/hardware\/bulkaudit\/?$/,
    /^\/hardware\/history\/?$/,
    /^\/maintenances\/?$/,
    /^\/employees\/?$/,
    /^\/employees\/import\/?$/,
    /^\/users\/?$/,
    /^\/companies\/?$/,
    /^\/departments\/?$/,
    /^\/locations\/?$/,
    /^\/suppliers\/?$/,
    /^\/models\/?$/,
    /^\/settings\/?$/,
    /^\/categories\/?$/,
    /^\/statuslabels\/?$/,
    /^\/manufacturers\/?$/,
    /^\/fields\/?$/,
    /^\/depreciations\/?$/,
  ]
  return listRoutes.some((re) => re.test(pathname))
}

function SectionTabs({ section }: { section: SectionKey }) {
  const location = useLocation()
  const tabs = SECTION_TABS[section]
  const search = location.search

  // Use Link (not NavLink): RR matches /hardware?* by pathname only and would
  // mark List All + Assigned + In Stock + … all "active" at once.
  const statusTabs = tabs.filter((t) => t.group === 'status')
  const toolTabs = tabs.filter((t) => t.group === 'tools')
  const plainTabs = tabs.filter((t) => !t.group)
  const renderTab = (tab: SectionTab) => {
    const active = tab.isActive(location.pathname, search)
    return (
      <Link
        key={tab.to + tab.label}
        to={tab.to}
        className={active ? 'active' : undefined}
        aria-current={active ? 'page' : undefined}
      >
        {tab.label}
      </Link>
    )
  }

  return (
    <nav className="section-tabs" aria-label="Section">
      <div className="section-tabs-track">
        {statusTabs.length > 0 ? (
          <>
            <div className="section-tabs-group">{statusTabs.map(renderTab)}</div>
            {toolTabs.length > 0 ? <span className="section-tabs-divider" aria-hidden /> : null}
            <div className="section-tabs-group">{toolTabs.map(renderTab)}</div>
          </>
        ) : (
          plainTabs.map(renderTab)
        )}
      </div>
    </nav>
  )
}

export default function AppLayout({ children, title, subtitle }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [tag, setTag] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Admin User'
  const path = location.pathname + location.search
  const section = resolveSection(location.pathname)
  const showSectionTabs = Boolean(section && shouldShowSectionTabs(location.pathname))

  const searchTag = (e: FormEvent) => {
    e.preventDefault()
    if (tag.trim()) navigate(`/hardware?q=${encodeURIComponent(tag.trim())}`)
  }

  return (
    <div className={`wrapper ${collapsed ? 'sidebar-collapse' : ''} ${!collapsed ? 'sidebar-open' : ''}`}>
      <header className="main-header">
        <NavLink to="/" className="logo" aria-label={siteName}>
          <img src="/refexone-logo.png" alt={siteName} />
        </NavLink>
        <nav className="navbar">
          <button type="button" className="sidebar-toggle" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
            <i className="fas fa-bars" />
          </button>
          <form className="header-search" onSubmit={searchTag}>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Search asset tag" />
            <button type="submit"><i className="fas fa-search" /></button>
          </form>
          <div className="navbar-custom-menu">
            <ul className="navbar-nav">
              <li><NavLink to="/hardware" title="Assets"><i className="fas fa-barcode" /></NavLink></li>
              <li><NavLink to="/licenses" title="Licenses"><i className="fas fa-save" /></NavLink></li>
              <li><NavLink to="/accessories" title="Accessories"><i className="fas fa-keyboard" /></NavLink></li>
              <li><NavLink to="/consumables" title="Consumables"><i className="fas fa-tint" /></NavLink></li>
              <li><NavLink to="/components" title="Components"><i className="fas fa-hdd" /></NavLink></li>
              <li><NavLink to="/employees" title="Employees"><i className="fas fa-id-badge" /></NavLink></li>
              <li><NavLink to="/users" title="App Users"><i className="fas fa-users" /></NavLink></li>
              <li className={`dropdown ${createOpen ? 'open' : ''}`}>
                <button type="button" className="nav-icon-btn" onClick={() => setCreateOpen((o) => !o)}>
                  <i className="fas fa-plus" />
                </button>
                <div className="dropdown-menu">
                  <NavLink to="/hardware/create" onClick={() => setCreateOpen(false)}>Asset</NavLink>
                  <NavLink to="/licenses/create" onClick={() => setCreateOpen(false)}>License</NavLink>
                  <NavLink to="/accessories/create" onClick={() => setCreateOpen(false)}>Accessory</NavLink>
                  <NavLink to="/consumables/create" onClick={() => setCreateOpen(false)}>Consumable</NavLink>
                  <NavLink to="/components/create" onClick={() => setCreateOpen(false)}>Component</NavLink>
                  <NavLink to="/employees/create" onClick={() => setCreateOpen(false)}>Employee</NavLink>
                  <NavLink to="/users/create" onClick={() => setCreateOpen(false)}>App User</NavLink>
                </div>
              </li>
              <li><NavLink to="/admin" title="Admin"><i className="fas fa-cog" /></NavLink></li>
              <li className={`dropdown ${userOpen ? 'open' : ''}`}>
                <button type="button" className="nav-icon-btn" onClick={() => setUserOpen((o) => !o)}>
                  <i className="fas fa-user" /> {displayName}
                </button>
                <div className="dropdown-menu">
                  <NavLink to="/account/assets" onClick={() => setUserOpen(false)}>View Assigned Assets</NavLink>
                  <NavLink to="/account/requested" onClick={() => setUserOpen(false)}>Requested Assets</NavLink>
                  <NavLink to="/account/accept" onClick={() => setUserOpen(false)}>Accept Assets</NavLink>
                  <div className="divider" />
                  <NavLink to="/account/profile" onClick={() => setUserOpen(false)}>Edit Profile</NavLink>
                  <NavLink to="/account/password" onClick={() => setUserOpen(false)}>Change Password</NavLink>
                  <NavLink to="/account/api" onClick={() => setUserOpen(false)}>Manage API Keys</NavLink>
                  <div className="divider" />
                  <button type="button" onClick={() => { logout(); navigate('/login') }}>Logout</button>
                </div>
              </li>
            </ul>
          </div>
        </nav>
      </header>

      <aside className="main-sidebar">
        <ul className="sidebar-menu">
          <li className={path === '/' ? 'active' : ''}>
            <NavLink to="/"><i className="fas fa-tachometer-alt fa-fw" /><span>Dashboard</span></NavLink>
          </li>

          <li className={section === 'assets' ? 'active' : ''}>
            <NavLink to="/hardware"><i className="fas fa-barcode fa-fw" /><span>Assets</span></NavLink>
          </li>
          <li className={path.startsWith('/licenses') ? 'active' : ''}>
            <NavLink to="/licenses"><i className="fas fa-save fa-fw" /><span>Licenses</span></NavLink>
          </li>
          <li className={path.startsWith('/accessories') ? 'active' : ''}>
            <NavLink to="/accessories"><i className="fas fa-keyboard fa-fw" /><span>Accessories</span></NavLink>
          </li>
          <li className={path.startsWith('/consumables') ? 'active' : ''}>
            <NavLink to="/consumables"><i className="fas fa-tint fa-fw" /><span>Consumables</span></NavLink>
          </li>
          <li className={path.startsWith('/components') ? 'active' : ''}>
            <NavLink to="/components"><i className="fas fa-hdd fa-fw" /><span>Components</span></NavLink>
          </li>

          <li className={section === 'people' ? 'active' : ''}>
            <NavLink to="/employees"><i className="fas fa-users fa-fw" /><span>People</span></NavLink>
          </li>
          <li className={section === 'masters' ? 'active' : ''}>
            <NavLink to="/companies"><i className="fas fa-database fa-fw" /><span>Masters</span></NavLink>
          </li>
          <li className={path.startsWith('/import') ? 'active' : ''}>
            <NavLink to="/import"><i className="fas fa-file-import fa-fw" /><span>Import</span></NavLink>
          </li>
          <li className={section === 'settings' ? 'active' : ''}>
            <NavLink to="/settings"><i className="fas fa-cog fa-fw" /><span>Settings</span></NavLink>
          </li>
          <li className={section === 'reports' ? 'active' : ''}>
            <NavLink to="/reports"><i className="fas fa-chart-bar fa-fw" /><span>Reports</span></NavLink>
          </li>
        </ul>
      </aside>

      <div className="content-wrapper">
        <section className="content-header" key={`h-${location.pathname}`}>
          <h1>
            {title}
            {subtitle ? <small>{subtitle}</small> : null}
          </h1>
          <ol className="breadcrumb">
            <li><NavLink to="/">Home</NavLink></li>
            <li>{title}</li>
          </ol>
        </section>
        {showSectionTabs && section ? <SectionTabs section={section} /> : null}
        <section className="content" key={`c-${location.pathname}`}>{children}</section>
      </div>

      <footer className="main-footer">
        <strong>Copyright &copy; {new Date().getFullYear()} {siteName}.</strong> IT Asset Management.
      </footer>
    </div>
  )
}

import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { siteName } from '../data/mockData'
import { useAuth } from '../api/AuthContext'

const NARROW_MQ = '(max-width: 991px)'

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

type Props = { children: ReactNode; title: string; subtitle?: string; dense?: boolean; hideHeader?: boolean }

type SectionTab = {
  to: string
  label: string
  /** Shorter label on narrow screens */
  shortLabel?: string
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
    // Pending / Deleted — not used at Refex for now; restore when needed
    // {
    //   to: '/hardware?status_type=Pending',
    //   label: 'Pending',
    //   group: 'status',
    //   isActive: (p, s) => p === '/hardware' && new URLSearchParams(s).get('status_type') === 'Pending',
    // },
    // {
    //   to: '/hardware?status_type=Deleted',
    //   label: 'Deleted',
    //   group: 'status',
    //   isActive: (p, s) => p === '/hardware' && new URLSearchParams(s).get('status_type') === 'Deleted',
    // },
    // Assets tool tabs — restore when needed
    // {
    //   to: '/hardware/audit/due',
    //   label: 'Audit Due',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/audit/due'),
    // },
    // {
    //   to: '/hardware/eol/due',
    //   label: 'EOL Due',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/eol/due'),
    // },
    // {
    //   to: '/hardware/checkins/due',
    //   label: 'Due for Unassign',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/checkins/due'),
    // },
    // {
    //   to: '/hardware/quickscancheckin',
    //   label: 'Quickscan Unassign',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/quickscancheckin'),
    // },
    // {
    //   to: '/hardware/bulkcheckout',
    //   label: 'Bulk Assign',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/bulkcheckout'),
    // },
    // {
    //   to: '/maintenances',
    //   label: 'Maintenances',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/maintenances'),
    // },
    // {
    //   to: '/hardware/bulkaudit',
    //   label: 'Bulk Audit',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/bulkaudit'),
    // },
    // {
    //   to: '/hardware/agent-activity',
    //   label: 'Agent activity',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/agent-activity'),
    // },
    // {
    //   to: '/hardware/history',
    //   label: 'Import History',
    //   group: 'tools',
    //   isActive: (p) => p.startsWith('/hardware/history'),
    // },
  ],
  people: [
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
  ],
  masters: [
    { to: '/masters', label: 'Cities & Models', isActive: (p) => p.startsWith('/masters') },
  ],
  settings: [
    { to: '/settings', label: 'General', isActive: (p) => p === '/settings' },
    { to: '/settings/roles', label: 'Roles & permissions', shortLabel: 'Roles', isActive: (p) => p.startsWith('/settings/roles') },
    { to: '/settings/notifications', label: 'Notifications', shortLabel: 'Alerts', isActive: (p) => p.startsWith('/settings/notifications') },
  ],
  reports: [
    { to: '/audit', label: 'Fleet audit', isActive: (p) => p.startsWith('/audit') },
  ],
}

function resolveSection(pathname: string, search = ''): SectionKey | null {
  void search
  // Drivers is fleet-only — never mix App Users / Admin tabs here
  if (pathname.startsWith('/drivers')) return null
  if (pathname.startsWith('/users')) return 'people'
  if (pathname.startsWith('/masters')) return 'masters'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/audit') || pathname.startsWith('/reports')) return 'reports'
  return null
}

/**
 * Section tabs navigate between list / filter views.
 * Hide them on create, edit, and single-record view pages.
 */
function shouldShowSectionTabs(pathname: string): boolean {
  if (pathname.startsWith('/audit') || pathname.startsWith('/reports')) return true

  const listRoutes = [
    /^\/users\/?$/,
    /^\/masters\/?$/,
    /^\/settings\/?$/,
    /^\/settings\/roles\/?$/,
    /^\/settings\/notifications\/?$/,
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
        title={tab.label}
      >
        {tab.shortLabel ? (
          <>
            <span className="section-tab-full">{tab.label}</span>
            <span className="section-tab-short">{tab.shortLabel}</span>
          </>
        ) : (
          tab.label
        )}
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

export default function AppLayout({ children, title, subtitle, dense, hideHeader }: Props) {
  const isNarrow = useIsNarrow()
  /** Desktop: false = sidebar visible. Mobile: true = drawer closed. */
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false,
  )
  const [userOpen, setUserOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [tag, setTag] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, can, isAdmin } = useAuth()
  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Admin User'
  const path = location.pathname + location.search
  const section = resolveSection(location.pathname, location.search)
  const showSectionTabs = Boolean(
    section
    && shouldShowSectionTabs(location.pathname)
    && !(new URLSearchParams(location.search).get('from') === 'employee' && location.pathname.startsWith('/hardware')),
  )
  const drawerOpen = isNarrow && !collapsed

  useEffect(() => {
    if (isNarrow) setCollapsed(true)
    else setCollapsed(false)
  }, [isNarrow])

  useEffect(() => {
    if (isNarrow) setCollapsed(true)
    setUserOpen(false)
    setCreateOpen(false)
  }, [location.pathname, location.search, isNarrow])

  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [drawerOpen])

  const closeDrawer = () => {
    if (isNarrow) setCollapsed(true)
  }

  const searchTag = (e: FormEvent) => {
    e.preventDefault()
    if (tag.trim()) navigate(`/vehicles?q=${encodeURIComponent(tag.trim())}`)
  }

  return (
    <div className={`wrapper ${collapsed ? 'sidebar-collapse' : ''} ${!collapsed ? 'sidebar-open' : ''}${isNarrow ? ' is-narrow' : ''}`}>
      {drawerOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={closeDrawer}
        />
      ) : null}
      <header className="main-header">
        <NavLink to="/" className="logo" aria-label={siteName} onClick={closeDrawer}>
          <img src="/mobility_logo.png" alt={siteName} />
        </NavLink>
        <nav className="navbar">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
          >
            <i className="fas fa-bars" />
          </button>
          <form className="header-search" onSubmit={searchTag}>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Search vehicles, plates, drivers…" />
            <button type="submit"><i className="fas fa-search" /></button>
          </form>
          <div className="navbar-custom-menu">
            <ul className="navbar-nav">
              <li><NavLink to="/vehicles" title="Vehicles"><i className="fas fa-car" /></NavLink></li>
              <li><NavLink to="/drivers" title="Drivers"><i className="fas fa-id-card" /></NavLink></li>
              <li><NavLink to="/audit" title="Audit"><i className="fas fa-clipboard-list" /></NavLink></li>
              <li><NavLink to="/users" title="App users"><i className="fas fa-user-shield" /></NavLink></li>
              <li className={`dropdown ${createOpen ? 'open' : ''}`}>
                <button type="button" className="nav-icon-btn" onClick={() => setCreateOpen((o) => !o)}>
                  <i className="fas fa-plus" />
                </button>
                <div className="dropdown-menu">
                  <NavLink to="/vehicles/create" onClick={() => setCreateOpen(false)}>Vehicle</NavLink>
                  <NavLink to="/drivers" onClick={() => setCreateOpen(false)}>Driver</NavLink>
                  <NavLink to="/masters" onClick={() => setCreateOpen(false)}>City / Model</NavLink>
                  <NavLink to="/users/create" onClick={() => setCreateOpen(false)}>App user</NavLink>
                </div>
              </li>
              {isAdmin ? <li><NavLink to="/settings" title="Settings"><i className="fas fa-cog" /></NavLink></li> : null}
              <li className={`dropdown ${userOpen ? 'open' : ''}`}>
                <button type="button" className="nav-icon-btn nav-user-btn" onClick={() => setUserOpen((o) => !o)}>
                  <i className="fas fa-user" aria-hidden="true" />
                  <span className="nav-user-name">{displayName}</span>
                </button>
                <div className="dropdown-menu">
                  <NavLink to="/account/profile" onClick={() => setUserOpen(false)}>Edit Profile</NavLink>
                  <NavLink to="/account/password" onClick={() => setUserOpen(false)}>Change Password</NavLink>
                  <div className="divider" />
                  <button type="button" onClick={() => { logout(); navigate('/login') }}>Logout</button>
                </div>
              </li>
            </ul>
          </div>
        </nav>
      </header>

      <aside className="main-sidebar" aria-hidden={isNarrow && collapsed}>
        <ul className="sidebar-menu">
          <li className={path === '/' || (path.startsWith('/vehicles') && !path.includes('/eol')) ? 'active' : ''}>
            <NavLink to="/vehicles" onClick={closeDrawer}><i className="fas fa-car fa-fw" /><span>Vehicles</span></NavLink>
          </li>
          <li className={path.startsWith('/drivers') ? 'active' : ''}>
            <NavLink to="/drivers" onClick={closeDrawer}><i className="fas fa-id-card fa-fw" /><span>Drivers</span></NavLink>
          </li>
          <li className={path.startsWith('/vehicles/eol') ? 'active' : ''}>
            <NavLink to="/vehicles/eol/due" onClick={closeDrawer}><i className="fas fa-hourglass-half fa-fw" /><span>EOL / Warranty</span></NavLink>
          </li>
          <li className={path.startsWith('/masters') ? 'active' : ''}>
            <NavLink to="/masters" onClick={closeDrawer}><i className="fas fa-database fa-fw" /><span>Masters</span></NavLink>
          </li>
          <li className={path.startsWith('/audit') ? 'active' : ''}>
            <NavLink to="/audit" onClick={closeDrawer}><i className="fas fa-clipboard-list fa-fw" /><span>Audit</span></NavLink>
          </li>
          <li className={path.startsWith('/users') ? 'active' : ''}>
            <NavLink to="/users" onClick={closeDrawer}><i className="fas fa-user-shield fa-fw" /><span>App users</span></NavLink>
          </li>
          {isAdmin ? (
            <li className={path.startsWith('/settings') ? 'active' : ''}>
              <NavLink to="/settings" onClick={closeDrawer}><i className="fas fa-cog fa-fw" /><span>Settings</span></NavLink>
            </li>
          ) : null}
        </ul>
      </aside>

      <div className="content-wrapper">
        {!hideHeader ? (
          <section className={`content-header${dense ? ' content-header--dense' : ''}`} key={`h-${location.pathname}`}>
            <h1>
              {title}
              {subtitle ? <small>{subtitle}</small> : null}
            </h1>
            <ol className="breadcrumb">
              <li><NavLink to="/">Home</NavLink></li>
              <li>{title}</li>
            </ol>
          </section>
        ) : null}
        {showSectionTabs && section ? <SectionTabs section={section} /> : null}
        <section className="content" key={`c-${location.pathname}`}>{children}</section>
      </div>

      <footer className="main-footer">
        <strong>Copyright &copy; {new Date().getFullYear()} {siteName}.</strong> Fleet &amp; Asset Management.
      </footer>
    </div>
  )
}

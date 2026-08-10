import PropTypes from 'prop-types';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useResponsive } from 'src/hooks/use-responsive';

import { bgBlur } from 'src/theme/css';

import Logo from 'src/components/logo';
import Iconify from 'src/components/iconify';

import { HEADER } from './config-layout';
import { getSubNavForPath } from './config-navigation';
import AccountPopover from './common/account-popover';

// ----------------------------------------------------------------------

function SectionNavLinks({ items, pathname }) {
  if (!items?.length) {
    return null;
  }

  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ ml: 2 }}>
      {items.map((page) => {
        const active = pathname === page.path || pathname.startsWith(`${page.path}/`);

        return (
          <Link
            key={page.path}
            component={RouterLink}
            href={page.path}
            underline="none"
            variant="subtitle2"
            sx={{
              color: active ? '#F4553B' : '#2879b6',
              fontWeight: active ? 600 : 500,
              whiteSpace: 'nowrap',
              transition: 'color 0.2s',
              '&:hover': {
                color: '#F4553B',
              },
            }}
          >
            {page.title}
          </Link>
        );
      })}
    </Stack>
  );
}

SectionNavLinks.propTypes = {
  items: PropTypes.array,
  pathname: PropTypes.string,
};

// ----------------------------------------------------------------------

export default function TopBar({ onToggleNav, showMenuButton = false, navItems }) {
  const theme = useTheme();
  const pathname = usePathname();
  const lgUp = useResponsive('up', 'lg');
  const items = navItems || getSubNavForPath(pathname);

  return (
    <AppBar
      position="fixed"
      sx={{
        boxShadow: 'none',
        height: HEADER.H_MOBILE,
        zIndex: theme.zIndex.appBar + 1,
        ...bgBlur({
          color: theme.palette.background.default,
        }),
        transition: theme.transitions.create(['height'], {
          duration: theme.transitions.duration.shorter,
        }),
        ...(lgUp && {
          height: HEADER.H_DESKTOP,
        }),
      }}
    >
      <Toolbar
        sx={{
          height: 1,
          px: { xs: 2, lg: 3 },
          gap: 1,
        }}
      >
        {showMenuButton && (
          <IconButton onClick={onToggleNav} edge="start" sx={{ mr: 0.5 }}>
            <Iconify icon="eva:menu-2-fill" />
          </IconButton>
        )}

        <Logo sx={{ mt: -1.25, flexShrink: 0 }} />

        <SectionNavLinks items={items} pathname={pathname} />

        <Box sx={{ flexGrow: 1 }} />

        <AccountPopover />
      </Toolbar>
    </AppBar>
  );
}

TopBar.propTypes = {
  onToggleNav: PropTypes.func,
  showMenuButton: PropTypes.bool,
  navItems: PropTypes.array,
};

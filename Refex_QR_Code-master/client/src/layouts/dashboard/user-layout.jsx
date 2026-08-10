import PropTypes from 'prop-types';

import Box from '@mui/material/Box';

import { useResponsive } from 'src/hooks/use-responsive';

import Main from './main';
import TopBar from './top-bar';
import Footer from './footer';
import { HEADER } from './config-layout';
import { SECTIONS, sectionSubNav } from './config-navigation';

// ----------------------------------------------------------------------

export default function UserLayout({ children }) {
  const lgUp = useResponsive('up', 'lg');
  const headerHeight = lgUp ? HEADER.H_DESKTOP : HEADER.H_MOBILE;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      <TopBar navItems={sectionSubNav[SECTIONS.qrCode]} showMenuButton={false} />

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          pt: `${headerHeight}px`,
        }}
      >
        <Main>{children}</Main>
        <Footer sx={{ py: 2 }} />
      </Box>
    </Box>
  );
}

UserLayout.propTypes = {
  children: PropTypes.node,
};

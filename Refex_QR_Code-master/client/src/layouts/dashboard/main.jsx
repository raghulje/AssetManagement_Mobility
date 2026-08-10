import PropTypes from 'prop-types';

import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

export default function Main({ children, sx, ...other }) {
  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        minWidth: 0,
        width: '100%',
        px: { xs: 2, md: 3 },
        py: 2,
        ...sx,
      }}
      {...other}
    >
      {children}
    </Box>
  );
}

Main.propTypes = {
  children: PropTypes.node,
  sx: PropTypes.object,
};

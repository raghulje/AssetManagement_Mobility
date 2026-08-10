import PropTypes from 'prop-types';

import { Stack } from '@mui/material';
// @mui
import Typography from '@mui/material/Typography';

// const FooterBox = styled('footer')(({ theme }) => ({
//   flexGrow: 1,
//   overflow: 'auto',
//   // height: theme.spacing(10),
//   paddingTop: 30,
//   backgroundColor: 'transparent',
// }));

export default function Footer({ sx, ...props }) {
  return (
    <Stack direction="row" justifyContent="center" sx={{ ...sx }} {...props}>
      <Typography color="text.disabled">
        Designed&nbsp;&&nbsp;Developed&nbsp;by&nbsp;
        <a
          href="https://www.refex.co.in/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit' }}
        >
          Refex IT
        </a>
        &nbsp;© {new Date().getFullYear()}
      </Typography>
    </Stack>
  );
}

Footer.propTypes = {
  sx: PropTypes.object,
};

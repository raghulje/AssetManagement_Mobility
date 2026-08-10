import PropTypes from 'prop-types';
import { QRCode } from 'react-qrcode-logo';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { downloadQrFromCanvas } from '../utils';

// ----------------------------------------------------------------------

export default function FixedUrlViewDialog({ open, onClose, item }) {
  if (!item) {
    return null;
  }

  const canvasId = `fixed-qr-view-${item.id}`;

  const handleDownload = () => {
    downloadQrFromCanvas(canvasId, item.code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>QR Code — {item.code}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} alignItems="center">
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: 'background.neutral',
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            <QRCode
              id={canvasId}
              value={item.value}
              size={240}
              quietZone={12}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ wordBreak: 'break-all', width: '100%' }}
          >
            {item.value}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={handleDownload}>
          Download PNG
        </Button>
      </DialogActions>
    </Dialog>
  );
}

FixedUrlViewDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};

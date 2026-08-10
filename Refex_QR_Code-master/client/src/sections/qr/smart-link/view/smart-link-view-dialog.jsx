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

import { downloadQrFromCanvas } from '../../fixed-url/utils';

// ----------------------------------------------------------------------

export default function SmartLinkViewDialog({ open, onClose, item }) {
  if (!item) {
    return null;
  }

  const canvasId = `smart-qr-view-${item.id}`;

  const handleDownload = () => {
    downloadQrFromCanvas(canvasId, item.code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Smart Link QR — {item.code}</DialogTitle>
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
              value={item.static_url}
              size={240}
              quietZone={12}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </Box>
          <Stack spacing={1.5} sx={{ width: '100%' }}>
            <Typography variant="subtitle2">Static URL (encoded in QR)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.static_url}
            </Typography>
            <Typography variant="subtitle2">Android</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.android_url}
            </Typography>
            <Typography variant="subtitle2">iPhone / iPad / macOS</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.ios_url}
            </Typography>
            <Typography variant="subtitle2">Fallback</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.fallback_url}
            </Typography>
          </Stack>
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

SmartLinkViewDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};

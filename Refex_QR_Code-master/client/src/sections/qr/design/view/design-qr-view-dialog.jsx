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

import { buildQrProps } from '../utils';
import { downloadQrFromCanvas } from '../../fixed-url/utils';

// ----------------------------------------------------------------------

export default function DesignQrViewDialog({ open, onClose, item }) {
  if (!item) {
    return null;
  }

  const canvasId = `design-qr-view-${item.id}`;
  const logoImage = item.design_config?.logoImage;
  const qrProps = buildQrProps({ value: item.value, ...item.design_config }, logoImage);

  const handleDownload = () => {
    downloadQrFromCanvas(canvasId, item.code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Design QR — {item.code}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} alignItems="center">
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: (theme) =>
                theme.palette.mode === 'light' ? theme.palette.grey[300] : theme.palette.grey[700],
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            <QRCode id={canvasId} {...qrProps} />
          </Box>
          <Stack spacing={1} sx={{ width: '100%' }}>
            <Typography variant="subtitle2">Name</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.name}
            </Typography>
            <Typography variant="subtitle2">Encoded value</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {item.value}
            </Typography>
            <Typography variant="subtitle2">Style</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.design_config?.qrStyle || 'squares'} · {item.design_config?.size || 300}px · EC{' '}
              {item.design_config?.ecLevel || 'M'}
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

DesignQrViewDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};

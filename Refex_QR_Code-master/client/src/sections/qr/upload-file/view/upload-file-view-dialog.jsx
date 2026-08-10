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
import { formatAccessMode } from '../filter-config';

// ----------------------------------------------------------------------

export default function UploadFileViewDialog({ open, onClose, item, onViewFile, onDownloadFile }) {
  if (!item) {
    return null;
  }

  const canvasId = `upload-file-qr-view-${item.id}`;

  const handleDownloadQr = () => {
    downloadQrFromCanvas(canvasId, item.code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload File QR — {item.code}</DialogTitle>
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
            <Typography variant="subtitle2">File</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.original_name} ({item.file_size_label})
            </Typography>
            <Typography variant="subtitle2">QR scan behavior</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatAccessMode(item.access_mode)}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" onClick={() => onViewFile(item)}>
          View file
        </Button>
        <Button variant="outlined" onClick={() => onDownloadFile(item)}>
          Download file
        </Button>
        <Button variant="contained" onClick={handleDownloadQr}>
          Download QR PNG
        </Button>
      </DialogActions>
    </Dialog>
  );
}

UploadFileViewDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
  onViewFile: PropTypes.func,
  onDownloadFile: PropTypes.func,
};

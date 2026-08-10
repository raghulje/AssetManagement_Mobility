import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

// ----------------------------------------------------------------------

export default function DynamicUrlEditDialog({ open, onClose, onSubmit, item, saving }) {
  const [dynamicValue, setDynamicValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && item) {
      setDynamicValue(item.dynamic_value || '');
      setError('');
    }
  }, [open, item]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!dynamicValue.trim()) {
      setError('Dynamic URL or data is required');
      return;
    }
    setError('');
    onSubmit(dynamicValue.trim());
  };

  if (!item) {
    return null;
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Edit Dynamic Link — {item.code}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Name: <strong>{item.name}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              Static URL (unchanged): {item.static_url}
            </Typography>
            <TextField
              required
              fullWidth
              multiline
              minRows={3}
              label="Dynamic URL / Data"
              value={dynamicValue}
              onChange={(e) => {
                setDynamicValue(e.target.value);
                setError('');
              }}
              error={Boolean(error)}
              helperText={error || 'Update where the static QR link redirects'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

DynamicUrlEditDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  item: PropTypes.object,
  saving: PropTypes.bool,
};

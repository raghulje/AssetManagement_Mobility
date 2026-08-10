import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

// ----------------------------------------------------------------------

export default function FixedUrlCreateDialog({ open, onClose, onSubmit, saving }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    setValue('');
    setError('');
    onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('URL or data is required');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Create Fixed URL QR Code</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              required
              fullWidth
              multiline
              minRows={3}
              label="URL / Data"
              placeholder="https://example.com or any text to encode"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              error={Boolean(error)}
              helperText={error || 'This value will be encoded in the QR code'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

FixedUrlCreateDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  saving: PropTypes.bool,
};

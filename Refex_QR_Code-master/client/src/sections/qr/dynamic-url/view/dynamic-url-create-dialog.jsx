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

export default function DynamicUrlCreateDialog({ open, onClose, onSubmit, saving }) {
  const [name, setName] = useState('');
  const [dynamicValue, setDynamicValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDynamicValue('');
      setError('');
    }
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!dynamicValue.trim()) {
      setError('Dynamic URL or data is required');
      return;
    }
    setError('');
    onSubmit({ name: name.trim(), dynamicValue: dynamicValue.trim() });
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Create Dynamic URL QR Code</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              required
              fullWidth
              label="Name"
              placeholder="e.g. product-launch"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              helperText="Used in the static QR link path"
            />
            <TextField
              required
              fullWidth
              multiline
              minRows={3}
              label="Dynamic URL / Data"
              placeholder="https://example.com/landing-page"
              value={dynamicValue}
              onChange={(e) => {
                setDynamicValue(e.target.value);
                setError('');
              }}
              error={Boolean(error)}
              helperText={error || 'This destination can be changed later without reprinting the QR'}
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

DynamicUrlCreateDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  saving: PropTypes.bool,
};

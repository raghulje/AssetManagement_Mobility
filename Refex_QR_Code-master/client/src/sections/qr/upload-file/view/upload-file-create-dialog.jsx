import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

// ----------------------------------------------------------------------

export default function UploadFileCreateDialog({ open, onClose, onSubmit, saving }) {
  const fileInputRef = useRef(null);
  const [name, setName] = useState('');
  const [accessMode, setAccessMode] = useState('view');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setAccessMode('view');
      setFile(null);
      setError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!file) {
      setError('Please choose a file to upload');
      return;
    }
    setError('');
    onSubmit({ name: name.trim(), accessMode, file });
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Create Upload File QR Code</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              required
              fullWidth
              label="Name"
              placeholder="e.g. product-brochure"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              helperText="Used in the static QR link path"
            />

            <FormControl fullWidth>
              <InputLabel>When QR is scanned</InputLabel>
              <Select
                label="When QR is scanned"
                value={accessMode}
                onChange={(e) => setAccessMode(e.target.value)}
              >
                <MenuItem value="view">View in browser</MenuItem>
                <MenuItem value="download">Download file</MenuItem>
              </Select>
            </FormControl>

            <Stack spacing={1}>
              <Button variant="outlined" component="label">
                Choose file
                <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />
              </Button>
              {file ? (
                <Typography variant="body2" color="text.secondary">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  PDF, images, Excel, videos, PPT, or any file type
                </Typography>
              )}
            </Stack>

            {error && (
              <Typography variant="caption" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Uploading…' : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

UploadFileCreateDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  saving: PropTypes.bool,
};

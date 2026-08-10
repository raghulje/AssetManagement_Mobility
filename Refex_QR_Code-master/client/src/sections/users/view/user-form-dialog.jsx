import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { ROLES } from 'src/utils/roles';

// ----------------------------------------------------------------------

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  userName: '',
  employeeId: '',
  companyName: '',
  designation: '',
  role: ROLES.User,
  password: '',
};

export default function UserFormDialog({ open, onClose, onSubmit, initialData, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              firstName: initialData.first_name || '',
              lastName: initialData.last_name || '',
              email: initialData.email || '',
              phone: initialData.phone || '',
              userName: initialData.user_name || '',
              employeeId: initialData.employee_id || '',
              companyName: initialData.company_name || '',
              designation: initialData.designation || '',
              role: initialData.role || ROLES.User,
            }
          : EMPTY_FORM
      );
    }
  }, [open, initialData]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  let submitLabel = 'Create';
  if (saving) submitLabel = 'Saving…';
  else if (initialData) submitLabel = 'Update';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{initialData ? 'Edit User' : 'Create User'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                required
                fullWidth
                label="First Name"
                value={form.firstName}
                onChange={handleChange('firstName')}
              />
              <TextField
                required
                fullWidth
                label="Last Name"
                value={form.lastName}
                onChange={handleChange('lastName')}
              />
            </Stack>
            <TextField
              required
              fullWidth
              type="email"
              label="Email"
              value={form.email}
              onChange={handleChange('email')}
            />
            {!initialData && (
              <TextField
                fullWidth
                type="password"
                label="Password (optional)"
                helperText="Leave blank to auto-generate; the password is emailed when the user is activated"
                value={form.password}
                onChange={handleChange('password')}
                inputProps={{ minLength: 6 }}
              />
            )}
            <TextField fullWidth label="Phone" value={form.phone} onChange={handleChange('phone')} />
            <TextField
              fullWidth
              label="Username"
              value={form.userName}
              onChange={handleChange('userName')}
            />
            <TextField
              fullWidth
              label="Employee ID"
              value={form.employeeId}
              onChange={handleChange('employeeId')}
            />
            <TextField
              fullWidth
              label="Company"
              value={form.companyName}
              onChange={handleChange('companyName')}
            />
            <TextField
              fullWidth
              label="Designation"
              value={form.designation}
              onChange={handleChange('designation')}
            />
            <TextField select fullWidth label="Role" value={form.role} onChange={handleChange('role')}>
              <MenuItem value={ROLES.User}>User</MenuItem>
              <MenuItem value={ROLES.Admin}>Admin</MenuItem>
              <MenuItem value={ROLES.SuperAdmin}>SuperAdmin</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

UserFormDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  initialData: PropTypes.object,
  saving: PropTypes.bool,
};

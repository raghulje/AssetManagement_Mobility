import axios from 'axios';
import { useSnackbar } from 'notistack';
import { QRCode } from 'react-qrcode-logo';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Select from '@mui/material/Select';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Pagination from '@mui/material/Pagination';
import FormControl from '@mui/material/FormControl';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';

import { isAdmin } from 'src/utils/roles';
import { useAuth } from 'src/context/AuthContext';

import Iconify from 'src/components/iconify';
import Scrollbar from 'src/components/scrollbar';

import { fetchAndOpenFile } from '../utils';
import { EMPTY_FILTER, formatAccessMode } from '../filter-config';
import { formatQrDate, downloadQrFromCanvas } from '../../fixed-url/utils';
import UploadFileFilterBar from './upload-file-filter-bar';
import UploadFileViewDialog from './upload-file-view-dialog';
import UploadFileEditDialog from './upload-file-edit-dialog';
import UploadFileCreateDialog from './upload-file-create-dialog';

// ----------------------------------------------------------------------

const USER_COLUMNS = [
  { id: 'code', label: 'ID' },
  { id: 'name', label: 'Name' },
  { id: 'static_url', label: 'Static URL' },
  { id: 'original_name', label: 'File Name' },
  { id: 'access_mode', label: 'Access' },
  { id: 'created_at', label: 'Created At' },
  { id: 'actions', label: '' },
];

const ADMIN_COLUMNS = [
  { id: 'code', label: 'ID' },
  { id: 'name', label: 'Name' },
  { id: 'static_url', label: 'Static URL' },
  { id: 'original_name', label: 'File Name' },
  { id: 'access_mode', label: 'Access' },
  { id: 'created_by', label: 'Created By' },
  { id: 'created_at', label: 'Created At' },
  { id: 'actions', label: '' },
];

export default function UploadFileList() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const [items, setItems] = useState([]);
  const [info, setInfo] = useState({ page: 1, limit: 10, total: 0, totalPage: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [refresh, setRefresh] = useState(0);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTER);
  const [appliedFilter, setAppliedFilter] = useState(EMPTY_FILTER);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [downloadItem, setDownloadItem] = useState(null);

  const columns = useMemo(() => (admin ? ADMIN_COLUMNS : USER_COLUMNS), [admin]);
  const hasAdvancedFilter = Boolean(appliedFilter.field && appliedFilter.value.trim());

  const action = useCallback(
    (snackbarId) => (
      <IconButton color="inherit" onClick={() => closeSnackbar(snackbarId)}>
        <Iconify icon="eva:close-outline" />
      </IconButton>
    ),
    [closeSnackbar]
  );

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        if (search.trim()) params.set('search', search.trim());
        if (appliedFilter.field && appliedFilter.value.trim()) {
          params.set('filterField', appliedFilter.field);
          params.set('filterOperator', appliedFilter.operator);
          params.set('filterValue', appliedFilter.value.trim());
        }

        const res = await axios.get(`/api/upload-file-qr?${params.toString()}`);
        if (res.data.status) {
          setItems(res.data.results || []);
          setInfo(res.data.info || { page: 1, limit: 10, total: 0, totalPage: 1 });
        } else {
          setItems([]);
          setInfo({ page: 1, limit: 10, total: 0, totalPage: 1 });
        }
      } catch (error) {
        setItems([]);
        setInfo({ page: 1, limit: 10, total: 0, totalPage: 1 });
        enqueueSnackbar(error?.response?.data?.message || error.message, {
          variant: 'error',
          action,
        });
      }
    };

    fetchItems();
  }, [page, limit, refresh, search, appliedFilter, enqueueSnackbar, action]);

  const handleApplyFilter = () => {
    setAppliedFilter({
      field: filterDraft.field,
      operator: filterDraft.operator,
      value: filterDraft.value.trim(),
    });
    setPage(1);
  };

  const handleClearFilter = () => {
    setFilterDraft(EMPTY_FILTER);
    setAppliedFilter(EMPTY_FILTER);
    setPage(1);
  };

  const handleCreate = async ({ name, accessMode, file }) => {
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('name', name);
      formData.append('accessMode', accessMode);
      formData.append('file', file);

      const res = await axios.post('/api/upload-file-qr', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      enqueueSnackbar(res.data.message || 'QR code created', {
        variant: res.data.status ? 'success' : 'error',
        action,
      });
      setCreateOpen(false);
      setRefresh((p) => p + 1);
    } catch (error) {
      enqueueSnackbar(error?.response?.data?.message || error.message, {
        variant: 'error',
        action,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async ({ accessMode, file }) => {
    if (!editItem) return;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('accessMode', accessMode);
      if (file) {
        formData.append('file', file);
      }

      const res = await axios.put(`/api/upload-file-qr/${editItem.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      enqueueSnackbar(res.data.message || 'Updated', {
        variant: res.data.status ? 'success' : 'error',
        action,
      });
      setEditItem(null);
      setRefresh((p) => p + 1);
    } catch (error) {
      enqueueSnackbar(error?.response?.data?.message || error.message, {
        variant: 'error',
        action,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      const res = await axios.delete(`/api/upload-file-qr/${deleteItem.id}`);
      enqueueSnackbar(res.data.message || 'Deleted', {
        variant: res.data.status ? 'success' : 'error',
        action,
      });
      setDeleteItem(null);
      setRefresh((p) => p + 1);
    } catch (error) {
      enqueueSnackbar(error?.response?.data?.message || error.message, {
        variant: 'error',
        action,
      });
    }
  };

  const handleDownloadQr = (row) => {
    setDownloadItem(row);
    setTimeout(() => {
      const ok = downloadQrFromCanvas(`upload-file-qr-dl-${row.id}`, row.code);
      if (!ok) {
        enqueueSnackbar('Could not download QR code', { variant: 'error', action });
      }
      setDownloadItem(null);
    }, 150);
  };

  const handleFileAction = async (row, mode) => {
    try {
      await fetchAndOpenFile(row, mode);
    } catch (error) {
      enqueueSnackbar(error?.response?.data?.message || error.message || 'Could not open file', {
        variant: 'error',
        action,
      });
    }
  };

  return (
    <Container maxWidth="xl">
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4">Upload File QR Codes</Typography>

        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" justifyContent="flex-end">
          <TextField
            size="small"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search ID, name, or file name…"
            sx={{ minWidth: { xs: '100%', sm: 280 } }}
          />

          <IconButton
            title={advancedFilterOpen ? 'Hide filters' : 'Show filters'}
            color={advancedFilterOpen || hasAdvancedFilter ? 'primary' : 'default'}
            onClick={() => setAdvancedFilterOpen((open) => !open)}
            sx={{
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              width: 40,
              height: 40,
            }}
          >
            <Iconify icon="eva:funnel-fill" />
          </IconButton>

          <Button
            variant="contained"
            startIcon={<Iconify icon="eva:plus-fill" />}
            onClick={() => setCreateOpen(true)}
          >
            Create QR Code
          </Button>
        </Stack>
      </Stack>

      <Card>
        <Collapse in={advancedFilterOpen}>
          <UploadFileFilterBar
            admin={admin}
            filter={filterDraft}
            onFilterChange={setFilterDraft}
            onApply={handleApplyFilter}
            onClear={handleClearFilter}
          />
        </Collapse>

        <Scrollbar>
          <TableContainer sx={{ overflow: 'unset' }}>
            <Table sx={{ minWidth: admin ? 1200 : 1080 }}>
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell key={col.id}>{col.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        No QR codes found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <Typography variant="body2" noWrap title={row.static_url}>
                          {row.static_url}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 160 }}>
                        <Typography variant="body2" noWrap title={row.original_name}>
                          {row.original_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={formatAccessMode(row.access_mode)}
                          color={row.access_mode === 'download' ? 'warning' : 'info'}
                          variant="soft"
                        />
                      </TableCell>
                      {admin && <TableCell>{row.created_by || '—'}</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatQrDate(row.created_at)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" title="View QR" onClick={() => setViewItem(row)}>
                            <Iconify icon="solar:eye-bold" />
                          </IconButton>
                          <IconButton
                            size="small"
                            title="View file"
                            onClick={() => handleFileAction(row, 'view')}
                          >
                            <Iconify icon="solar:document-bold" />
                          </IconButton>
                          <IconButton
                            size="small"
                            title="Download file"
                            onClick={() => handleFileAction(row, 'download')}
                          >
                            <Iconify icon="eva:download-outline" />
                          </IconButton>
                          <IconButton size="small" title="Download QR" onClick={() => handleDownloadQr(row)}>
                            <Iconify icon="mdi:qrcode" />
                          </IconButton>
                          <IconButton size="small" title="Edit" onClick={() => setEditItem(row)}>
                            <Iconify icon="solar:pen-bold" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            title="Delete"
                            onClick={() => setDeleteItem(row)}
                          >
                            <Iconify icon="solar:trash-bin-trash-bold" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Scrollbar>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ p: 2 }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Total: {info.total || 0}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 88 }}>
              <Select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Pagination
            count={info.totalPage || 1}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
          />
        </Stack>
      </Card>

      <UploadFileCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        saving={saving}
      />

      <UploadFileViewDialog
        open={Boolean(viewItem)}
        onClose={() => setViewItem(null)}
        item={viewItem}
        onViewFile={(row) => handleFileAction(row, 'view')}
        onDownloadFile={(row) => handleFileAction(row, 'download')}
      />

      <UploadFileEditDialog
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        onSubmit={handleEdit}
        item={editItem}
        saving={saving}
      />

      <Dialog open={Boolean(deleteItem)} onClose={() => setDeleteItem(null)}>
        <DialogTitle>Delete QR Code</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete <strong>{deleteItem?.code}</strong> and its uploaded file? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {downloadItem && (
        <Box sx={{ position: 'fixed', left: -9999, top: -9999, opacity: 0, pointerEvents: 'none' }}>
          <QRCode
            id={`upload-file-qr-dl-${downloadItem.id}`}
            value={downloadItem.static_url}
            size={512}
            quietZone={16}
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </Box>
      )}
    </Container>
  );
}

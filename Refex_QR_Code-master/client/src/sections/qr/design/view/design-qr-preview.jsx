import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCode } from 'react-qrcode-logo';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import Iconify from 'src/components/iconify';

import { buildQrProps, getQrCanvasSize } from '../utils';
import { downloadQrFromCanvas } from '../../fixed-url/utils';

// ----------------------------------------------------------------------

const PREVIEW_QR_MAX_WIDTH = 500;
const PREVIEW_MAT_PADDING = 24;
const ACTION_BUTTON_WIDTH = 120;

function getPreviewScale(canvasPx, maxContentWidth) {
  const maxContent = Math.min(PREVIEW_QR_MAX_WIDTH, maxContentWidth);
  if (canvasPx <= maxContent) return 1;
  return maxContent / canvasPx;
}

export default function DesignQrPreview({
  design,
  logoPreview,
  canvasId,
  saving,
  editingId,
  onNameChange,
  onSave,
}) {
  const scrollRef = useRef(null);
  const [contentMaxWidth, setContentMaxWidth] = useState(PREVIEW_QR_MAX_WIDTH);

  const exportCanvasId = `${canvasId}-export`;
  const qrProps = buildQrProps(design, logoPreview);
  const canvasPx = getQrCanvasSize(design);
  const previewScale = useMemo(
    () => getPreviewScale(canvasPx, contentMaxWidth),
    [canvasPx, contentMaxWidth]
  );
  const displayPx = Math.round(canvasPx * previewScale);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const updateWidth = () => {
      const available = el.clientWidth - PREVIEW_MAT_PADDING * 2;
      setContentMaxWidth(Math.max(120, Math.min(PREVIEW_QR_MAX_WIDTH, available)));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const handleDownload = () => {
    setTimeout(() => {
      downloadQrFromCanvas(exportCanvasId, design.name?.trim() || 'qr-design');
    }, 200);
  };

  const saveLabel = (() => {
    if (saving) return 'Saving…';
    if (editingId) return 'Update';
    return 'Save';
  })();

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        flexWrap="nowrap"
        sx={{
          flexShrink: 0,
          pb: 1.5,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          Live Preview
        </Typography>

        <TextField
          size="small"
          placeholder="Design name"
          value={design.name}
          onChange={(e) => onNameChange(e.target.value)}
          sx={{ flex: '1 1 auto', minWidth: 0 }}
        />

        <Button
          size="small"
          variant="contained"
          startIcon={<Iconify icon="eva:download-outline" width={18} />}
          onClick={handleDownload}
          sx={{ flexShrink: 0, width: ACTION_BUTTON_WIDTH, minWidth: ACTION_BUTTON_WIDTH }}
        >
          Download
        </Button>

        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<Iconify icon="eva:save-outline" width={18} />}
          onClick={() => onSave(design)}
          disabled={saving}
          sx={{ flexShrink: 0, width: ACTION_BUTTON_WIDTH, minWidth: ACTION_BUTTON_WIDTH }}
        >
          {saveLabel}
        </Button>
      </Stack>

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          mt: 1.5,
          width: '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          borderRadius: 1.5,
          bgcolor: (theme) =>
            theme.palette.mode === 'light' ? theme.palette.grey[300] : theme.palette.grey[700],
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            p: `${PREVIEW_MAT_PADDING}px`,
            minHeight: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Box
            sx={{
              width: displayPx,
              height: displayPx,
              flexShrink: 0,
              overflow: 'hidden',
              lineHeight: 0,
            }}
          >
            <Box
              sx={{
                width: canvasPx,
                height: canvasPx,
                transform: previewScale < 1 ? `scale(${previewScale})` : 'none',
                transformOrigin: 'top left',
                lineHeight: 0,
              }}
            >
              <QRCode id={canvasId} {...qrProps} />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0,
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <QRCode id={exportCanvasId} {...qrProps} />
      </Box>
    </Box>
  );
}

DesignQrPreview.propTypes = {
  design: PropTypes.object.isRequired,
  logoPreview: PropTypes.string,
  canvasId: PropTypes.string,
  saving: PropTypes.bool,
  editingId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onNameChange: PropTypes.func,
  onSave: PropTypes.func,
};

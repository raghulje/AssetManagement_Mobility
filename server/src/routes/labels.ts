import { Router } from 'express'
import { fail, okItem, okMessage } from '../utils/response.js'
import { generateLabelsPdf, generateSingleLabel } from '../services/labels.js'

const router = Router()

router.get('/templates', (_req, res) => {
  return okItem(res, {
    rows: [
      {
        name: 'Default 4x2',
        unit: 'in',
        width: 4,
        height: 2,
        support_1d_barcode: true,
        support_2d_barcode: true,
        fields: ['asset_tag', 'name', 'model', 'serial', 'location'],
      },
    ],
  })
})

/** POST { asset_tags: string[] } → { pdf_base64, count } */
router.post('/', async (req, res) => {
  const tags = req.body?.asset_tags || req.body?.assets || []
  if (!Array.isArray(tags) || !tags.length) return fail(res, 'asset_tags array required')
  try {
    const result = await generateLabelsPdf(tags, { userId: req.user?.id })
    return okItem(res, result)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Label generation failed')
  }
})

router.get('/hardware/:id', async (req, res) => {
  try {
    const result = await generateSingleLabel(Number(req.params.id), { userId: req.user?.id })
    if (req.query.download === '1') {
      const buf = Buffer.from(result.pdf_base64, 'base64')
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="print-label-${req.params.id}.pdf"`)
      return res.send(buf)
    }
    return okItem(res, result)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Label generation failed')
  }
})

router.post('/hardware/:id', async (req, res) => {
  try {
    const result = await generateSingleLabel(Number(req.params.id), { userId: req.user?.id })
    return okMessage(res, 'Print label generated', result)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Label generation failed')
  }
})

export default router

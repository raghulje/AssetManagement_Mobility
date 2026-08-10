import 'dotenv/config'
import { syncMastersFromEmployees } from '../src/services/hrmsMastersSync.js'

const summary = await syncMastersFromEmployees()
console.log(JSON.stringify(summary, null, 2))

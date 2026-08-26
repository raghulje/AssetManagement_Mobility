import dotenv from 'dotenv'
dotenv.config()

import { provisionVerifiers } from '../src/services/provisionVerifiers.js'

const result = await provisionVerifiers()
console.log(JSON.stringify(result, null, 2))
process.exit(result.errors.length ? 1 : 0)

// server/db.js
import postgres from 'postgres'
import 'dotenv/config'

const sql = postgres(process.env.DATABASE_URL, { max: 10 })
export default sql

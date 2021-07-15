import GraphSync from '..'
import pg from 'pg'

const connectionString = process.env.PG

const pgPool = new pg.Pool({ connectionString })
const graphSync = new GraphSync({ pgPool })

async function runTests() {
  await graphSync.registerTable({
    tableName: 'cuisines',
    getLabels: () => ['Cuisine']
  })
  console.log(graphSync.tables)
}

runTests()
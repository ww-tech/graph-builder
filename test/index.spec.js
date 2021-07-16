import GraphSync from '..'
import pg from 'pg'
import pgSetup from '@databases/pg-test/jest/globalSetup'
import pgTeardown from '@databases/pg-test/jest/globalTeardown'
import test from 'ava'
import fs from 'fs'

let pgPool
let graphSync

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const findOne = async (tableName, id) => {
  const { rows } = await graphSync.pgQuery(`select * from "${tableName}" where id = $1`, [id])
  return rows[0]
}

test.before(async function () {
  await pgSetup()
  await wait(1000)
  pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  graphSync = new GraphSync({ pgPool })
  const sql = fs.readFileSync(`${__dirname}/fixtures.sql`, 'utf8')
  await graphSync.pgQuery(sql)
})

test.serial('registerTable', async t => {
  await graphSync.registerTable({
    tableName: 'authors',
    getLabels: () => ['Person', 'Author'],
    getProperties: row => row
  })
  await graphSync.registerTable({
    tableName: 'books',
    getLabels: () => ['Book'],
    getProperties: row => ({ id: row.id, title: row.title })
  })
  t.is(graphSync.tables.books.foreignKeys.author.foreignTable, 'authors')
  t.deepEqual(graphSync.tables.books.getLabels(), ['Book'])
})

test.serial('generateNode single label', async t => {
  const row = await findOne('books', 1)
  const cypher = await graphSync.generateNode({
    tableName: 'books',
    row
  })
  t.is(cypher, "MERGE (:Book {id: 1, title: 'The Great Gatsby'});")
})

test.serial('generateNode multiple labels', async t => {
  const row = await findOne('authors', 1)
  const cypher = await graphSync.generateNode({
    tableName: 'authors',
    row
  })
  t.is(cypher, "MERGE (:Person:Author {id: 1, name: 'F. Scott Fitzgerald'});")
})


test.after(() => {
  pgTeardown()
})
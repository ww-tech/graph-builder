import GraphSync from '..'
import pg from 'pg'
import pgSetup from '@databases/pg-test/jest/globalSetup'
import pgTeardown from '@databases/pg-test/jest/globalTeardown'
import test from 'ava'
import fs from 'fs'

let pgPool
let graphSync
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

test.before(async function () {
  // this.timeout(120*1000);
  await pgSetup()
  //set timeout to make sure the in-memory-db is already setup.
  await wait(5000)
  pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  graphSync = new GraphSync({ pgPool })
  const sql = fs.readFileSync(`${__dirname}/fixtures.sql`, 'utf8')
  await graphSync.pgQuery(sql)
})

test.serial('register tables', async t => {
  await graphSync.registerTable({
    tableName: 'authors',
    getLabels: () => ['Author'],
    getProperties: row => row
  })
  await graphSync.registerTable({
    tableName: 'books',
    getLabels: () => ['Book'],
    getProperties: row => ({ id: row.id, title: row.title })
  })
  t.is(graphSync.tables.books.foreignKeys.author.foreignTable, 'authors')
  t.is(graphSync.tables.books.getLabels()[0], 'Book')
})

test.serial('generate node', async t => {
  const { rows } = await graphSync.pgQuery('select * from books where id = $1', [1])
  const cypher = await graphSync.generateNode({
    tableName: 'books',
    row: rows[0]
  })
  t.is(cypher, "MERGE (:Book {id: 1, title: 'The Great Gatsby'});")
})

test.after(() => {
  pgTeardown()
})
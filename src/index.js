export default class GraphSync {
  constructor({ pgPool, neo4jClient, kafkaConsumerClient }) {
    this.pgPool = pgPool
    this.neo4jClient = neo4jClient
    this.kafkaConsumerClient = kafkaConsumerClient
    this.tables = {}
  }

  async registerTable(options = {}) {
    const {
      tableName,
      getLabels,
      getProperties,
      getRelationships
    } = options
    if (!tableName) throw new Error('registerTable: `tableName` is required.')
    this.tables[tableName] = {
      foreignKeys: await this.getForeignKeys(tableName),
      getLabels,
      getProperties,
      getRelationships
    }
  }

  async pgQuery(sql, values) {
    const client = await this.pgPool.connect()
    const result = await client.query(sql, values)
    client.release()
    return result
  }

  async getForeignKeys(tableName) {
    const { rows } = await this.pgQuery(`
      SELECT conname, pg_catalog.pg_get_constraintdef(r.oid, true) as condef
      FROM pg_catalog.pg_constraint r
      WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = $1)
      AND r.contype = 'f'
    `, [tableName])
    const foreignKeys = {}
    rows.forEach(r => {
      var regExp = /\(([^)]+)\) REFERENCES (.+)\(([^)]+)\)/
      var matches = regExp.exec(r.condef)
      foreignKeys[r.conname] = {
        constraintName: r.conname,
        table: tableName,
        columns: matches[1].replace(/"/g,'').split(', '),
        foreignTable: matches[2].replace(/"/g,''),
        foreignColumns: matches[3].replace(/"/g,'').split(', ')
      }
    })
    return foreignKeys
  }

}
import stringifyProperties from './stringifyProperties'

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
      primaryKey: await this.getPrimaryKey(tableName),
      foreignKeys: await this.getForeignKeys(tableName),
      getLabels,
      getProperties,
      getRelationships
    }
  }

  async generateNode(options = {}) {
    const { tableName, row } = options
    if (!tableName) throw new Error('generateNode: `tableName` is required.')
    if (!row) throw new Error('generateNode: `row` is required.')
    const { getLabels, getProperties } = this.tables[tableName]
    if (!getLabels) return
    const labels = await getLabels(row)
    if (!labels.length) return
    if (!getProperties) throw new Error('generateNode: `getProperties` is undefined.')
    const labelStr = `:${labels.join(':')}`
    const properties = await getProperties(row)
    return `MERGE (${labelStr} ${stringifyProperties(properties)});`
  }

  async generateRelationships(options = {}) {
    const { tableName, row } = options
    if (!tableName) throw new Error('generateRelationships: `tableName` is required.')
    if (!row) throw new Error('generateRelationships: `row` is required.')
    const { getRelationships } = this.tables[tableName]
    if (!getRelationships) return
    const relationships = await getRelationships(row)
    if (!relationships.length) return
    const cypherQueries = await Promise.all(relationships.map(relationship => {
      return this.createRelationship({
        relationship,
        tableName,
        row
      })
    }))
    return cypherQueries.join('\n')
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

  async getPrimaryKey(tableName) {
    const { rows } = await this.pgQuery(`
      SELECT
        c.relname,
        pg_catalog.pg_get_constraintdef(con.oid, true) as def,
        con.conname,
        con.conkey
      FROM
        pg_catalog.pg_class c,
        pg_catalog.pg_index i
      LEFT JOIN pg_catalog.pg_constraint con ON (conrelid = i.indrelid AND conindid = i.indexrelid)
      WHERE c.oid = i.indrelid
      AND con.contype = 'p'
      AND c.relname = $1
      ORDER BY i.indisprimary DESC, i.indisunique DESC
    `, [tableName])
    const [row] = rows
    if (!row) return
    const regExp = /\(([^)]+)\)/
    const matches = regExp.exec(row.def)
    return matches[1].replace(/"/g,'').split(', ')
  }

  getLabelString(tableName, row) {
    return `:${this.tables[tableName].getLabels(row).join(':')}`
  }

  async findOne(tableName, query) {
    const columns = Object.keys(query).map(key => key.replace(/\W/g, ''))
    const values = columns.map(col => query[col])
    const where = 'WHERE ' + columns.map((col, idx) => `"${col}"=$${idx + 1}`).join(" AND ")
    const sql = `SELECT * FROM "${tableName}" ${where}`
    const { rows } = await this.pgQuery(sql, values)
    return rows[0]
  }

  async createRelationship({ tableName, row, relationship }) {
    const { foreignKeys, primaryKey } = this.tables[tableName]
    const variables = relationship.match(/\(.*?\)/g).map(key => key.replace(/[()]/g, ''))
    const match = []
    const where = []
    await Promise.all(variables.map(async variable => {
      if (variable === 'this') {
        const thisLabelString = this.getLabelString(tableName, row)
        match.push(`(this${thisLabelString})`)
        primaryKey.forEach(col => {
          where.push(`this.${col} = '${row[col]}'`)
        })
        return
      }
      if (!foreignKeys[variable]) throw new Error(`FK ${variable} does not exist.`)
      const { foreignTable, foreignColumns, columns } = foreignKeys[variable]
      const query = {}
      foreignColumns.forEach((col, i) => {
        query[col] = row[columns[i]]
        const value = query[col]
        if (!value) {
          const err = new Error('No foreign key value')
          err.silent = true
          throw err
        }
        where.push(`${variable}.${col} = '${value}'`)
      })
      const foreignRow = await this.findOne(foreignTable, query)
      const labelString = this.getLabelString(foreignTable, foreignRow)
      match.push(`(${variable}${labelString})`)
    }))
    return `MATCH ${match.join(', ')} WHERE ${where.join(' AND ')} MERGE ${relationship};`
  }

}
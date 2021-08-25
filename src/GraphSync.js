import { stringifyProperties, setPropertiesString, quote } from './stringHelper'
import Cursor from 'pg-cursor';
import Promise from 'bluebird';
import logger from './logger';

const GRAPH_NODE = 'node';
const GRAPH_REL = 'relationships';
const DELETE = 'DELETE';
const MERGE = 'MERGE';
export default class GraphSync {
  constructor({ pgPool, neo4jClient, kafkaConsumerClient }) {
    this.pgPool = pgPool
    this.neo4jClient = neo4jClient
    this.kafkaConsumerClient = kafkaConsumerClient
    this.tables = {}
  }
  async load(type, batchSize = 1000) {
    const tableArray = Object.keys(this.tables);
    //sync
    await Promise.each(tableArray, async(tableName) => {
      const { getLabels, getRelationships, primaryKey } = this.tables[tableName];
      if (type === GRAPH_NODE && !getLabels) return;
      if (type === GRAPH_REL && !getRelationships) return;
      if (type === GRAPH_NODE) {
        const labels = await getLabels();
        await this.neo4jClient.createUniqueConstraint(labels, primaryKey);
      }
      const client = await this.pgPool.connect()
      const cursor = client.query(new Cursor(`select * from "${tableName}"`));
      while (true) {
        const rows = await cursor.read(batchSize);
        if (rows.length === 0) {
          cursor.close(() => {
            client.release();
          });
          break;
        }
        await Promise.map(rows, async (row) => {
          if (type === GRAPH_NODE) {
            const nodeCypher = await this.generateNode(tableName, row);
            if (nodeCypher) await this.neo4jClient.run(nodeCypher);
          } else {
            const relCypher = await this.generateRelationships(tableName, row);
            if (relCypher) await this.neo4jClient.run(relCypher);
          }
        }, {
          concurrency: this.neo4jClient.getPoolSize()
        });
      }
    });
  }

  async autoRegisterAllTables({
    getTopic,
    exclusiveTables = []
  } = {}){
    const { rows } = await this.pgQuery(`SELECT *
        FROM pg_catalog.pg_tables
        WHERE schemaname != 'pg_catalog' AND 
        schemaname != 'information_schema';`);
    await Promise.all(rows.map(async row => {
      const tableName = row.tablename;
      if (exclusiveTables.includes(tableName)) return;
      const foreignKeys = await this.getForeignKeys(tableName);
      const relationships = Object.keys(foreignKeys).map(key => {
        return { from: 'this', to: key, label: `has_${key}`};
      });
      await this.registerTable({
        tableName,
        getLabels: () => [tableName],
        getProperties: r => r,
        getRelationships: r => relationships,
        topic: getTopic(tableName)
      });
    }));
  }

  async initialLoad({ batchSize = 1000 } = {}) {
    if (this.kafkaConsumerClient) {
      //set kafka offset to latest.
      await this.listen();//commit the last offset to kafka
      await this.kafkaConsumerClient.pause();
    }
    //import data from pg to neo4j.
    await this.load(GRAPH_NODE, batchSize);
    await this.load(GRAPH_REL, batchSize);
  }

  async registerTable(options = {}) {
    const {
      tableName,
      getLabels,
      getProperties,
      getRelationships,
      topic
    } = options
    if (!tableName) throw new Error('registerTable: `tableName` is required.')
    this.tables[tableName] = {
      tableName,
      primaryKey: await this.getPrimaryKey(tableName),
      foreignKeys: await this.getForeignKeys(tableName),
      getLabels,
      getProperties,
      getRelationships,
      topic
    }
    if (this.kafkaConsumerClient && topic) {
      await this.kafkaConsumerClient.subscribe({ topic });
    } else {
      logger.info(`The topic of table(${tableName}) is not subscribed`);
    }
  }

  /**
   * Generate the cypher query to add a node to the graph
   * @param tableName {String}
   * @param row {Object}
   */
  async generateNode(tableName, row, { op = MERGE } = {}) {
    if (!tableName) throw new Error('generateNode: `tableName` is required.')
    if (!row) throw new Error('generateNode: `row` is required.')
    const { getLabels, getProperties, primaryKey } = this.tables[tableName]
    if (!getLabels) return
    const labels = await getLabels(row)
    if (!labels.length) return
    if (!getProperties) throw new Error('generateNode: `getProperties` is undefined.')
    const labelStr = `:${labels.join(':')}`
    const properties = await getProperties(row)
    const pkObject = {};
    primaryKey.forEach(pk => {
      pkObject[pk] = row[pk]
    });
    if (op === DELETE) {
      return `MATCH (varName${labelStr} ${stringifyProperties(pkObject)}) DETACH DELETE varName;`
    } else {
      const setStr = setPropertiesString('varName', properties);
      return `MERGE (varName${labelStr} ${stringifyProperties(pkObject)}) ON CREATE ${setStr} ON MATCH ${setStr};`;
    }
  }

  /**
   * Generate the cypher query to add a relationship to existing nodes on the graph
   * @param tableName {String}
   * @param row {Object}
   */
  async generateRelationships(tableName, row, { op = MERGE } = {}) {
    if (!tableName) throw new Error('generateRelationships: `tableName` is required.')
    if (!row) throw new Error('generateRelationships: `row` is required.')
    const { getRelationships } = this.tables[tableName]
    if (!getRelationships) return
    const relationships = await getRelationships(row)
    if (!relationships.length) return
    const cypherQueries = await Promise.all(relationships.map(relationship => {
      return this.generateRelationship({
        relationship,
        tableName,
        row,
        op
      })
    }))
    return cypherQueries.filter(q => q);
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

  async generateRelationship({ tableName, row, relationship, op = MERGE } = {}) {
    const { foreignKeys, primaryKey } = this.tables[tableName]
    // const variables = relationship.match(/\(.*?\)/g).map(key => key.replace(/[()]/g, ''))
    const { from, to, label } = relationship;
    if (!label) throw Error('relationship label can not be empty');
    const variables = [from, to];
    const match = [];
    const where = [];
    let noForeignKey = false;
    await Promise.map(variables, async (variable, idx) => {
      if (variable === 'this') {
        const thisLabelString = this.getLabelString(tableName, row)
        primaryKey.forEach(col => {
          where.push(`this.${col} = ${quote(row[col])}`)
        });
        match[idx] = `(this${thisLabelString})`;
        return
      }
      if (!foreignKeys[variable]) throw new Error(`FK ${variable} does not exist.`)
      const { foreignTable, foreignColumns, columns } = foreignKeys[variable]
      const query = {}
      foreignColumns.forEach((col, i) => {
        query[col] = row[columns[i]]
        const value = query[col]
        if (!value) {
          noForeignKey = true;
          return;
        }
        where.push(`${variable}.${col} = ${quote(value)}`)
      });
      if (noForeignKey) return;
      const foreignRow = await this.findOne(foreignTable, query)
      const labelString = this.getLabelString(foreignTable, foreignRow)
      match[idx] = `(${variable}${labelString})`;
    });
    if (noForeignKey || match.length === 0) return;
    if (op === DELETE) {
      return `MATCH ${match[0]}-[rel:${label}]->${match[1]} WHERE ${where.join(' AND ')} DELETE rel;`
    } else {
      const merge = `(${variables[0]})-[:${label}]->(${variables[1]})`;
      return `MATCH ${match.join(', ')} WHERE ${where.join(' AND ')} MERGE ${merge};`
    }
  }

  async listen() {
    await this.kafkaConsumerClient.run(async ({ topic, partition, message, parsedValue }) => {
      const { before, after, source, op } = parsedValue;
      const { table } = source;
      if (before) {
        //remove old relationships.
        const delRelCypher = await this.generateRelationships(table, before, { op: DELETE });
        if (delRelCypher) {
          await this.neo4jClient.run(delRelCypher);
        }
      }

      if (op === 'u' || op === 'c') {
        const nodeCypher = await this.generateNode(table, after);
        if (nodeCypher) await this.neo4jClient.run(nodeCypher);
        const relCypher = await this.generateRelationships(table, after);
        if (relCypher) await this.neo4jClient.run(relCypher);
      } else if(op === 'd') {
        const nodeCypher = await this.generateNode(table, before, { op: DELETE });
        if (nodeCypher) await this.neo4jClient.run(nodeCypher);
      }
    });
  }
}

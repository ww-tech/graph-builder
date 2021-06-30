export default class GraphSync {
  constructor({ pgClient, neo4jClient, kafkaConsumerClient }) {
    this.pgClient = pgClient
    this.neo4jClient = neo4jClient
    this.kafkaConsumerClient = kafkaConsumerClient
    this.tables = {}
  }

  registerTable(options = {}) {
    const {
      tableName,
      getLabels,
      getProperties,
      getRelationships
    } = options
    if (tableName) throw new Error('registerTable() `tableName` is required.')
  }

}
import neo4j from 'neo4j-driver';

export default class Neo4jClient {
  constructor({ uri, user, password, db, config = {} } = {}) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), config);
    this.db = db;
    this.poolSize = config.max_connection_pool_size || 100;
  }

  getPoolSize() {
    return this.poolSize;
  }

  session() {
    return this.driver.session({ database: this.db });
  }

  async run(cypher, params = {}) {
    const session = this.session();
    const res = await session.run(cypher, params).catch(err => {
      session.close();
      throw err;
    });
    session.close();
    return res;
  }
};

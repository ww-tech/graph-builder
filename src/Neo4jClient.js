import neo4j from 'neo4j-driver';
import Promise from 'bluebird';
import logger from './logger';
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

  async createUniqueConstraint(labels, pkColumns) {
    if (pkColumns.length > 1) {
      logger.warn(`${labels.join(':')}'s PK keys' length is larger than 1, failed to create an unique constraint`);
      return;
    }
    await Promise.map(labels, label => {
      const cypher = `CREATE CONSTRAINT ${label}_unique_constraint IF NOT EXISTS
        ON (n:${label})
        ASSERT (${pkColumns.map(c => `n.${c}`).join(',')}) IS UNIQUE`;
      return this.run(cypher);
    });
  }
  async run(cyphers, params = {}) {
    if (!cyphers) return;
    const session = this.session();
    if (typeof cyphers === 'string') cyphers = [cyphers];
    const res = await Promise.each(
      cyphers,
      async (cypher) => {
        logger.debug(cypher);
        const res = await session.run(cypher, params)
        return res;
      }
    ).catch(err => {
      logger.error(err);
      session.close();
      throw err; 
    });
    session.close();
    if (cyphers.length === 1) return res[0];
    return res;
  }
};

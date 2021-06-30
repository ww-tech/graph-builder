# GraphSync

Keep PostgreSQL and Neo4j in sync using Kafka Connector.

## Usage

#### `new GraphSync(options)` - Create a GraphSync instance
- `options` {Object}
  - `pgClient` {Pool} postgres client (must have `connect()` method)
  - `neo4jClient` {GraphDatabase} neo4j client (must have `cypher()` method)
  - `kafkaConsumer` {Consumer} kafka consumer (must have `run()` method)

#### `registerTable(options)` - Configure mapping between rows and nodes
- `options` {Object}
  - `tableName` {String} the name of the table
  - `getLabels` {Function} returns the labels for the node
  - `getProperties` {Function} returns the properties for the node
  - `getRelationships` {Function} returns the relationships for the node

#### `generateNode(options)` - Get cypher query for creating a node
- `options` {Object}
  - `tableName` {String} the name of the table
  - `row` {Object} the relational row data
- Returns {String} cypher query to create node

#### `generateRelationships(options)` - Get cypher query for creating relationships
- `options` {Object}
  - `tableName` {String} the name of the table
  - `row` {Object} the relational row data
- Returns {String} cypher query to create relationships

#### `initialLoad()` - Read all relational rows and write all graph nodes and relationships

#### `listen()` - Listen for messages on the Kafka topic and update the graph

## Example

### 1. Define the relational schema with foreign keys

```sql
CREATE TABLE cuisine (
  id uuid,
  name text
)

CREATE TABLE foods (
  id uuid,
  name text,
  metadata jsonb
)

CREATE TABLE recipes (
  id uuid,
  name text,
  cuisine_id uuid,
  CONSTRAINT cuisine FOREIGN KEY (cuisine_id) REFERENCES cuisines (id)
)

CREATE TABLE ingredients (
  recipe_id uuid,
  food_id uuid,
  CONSTRAINT recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id),
  CONSTRAINT food FOREIGN KEY (food_id) REFERENCES foods (id)
)
```

### 2. Instantiate Graph Sync

```js
import GraphSync from 'graph-sync'
import pg from 'pg'
import neo4j from 'neo4j-driver'
import Kafka from 'kafka'

const pgClient = new pg.Pool()
const neo4jDriver = neo4j.driver()
const kafka = new Kafka()
const kafkaConsumer = kafka.consumer()
const graphSync = new GraphSync({ pgClient, neo4jDriver, kafkaConsumer })
```

### 3. Define the nodes, labels, properties and relationships for the graph

```js
// Specify the relational table and corresponding label for the graph.
graphSync.registerTable({
  tableName: 'cuisines',
  getLabels: () => ['Cuisine']
})

// By default, all relational columns (except foreign keys) are saved
// as properties for the nodes in the graph. You can transform the
// data if you want different custom properties in the graph.
graphSync.registerTable({
  tableName: 'foods',
  getLabels: row => row.isBeverage ? ['Beverage'] : ['Food'],
  getProperties: row => ({ ...row, myCustomProperty: 123 })
})

// You can create one-to-many relationships between "this" node and 
// another node using the name of the foreign key constraint.
graphSync.registerTable({
  tableName: 'recipes',
  getLabels: () => ['Recipe'],
  getRelationships: row => ['(this)-[:HAS_CUISINE]->(cuisine)']
})

// You can create many-to-many relationships between foreign keys.
// We've omitted a label, so it will not create a node on the graph.
graphSync.registerTable({
  tableName: 'ingredients',
  getRelationships: row => ['(recipe)-[:HAS_INGREDIENT]->(food)']
})
```

### 4. Create the graph and/or keep it in sync

```js
// Generate the graph and sync it to Neo4j
await graphSync.initialLoad()

// Subscribe to the Kafka topic and update the graph
graphSync.listen()
```

## Known Issues

1. Multi-column foreign key constraints are not yet supported.
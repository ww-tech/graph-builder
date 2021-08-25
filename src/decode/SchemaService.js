import axios from 'axios';

export default class SchemaService {
  constructor(url) {
    this.url = url;
    this.schemaCache = {};
  }

  async getSchemaById(id) {
    if (this.schemaCache[id]) return this.schemaCache[id]; 
    const res = await axios.get(`${this.url}/schemas/ids/${id}`);
    this.schemaCache[id] = res.data;
    return res.data;
  };
};

import avsc from 'avsc';
import SchemaService from './SchemaService';

export default class AvroDecoder {
  constructor(registryUrl) {
    this.SchemaService = new SchemaService(registryUrl);
  }
  async decode(message) {
    const { value: msgVal } = message;
    if (!msgVal) return;
    if (msgVal.readUInt8(0) !== 0) throw Error(`Error message, ${message.value.toString()}`);
    const id = msgVal.readUInt32BE(1);
    const { schema } = await this.SchemaService.getSchemaById(id);
    const parsedSchema = avsc.parse(schema);
    const parsedVal = parsedSchema.fromBuffer(msgVal.slice(5))
    return parsedVal;
  }
};

import AvroDecoder from './AvroDecoder';

export const createAvroDecoder = (registryUrl) => {
  return new AvroDecoder(registryUrl);
};

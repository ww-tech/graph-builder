import { Kafka } from 'kafkajs';

export default class KafkaConsumerClient {
  /** 
    * @param config:
      {
        clientId: 'app-name',
        brokers: ['localhost:9092'],
        ssl: true,
        sasl: {
          mechanism: 'plain', // scram-sha-256 or scram-sha-512
          username: 'username',
          password: 'password'
        },
      }
    * @param decoder:
    * @param options:
      {
        decoder:
      }
  */
  constructor(
    config, 
    decoder, {
      numPartitions = 3,
    } = {}) {
    this.kafka = new Kafka(config);
    if (!decoder) throw Error('Please provide a decoder');
    this.decoder = decoder;
    this.numPartitions = numPartitions;
    this.topics = {};
  }

  async init({ groupId }) {
    this.consumer = this.kafka.consumer({ groupId });
    await this.consumer.connect();
    return this.consumer;
  }

  async subscribe({ topic }) {
    this.topics[topic] = 1;
    await this.consumer.subscribe({ topic });
  }

  async pause() {
    const partitions = Array(this.numPartitions).fill(0).map((n, i) => i);
    const topics = Object.keys(this.topics).map(topic => {
      return { topic, partitions };
    });
    await this.consumer.pause(topics);
  }

  async stop() {
    return this.consumer.stop();
  }
  async resume() {
    const pausedList = this.consumer.paused();
    await this.consumer.resume(pausedList);
  }

  async run(cb) {
    if (!this.decoder) throw Error('');
    if (this.consumer.paused().length) {
      return this.resume();
    }
    await this.consumer.run({
      partitionsConsumedConcurrently: this.numPartitions,
      eachMessage: async ({ topic, partition, message }) => {
        const parsedValue = await this.decoder.decode(message);
        if (!parsedValue) {
          return;
        }
        await cb({ topic, partition, message, parsedValue });
      }
    });
  }
};

const { Pact } = require('@pact-foundation/pact');
const { Matchers } = require('@pact-foundation/pact');
const axios = require('axios');

describe('Recognition API Contract', () => {
  const provider = new Pact({
    consumer: 'Frontend',
    provider: 'Recognition API',
    port: 1234,
    log: 'pacts/pact.log',
    dir: 'pacts',
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());
  afterEach(() => provider.verify());

  test('POST /api/v1/recognize', async () => {
    await provider.addInteraction({
      state: 'image contains logos',
      uponReceiving: 'a request to recognize logos',
      withRequest: {
        method: 'POST',
        path: '/api/v1/recognize',
        headers: {
          'Content-Type': Matchers.term({
            matcher: 'multipart/form-data.*',
            generate: 'multipart/form-data; boundary=----WebKitFormBoundary',
          }),
          'Authorization': Matchers.like('Bearer token'),
        },
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          request_id: Matchers.uuid(),
          processing_time: Matchers.decimal(),
          detections: Matchers.eachLike({
            brand: Matchers.string(),
            confidence: Matchers.decimal(),
            bbox: {
              x: Matchers.integer(),
              y: Matchers.integer(),
              width: Matchers.integer(),
              height: Matchers.integer(),
            },
          }),
        },
      },
    });

    const response = await axios.post('http://localhost:1234/api/v1/recognize', {
      image: 'base64_data',
    }, {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data.request_id).toBeDefined();
    expect(response.data.detections).toBeInstanceOf(Array);
  });
});

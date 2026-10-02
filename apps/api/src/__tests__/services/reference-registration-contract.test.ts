import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('../../services/ml-client');
const { post } = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue({ data: { added: true, reason: 'added' } }) }));
vi.mock('axios', () => ({ default: { create: () => ({ post, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) } }));
import { mlClient } from '../../services/ml-client';
import { resolveFieldType } from '../../services/field-type-mapping';

describe('reference registration contract', () => {
  beforeEach(() => post.mockClear());
  it.each(['NUTRISCORE_A', 'NUTRISCORE_B', 'NUTRISCORE_C', 'NUTRISCORE_D', 'NUTRISCORE_E', 'VEGAN', 'AISE_1', 'FLAME', 'UNKNOWN_VALID'])('sends resolved fields for %s', async code => {
    const resolved = resolveFieldType(code);
    await mlClient.registerReference('crop.png', ` ${code.toLowerCase()} `);
    expect(post).toHaveBeenCalledWith('/ml/artwork/register-reference', {
      crop_path: 'crop.png', t3777_code: code, field_type: resolved.fieldType, gs1_field: resolved.gs1Field,
    });
  });
  it.each(['', '  ', null, 42, {}])('rejects invalid code %j before HTTP', async code => {
    await expect(mlClient.registerReference('crop.png', code as string)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});

import mapping from '../../services/reference-code-mapping.json';
it('resolves every entry from the canonical JSON source', () => {
  for (const [fieldType, group] of Object.entries(mapping.categories)) {
    for (const code of group.codes) {
      expect(resolveFieldType(` ${code.toLowerCase()} `)).toMatchObject({ code, fieldType, gs1Field: group.gs1Field });
    }
  }
});

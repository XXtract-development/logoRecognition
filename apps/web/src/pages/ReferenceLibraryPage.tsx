/**
 * ReferenceLibraryPage (Epic 7, Story 7.3)
 *
 * Manage the keurmerk reference library: upload official artwork + variants,
 * browse them grouped per T3777 code, and deactivate variants without losing
 * history (soft delete).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Typography, Space, Empty, Spin, Divider, message } from 'antd';
import {
  fetchReferenceLogos,
  deactivateReferenceLogo,
  type ReferenceLogo,
} from '@/services/referenceLibraryService';
import ReferenceUploadForm from '@/components/reference-library/ReferenceUploadForm';
import ReferenceVariantCard from '@/components/reference-library/ReferenceVariantCard';

const { Title, Paragraph } = Typography;

const ReferenceLibraryPage: React.FC = () => {
  const [variants, setVariants] = useState<ReferenceLogo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReferenceLogos();
      setVariants(data);
    } catch {
      message.error('Ophalen van referentiebibliotheek mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeactivate = useCallback(async (id: string) => {
    try {
      await deactivateReferenceLogo(id);
      setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, active: false } : v)));
      message.success('Variant gedeactiveerd');
    } catch {
      message.error('Deactiveren mislukt');
    }
  }, []);

  // Group variants per T3777 code (stable alphabetical ordering).
  const groups = useMemo(() => {
    const map = new Map<string, ReferenceLogo[]>();
    for (const v of variants) {
      const list = map.get(v.t3777Code) ?? [];
      list.push(v);
      map.set(v.t3777Code, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [variants]);

  return (
    <div data-testid="reference-library-page" style={{ padding: 24, color: '#1E293B' }}>
      <Title level={2} style={{ color: '#2F5A7A' }}>
        Keurmerk-referentiebibliotheek
      </Title>
      <Paragraph>
        Beheer de officiële keurmerk-beeldmerken en hun varianten (taal, mono, kleur). Deze
        bibliotheek vormt de kennisbron voor lokalisatie, classificatie en synthese.
      </Paragraph>

      <ReferenceUploadForm onUploaded={load} />

      <Divider />

      {loading ? (
        <Spin />
      ) : groups.length === 0 ? (
        <Empty description="Nog geen referenties in de bibliotheek" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {groups.map(([code, items]) => (
            <div key={code} data-testid="reference-code-group">
              <Title level={4} style={{ color: '#54949E' }}>
                {code}
              </Title>
              <Space wrap size="middle">
                {items.map((variant) => (
                  <ReferenceVariantCard
                    key={variant.id}
                    variant={variant}
                    onDeactivate={handleDeactivate}
                  />
                ))}
              </Space>
            </div>
          ))}
        </Space>
      )}
    </div>
  );
};

export default React.memo(ReferenceLibraryPage);

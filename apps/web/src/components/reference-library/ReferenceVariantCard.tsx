/**
 * ReferenceVariantCard (Epic 7, Story 7.3)
 * Single keurmerk variant with preview and a soft-delete (deactivate) action.
 */
import React, { useState } from 'react';
import { Card, Button, Popconfirm, Tag, Typography } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import type { ReferenceLogo } from '@/services/referenceLibraryService';

const { Text } = Typography;

interface ReferenceVariantCardProps {
  variant: ReferenceLogo;
  onDeactivate: (id: string) => Promise<void>;
}

const ReferenceVariantCard: React.FC<ReferenceVariantCardProps> = ({ variant, onDeactivate }) => {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onDeactivate(variant.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      size="small"
      data-testid="reference-variant-card"
      style={{
        width: 200,
        opacity: variant.active ? 1 : 0.55,
        borderColor: variant.active ? '#E2E8F0' : '#D64545',
      }}
      cover={
        variant.previewUrl ? (
          <img
            alt={`${variant.t3777Code} ${variant.variantLabel}`}
            src={variant.previewUrl}
            style={{ height: 140, objectFit: 'contain', background: '#F8FAFC' }}
          />
        ) : (
          <div
            style={{
              height: 140,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#F8FAFC',
              color: '#94A3B8',
            }}
          >
            geen preview
          </div>
        )
      }
    >
      <Text strong style={{ color: '#1E293B' }}>
        {variant.variantLabel}
      </Text>
      <br />
      {variant.active ? (
        <Tag color="#B7D945">actief</Tag>
      ) : (
        <Tag data-testid="reference-variant-inactive" color="#D64545">
          inactief
        </Tag>
      )}
      {variant.active && (
        <Popconfirm
          title="Variant deactiveren?"
          description="De variant blijft bewaard maar wordt als inactief gemarkeerd."
          okText="Deactiveer"
          cancelText="Annuleer"
          onConfirm={handleConfirm}
        >
          <Button
            danger
            size="small"
            type="text"
            icon={<StopOutlined />}
            loading={busy}
            data-testid="reference-variant-deactivate"
            style={{ marginTop: 8 }}
          >
            Deactiveer
          </Button>
        </Popconfirm>
      )}
    </Card>
  );
};

export default React.memo(ReferenceVariantCard);

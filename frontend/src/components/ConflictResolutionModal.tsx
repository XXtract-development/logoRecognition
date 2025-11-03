import React, { useState, useEffect } from 'react';
import { Modal, Radio, Space, Typography, Divider } from 'antd';
import { AnnotationConflict, ConflictResolutionOption } from '../types/annotations';

const { Text } = Typography;

interface ConflictResolutionModalProps {
  open: boolean;
  conflicts: AnnotationConflict[];
  onResolve: (resolution: Record<string, ConflictResolutionOption>) => void;
  onCancel: () => void;
}

const OPTIONS: { label: string; value: ConflictResolutionOption; description: string }[] = [
  { label: 'Merge', value: 'merge', description: 'Replace existing annotation with the incoming bounding box.' },
  { label: 'Keep both', value: 'keep_both', description: 'Retain both annotations for further review.' },
  { label: 'Keep existing', value: 'discard_new', description: 'Discard the incoming annotation and keep the stored one.' },
];

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  open,
  conflicts,
  onResolve,
  onCancel,
}) => {
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolutionOption>>({});

  useEffect(() => {
    if (open) {
      const defaults = conflicts.reduce<Record<string, ConflictResolutionOption>>((acc, conflict) => {
        acc[conflict.conflictId] = acc[conflict.conflictId] ?? 'merge';
        return acc;
      }, {});
      setResolutions(defaults);
    }
  }, [conflicts, open]);

  const handleConfirm = () => {
    onResolve(resolutions);
  };

  return (
    <Modal
      title="Resolve Conflicting Annotations"
      open={open}
      onCancel={onCancel}
      onOk={handleConfirm}
      okText="Apply resolutions"
      destroyOnHidden
      okButtonProps={{ disabled: conflicts.some(conflict => !resolutions[conflict.conflictId]) }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {conflicts.map((conflict) => (
          <div key={conflict.conflictId}>
            <Text strong>{conflict.reason}</Text>
            <div>
              <Text type="secondary">
                Overlap {Math.round(conflict.overlapRatio * 100)}% for {conflict.incomingAnnotation.category} · {conflict.incomingAnnotation.value}
              </Text>
            </div>
            <Radio.Group
              style={{ marginTop: 8 }}
              value={resolutions[conflict.conflictId]}
              onChange={(event) =>
                setResolutions((prev) => ({
                  ...prev,
                  [conflict.conflictId]: event.target.value,
                }))
              }
            >
              <Space direction="vertical">
                {OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value}>
                    <Space direction="vertical" size={0}>
                      <Text>{option.label}</Text>
                      <Text type="secondary">{option.description}</Text>
                    </Space>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            <Divider />
          </div>
        ))}
      </Space>
    </Modal>
  );
};

export default ConflictResolutionModal;

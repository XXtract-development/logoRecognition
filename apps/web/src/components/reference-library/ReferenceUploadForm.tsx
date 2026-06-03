/**
 * ReferenceUploadForm (Epic 7, Story 7.3)
 * Upload form for a single keurmerk reference variant.
 */
import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { uploadReferenceLogo } from '@/services/referenceLibraryService';

interface ReferenceUploadFormProps {
  onUploaded: () => void;
}

const ALLOWED = ['png', 'svg'];

const ReferenceUploadForm: React.FC<ReferenceUploadFormProps> = ({ onUploaded }) => {
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: { t3777Code: string; variantLabel: string; source?: string }) => {
    if (!file) {
      message.error('Selecteer een bestand');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.includes(ext)) {
      message.error('Alleen PNG of SVG toegestaan');
      return;
    }
    setSubmitting(true);
    try {
      await uploadReferenceLogo({ ...values, file });
      message.success('Referentie toegevoegd');
      form.resetFields();
      setFile(null);
      onUploaded();
    } catch (err: unknown) {
      const apiError =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(apiError || 'Toevoegen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      data-testid="reference-library-upload"
      style={{ maxWidth: 480 }}
    >
      <Form.Item
        label="T3777-code"
        name="t3777Code"
        rules={[{ required: true, message: 'T3777-code is verplicht' }]}
      >
        <Input name="t3777Code" placeholder="bijv. EU_ORGANIC_FARMING" />
      </Form.Item>
      <Form.Item
        label="Variantlabel"
        name="variantLabel"
        rules={[{ required: true, message: 'Variantlabel is verplicht' }]}
      >
        <Input name="variantLabel" placeholder="bijv. kleur-nl / mono" />
      </Form.Item>
      <Form.Item label="Bronvermelding" name="source">
        <Input name="source" placeholder="URL of bron van het beeldmerk" />
      </Form.Item>
      <Form.Item label="Afbeelding (PNG/SVG)">
        <input
          type="file"
          name="file"
          accept=".png,.svg,image/png,image/svg+xml"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Form.Item>
      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          icon={<UploadOutlined />}
          loading={submitting}
          style={{ backgroundColor: '#2F5A7A' }}
        >
          Toevoegen
        </Button>
      </Form.Item>
    </Form>
  );
};

export default React.memo(ReferenceUploadForm);

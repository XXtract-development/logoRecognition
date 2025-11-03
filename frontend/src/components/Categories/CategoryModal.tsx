/**
 * CategoryModal Component
 *
 * Modal dialog for creating and editing categories with validation
 */

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message, Space } from 'antd';
import type { Category } from '../../types/category';

interface CategoryModalProps {
  category?: Category | null;
  visible: boolean;
  onClose: () => void;
  onSave: (category: CategoryFormData) => Promise<void>;
}

export interface CategoryFormData {
  categorie: string;
  categorie_naam?: string;
  code: string;
  code_naam?: string;
  definitie?: string;
}

/**
 * CategoryModal - Modal for category creation and editing
 *
 * Features:
 * - Form validation for all fields
 * - Support for both create and edit modes
 * - Loading state during save
 * - Auto-focus on first field
 * - Keyboard shortcuts (ESC to close, Enter to save when valid)
 */
export const CategoryModal: React.FC<CategoryModalProps> = ({
  category,
  visible,
  onClose,
  onSave,
}) => {
  const [form] = Form.useForm<CategoryFormData>();
  const [loading, setLoading] = useState(false);

  // Initialize form when category changes
  useEffect(() => {
    if (visible) {
      if (category) {
        // Edit mode - populate form with existing values
        form.setFieldsValue({
          categorie: category.categorie,
          categorie_naam: category.categorie_naam || '',
          code: category.code,
          code_naam: category.code_naam || '',
          definitie: category.definitie || '',
        });
      } else {
        // Create mode - reset form with defaults
        form.resetFields();
      }
    }
  }, [category, visible, form]);

  /**
   * Handle form submission
   */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      await onSave(values);

      message.success(category ? 'Categorie bijgewerkt' : 'Categorie aangemaakt');
      form.resetFields();
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message);
      } else {
        console.error('Validation failed:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Validation rules
   */
  const validationRules = {
    categorie: [
      { required: true, message: 'Categorie is verplicht' },
      { min: 1, max: 100, message: 'Categorie moet tussen 1 en 100 tekens zijn' },
    ],
    code: [
      { required: true, message: 'Code is verplicht' },
      { min: 1, max: 50, message: 'Code moet tussen 1 en 50 tekens zijn' },
      {
        pattern: /^[a-zA-Z0-9_]+$/,
        message: 'Code mag alleen letters, cijfers en underscores bevatten',
      },
    ],
    categorie_naam: [
      { max: 255, message: 'Maximaal 255 tekens toegestaan' },
    ],
    code_naam: [
      { max: 255, message: 'Maximaal 255 tekens toegestaan' },
    ],
    definitie: [
      { max: 255, message: 'Maximaal 255 tekens toegestaan' },
    ],
  };

  return (
    <Modal
      title={category ? 'Categorie Bewerken' : 'Nieuwe Categorie'}
      open={visible}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Annuleren
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          Opslaan
        </Button>,
      ]}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        onFinish={handleSubmit}
      >
        {/* Category and Code - Main fields */}
        <Space.Compact style={{ width: '100%' }}>
          <Form.Item
            name="categorie"
            label="Categorie"
            rules={validationRules.categorie}
            style={{ flex: 1, marginRight: 12 }}
          >
            <Input placeholder="Bijv. Logo" autoFocus />
          </Form.Item>

          <Form.Item
            name="code"
            label="Code"
            rules={validationRules.code}
            style={{ flex: 1 }}
          >
            <Input placeholder="Bijv. LOGO_001" />
          </Form.Item>
        </Space.Compact>

        {/* Category Name and Code Name - Optional */}
        <Space.Compact style={{ width: '100%' }}>
          <Form.Item
            name="categorie_naam"
            label="Categorie Naam (Optioneel)"
            rules={validationRules.categorie_naam}
            style={{ flex: 1, marginRight: 12 }}
          >
            <Input placeholder="Volledige naam van de categorie" />
          </Form.Item>

          <Form.Item
            name="code_naam"
            label="Code Naam (Optioneel)"
            rules={validationRules.code_naam}
            style={{ flex: 1 }}
          >
            <Input placeholder="Volledige naam van de code" />
          </Form.Item>
        </Space.Compact>

        {/* Definition */}
        <Form.Item
          name="definitie"
          label="Definitie (Optioneel)"
          rules={validationRules.definitie}
        >
          <Input.TextArea
            rows={2}
            placeholder="Korte definitie"
            maxLength={255}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CategoryModal;
/**
 * CategoryImportButton Component
 *
 * Trigger button for opening the category import modal.
 * Placed in the top-right of the Categories page.
 */

import React, { useState } from 'react';
import { Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import CategoryImportModal from './CategoryImportModal';

interface CategoryImportButtonProps {
  onSuccess?: () => void;
}

/**
 * Button to trigger category import modal
 *
 * Features:
 * - Opens import modal on click
 * - Handles modal state
 * - Triggers refresh callback on success
 */
export const CategoryImportButton: React.FC<CategoryImportButtonProps> = ({
  onSuccess,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleOpenModal = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  const handleSuccess = () => {
    onSuccess?.();
  };

  return (
    <>
      <Button
        type="primary"
        icon={<UploadOutlined />}
        onClick={handleOpenModal}
        data-testid="category-import-button"
      >
        Import uit Excel
      </Button>

      <CategoryImportModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
      />
    </>
  );
};

export default CategoryImportButton;
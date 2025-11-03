/**
 * CategoryModal Component Tests
 *
 * Unit tests for the category modal with form validation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CategoryModal, CategoryFormData } from '../CategoryModal';
import type { Category } from '../../../types/category';

// Mock Ant Design's message
jest.mock('antd', () => ({
  ...jest.requireActual('antd'),
  message: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CategoryModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();

  const defaultProps = {
    visible: true,
    onClose: mockOnClose,
    onSave: mockOnSave,
  };

  const mockCategory: Category = {
    id: 1,
    categorie: 'Logo',
    categorie_naam: 'Logo Category',
    code: 'LOGO_001',
    code_naam: 'Logo Code',
    definitie: 'Logo definition',
    annotation_count: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render modal with correct title for create mode', () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      expect(screen.getByText('Nieuwe Categorie')).toBeInTheDocument();
    });

    it('should render modal with correct title for edit mode', () => {
      render(<CategoryModal {...defaultProps} category={mockCategory} />);

      expect(screen.getByText('Categorie Bewerken')).toBeInTheDocument();
    });

    it('should render all form fields', () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      expect(screen.getByLabelText(/Categorie/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Definitie/i)).toBeInTheDocument();
    });

    it('should populate form fields when editing', () => {
      render(<CategoryModal {...defaultProps} category={mockCategory} />);

      const categorieInput = screen.getByDisplayValue('Logo');
      const codeInput = screen.getByDisplayValue('LOGO_001');

      expect(categorieInput).toBeInTheDocument();
      expect(codeInput).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show validation error for empty required fields', async () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Categorie is verplicht')).toBeInTheDocument();
        expect(screen.getByText('Code is verplicht')).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should validate category name length', async () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      const veryLongText = 'a'.repeat(101);

      await userEvent.type(categorieInput, veryLongText);

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Categorie moet tussen 1 en 100 tekens zijn')
        ).toBeInTheDocument();
      });
    });

    it('should validate code format', async () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      const codeInput = screen.getByLabelText(/Code/i);

      await userEvent.type(codeInput, 'Invalid Code!'); // Contains invalid character

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Code mag alleen letters, cijfers en underscores bevatten')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call onSave with correct data on valid submission', async () => {
      mockOnSave.mockResolvedValue(undefined);

      render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      const codeInput = screen.getByLabelText(/Code/i);

      await userEvent.type(categorieInput, 'NewCategory');
      await userEvent.type(codeInput, 'NEW_001');

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            categorie: 'NewCategory',
            code: 'NEW_001',
          })
        );
      });
    });

    it('should include optional fields when provided', async () => {
      mockOnSave.mockResolvedValue(undefined);

      render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      const codeInput = screen.getByLabelText(/Code/i);
      const definitieInput = screen.getByLabelText(/Definitie/i);

      await userEvent.type(categorieInput, 'TestCategory');
      await userEvent.type(codeInput, 'TEST_001');
      await userEvent.type(definitieInput, 'Test definitie');

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            categorie: 'TestCategory',
            code: 'TEST_001',
            definitie: 'Test definitie',
          })
        );
      });
    });

    it('should close modal after successful save', async () => {
      mockOnSave.mockResolvedValue(undefined);

      render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      const codeInput = screen.getByLabelText(/Code/i);

      await userEvent.type(categorieInput, 'TestCategory');
      await userEvent.type(codeInput, 'TEST_001');

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show error message on save failure', async () => {
      const errorMessage = 'Failed to save category';
      mockOnSave.mockRejectedValue(new Error(errorMessage));

      render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      const codeInput = screen.getByLabelText(/Code/i);

      await userEvent.type(categorieInput, 'TestCategory');
      await userEvent.type(codeInput, 'TEST_001');

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('Cancel Operation', () => {
    it('should call onClose when cancel button is clicked', () => {
      render(<CategoryModal {...defaultProps} category={null} />);

      const cancelButton = screen.getByText('Annuleren');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should reset form when modal is closed', () => {
      const { rerender } = render(<CategoryModal {...defaultProps} category={null} />);

      const categorieInput = screen.getByLabelText(/Categorie/i);
      fireEvent.change(categorieInput, { target: { value: 'TestValue' } });

      // Close modal
      rerender(<CategoryModal {...defaultProps} visible={false} category={null} />);

      // Reopen modal
      rerender(<CategoryModal {...defaultProps} visible={true} category={null} />);

      const freshInput = screen.getByLabelText(/Categorie/i) as HTMLInputElement;
      expect(freshInput.value).toBe('');
    });
  });

  describe('Edit Mode', () => {
    it('should preserve existing values when editing', () => {
      render(<CategoryModal {...defaultProps} category={mockCategory} />);

      const categorieInput = screen.getByDisplayValue('Logo') as HTMLInputElement;
      const codeInput = screen.getByDisplayValue('LOGO_001') as HTMLInputElement;
      const colorInput = screen.getByDisplayValue('#FF0000') as HTMLInputElement;

      expect(categorieInput.value).toBe('Logo');
      expect(codeInput.value).toBe('LOGO_001');
      expect(colorInput.value).toBe('#FF0000');
    });

    it('should call onSave with updated values', async () => {
      mockOnSave.mockResolvedValue(undefined);

      render(<CategoryModal {...defaultProps} category={mockCategory} />);

      const categorieInput = screen.getByDisplayValue('Logo');

      await userEvent.clear(categorieInput);
      await userEvent.type(categorieInput, 'UpdatedLogo');

      const saveButton = screen.getByText('Opslaan');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            categorie: 'UpdatedLogo',
            code: 'LOGO_001',
          })
        );
      });
    });
  });
});
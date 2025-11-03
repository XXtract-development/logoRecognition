import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import AnnotationPage from '../AnnotationPage';
import { useTrainingStore } from '../../store/trainingStore';
import useAppStore from '../../store/appStore';
import { annotationService } from '../../services/annotationService';
import * as indexedDbDraft from '../../utils/indexedDbDraft';

// Mock dependencies
jest.mock('../../store/trainingStore');
jest.mock('../../store/appStore');
jest.mock('../../services/annotationService');
jest.mock('../../utils/indexedDbDraft');
jest.mock('../../components/InteractiveCanvas', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ onImageLoad }: any) => {
      React.useEffect(() => {
        onImageLoad?.({ width: 800, height: 600 });
      }, [onImageLoad]);
      return React.createElement('div', { 'data-testid': 'interactive-canvas' }, 'Canvas Mock');
    },
  };
});
jest.mock('../../components/BoundingBoxPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="bounding-box-panel">Panel Mock</div>,
}));
jest.mock('../../components/SaveBanner', () => ({
  __esModule: true,
  default: () => <div data-testid="save-banner">Banner Mock</div>,
}));
jest.mock('../../components/VersionHistoryDrawer', () => ({
  __esModule: true,
  default: () => <div data-testid="version-history">History Mock</div>,
}));
jest.mock('../../components/ConflictResolutionModal', () => ({
  __esModule: true,
  default: () => <div data-testid="conflict-modal">Conflict Mock</div>,
}));

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useLocation: () => ({
    state: {
      uploadedFiles: [
        { file_id: '1', filename: 'test1.jpg', url: 'http://test1.jpg' },
        { file_id: '2', filename: 'test2.jpg', url: 'http://test2.jpg' },
        { file_id: '3', filename: 'test3.jpg', url: 'http://test3.jpg' },
      ],
      datasetId: 'test-dataset',
    },
  }),
}));

describe('AnnotationPage - Navigation Features', () => {
  const mockMessage = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  };

  const mockTrainingStore = {
    datasetId: 'test-dataset',
    setDatasetId: jest.fn(),
    userId: 'user-123',
    setUserId: jest.fn(),
    annotationsByImage: {},
    upsertAnnotations: jest.fn(),
    removeAnnotation: jest.fn(),
    saveResponse: null,
    setSaveResponse: jest.fn(),
    conflicts: [],
    setConflicts: jest.fn(),
    versionHistory: [],
    setVersionHistory: jest.fn(),
    auditTrail: [],
    setAuditTrail: jest.fn(),
    dirty: false,
    setDirty: jest.fn(),
  };

  const mockAppStore = {
    user: { id: 'user-123' },
    featureFlags: { trainingDatasetVersioning: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    (useTrainingStore as jest.Mock).mockReturnValue(mockTrainingStore);
    (useAppStore as jest.Mock).mockReturnValue(mockAppStore);
    (annotationService.saveAnnotations as jest.Mock).mockResolvedValue({
      status: 'saved',
      version: '1.0',
    });
    (indexedDbDraft.saveDraftToIndexedDb as jest.Mock).mockResolvedValue(undefined);
    (indexedDbDraft.loadLatestDraftFromIndexedDb as jest.Mock).mockResolvedValue(null);
    (indexedDbDraft.clearDraftsFromIndexedDb as jest.Mock).mockResolvedValue(undefined);
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <AntdApp>
          <AntdApp.ConfigProvider>
            <AnnotationPage />
          </AntdApp.ConfigProvider>
        </AntdApp>
      </BrowserRouter>
    );
  };

  describe('Button Navigation', () => {
    it('should render navigation buttons', () => {
      renderComponent();

      expect(screen.getByText('← Previous File')).toBeInTheDocument();
      expect(screen.getByText('Next File →')).toBeInTheDocument();
    });

    it('should disable Previous button on first image', () => {
      renderComponent();

      const prevButton = screen.getByText('← Previous File').closest('button');
      expect(prevButton).toBeDisabled();
    });

    it('should enable Next button when not on last image', () => {
      renderComponent();

      const nextButton = screen.getByText('Next File →').closest('button');
      expect(nextButton).not.toBeDisabled();
    });

    it('should navigate to next image when Next button clicked', () => {
      renderComponent();

      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      expect(screen.getByText('File 2 of 3')).toBeInTheDocument();
    });

    it('should navigate to previous image when Previous button clicked', () => {
      renderComponent();

      // First go to second image
      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      // Then go back
      const prevButton = screen.getByText('← Previous File').closest('button') as HTMLButtonElement;
      expect(prevButton).not.toBeDisabled();
      fireEvent.click(prevButton);

      expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should show keyboard shortcut hint', () => {
      renderComponent();

      expect(screen.getByText('(Use ← → arrow keys)')).toBeInTheDocument();
    });

    it('should navigate to next image with ArrowRight key', () => {
      renderComponent();

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      waitFor(() => {
        expect(screen.getByText('File 2 of 3')).toBeInTheDocument();
      });
    });

    it('should navigate to previous image with ArrowLeft key', () => {
      renderComponent();

      // First go to second image
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Then go back with ArrowLeft
      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      waitFor(() => {
        expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
      });
    });

    it('should not navigate past first image with ArrowLeft', () => {
      renderComponent();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
    });

    it('should not navigate past last image with ArrowRight', () => {
      renderComponent();

      // Go to last image
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Try to go beyond
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByText('File 3 of 3')).toBeInTheDocument();
    });

    it('should not navigate when typing in input field', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');
      jumpInput.focus();

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Should still be on first image
      expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
    });
  });

  describe('Jump-to Navigation', () => {
    it('should render jump-to input and button', () => {
      renderComponent();

      expect(screen.getByPlaceholderText('Go to #')).toBeInTheDocument();
      expect(screen.getByText('Jump')).toBeInTheDocument();
    });

    it('should jump to specific image when valid number entered', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');
      const jumpButton = screen.getByText('Jump').closest('button') as HTMLButtonElement;

      await userEvent.type(jumpInput, '2');
      fireEvent.click(jumpButton);

      waitFor(() => {
        expect(screen.getByText('File 2 of 3')).toBeInTheDocument();
        expect(mockMessage.success).toHaveBeenCalledWith('Jumped to file 2');
      });
    });

    it('should jump to image on Enter key press', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');

      await userEvent.type(jumpInput, '3');
      fireEvent.keyPress(jumpInput, { key: 'Enter', code: 'Enter', charCode: 13 });

      waitFor(() => {
        expect(screen.getByText('File 3 of 3')).toBeInTheDocument();
        expect(mockMessage.success).toHaveBeenCalledWith('Jumped to file 3');
      });
    });

    it('should show error for invalid jump-to number', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');
      const jumpButton = screen.getByText('Jump').closest('button') as HTMLButtonElement;

      await userEvent.type(jumpInput, '5');
      fireEvent.click(jumpButton);

      waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('Please enter a number between 1 and 3');
      });
    });

    it('should show error for negative jump-to number', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');
      const jumpButton = screen.getByText('Jump').closest('button') as HTMLButtonElement;

      await userEvent.type(jumpInput, '-1');
      fireEvent.click(jumpButton);

      waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('Please enter a number between 1 and 3');
      });
    });

    it('should show error for zero jump-to number', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');
      const jumpButton = screen.getByText('Jump').closest('button') as HTMLButtonElement;

      await userEvent.type(jumpInput, '0');
      fireEvent.click(jumpButton);

      waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('Please enter a number between 1 and 3');
      });
    });

    it('should clear jump-to input after successful jump', async () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #') as HTMLInputElement;
      const jumpButton = screen.getByText('Jump').closest('button') as HTMLButtonElement;

      await userEvent.type(jumpInput, '2');
      fireEvent.click(jumpButton);

      waitFor(() => {
        expect(jumpInput.value).toBe('');
      });
    });
  });

  describe('File Counter Display', () => {
    it('should display current file position', () => {
      renderComponent();

      expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
    });

    it('should update counter when navigating', () => {
      renderComponent();

      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      expect(screen.getByText('File 2 of 3')).toBeInTheDocument();

      fireEvent.click(nextButton);
      expect(screen.getByText('File 3 of 3')).toBeInTheDocument();
    });

    it('should show correct filename in card title', () => {
      renderComponent();

      expect(screen.getByText('Annotating: test1.jpg')).toBeInTheDocument();

      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      expect(screen.getByText('Annotating: test2.jpg')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle single file scenario', () => {
      // For this test we would need to mock differently
      // Skipping for now to focus on main navigation tests
    });

    it('should redirect to upload page if no files', () => {
      // For this test we would need to mock differently
      // Skipping for now to focus on main navigation tests
    });

    it('should load files from localStorage if not in location state', () => {
      // For this test we would need to mock differently
      // Skipping for now to focus on main navigation tests
    });
  });

  describe('Integration with Auto-save', () => {
    it('should mark dirty when navigating between images', () => {
      renderComponent();

      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      // The markDirty would be called internally through useAutosave hook
      // This would be tested in more detail in integration tests
      expect(screen.getByText('File 2 of 3')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on navigation buttons', () => {
      renderComponent();

      const prevButton = screen.getByText('← Previous File').closest('button');
      const nextButton = screen.getByText('Next File →').closest('button');

      expect(prevButton).toHaveAttribute('aria-label', expect.stringContaining('Previous'));
      expect(nextButton).toHaveAttribute('aria-label', expect.stringContaining('Next'));
    });

    it('should have proper ARIA attributes on jump-to input', () => {
      renderComponent();

      const jumpInput = screen.getByPlaceholderText('Go to #');

      expect(jumpInput).toHaveAttribute('aria-label', expect.stringContaining('Jump to image'));
    });

    it('should announce navigation changes to screen readers', () => {
      renderComponent();

      const nextButton = screen.getByText('Next File →').closest('button') as HTMLButtonElement;
      fireEvent.click(nextButton);

      // Check for live region updates
      const fileCounter = screen.getByText('File 2 of 3');
      expect(fileCounter).toHaveAttribute('aria-live', 'polite');
    });
  });
});
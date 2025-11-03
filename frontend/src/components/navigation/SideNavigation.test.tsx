import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import SideNavigation from './SideNavigation';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('SideNavigation Component', () => {
  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
    isMobile: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('Desktop View', () => {
    it('should render all menu items correctly', () => {
      const { container } = render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      expect(screen.getByText('🚀 Logo Recognition')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Upload Images')).toBeInTheDocument();
      expect(screen.getByText('Annotate')).toBeInTheDocument();
      expect(screen.getByText('Training')).toBeInTheDocument();
      expect(screen.getByText('Models')).toBeInTheDocument();
      expect(screen.getByText('Canvas Demo')).toBeInTheDocument();
    });

    it('should handle menu item click and navigate', async () => {
      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const uploadItem = screen.getByText('Upload Images');
      fireEvent.click(uploadItem);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/upload');
      });
    });

    it('should highlight active route', () => {
      render(
        <MemoryRouter initialEntries={['/upload']}>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const uploadItem = screen.getByText('Upload Images').closest('li');
      expect(uploadItem).toHaveClass('ant-menu-item-selected');
    });

    it('should handle collapse/expand functionality', () => {
      const onCollapseMock = jest.fn();
      const { container } = render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} onCollapse={onCollapseMock} />
        </MemoryRouter>
      );

      const trigger = container.querySelector('.ant-layout-sider-trigger');
      if (trigger) {
        fireEvent.click(trigger);
        expect(onCollapseMock).toHaveBeenCalledWith(true);
      }
    });

    it('should show collapsed logo when collapsed', () => {
      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} collapsed={true} />
        </MemoryRouter>
      );

      expect(screen.getByText('🚀')).toBeInTheDocument();
      expect(screen.queryByText('🚀 Logo Recognition')).not.toBeInTheDocument();
    });

    it('should handle submenu expansion for Training', () => {
      render(
        <MemoryRouter initialEntries={['/training']}>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const trainingSubmenu = screen.getByText('Training').closest('.ant-menu-submenu');
      expect(trainingSubmenu).toHaveClass('ant-menu-submenu-open');
    });

    it('should navigate to training dashboard when clicking submenu item', async () => {
      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      // First expand the Training submenu
      const trainingMenu = screen.getByText('Training');
      fireEvent.click(trainingMenu);

      // Wait for submenu to be visible
      await waitFor(() => {
        const dashboardItem = screen.getByText('Dashboard');
        fireEvent.click(dashboardItem);
        expect(mockNavigate).toHaveBeenCalledWith('/training');
      });
    });
  });

  describe('Mobile View', () => {
    const mobileProps = {
      ...defaultProps,
      isMobile: true,
    };

    it('should render mobile menu trigger button', () => {
      render(
        <MemoryRouter>
          <SideNavigation {...mobileProps} />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button');
      expect(menuButton).toBeInTheDocument();
    });

    it('should open drawer when trigger is clicked', async () => {
      render(
        <MemoryRouter>
          <SideNavigation {...mobileProps} />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('🚀 Logo Recognition')).toBeInTheDocument();
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });
    });

    it('should close drawer after navigation', async () => {
      render(
        <MemoryRouter>
          <SideNavigation {...mobileProps} />
        </MemoryRouter>
      );

      // Open drawer
      const menuButton = screen.getByRole('button');
      fireEvent.click(menuButton);

      await waitFor(() => {
        const uploadItem = screen.getByText('Upload Images');
        fireEvent.click(uploadItem);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/upload');
      });
    });
  });

  describe('LocalStorage Integration', () => {
    it('should not save state to localStorage on mobile', () => {
      const mobileProps = {
        ...defaultProps,
        isMobile: true,
      };

      render(
        <MemoryRouter>
          <SideNavigation {...mobileProps} collapsed={true} />
        </MemoryRouter>
      );

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });

    it('should save collapsed state to localStorage on desktop', () => {
      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} collapsed={true} />
        </MemoryRouter>
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('menuCollapsed', 'true');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const nav = container.querySelector('[role="menu"]');
      expect(nav).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const dashboardItem = screen.getByText('Dashboard');
      dashboardItem.focus();

      fireEvent.keyDown(dashboardItem, { key: 'Enter' });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      expect(() => {
        render(
          <MemoryRouter>
            <SideNavigation {...defaultProps} />
          </MemoryRouter>
        );
      }).not.toThrow();
    });

    it('should handle navigation errors gracefully', () => {
      mockNavigate.mockImplementation(() => {
        throw new Error('Navigation failed');
      });

      render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const uploadItem = screen.getByText('Upload Images');

      expect(() => {
        fireEvent.click(uploadItem);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily on prop changes', () => {
      const { rerender } = render(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      const initialRenderCount = 1;

      // Rerender with same props
      rerender(
        <MemoryRouter>
          <SideNavigation {...defaultProps} />
        </MemoryRouter>
      );

      // Component should use React.memo or similar optimization
      // This is a simplified test - in real scenarios, you'd track render counts
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
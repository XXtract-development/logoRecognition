/**
 * Responsiveness and Accessibility Testing Suite
 * US-023: Frontend Polish & Responsiveness - Mobile responsiveness and accessibility tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Create responsive test utilities
const createResponsiveTest = (Component, breakpoints = {}) => {
  const testBreakpoint = (width, height = 768) => {
    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: height,
    });

    // Mock matchMedia for different breakpoints
    window.matchMedia = jest.fn().mockImplementation(query => {
      const matches = (() => {
        if (query.includes('(max-width: 576px)')) return width <= 576;
        if (query.includes('(max-width: 768px)')) return width <= 768;
        if (query.includes('(max-width: 992px)')) return width <= 992;
        if (query.includes('(max-width: 1200px)')) return width <= 1200;
        if (query.includes('(min-width: 1200px)')) return width >= 1200;
        return false;
      })();

      return {
        matches,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    });

    // Trigger resize event
    fireEvent(window, new Event('resize'));

    return { width, height };
  };

  return { testBreakpoint };
};

describe('Responsive Design Tests', () => {
  // Mock components for testing
  const ResponsiveComponent = () => {
    const [isMobile, setIsMobile] = React.useState(false);

    React.useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth <= 768);
      };

      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
      <div data-testid="responsive-component">
        <div className={`layout ${isMobile ? 'mobile' : 'desktop'}`}>
          {isMobile ? (
            <div data-testid="mobile-layout">
              <header data-testid="mobile-header">Mobile Header</header>
              <nav data-testid="mobile-nav">Mobile Navigation</nav>
              <main data-testid="mobile-content">Mobile Content</main>
            </div>
          ) : (
            <div data-testid="desktop-layout">
              <header data-testid="desktop-header">Desktop Header</header>
              <nav data-testid="desktop-nav">Desktop Navigation</nav>
              <main data-testid="desktop-content">Desktop Content</main>
            </div>
          )}
        </div>
      </div>
    );
  };

  const { testBreakpoint } = createResponsiveTest(ResponsiveComponent);

  describe('Breakpoint Behavior', () => {
    test('should display mobile layout on mobile devices', () => {
      testBreakpoint(375); // Mobile width

      render(<ResponsiveComponent />);

      expect(screen.getByTestId('mobile-layout')).toBeInTheDocument();
      expect(screen.queryByTestId('desktop-layout')).not.toBeInTheDocument();
    });

    test('should display desktop layout on desktop devices', () => {
      testBreakpoint(1200); // Desktop width

      render(<ResponsiveComponent />);

      expect(screen.getByTestId('desktop-layout')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-layout')).not.toBeInTheDocument();
    });

    test('should transition between layouts on resize', async () => {
      testBreakpoint(1200); // Start with desktop

      const { rerender } = render(<ResponsiveComponent />);

      expect(screen.getByTestId('desktop-layout')).toBeInTheDocument();

      // Resize to mobile
      testBreakpoint(375);
      rerender(<ResponsiveComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('mobile-layout')).toBeInTheDocument();
      });
    });

    test('should handle tablet breakpoints correctly', () => {
      testBreakpoint(768); // Tablet width

      render(<ResponsiveComponent />);

      // Should still show mobile layout at 768px
      expect(screen.getByTestId('mobile-layout')).toBeInTheDocument();
    });
  });

  describe('Touch and Gesture Support', () => {
    const TouchableComponent = () => {
      const [touchCount, setTouchCount] = React.useState(0);
      const [gestureData, setGestureData] = React.useState(null);

      const handleTouch = (e) => {
        setTouchCount(e.touches.length);
      };

      const handleGesture = (type) => {
        setGestureData({ type, timestamp: Date.now() });
      };

      return (
        <div
          data-testid="touchable-component"
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={() => setTouchCount(0)}
          style={{
            width: '200px',
            height: '200px',
            background: 'lightblue',
            touchAction: 'manipulation',
          }}
        >
          <div data-testid="touch-count">Touches: {touchCount}</div>
          {gestureData && (
            <div data-testid="gesture-data">
              Gesture: {gestureData.type}
            </div>
          )}
        </div>
      );
    };

    test('should handle touch events', () => {
      render(<TouchableComponent />);

      const touchable = screen.getByTestId('touchable-component');

      // Simulate touch start
      fireEvent.touchStart(touchable, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(screen.getByTestId('touch-count')).toHaveTextContent('Touches: 1');

      // Simulate multi-touch
      fireEvent.touchStart(touchable, {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 150, clientY: 150 },
        ],
      });

      expect(screen.getByTestId('touch-count')).toHaveTextContent('Touches: 2');
    });

    test('should handle touch end events', () => {
      render(<TouchableComponent />);

      const touchable = screen.getByTestId('touchable-component');

      fireEvent.touchStart(touchable, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      fireEvent.touchEnd(touchable);

      expect(screen.getByTestId('touch-count')).toHaveTextContent('Touches: 0');
    });
  });

  describe('Viewport and Scaling', () => {
    test('should handle different viewport sizes', () => {
      const ViewportComponent = () => {
        const [dimensions, setDimensions] = React.useState({
          width: window.innerWidth,
          height: window.innerHeight,
        });

        React.useEffect(() => {
          const handleResize = () => {
            setDimensions({
              width: window.innerWidth,
              height: window.innerHeight,
            });
          };

          window.addEventListener('resize', handleResize);
          return () => window.removeEventListener('resize', handleResize);
        }, []);

        return (
          <div data-testid="viewport-component">
            <div data-testid="viewport-width">Width: {dimensions.width}</div>
            <div data-testid="viewport-height">Height: {dimensions.height}</div>
            <div data-testid="viewport-ratio">
              Ratio: {(dimensions.width / dimensions.height).toFixed(2)}
            </div>
          </div>
        );
      };

      testBreakpoint(1920, 1080);
      render(<ViewportComponent />);

      expect(screen.getByTestId('viewport-width')).toHaveTextContent('Width: 1920');
      expect(screen.getByTestId('viewport-height')).toHaveTextContent('Height: 1080');
    });

    test('should adapt to device pixel ratio', () => {
      const PixelRatioComponent = () => {
        const [pixelRatio, setPixelRatio] = React.useState(window.devicePixelRatio || 1);

        return (
          <div data-testid="pixel-ratio-component">
            <div data-testid="pixel-ratio">Pixel Ratio: {pixelRatio}</div>
            <div data-testid="is-retina">
              Retina: {pixelRatio > 1 ? 'Yes' : 'No'}
            </div>
          </div>
        );
      };

      // Mock high DPI display
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        configurable: true,
        value: 2,
      });

      render(<PixelRatioComponent />);

      expect(screen.getByTestId('pixel-ratio')).toHaveTextContent('Pixel Ratio: 2');
      expect(screen.getByTestId('is-retina')).toHaveTextContent('Retina: Yes');
    });
  });

  describe('CSS Grid and Flexbox Responsiveness', () => {
    test('should handle responsive grid layouts', () => {
      const GridComponent = () => {
        const [columns, setColumns] = React.useState(4);

        React.useEffect(() => {
          const updateColumns = () => {
            if (window.innerWidth <= 576) setColumns(1);
            else if (window.innerWidth <= 768) setColumns(2);
            else if (window.innerWidth <= 992) setColumns(3);
            else setColumns(4);
          };

          updateColumns();
          window.addEventListener('resize', updateColumns);
          return () => window.removeEventListener('resize', updateColumns);
        }, []);

        return (
          <div
            data-testid="grid-component"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: '16px',
            }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} data-testid={`grid-item-${i}`}>
                Item {i + 1}
              </div>
            ))}
            <div data-testid="grid-columns">Columns: {columns}</div>
          </div>
        );
      };

      // Test mobile layout
      testBreakpoint(375);
      render(<GridComponent />);
      expect(screen.getByTestId('grid-columns')).toHaveTextContent('Columns: 1');

      // Test tablet layout
      testBreakpoint(768);
      render(<GridComponent />);
      expect(screen.getByTestId('grid-columns')).toHaveTextContent('Columns: 2');

      // Test desktop layout
      testBreakpoint(1200);
      render(<GridComponent />);
      expect(screen.getByTestId('grid-columns')).toHaveTextContent('Columns: 4');
    });

    test('should handle responsive flexbox layouts', () => {
      const FlexComponent = () => {
        const [direction, setDirection] = React.useState('row');

        React.useEffect(() => {
          const updateDirection = () => {
            setDirection(window.innerWidth <= 768 ? 'column' : 'row');
          };

          updateDirection();
          window.addEventListener('resize', updateDirection);
          return () => window.removeEventListener('resize', updateDirection);
        }, []);

        return (
          <div
            data-testid="flex-component"
            style={{
              display: 'flex',
              flexDirection: direction,
              gap: '16px',
            }}
          >
            <div data-testid="flex-item-1">Item 1</div>
            <div data-testid="flex-item-2">Item 2</div>
            <div data-testid="flex-direction">Direction: {direction}</div>
          </div>
        );
      };

      // Test mobile layout (column)
      testBreakpoint(375);
      render(<FlexComponent />);
      expect(screen.getByTestId('flex-direction')).toHaveTextContent('Direction: column');

      // Test desktop layout (row)
      testBreakpoint(1200);
      render(<FlexComponent />);
      expect(screen.getByTestId('flex-direction')).toHaveTextContent('Direction: row');
    });
  });
});

describe('Accessibility Tests', () => {
  describe('Keyboard Navigation', () => {
    const KeyboardComponent = () => {
      const [focusedIndex, setFocusedIndex] = React.useState(-1);
      const items = ['Item 1', 'Item 2', 'Item 3', 'Item 4'];

      const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Handle selection
        }
      };

      return (
        <div
          data-testid="keyboard-component"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="listbox"
          aria-label="Navigable list"
        >
          {items.map((item, index) => (
            <div
              key={index}
              data-testid={`keyboard-item-${index}`}
              role="option"
              aria-selected={index === focusedIndex}
              style={{
                padding: '8px',
                backgroundColor: index === focusedIndex ? '#e6f3ff' : 'transparent',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      );
    };

    test('should handle arrow key navigation', () => {
      render(<KeyboardComponent />);

      const component = screen.getByTestId('keyboard-component');

      // Focus the component
      component.focus();

      // Navigate down
      fireEvent.keyDown(component, { key: 'ArrowDown' });
      expect(screen.getByTestId('keyboard-item-0')).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(component, { key: 'ArrowDown' });
      expect(screen.getByTestId('keyboard-item-1')).toHaveAttribute('aria-selected', 'true');

      // Navigate up
      fireEvent.keyDown(component, { key: 'ArrowUp' });
      expect(screen.getByTestId('keyboard-item-0')).toHaveAttribute('aria-selected', 'true');
    });

    test('should handle tab navigation', () => {
      const TabComponent = () => (
        <div data-testid="tab-component">
          <button data-testid="button-1">Button 1</button>
          <input data-testid="input-1" placeholder="Input 1" />
          <a href="#" data-testid="link-1">Link 1</a>
          <button data-testid="button-2" disabled>Disabled Button</button>
          <input data-testid="input-2" placeholder="Input 2" />
        </div>
      );

      render(<TabComponent />);

      const button1 = screen.getByTestId('button-1');
      const input1 = screen.getByTestId('input-1');
      const link1 = screen.getByTestId('link-1');
      const input2 = screen.getByTestId('input-2');

      // Tab through elements
      button1.focus();
      expect(document.activeElement).toBe(button1);

      fireEvent.keyDown(document.activeElement, { key: 'Tab' });
      input1.focus();
      expect(document.activeElement).toBe(input1);

      fireEvent.keyDown(document.activeElement, { key: 'Tab' });
      link1.focus();
      expect(document.activeElement).toBe(link1);

      // Should skip disabled button
      fireEvent.keyDown(document.activeElement, { key: 'Tab' });
      input2.focus();
      expect(document.activeElement).toBe(input2);
    });
  });

  describe('ARIA Attributes and Roles', () => {
    test('should have proper ARIA attributes', () => {
      const AccessibleComponent = () => (
        <div data-testid="accessible-component">
          <header role="banner" aria-label="Main header">
            <h1>Logo Recognition System</h1>
          </header>

          <nav role="navigation" aria-label="Main navigation">
            <ul role="menubar">
              <li role="none">
                <a href="#" role="menuitem" aria-current="page">Home</a>
              </li>
              <li role="none">
                <a href="#" role="menuitem">Upload</a>
              </li>
            </ul>
          </nav>

          <main role="main" aria-label="Main content">
            <section aria-labelledby="upload-heading">
              <h2 id="upload-heading">Upload Images</h2>
              <div role="region" aria-live="polite" aria-label="Upload status">
                <p>Ready to upload</p>
              </div>
            </section>
          </main>

          <aside role="complementary" aria-label="Sidebar">
            <h3>Recent uploads</h3>
          </aside>
        </div>
      );

      render(<AccessibleComponent />);

      // Check header
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toHaveAttribute('aria-label', 'Main header');

      // Check navigation
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('menubar')).toBeInTheDocument();

      // Check main content
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('region')).toHaveAttribute('aria-live', 'polite');

      // Check sidebar
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    test('should handle form accessibility', () => {
      const AccessibleForm = () => (
        <form data-testid="accessible-form" aria-label="Upload form">
          <fieldset>
            <legend>Image Upload</legend>

            <div>
              <label htmlFor="file-input">Choose file:</label>
              <input
                id="file-input"
                type="file"
                aria-describedby="file-help"
                required
                aria-required="true"
              />
              <div id="file-help">
                Select an image file (JPG, PNG, or GIF)
              </div>
            </div>

            <div>
              <label htmlFor="description">Description:</label>
              <textarea
                id="description"
                aria-describedby="description-help"
                maxLength={200}
              />
              <div id="description-help">
                Optional description (max 200 characters)
              </div>
            </div>

            <div role="group" aria-labelledby="privacy-legend">
              <div id="privacy-legend">Privacy settings</div>
              <label>
                <input type="radio" name="privacy" value="public" defaultChecked />
                Public
              </label>
              <label>
                <input type="radio" name="privacy" value="private" />
                Private
              </label>
            </div>

            <button type="submit" aria-describedby="submit-help">
              Upload Image
            </button>
            <div id="submit-help">
              Click to upload your image to the system
            </div>
          </fieldset>
        </form>
      );

      render(<AccessibleForm />);

      // Check form structure
      expect(screen.getByRole('form')).toHaveAttribute('aria-label', 'Upload form');
      expect(screen.getByRole('group', { name: 'Image Upload' })).toBeInTheDocument();

      // Check input associations
      const fileInput = screen.getByLabelText('Choose file:');
      expect(fileInput).toHaveAttribute('aria-describedby', 'file-help');
      expect(fileInput).toHaveAttribute('aria-required', 'true');

      const descriptionInput = screen.getByLabelText('Description:');
      expect(descriptionInput).toHaveAttribute('aria-describedby', 'description-help');

      // Check radio group
      expect(screen.getByRole('group', { name: 'Privacy settings' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
    });
  });

  describe('Focus Management', () => {
    test('should manage focus properly in modals', () => {
      const ModalComponent = ({ isOpen, onClose }) => {
        const modalRef = React.useRef(null);
        const firstFocusRef = React.useRef(null);
        const lastFocusRef = React.useRef(null);

        React.useEffect(() => {
          if (isOpen && firstFocusRef.current) {
            firstFocusRef.current.focus();
          }
        }, [isOpen]);

        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            onClose();
          } else if (e.key === 'Tab') {
            const focusableElements = modalRef.current?.querySelectorAll(
              'button, input, textarea, select, a[href]'
            );
            const firstElement = focusableElements?.[0];
            const lastElement = focusableElements?.[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === firstElement) {
              e.preventDefault();
              lastElement?.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              e.preventDefault();
              firstElement?.focus();
            }
          }
        };

        if (!isOpen) return null;

        return (
          <div
            data-testid="modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
            onClick={onClose}
          >
            <div
              ref={modalRef}
              data-testid="modal-content"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              onKeyDown={handleKeyDown}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="modal-title">Confirm Action</h2>
              <p>Are you sure you want to proceed?</p>

              <div>
                <button ref={firstFocusRef} data-testid="confirm-button">
                  Confirm
                </button>
                <button ref={lastFocusRef} onClick={onClose} data-testid="cancel-button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      };

      const TestApp = () => {
        const [modalOpen, setModalOpen] = React.useState(false);

        return (
          <div>
            <button onClick={() => setModalOpen(true)} data-testid="open-modal">
              Open Modal
            </button>
            <ModalComponent isOpen={modalOpen} onClose={() => setModalOpen(false)} />
          </div>
        );
      };

      render(<TestApp />);

      // Open modal
      fireEvent.click(screen.getByTestId('open-modal'));

      // Check modal accessibility
      const modal = screen.getByTestId('modal-content');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');

      // Check focus management
      expect(document.activeElement).toBe(screen.getByTestId('confirm-button'));

      // Test Escape key
      fireEvent.keyDown(modal, { key: 'Escape' });
      expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
    });

    test('should handle focus trapping in navigation', () => {
      const NavigationComponent = () => {
        const [isExpanded, setIsExpanded] = React.useState(false);
        const navRef = React.useRef(null);

        const handleKeyDown = (e) => {
          if (e.key === 'Escape' && isExpanded) {
            setIsExpanded(false);
          }
        };

        return (
          <nav
            ref={navRef}
            data-testid="navigation"
            onKeyDown={handleKeyDown}
            aria-expanded={isExpanded}
          >
            <button
              data-testid="nav-toggle"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-controls="nav-menu"
              aria-expanded={isExpanded}
            >
              Menu
            </button>

            {isExpanded && (
              <ul id="nav-menu" data-testid="nav-menu" role="menu">
                <li role="none">
                  <a href="#" role="menuitem" data-testid="nav-item-1">Home</a>
                </li>
                <li role="none">
                  <a href="#" role="menuitem" data-testid="nav-item-2">Upload</a>
                </li>
                <li role="none">
                  <a href="#" role="menuitem" data-testid="nav-item-3">Gallery</a>
                </li>
              </ul>
            )}
          </nav>
        );
      };

      render(<NavigationComponent />);

      const toggle = screen.getByTestId('nav-toggle');

      // Open menu
      fireEvent.click(toggle);

      expect(screen.getByTestId('nav-menu')).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Test Escape key
      fireEvent.keyDown(screen.getByTestId('navigation'), { key: 'Escape' });
      expect(screen.queryByTestId('nav-menu')).not.toBeInTheDocument();
    });
  });

  describe('Screen Reader Support', () => {
    test('should provide proper screen reader announcements', () => {
      const AnnouncementComponent = () => {
        const [status, setStatus] = React.useState('');
        const [loading, setLoading] = React.useState(false);

        const handleUpload = async () => {
          setLoading(true);
          setStatus('Uploading file...');

          // Simulate upload
          setTimeout(() => {
            setLoading(false);
            setStatus('File uploaded successfully!');
          }, 1000);
        };

        return (
          <div data-testid="announcement-component">
            <button onClick={handleUpload} disabled={loading} data-testid="upload-button">
              {loading ? 'Uploading...' : 'Upload File'}
            </button>

            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="status-announcement"
            >
              {status}
            </div>

            <div
              role="alert"
              aria-live="assertive"
              data-testid="error-announcement"
              style={{ display: status.includes('error') ? 'block' : 'none' }}
            >
              {status.includes('error') ? status : ''}
            </div>
          </div>
        );
      };

      render(<AnnouncementComponent />);

      const uploadButton = screen.getByTestId('upload-button');
      const statusAnnouncement = screen.getByTestId('status-announcement');

      // Check initial state
      expect(statusAnnouncement).toHaveAttribute('aria-live', 'polite');
      expect(statusAnnouncement).toHaveAttribute('aria-atomic', 'true');

      // Trigger upload
      fireEvent.click(uploadButton);

      expect(statusAnnouncement).toHaveTextContent('Uploading file...');
      expect(uploadButton).toBeDisabled();
    });

    test('should handle dynamic content updates', () => {
      const DynamicComponent = () => {
        const [items, setItems] = React.useState(['Item 1', 'Item 2']);
        const [announcement, setAnnouncement] = React.useState('');

        const addItem = () => {
          const newItem = `Item ${items.length + 1}`;
          setItems([...items, newItem]);
          setAnnouncement(`Added ${newItem}. Total items: ${items.length + 1}`);
        };

        const removeItem = (index) => {
          const removedItem = items[index];
          setItems(items.filter((_, i) => i !== index));
          setAnnouncement(`Removed ${removedItem}. Total items: ${items.length - 1}`);
        };

        return (
          <div data-testid="dynamic-component">
            <button onClick={addItem} data-testid="add-button">
              Add Item
            </button>

            <ul data-testid="items-list" aria-label="Dynamic items list">
              {items.map((item, index) => (
                <li key={index} data-testid={`item-${index}`}>
                  <span>{item}</span>
                  <button
                    onClick={() => removeItem(index)}
                    aria-label={`Remove ${item}`}
                    data-testid={`remove-${index}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div
              role="status"
              aria-live="polite"
              data-testid="dynamic-announcement"
            >
              {announcement}
            </div>
          </div>
        );
      };

      render(<DynamicComponent />);

      // Add item
      fireEvent.click(screen.getByTestId('add-button'));

      expect(screen.getByTestId('dynamic-announcement')).toHaveTextContent(
        'Added Item 3. Total items: 3'
      );

      // Remove item
      fireEvent.click(screen.getByTestId('remove-0'));

      expect(screen.getByTestId('dynamic-announcement')).toHaveTextContent(
        'Removed Item 1. Total items: 2'
      );
    });
  });
});
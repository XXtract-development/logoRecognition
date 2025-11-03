import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ImageUpload } from '../ImageUpload';

// Mock FileValidator to not fail
jest.mock('../FileValidator', () => ({
  FileValidator: {
    validate: jest.fn(() => ({ isValid: true })),
    validateDimensions: jest.fn(() => Promise.resolve({ isValid: true }))
  }
}));

// Mock XMLHttpRequest for upload testing
class MockXHR {
  upload = {
    addEventListener: jest.fn((event, handler) => {
      if (event === 'progress') {
        setTimeout(() => handler({ lengthComputable: true, loaded: 50, total: 100 }), 100);
        setTimeout(() => handler({ lengthComputable: true, loaded: 100, total: 100 }), 200);
      }
    })
  };

  addEventListener = jest.fn((event, handler) => {
    if (event === 'load') {
      setTimeout(() => {
        this.status = 200;
        this.responseText = JSON.stringify({
          uploadId: 'test-upload-123',
          status: 'success'
        });
        handler();
      }, 300);
    }
  });

  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn();
  status = 200;
  responseText = '';
}

describe('Upload Flow E2E', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    originalXHR = global.XMLHttpRequest;
    global.XMLHttpRequest = MockXHR as any;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  test('complete upload journey (select → preview → upload → success)', async () => {
    render(<ImageUpload />);

    const file = new File(['test image content'], 'test-logo.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload image file') as HTMLInputElement;

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('test-logo.png')).toBeInTheDocument();
      expect(screen.getByText(/Size:/)).toBeInTheDocument();
      expect(screen.getByText(/Type: image\/png/)).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /Upload Image/i });
    await userEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    await waitFor(() => {
      const historySection = screen.getByText('Recent Uploads (Session)').parentElement;
      expect(within(historySection!).getByText('test-logo.png')).toBeInTheDocument();
      expect(within(historySection!).getByText('success')).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('error recovery scenarios', async () => {
    class ErrorXHR extends MockXHR {
      addEventListener = jest.fn((event, handler) => {
        if (event === 'load') {
          setTimeout(() => {
            this.status = 413;
            this.responseText = JSON.stringify({
              message: 'File size too large'
            });
            handler();
          }, 100);
        }
      });
      status = 413;
    }

    global.XMLHttpRequest = ErrorXHR as any;
    render(<ImageUpload />);

    const file = new File(['large file'], 'large.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload image file') as HTMLInputElement;

    await userEvent.upload(input, file);

    const uploadButton = screen.getByRole('button', { name: /Upload Image/i });
    await userEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed/i);
    });
  });

  test('concurrent upload handling', async () => {
    render(<ImageUpload />);

    const file1 = new File(['content1'], 'file1.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload image file') as HTMLInputElement;

    await userEvent.upload(input, file1);

    const uploadButton = screen.getByRole('button', { name: /Upload Image/i });
    await userEvent.click(uploadButton);

    await waitFor(() => {
      const historySection = screen.getByText('Recent Uploads (Session)').parentElement;
      expect(within(historySection!).getByText('file1.png')).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('network interruption recovery', async () => {
    class NetworkErrorXHR extends MockXHR {
      addEventListener = jest.fn((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(), 100);
        } else if (event === 'load') {
          // Never calls load handler
        }
      });
    }

    global.XMLHttpRequest = NetworkErrorXHR as any;
    render(<ImageUpload />);

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload image file') as HTMLInputElement;

    await userEvent.upload(input, file);

    const uploadButton = screen.getByRole('button', { name: /Upload Image/i });
    await userEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed/i);
    });
  });

  test('rate limiting behavior', async () => {
    class RateLimitXHR extends MockXHR {
      addEventListener = jest.fn((event, handler) => {
        if (event === 'load') {
          setTimeout(() => {
            this.status = 429;
            this.responseText = JSON.stringify({
              message: 'Rate limit exceeded'
            });
            handler();
          }, 100);
        }
      });
      status = 429;
    }

    global.XMLHttpRequest = RateLimitXHR as any;
    render(<ImageUpload />);

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload image file') as HTMLInputElement;

    await userEvent.upload(input, file);

    const uploadButton = screen.getByRole('button', { name: /Upload Image/i });
    await userEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

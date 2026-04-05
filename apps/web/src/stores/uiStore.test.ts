import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useUIStore.getState();
    expect(state.theme).toBe('system');
    expect(state.language).toBe('en');
    expect(state.sidebarOpen).toBe(true);
    expect(state.modalStack).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it('setTheme updates theme', () => {
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');

    useUIStore.getState().setTheme('light');
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('toggleSidebar flips sidebarOpen', () => {
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it('openModal and closeModal manage modal stack', () => {
    const store = useUIStore.getState();
    store.openModal('settings');
    store.openModal('confirm');

    expect(useUIStore.getState().modalStack).toEqual(['settings', 'confirm']);

    store.closeModal('settings');
    expect(useUIStore.getState().modalStack).toEqual(['confirm']);
  });

  it('openModal does not add duplicate modal ids', () => {
    const store = useUIStore.getState();
    store.openModal('settings');
    store.openModal('settings');

    expect(useUIStore.getState().modalStack).toEqual(['settings']);
  });

  it('addNotification adds with id and timestamp, limited to 10', () => {
    const store = useUIStore.getState();

    for (let i = 0; i < 12; i++) {
      store.addNotification({ type: 'info', message: `Notification ${i}` });
    }

    const state = useUIStore.getState();
    expect(state.notifications.length).toBeLessThanOrEqual(10);
    expect(state.notifications[0]).toHaveProperty('id');
    expect(state.notifications[0]).toHaveProperty('timestamp');
  });

  it('clearNotifications empties the list', () => {
    const store = useUIStore.getState();
    store.addNotification({ type: 'success', message: 'Done' });
    store.clearNotifications();

    expect(useUIStore.getState().notifications).toEqual([]);
  });
});

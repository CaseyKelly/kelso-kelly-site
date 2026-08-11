// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './layout/Header';

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

describe('Header', () => {
  it('renders all top-level navigation links', () => {
    mockUsePathname.mockReturnValue('/');
    render(<Header />);
    for (const label of ['Home', 'Photos & Videos', 'Schedule', 'Bio', 'Song List', 'Contact']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('highlights the link matching the current route', () => {
    mockUsePathname.mockReturnValue('/schedule');
    render(<Header />);
    const desktopLinks = screen.getAllByText('Schedule');
    const activeLink = desktopLinks.find((el) => el.className.includes('text-amber-400'));
    expect(activeLink).toBeDefined();
  });

  it('opens the mobile menu when the toggle button is clicked, and closes it again', async () => {
    mockUsePathname.mockReturnValue('/');
    render(<Header />);

    // Mobile menu content is not in the document until opened
    expect(screen.getAllByText('Home')).toHaveLength(1);

    const toggle = screen.getByRole('button');
    await userEvent.click(toggle);
    expect(screen.getAllByText('Home')).toHaveLength(2);

    await userEvent.click(toggle);
    expect(screen.getAllByText('Home')).toHaveLength(1);
  });

  it('closes the mobile menu when a nav link is clicked', async () => {
    mockUsePathname.mockReturnValue('/');
    render(<Header />);

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('Bio')).toHaveLength(2);

    const mobileLinks = screen.getAllByText('Bio');
    await userEvent.click(mobileLinks[mobileLinks.length - 1]);
    expect(screen.getAllByText('Bio')).toHaveLength(1);
  });
});
